#!/usr/bin/env python3
"""Фавиконы и иконки приложений по брендбуку BOROZDOV.

Одна литера, один вес, один размер — на всех сайтах бренда. Спецификация целиком
в BRAND.md, раздел «Иконки»; здесь та же самая, реализованная на Pillow, потому
что этот репозиторий пересобирается на CI и обязан быть самодостаточным.

  плита  #ffffff, литера #0d0d0d, Inter Bold 700 + обводка 1.5% канвы;
  рост литеры задаётся долей ВЫСОТЫ ФАКТИЧЕСКОЙ КРАСКИ, не кеглем.

Инверсии в иконках больше нет: и фавикон, и apple-touch, и PWA-иконки, и сплэши
рисуются одним ликом. Раньше фавикон был титановым, а иконки приложений —
обсидиановыми, и набор читался как два разных бренда, смотря куда смотреть.

Шрифт берём из scripts/og-fonts/ теми же кандидатами, что и gen_og: на раннере
CI брендовых шрифтов нет, а Pillow не умеет woff2 — без локального ttf литера
рисовалась бы DejaVu и разъезжалась бы с сайтом.

  python scripts/gen_icons.py --letter Р --outdir public
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

import gen_og

GROUND = gen_og.GROUND
MARK = gen_og.MARK

# Доли высоты краски от меньшей стороны канвы.
FAVICON_LETTER = 0.62
APP_LETTER = 0.62
# Единственное исключение по размеру, и оно вынужденное: систем­ная маска режет
# иконку до центрального круга 80% диаметра, литера в 0.62 из него вылезет.
MASKABLE_LETTER = 0.38
SPLASH_LETTER = 0.12

STROKE = 0.015      # обводка контура, доля канвы: Bold 700 → визуально 800
PLATE_RADIUS = 0.16

# Кегль-затравка: доля капители Inter (capHeight 1490 / upm 2048).
CAP_RATIO = 1490 / 2048

# Логические размеры экранов (pt) и масштаб. Единственный источник и для файлов
# в public/splash/, и для тегов <link rel="apple-touch-startup-image"> в build.py:
# тест сверяет одно с другим. iPhone запускает приложение в портрете; у iPad
# домашний экран бывает горизонтальным, поэтому для него — обе ориентации.
SPLASH_SIZES = [
    # iPhone
    (440, 956, 3), (430, 932, 3), (428, 926, 3), (420, 912, 3),
    (414, 896, 3), (414, 896, 2), (414, 736, 3), (402, 874, 3),
    (393, 852, 3), (390, 844, 3), (375, 812, 3), (375, 667, 2),
    # iPad
    (1032, 1376, 2), (1024, 1366, 2), (834, 1210, 2), (834, 1194, 2),
    (834, 1112, 2), (820, 1180, 2), (810, 1080, 2), (768, 1024, 2), (744, 1133, 2),
]
IPAD_MIN_WIDTH = 744


def letter_mask(letter: str, target_ink_h: float, stroke: int, canvas: int) -> Image.Image:
    """Маска литеры ровно заданного роста краски, обрезанная по её границам.

    Кегль здесь не параметр, а результат. Привязывать рост литеры к font-size
    нельзя: у «Р» и «Ю» при одном кегле разная высота очка и разная ширина, и
    на соседних вкладках сайты бренда выглядели бы разного размера. Высота
    краски линейна по кеглю, поэтому одной поправки хватает; третий проход —
    страховка от округления на мелких канвах.

    Границы берутся из getbbox() — фактических границ краски. Ни textbbox, ни
    метрики шрифта так не умеют: первый меряет по ширине с апрошами (у «Р»
    правый апрош больше левого, литера уезжала бы вправо примерно на 1% канвы),
    вторые считают ascender/descender с выносными элементами, которых в
    прописной литере нет, и она садилась бы ниже центра.
    """
    size = max(8, round((target_ink_h - 2 * stroke) / CAP_RATIO))
    for _ in range(3):
        font = gen_og.load_font(gen_og.SANS_BOLD_CANDIDATES, size)
        layer = Image.new("L", (canvas * 3, canvas * 3), 0)
        ImageDraw.Draw(layer).text((canvas, canvas), letter, font=font, fill=255,
                                   stroke_width=stroke, stroke_fill=255)
        box = layer.getbbox()
        if box is None:      # шрифт без этого глифа — молча пустая иконка хуже падения
            raise RuntimeError(f"шрифт не содержит литеру {letter!r}")
        ink_h = box[3] - box[1]
        if abs(ink_h - target_ink_h) <= 1:
            break
        cap = ink_h - 2 * stroke
        if cap <= 0:
            raise RuntimeError(f"обводка съела литеру {letter!r} на канве {canvas}")
        size = max(8, round(size * (target_ink_h - 2 * stroke) / cap))
    return layer.crop(box)


def draw_letter(img: Image.Image, letter: str, ratio: float) -> None:
    w, h = img.size
    base = min(w, h)   # у сплэша канва не квадратная — литера считается от меньшей стороны
    mask = letter_mask(letter, ratio * base, round(STROKE * base), base)
    img.paste(MARK, ((w - mask.width) // 2, (h - mask.height) // 2), mask)


def _supersample(size: int) -> int:
    """Множитель канвы под отрисовку: мелкая иконка рисуется крупно и жмётся.

    16px-фавикон, нарисованный сразу в 16px, — каша: растеризатор гасит штрих
    в полтона. Отрисовка в 1024 и один LANCZOS вниз дают читаемую литеру.
    """
    return 1 if size >= 512 else min(32, -(-1024 // size))


def favicon(size: int, letter: str) -> Image.Image:
    """Белая плита rx 16% + чёрная литера. Читается на любой полосе вкладок."""
    k = _supersample(size)
    s = size * k
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle(
        (0, 0, s - 1, s - 1), radius=round(s * PLATE_RADIUS), fill=GROUND + (255,))
    draw_letter(img, letter, FAVICON_LETTER)
    return img.resize((size, size), Image.LANCZOS) if k > 1 else img


def app_icon(size: int, letter: str, maskable: bool = False) -> Image.Image:
    """Белый квадрат под обрез + чёрная литера.

    Режим RGB, без альфа-канала. Иконка и так сплошная заливка без единого
    прозрачного пикселя, но на 100%-непрозрачном PNG альфа-канал всё равно даёт
    белую окантовку на домашнем экране iOS: система маскирует квадрат своей
    скруглённой формой и антиалиасит край маски против альфы. Без альфы
    маскировать нечего — угол просто обрезается цветом изображения.

    Скругление тоже не рисуем: и iOS, и Android кладут поверх свою маску,
    а нарисованный радиус проступил бы вторым контуром внутри системного.
    """
    k = _supersample(size)
    s = size * k
    img = Image.new("RGB", (s, s), GROUND)
    draw_letter(img, letter, MASKABLE_LETTER if maskable else APP_LETTER)
    return img.resize((size, size), Image.LANCZOS) if k > 1 else img


def splash(width: int, height: int, letter: str) -> Image.Image:
    """Стартовый экран iOS: белое поле, чёрная литера по центру.

    RGB без альфы и без единой надписи: текст потребовал бы подбора кегля под
    каждый из 30 размеров и разъезжался бы с фолбэк-шрифтом на раннере CI.
    """
    img = Image.new("RGB", (width, height), GROUND)
    draw_letter(img, letter, SPLASH_LETTER)
    return img


def save_ico(path: Path, letter: str, sizes=(16, 32, 48)) -> None:
    """ICO, где каждый размер нарисован отдельно.

    Pillow умеет сохранять .ico сам, но масштабирует один исходник под все
    размеры: 16px получался бы даунсэмплом уже антиалиасной 48px-литеры и мылил.
    Контейнер тривиален — заголовок, по 16 байт на запись, следом сами PNG.
    """
    import struct
    from io import BytesIO

    blobs = []
    for size in sizes:
        buf = BytesIO()
        favicon(size, letter).save(buf, format="PNG", optimize=True)
        blobs.append((size, buf.getvalue()))

    header = struct.pack("<HHH", 0, 1, len(blobs))
    offset = len(header) + 16 * len(blobs)
    entries, payload = b"", b""
    for size, blob in blobs:
        entries += struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(blob), offset)
        payload += blob
        offset += len(blob)
    path.write_bytes(header + entries + payload)


def splash_set() -> list[dict]:
    """Все стартовые экраны: имя файла, пиксельный размер и media-запрос для <link>."""
    out = []
    for w, h, scale in SPLASH_SIZES:
        orientations = ("portrait", "landscape") if w >= IPAD_MIN_WIDTH else ("portrait",)
        for orientation in orientations:
            landscape = orientation == "landscape"
            pw, ph = (h * scale, w * scale) if landscape else (w * scale, h * scale)
            suffix = "-landscape" if landscape else ""
            out.append({
                "name": f"splash/{w}x{h}-{scale}x{suffix}.png",
                "width": pw,
                "height": ph,
                # device-width/height у iOS всегда портретные, ориентация — отдельным условием
                "media": (f"screen and (device-width: {w}px) and (device-height: {h}px) "
                          f"and (-webkit-device-pixel-ratio: {scale}) "
                          f"and (orientation: {orientation})"),
            })
    return out


def render(outdir: Path, letter: str) -> list[str]:
    """Пишет весь набор в outdir. Возвращает имена файлов."""
    outdir.mkdir(parents=True, exist_ok=True)

    # .ico — единственный формат, который старые браузеры и часть краулеров
    # ищут по /favicon.ico молча, не заглядывая в <link>. Три размера в одном
    # файле: 16 для вкладки, 32 для ретины, 48 для панели закладок Windows.
    save_ico(outdir / "favicon.ico", letter)
    # Яндексу для карточки в поиске нужен фавикон файлом по прямой ссылке (SVG
    # или 120×120). PNG печёт нужный вес шрифта один раз здесь.
    favicon(120, letter).save(outdir / "favicon-120.png")
    app_icon(180, letter).save(outdir / "apple-touch-icon.png")
    for size in (192, 512):
        app_icon(size, letter).save(outdir / f"icon-{size}.png")
    app_icon(512, letter, maskable=True).save(outdir / "icon-maskable-512.png")

    names = ["favicon.ico", "favicon-120.png", "apple-touch-icon.png",
             "icon-192.png", "icon-512.png", "icon-maskable-512.png"]
    (outdir / "splash").mkdir(exist_ok=True)
    for item in splash_set():
        # optimize: сплошная заливка с одной литерой сжимается в единицы килобайт
        splash(item["width"], item["height"], letter).save(
            outdir / item["name"], optimize=True)
        names.append(item["name"])
    return names


def main() -> int:
    p = argparse.ArgumentParser(description="BOROZDOV icons")
    p.add_argument("--letter", default="Ю", help="литера (одна буква)")
    p.add_argument("--outdir", default="public", type=Path)
    args = p.parse_args()
    names = render(args.outdir, args.letter)
    print(f"{args.outdir}: " + ", ".join(names))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
