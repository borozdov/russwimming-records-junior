#!/usr/bin/env python3
"""Скриншоты для манифеста PWA — Richer Install UI в Chrome и Edge.

Без `screenshots` браузер показывает куцый баннер «Добавить на главный экран»;
с ними — диалог с картинками и описанием. Chrome требует PNG/JPEG со стороной
320–3840px, отношение сторон не больше 2.3, и одну пропорцию на все картинки
одного form_factor.

Настоящий снимок браузера тут невозможен: на раннере CI браузера нет, а байты
скриншота плавали бы от прогона к прогону. Поэтому экран рисуется Pillow из тех
же данных, что и сайт, — вёрстка повторяет реальную (шапка, герой, статистика,
поиск, чипы, карточки на телефоне / таблица на десктопе), и картинка меняется
только вместе с данными.

Константа вне зеркала: как OG-картинка, всегда ОБСИДИАН. Шрифты — из
scripts/og-fonts/ (кладёт scripts/fetch_fonts.py --og-only).

  python scripts/gen_screens.py --data data/junior.json --outdir public
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

import gen_og

ROOT = Path(__file__).resolve().parent.parent
OG_FONTS = gen_og.OG_FONTS

# Токены обсидиана из static/style.css — ровно те же значения
CANVAS = (13, 13, 13)
INSET = (18, 18, 18)
SURFACE = (26, 26, 26)
HAIRLINE = (46, 46, 46)
STRONG = (107, 107, 107)
SLATE = (138, 138, 138)
SOFT = (209, 209, 209)
INK = (250, 250, 250)

# form_factor → (пиксели, масштаб относительно CSS-пикселей)
NARROW = ((1080, 1920), 3)   # телефон 360×640 @3x
WIDE = ((1920, 1080), 2)     # десктоп 960×540 @2x

SANS = {
    400: [OG_FONTS / "inter-regular.ttf", OG_FONTS / "inter-medium.ttf",
          OG_FONTS / "inter-semibold.ttf"] + gen_og.SANS_CANDIDATES[1:],
    500: [OG_FONTS / "inter-medium.ttf", OG_FONTS / "inter-semibold.ttf"]
         + gen_og.SANS_CANDIDATES[1:],
    600: gen_og.SANS_CANDIDATES,
}
MONO = {
    500: [OG_FONTS / "jetbrains-mono-medium.ttf"] + gen_og.MONO_CANDIDATES,
    700: gen_og.MONO_CANDIDATES,
}

STAT_LABELS = ("Действующих рекордов", "Обновлено за 12 месяцев", "Синхронизировано")
COLUMNS = ("Дисциплина", "Спортсмен", "Результат", "Место", "Дата")
COL_FRACTIONS = (0.34, 0.25, 0.14, 0.13, 0.14)


class Sheet:
    """Рисование в CSS-пикселях: все координаты умножаются на масштаб."""

    def __init__(self, size: tuple[int, int], scale: int):
        self.img = Image.new("RGB", size, CANVAS)
        self.d = ImageDraw.Draw(self.img)
        self.k = scale
        self.w = size[0] / scale
        self.h = size[1] / scale

    def px(self, v: float) -> int:
        return int(round(v * self.k))

    def sans(self, size: float, weight: int = 400):
        return gen_og.load_font(SANS[weight], self.px(size))

    def mono(self, size: float, weight: int = 500):
        return gen_og.load_font(MONO[weight], self.px(size))

    def text(self, xy, s, font, fill, anchor="la", tracking: float = 0.0) -> float:
        """Возвращает ширину строки в CSS-пикселях.

        Трекинг рисуется посимвольно (Pillow не умеет letter-spacing), но anchor
        уважается: горизонталь считается по общей ширине, вертикаль — у каждого символа.
        """
        x, y = self.px(xy[0]), self.px(xy[1])
        if not tracking:
            self.d.text((x, y), s, font=font, fill=fill, anchor=anchor)
            return self.d.textlength(s, font=font) / self.k
        t = self.px(tracking)
        widths = [self.d.textlength(ch, font=font) for ch in s]
        total = sum(widths) + t * max(len(s) - 1, 0)
        if anchor[0] == "r":
            x -= total
        elif anchor[0] == "m":
            x -= total / 2
        per_char = "l" + anchor[1]
        for ch, w in zip(s, widths):
            self.d.text((x, y), ch, font=font, fill=fill, anchor=per_char)
            x += w + t
        return total / self.k

    def width(self, s, font, tracking: float = 0.0) -> float:
        if tracking:
            return gen_og.tracked_width(self.d, s, font, self.px(tracking))[0] / self.k
        return self.d.textlength(s, font=font) / self.k

    def hline(self, x1, y, x2, fill=HAIRLINE):
        self.d.rectangle([self.px(x1), self.px(y), self.px(x2), self.px(y) + max(self.k // 2, 1) - 1
                          + (self.k - max(self.k // 2, 1))], fill=fill)

    def rect(self, box, fill=None, outline=None, radius: float = 0):
        x1, y1, x2, y2 = (self.px(v) for v in box)
        if radius:
            self.d.rounded_rectangle([x1, y1, x2, y2], radius=self.px(radius),
                                     fill=fill, outline=outline, width=max(self.k // 2, 1))
        else:
            self.d.rectangle([x1, y1, x2, y2], fill=fill, outline=outline,
                             width=max(self.k // 2, 1))

    def wrap(self, s: str, font, max_w: float, max_lines: int, tracking: float = 0.0) -> list[str]:
        words, lines, line = s.split(), [], ""
        for w in words:
            probe = f"{line} {w}".strip()
            if line and self.width(probe, font, tracking) > max_w:
                lines.append(line)
                line = w
                if len(lines) == max_lines:
                    return lines
            else:
                line = probe
        if line and len(lines) < max_lines:
            lines.append(line)
        return lines

    def ellipsize(self, s: str, font, max_w: float) -> str:
        if self.width(s, font) <= max_w:
            return s
        while len(s) > 1 and self.width(s + "…", font) > max_w:
            s = s[:-1]
        return s.rstrip() + "…"

    # --- атомы бренда ------------------------------------------------------

    def label(self, xy, s, size=11, fill=SLATE, anchor="la") -> float:
        """Лейбл: UPPERCASE, разреженный трекинг 0.12em."""
        return self.text(xy, s.upper(), self.sans(size, 500), fill, anchor, tracking=size * 0.12)

    def chip(self, x, y, s, on=False, h=32, size=12) -> float:
        font = self.sans(size, 500 if on else 400)
        w = self.width(s, font) + 24
        if on:
            self.rect((x, y, x + w, y + h), fill=INK, radius=4)
        else:
            self.rect((x, y, x + w, y + h), outline=HAIRLINE, radius=4)
        self.text((x + 12, y + h / 2), s, font, CANVAS if on else SOFT, anchor="lm")
        return w

    def badge_new(self, x, y_mid) -> float:
        font = self.sans(9, 600)
        w = self.width("НОВОЕ", font, tracking=0.7) + 12
        self.rect((x, y_mid - 7, x + w, y_mid + 7), fill=INK, radius=2)
        self.text((x + 6, y_mid), "НОВОЕ", font, CANVAS, anchor="lm", tracking=0.7)
        return w

    def icon_button(self, x, y, size, kind, primary=False):
        """Штриховые иконки шапки: солнце и стрелка скачивания."""
        if primary:
            self.rect((x, y, x + size, y + size), fill=INK, radius=4)
            stroke = CANVAS
        else:
            self.rect((x, y, x + size, y + size), outline=STRONG, radius=4)
            stroke = INK
        cx, cy = x + size / 2, y + size / 2
        lw = max(self.px(1.8), 2)
        if kind == "sun":
            r = size * 0.11
            self.d.ellipse([self.px(cx - r), self.px(cy - r), self.px(cx + r), self.px(cy + r)],
                           outline=stroke, width=lw)
            for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0), (0.7, 0.7), (-0.7, -0.7), (0.7, -0.7), (-0.7, 0.7)):
                self.d.line([self.px(cx + dx * r * 1.9), self.px(cy + dy * r * 1.9),
                             self.px(cx + dx * r * 2.6), self.px(cy + dy * r * 2.6)],
                            fill=stroke, width=lw)
        else:
            a = size * 0.2
            self.d.line([self.px(cx), self.px(cy - a), self.px(cx), self.px(cy + a * 0.6)],
                        fill=stroke, width=lw)
            self.d.line([self.px(cx - a * 0.7), self.px(cy - a * 0.1), self.px(cx), self.px(cy + a * 0.6),
                         self.px(cx + a * 0.7), self.px(cy - a * 0.1)], fill=stroke, width=lw, joint="curve")
            self.d.line([self.px(cx - a), self.px(cy + a), self.px(cx + a), self.px(cy + a)],
                        fill=stroke, width=lw)

    def search_box(self, x, y, w, h, size=14):
        self.rect((x, y, x + w, y + h), fill=INSET, outline=STRONG, radius=4)
        cx, cy, r = x + 20, y + h / 2, 5.5
        lw = max(self.px(1.6), 2)
        self.d.ellipse([self.px(cx - r), self.px(cy - r), self.px(cx + r), self.px(cy + r)],
                       outline=SLATE, width=lw)
        self.d.line([self.px(cx + r * 0.75), self.px(cy + r * 0.75), self.px(cx + r * 1.7), self.px(cy + r * 1.7)],
                    fill=SLATE, width=lw)
        self.text((x + 36, cy), "Фамилия, дисциплина, город…", self.sans(size), SLATE, anchor="lm")


def fmt_date(iso: str, orig: str) -> str:
    return ".".join(reversed(iso.split("-"))) if iso else (orig or "")


def stats(data: dict, fresh_days: int, today: str) -> list[tuple[str, str]]:
    """Те же три числа, что в .stat-strip; свежесть — как в build.enrich()."""
    from datetime import date
    records = [r for c in data["categories"] for r in c["records"]]
    t = date.fromisoformat(today)
    fresh = sum(1 for r in records if r["date"] and (t - date.fromisoformat(r["date"])).days <= fresh_days)
    synced = fmt_date(data["fetched_at"][:10], "")
    return [(str(len(records)), STAT_LABELS[0]), (str(fresh), STAT_LABELS[1]), (synced, STAT_LABELS[2])]


def title_of(r: dict) -> str:
    """`_title` из build.enrich(); запасной путь — для сырых данных без обогащения."""
    if r.get("_title"):
        return r["_title"]
    import re
    t = re.sub(r"\s*\(бассейн 25 м\)\s*", "", r["discipline"]).strip()
    return t[:1].upper() + t[1:]


def first_category(data: dict) -> dict:
    """Пустой набор — легальный вход (render_page его принимает): рисуем пустую таблицу."""
    return data["categories"][0] if data["categories"] else {"title": "", "records": []}


def is_fresh(r: dict, fresh_days: int, today: str) -> bool:
    from datetime import date
    return bool(r["date"]) and (date.fromisoformat(today) - date.fromisoformat(r["date"])).days <= fresh_days


# ---------------------------------------------------------------- телефон

def render_narrow(data: dict, out: Path, *, title: str, eyebrow: str,
                  fresh_days: int, today: str) -> Path:
    size, k = NARROW
    s = Sheet(size, k)
    pad = 16
    right = s.w - pad

    # шапка
    s.text((pad, 20), "Рекорды России", s.sans(15, 600), INK, anchor="lm")
    s.label((pad, 31), "Плавание · Юниоры", size=10)
    s.icon_button(right - 36, 10, 36, "down", primary=True)
    s.icon_button(right - 36 - 8 - 36, 10, 36, "sun")
    s.hline(0, 56, s.w)

    # герой
    y = 74
    for line in s.wrap(eyebrow.upper(), s.sans(11, 500), right - pad, 2, tracking=11 * 0.12):
        s.label((pad, y), line)
        y += 17
    y += 8
    h1 = s.sans(28, 600)
    # до трёх строк: «Юношеские рекорды России по плаванию» в две не помещается
    for line in s.wrap(title.upper(), h1, right - pad, 3):
        s.text((pad, y), line, h1, INK, tracking=-0.5)
        y += 30
    y += 12
    s.hline(pad, y, right)
    for value, lab in stats(data, fresh_days, today):
        y += 1
        s.text((pad, y + 19), value, s.mono(18), INK, anchor="lm")
        s.label((right, y + 19), lab, anchor="rm")
        y += 38
        s.hline(pad, y, right)

    # поиск и чипы
    y += 16
    s.search_box(pad, y, right - pad, 44, size=16)
    y += 44 + 8
    s.label((pad, y + 8), f"Показано {data['total_records']}", size=10, anchor="lm")
    y += 24
    x = pad
    x += s.label((x, y + 18), "Пол", anchor="lm") + 12
    for i, lab in enumerate(("Все", "Женщины", "Мужчины", "Смешанные")):
        x += s.chip(x, y, lab, on=i == 0, h=36, size=13) + 8
    y += 36 + 14
    s.hline(0, y, s.w)

    # карточки первой категории
    y += 12
    cat = first_category(data)
    s.rect((pad, y, right, s.h + 40), fill=SURFACE, outline=HAIRLINE, radius=8)
    s.rect((pad, y, right, y + 45), fill=INSET)
    x = pad + 12
    for lab in COLUMNS[:3]:
        font = s.sans(11, 500)
        w = s.width(lab.upper(), font, tracking=1.3) + 20
        s.rect((x, y + 8, x + w, y + 37), outline=HAIRLINE, radius=4)
        s.label((x + 10, y + 22.5), lab, anchor="lm")
        x += w + 6
    y += 45
    s.hline(pad, y, right)
    s.rect((pad, y, right, y + 36), fill=INSET)
    s.label((pad + 16, y + 18), cat["title"], anchor="lm")
    y += 36
    s.hline(pad, y, right)

    for r in cat["records"]:
        if y > s.h:
            break
        top = y + 13
        name_font = s.sans(14, 500)
        disc = title_of(r)
        res_font = s.mono(16)
        res_w = s.width(r["result"], res_font)
        max_disc = right - 16 - (pad + 16) - res_w - 14 - (60 if is_fresh(r, fresh_days, today) else 0)
        disc = s.ellipsize(disc, name_font, max_disc)
        w = s.text((pad + 16, top + 10), disc, name_font, INK, anchor="lm")
        if is_fresh(r, fresh_days, today):
            s.badge_new(pad + 16 + w + 8, top + 10)
        s.text((right - 16, top + 10), r["result"], res_font, INK, anchor="rm")
        athlete = r["athlete"]
        s.text((pad + 16, top + 34), s.ellipsize(athlete, s.sans(13), right - pad - 32), s.sans(13), SOFT, anchor="lm")
        meta_font = s.sans(12)
        s.text((pad + 16, top + 55), f"Место: {r['location']}", meta_font, SLATE, anchor="lm")
        date_txt = fmt_date(r["date"], r["date_original"])
        dw = s.width(date_txt, s.mono(12))
        s.text((right - 16, top + 55), date_txt, s.mono(12), SLATE, anchor="rm")
        s.text((right - 16 - dw - 2, top + 55), "Дата: ", meta_font, SLATE, anchor="rm")
        y = top + 68
        s.hline(pad, y, right)

    out.parent.mkdir(parents=True, exist_ok=True)
    s.img.save(out, optimize=True)
    return out


# ---------------------------------------------------------------- десктоп

def render_wide(data: dict, out: Path, *, title: str, eyebrow: str,
                fresh_days: int, today: str) -> Path:
    size, k = WIDE
    s = Sheet(size, k)
    pad = 40
    right = s.w - pad

    # шапка
    s.text((pad, 24), "Рекорды России", s.sans(15, 600), INK, anchor="lm")
    s.label((pad, 35), "Плавание · Юниоры", size=10)
    s.label((pad + s.width("Рекорды России", s.sans(15, 600)) + 14, 30), "By Borozdov", anchor="lm")
    btn_w = 104
    s.rect((right - btn_w, 12, right, 48), fill=INK, radius=4)
    s.icon_button(right - btn_w + 4, 16, 28, "down", primary=True)
    s.label((right - btn_w + 36, 30), "Скачать", size=11, fill=CANVAS, anchor="lm")
    s.icon_button(right - btn_w - 8 - 36, 12, 36, "sun")
    s.hline(0, 60, s.w)

    # герой в одну строку заголовка
    y = 84
    s.label((pad, y), eyebrow)
    y += 24
    s.text((pad, y), title.upper(), s.sans(40, 600), INK, tracking=-0.8)
    y += 56
    s.hline(pad, y, right)
    y += 14
    x = pad
    for value, lab in stats(data, fresh_days, today):
        s.text((x, y + 9), value, s.mono(18), INK, anchor="lm")
        w = s.label((x, y + 30), lab, anchor="lm")
        x += max(w, 60) + 36

    # навигация по категориям
    y += 52
    x = pad
    x += s.chip(x, y, "Все рекорды", on=True, h=33) + 8
    for cat in data["categories"]:
        w = s.width(cat["title"], s.sans(12)) + 24
        if x + w > right:          # как flex-wrap на странице
            x = pad
            y += 33 + 8
        x += s.chip(x, y, cat["title"], h=33) + 8

    # поиск, счётчик, чипы
    y += 33 + 20
    s.search_box(pad, y, 420, 38)
    s.label((pad + 432, y + 19), f"Показано {data['total_records']}", size=10, anchor="lm")
    y += 38 + 14
    x = pad
    for group, options in (("Пол", ("Все", "Женщины", "Мужчины", "Смешанные")),
                           ("Бассейн", ("Все", "50 м", "25 м")),
                           ("Тип", ("Все", "Личные", "Эстафеты"))):
        x += s.label((x, y + 14), group, anchor="lm") + 10
        for i, lab in enumerate(options):
            x += s.chip(x, y, lab, on=i == 0, h=28) + 6
        x += 20

    # таблица
    y += 28 + 20
    s.rect((pad, y, right, s.h + 40), fill=SURFACE, outline=HAIRLINE, radius=8)
    inner = right - pad
    xs, acc = [], pad
    for f in COL_FRACTIONS:
        xs.append(acc)
        acc += inner * f
    s.rect((pad, y, right, y + 45), fill=INSET)
    for i, lab in enumerate(COLUMNS):
        s.label((xs[i] + 14, y + 22.5), lab, anchor="lm")
    y += 45
    s.hline(pad, y, right)

    cat = first_category(data)
    s.rect((pad, y, right, y + 36), fill=INSET)
    s.label((pad + 14, y + 18), cat["title"], anchor="lm")
    y += 36
    s.hline(pad, y, right)
    for r in cat["records"]:
        if y > s.h:
            break
        mid = y + 21
        widths = [inner * f - 28 for f in COL_FRACTIONS]
        fresh = is_fresh(r, fresh_days, today)
        name_font = s.sans(14, 500)
        disc = s.ellipsize(title_of(r), name_font, widths[0] - (62 if fresh else 0))
        w = s.text((xs[0] + 14, mid), disc, name_font, INK, anchor="lm")
        if fresh:
            s.badge_new(xs[0] + 14 + w + 8, mid)
        s.text((xs[1] + 14, mid), s.ellipsize(r["athlete"], s.sans(14), widths[1]), s.sans(14), INK, anchor="lm")
        s.text((xs[2] + 14, mid), r["result"], s.mono(16), INK, anchor="lm")
        s.text((xs[3] + 14, mid), s.ellipsize(r["location"], s.sans(14), widths[3]), s.sans(14), INK, anchor="lm")
        s.text((xs[4] + 14, mid), fmt_date(r["date"], r["date_original"]), s.mono(13), INK, anchor="lm")
        y += 42
        s.hline(pad, y, right)

    out.parent.mkdir(parents=True, exist_ok=True)
    s.img.save(out, optimize=True)
    return out


SCREENSHOTS = [
    # (файл, form_factor, размер, подпись для диалога установки)
    ("screenshot-narrow.png", "narrow", NARROW[0], "Таблица рекордов на телефоне"),
    ("screenshot-wide.png", "wide", WIDE[0], "Таблица рекордов на компьютере"),
]


def render(data: dict, outdir: Path, *, title: str, eyebrow: str,
           fresh_days: int, today: str) -> list[str]:
    render_narrow(data, outdir / SCREENSHOTS[0][0], title=title, eyebrow=eyebrow,
                  fresh_days=fresh_days, today=today)
    render_wide(data, outdir / SCREENSHOTS[1][0], title=title, eyebrow=eyebrow,
                fresh_days=fresh_days, today=today)
    return [name for name, *_ in SCREENSHOTS]


def main() -> int:
    p = argparse.ArgumentParser(description="BOROZDOV PWA screenshots")
    p.add_argument("--data", default=str(ROOT / "data" / "junior.json"))
    p.add_argument("--outdir", default=str(ROOT / "public"), type=Path)
    p.add_argument("--today", default="2026-01-01")
    args = p.parse_args()
    data = json.loads(Path(args.data).read_text(encoding="utf-8"))
    names = render(data, args.outdir, title="Юношеские рекорды России по плаванию",
                   eyebrow="Официальное зеркало · Всероссийская федерация плавания",
                   fresh_days=365, today=args.today)
    print(f"{args.outdir}: " + ", ".join(names))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
