#!/usr/bin/env python3
"""Фавиконы и иконки приложений по брендбуку BOROZDOV.

Константы вне зеркала (не следуют лику сайта):
  - фавикон — ТИТАНОВЫЙ квадрат rx 16% с обсидиановой литерой: читается
    и на светлой, и на тёмной полосе вкладок;
  - apple-touch-icon и PWA-иконки — ОБСИДИАН с титановой литерой: внешний
    лик бренда тёмный;
  - maskable — та же обсидиановая заливка, но литера мельче (~35% канвы):
    система кропит края под свою маску, и на 50%-й литере срезало бы очко;
  - стартовые экраны iOS (apple-touch-startup-image) — ОБСИДИАН с титановой
    литерой по центру, как Android рисует сплэш из иконки и background_color.
    Один набор без prefers-color-scheme: лик сайта ручной и до загрузки страницы
    неизвестен, а внешний лик бренда — тёмный. iOS не масштабирует ближайший
    размер, поэтому картинка нужна под каждое сочетание pt × scale × ориентация.

Шрифт берём из scripts/og-fonts/ теми же кандидатами, что и gen_og: на раннере
CI брендовых шрифтов нет, а Pillow не умеет woff2 — без локального ttf литера
рисовалась бы DejaVu и разъезжалась бы с сайтом.

  python scripts/gen_icons.py --letter Р --outdir public
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import gen_og

OBSIDIAN = gen_og.OBSIDIAN
TITAN = gen_og.TITAN

# Литера в фавиконе крупнее, чем в иконке приложения: 16px-квадрат во вкладке
# должен читаться, там запас поля не нужен. У иконки приложения поле — часть
# формы, её система ещё и скругляет по-своему.
FAVICON_LETTER = 0.62
APP_LETTER = 0.50
MASKABLE_LETTER = 0.35
SPLASH_LETTER = 0.12  # доля меньшей стороны экрана — примерно размер иконки в лаунчере

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


def draw_letter(img: Image.Image, letter: str, color, scale: float, bold: bool = False) -> None:
    """Литера по центру фактического очка, а не по метрикам шрифта.

    Меряем в два прохода: рисуем литеру на отдельном слое и берём его
    `getbbox()` — реальные границы краски. Ни textbbox, ни text-anchor в SVG
    так не умеют: они меряют по ширине с апрошами, а у «Р» правый апрош больше
    левого — литера уезжала бы вправо примерно на 1% канвы. По вертикали то же
    самое с метриками: ascender/descender считают выносные элементы, которых в
    прописной литере нет, и она садилась бы ниже центра.

    Для «Р» с плоским верхом и плоской базовой линией геометрический центр
    очка и есть оптический — дополнительный подъём здесь не нужен (он нужен
    литерам с овалами, у которых есть свес за пределы капители). Двухпроходный
    getbbox() центрует любую литеру одинаково надёжно, поэтому bold=True (для
    «Ю» — см. gen_og.SANS_BOLD_CANDIDATES) не требует отдельной перепроверки
    центровки: контур другой, а метод её нахождения — тот же.
    """
    w, h = img.size
    size = min(w, h)   # у сплэша канва не квадратная — литера считается от меньшей стороны
    candidates = gen_og.SANS_BOLD_CANDIDATES if bold else gen_og.SANS_CANDIDATES
    font = gen_og.load_font(candidates, int(size * scale))

    layer = Image.new("L", (size * 2, size * 2), 0)
    ImageDraw.Draw(layer).text((size // 2, size // 2), letter, font=font, fill=255)
    box = layer.getbbox()
    if box is None:      # шрифт без этого глифа — молча пустая иконка хуже падения
        raise RuntimeError(f"шрифт не содержит литеру {letter!r}")
    mask = layer.crop(box)

    img.paste(color, ((w - mask.width) // 2, (h - mask.height) // 2), mask)


def favicon(size: int, letter: str, bold: bool = False) -> Image.Image:
    """Титановый квадрат rx 16% + обсидиановая литера."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=round(size * 0.16), fill=TITAN + (255,))
    draw_letter(img, letter, OBSIDIAN + (255,), FAVICON_LETTER, bold=bold)
    return img


def app_icon(size: int, letter: str, maskable: bool = False, bold: bool = False) -> Image.Image:
    """Обсидиановый квадрат под обрез + титановая литера.

    Режим RGB, без альфа-канала. Иконка и так сплошная заливка без единого
    прозрачного пикселя, но на 100%-непрозрачном PNG альфа-канал всё равно даёт
    белую окантовку на домашнем экране iOS: система маскирует квадрат своей
    скруглённой формой и антиалиасит край маски против альфы. Без альфы
    маскировать нечего — угол просто обрезается цветом изображения.

    Скругление тоже не рисуем: и iOS, и Android кладут поверх свою маску,
    а нарисованный радиус проступил бы вторым контуром внутри системного.
    """
    img = Image.new("RGB", (size, size), OBSIDIAN)
    draw_letter(img, letter, TITAN, MASKABLE_LETTER if maskable else APP_LETTER, bold=bold)
    return img


def splash(width: int, height: int, letter: str, bold: bool = False) -> Image.Image:
    """Стартовый экран iOS: сплошной обсидиан, титановая литера по центру.

    RGB без альфы и без единой надписи: текст потребовал бы подбора кегля под
    каждый из 30 размеров и разъезжался бы с фолбэк-шрифтом на раннере CI.
    """
    img = Image.new("RGB", (width, height), OBSIDIAN)
    draw_letter(img, letter, TITAN, SPLASH_LETTER, bold=bold)
    return img


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


def render(outdir: Path, letter: str, bold: bool = False) -> list[str]:
    """Пишет весь набор в outdir. Возвращает имена файлов.

    bold=True — компенсация оптического веса для широких/округлых литер
    («Ю»): при идентичной фактической толщине штриха они читаются легче
    блочных («Р»), см. gen_og.SANS_BOLD_CANDIDATES. Применяется ко всем
    иконкам разом, не только фавикону — иначе комплект расходится сам с
    собой (фавикон жирнее, чем иконка на домашнем экране).
    """
    outdir.mkdir(parents=True, exist_ok=True)

    # .ico — единственный формат, который старые браузеры и часть краулеров
    # ищут по /favicon.ico молча, не заглядывая в <link>. Три размера в одном
    # файле: 16 для вкладки, 32 для ретины, 48 для панели закладок Windows.
    favicon(48, letter, bold=bold).save(
        outdir / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    # Яндексу для карточки в поиске нужен фавикон файлом по прямой ссылке (SVG
    # или 120×120) — растровый PNG, а не живой SVG-текст: браузер рисует
    # фавикон вкладки системными шрифтами, веб-шрифт страницы (Inter) туда не
    # грузится, и текст в SVG уезжал бы в фолбэк другой насыщенности прямо на
    # вкладке. PNG печёт нужный вес шрифта один раз здесь.
    favicon(120, letter, bold=bold).save(outdir / "favicon-120.png")
    app_icon(180, letter, bold=bold).save(outdir / "apple-touch-icon.png")
    for size in (192, 512):
        app_icon(size, letter, bold=bold).save(outdir / f"icon-{size}.png")
    app_icon(512, letter, maskable=True, bold=bold).save(outdir / "icon-maskable-512.png")

    names = ["favicon.ico", "favicon-120.png", "apple-touch-icon.png",
             "icon-192.png", "icon-512.png", "icon-maskable-512.png"]
    (outdir / "splash").mkdir(exist_ok=True)
    for item in splash_set():
        # optimize: сплошная заливка с одной литерой сжимается в единицы килобайт
        splash(item["width"], item["height"], letter, bold=bold).save(
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
