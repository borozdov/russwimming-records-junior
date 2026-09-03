#!/usr/bin/env python3
"""OG-картинка 1200×630 по рецепту брендбука BOROZDOV.

Константа вне зеркала: OG всегда ОБСИДИАН, независимо от лика сайта.
Рецепт: обсидиановая канва, hairline-рамка 2px, сверху разреженный UPPERCASE-лейбл
slate, по центру крупный вордмарк, внизу hairline-линия и строка «моно-факт слева /
домен справа». Без градиентов и теней.

Шрифты берём из scripts/og-fonts/ (кладёт scripts/fetch_fonts.py): Pillow не умеет
woff2, а на раннере CI брендовых шрифтов нет — без локальных ttf картинка рисуется
чем попало. Системные пути остаются запасным вариантом.

  python scripts/gen_og.py --out public/og-image.png --fact "90 РЕКОРДОВ"
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OG_FONTS = ROOT / "scripts" / "og-fonts"

OBSIDIAN = (13, 13, 13)
TITAN = (250, 250, 250)
HAIRLINE = (46, 46, 46)
SLATE = (138, 138, 138)

W, H = 1200, 630
INSET = 28

SANS_CANDIDATES = [
    OG_FONTS / "inter-semibold.ttf",
    Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]
MONO_CANDIDATES = [
    OG_FONTS / "jetbrains-mono-bold.ttf",
    Path("/System/Library/Fonts/Menlo.ttc"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"),
]


def load_font(candidates: list[Path], size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        try:
            return ImageFont.truetype(str(path), size)
        except OSError:
            continue
    return ImageFont.load_default()


def tracked_width(d: ImageDraw.ImageDraw, text: str, font, tracking: float) -> tuple[float, list]:
    widths = [d.textlength(ch, font=font) for ch in text]
    return sum(widths) + tracking * max(len(text) - 1, 0), widths


def tracked(d, xy, text, font, fill, tracking, anchor_right=False) -> float:
    """Текст с ручным трекингом — Pillow не умеет letter-spacing."""
    total, widths = tracked_width(d, text, font, tracking)
    x, y = xy
    if anchor_right:
        x -= total
    for ch, w in zip(text, widths):
        d.text((x, y), ch, font=font, fill=fill)
        x += w + tracking
    return total


def fit_wordmark(d, words: list[str], max_w: int, max_lines: int) -> tuple[list[str], int]:
    """Крупнейший кегль, при котором вордмарк укладывается в max_lines строк."""
    for size in range(104, 39, -4):
        font = load_font(SANS_CANDIDATES, size)
        lines, line = [], ""
        for word in words:
            probe = f"{line} {word}".strip()
            if line and d.textlength(probe, font=font) > max_w:
                lines.append(line)
                line = word
            else:
                line = probe
        if line:
            lines.append(line)
        if len(lines) <= max_lines and all(d.textlength(l, font=font) <= max_w for l in lines):
            return lines, size
    return [" ".join(words)], 40


def render(out: Path, title: str, label: str, fact: str, domain: str) -> Path:
    img = Image.new("RGB", (W, H), OBSIDIAN)
    d = ImageDraw.Draw(img)

    d.rectangle([INSET, INSET, W - INSET, H - INSET], outline=HAIRLINE, width=2)

    label_font = load_font(SANS_CANDIDATES, 24)
    lw, _ = tracked_width(d, label.upper(), label_font, 8)
    tracked(d, ((W - lw) / 2, 92), label.upper(), label_font, SLATE, 8)

    max_w = W - 2 * (INSET + 70)
    lines, size = fit_wordmark(d, title.upper().split(), max_w, 2)
    font = load_font(SANS_CANDIDATES, size)
    leading = int(size * 1.1)
    block_h = leading * len(lines)
    y = (H - block_h) / 2 - 14
    for line in lines:
        tw = d.textlength(line, font=font)
        d.text(((W - tw) / 2, y), line, font=font, fill=TITAN)
        y += leading

    line_y = H - 148
    d.line([INSET + 40, line_y, W - INSET - 40, line_y], fill=HAIRLINE, width=2)
    bottom_y = line_y + 44

    # Факт слева, домен справа. Обе строки длинные и переменные, поэтому
    # подбираем кегли по фактически свободной ширине, а не по половине картинки.
    left, right = INSET + 40, W - INSET - 40
    gap = 48
    for fsize, ftrack in ((28, 3), (26, 3), (24, 2), (22, 2)):
        mono = load_font(MONO_CANDIDATES, fsize)
        fact_w, _ = tracked_width(d, fact.upper(), mono, ftrack)
        if fact_w <= (right - left) * 0.55:
            break
    tracked(d, (left, bottom_y), fact.upper(), mono, TITAN, ftrack)

    room = right - left - fact_w - gap
    for dsize, dtrack in ((26, 5), (24, 4), (22, 3), (20, 2), (18, 1)):
        right_font = load_font(SANS_CANDIDATES, dsize)
        dw, _ = tracked_width(d, domain.upper(), right_font, dtrack)
        if dw <= room:
            break
    tracked(d, (right, bottom_y + 3), domain.upper(), right_font, SLATE, dtrack,
            anchor_right=True)

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, optimize=True)
    return out


def main() -> int:
    p = argparse.ArgumentParser(description="BOROZDOV OG image")
    p.add_argument("--title", default="Рекорды России по плаванию")
    p.add_argument("--label", default="By Borozdov")
    p.add_argument("--fact", default="")
    p.add_argument("--domain", default="russwimming-records-junior.borozdov.ru")
    p.add_argument("--out", default="og-image.png")
    args = p.parse_args()
    out = render(Path(args.out), args.title, args.label, args.fact, args.domain)
    print(f"{out}: {W}×{H}, обсидиан")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
