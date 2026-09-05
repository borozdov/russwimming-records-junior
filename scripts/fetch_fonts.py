#!/usr/bin/env python3
"""Download Inter + JetBrains Mono from Google Fonts.

Разовый скрипт: шрифты коммитятся в репозиторий, ежедневная сборка их не трогает.
Запускать только при смене начертаний или сабсетов.

  python scripts/fetch_fonts.py            # всё
  python scripts/fetch_fonts.py --og-only  # только ttf для Pillow

Кладёт два набора:
  static/fonts/*.woff2    — для сайта; переменные шрифты, один файл на сабсет
  scripts/og-fonts/*.ttf  — для gen_og.py, gen_icons.py и gen_screens.py; Pillow
                            не умеет woff2, а на раннере CI брендовых шрифтов нет,
                            иначе OG, иконки и скриншоты манифеста рисуются чем попало

Сабсеты только cyrillic + latin: cyrillic-ext/latin-ext/greek/vietnamese сайту не нужны.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "fonts"
CSS_OUT = ROOT / "static" / "fonts.css"
OG_OUT = ROOT / "scripts" / "og-fonts"

# Chrome-UA обязателен: под старым UA Google отдаёт ttf/woff и статические начертания
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
)

FAMILIES = [
    ("Inter", "Inter:wght@400..700"),
    ("JetBrains Mono", "JetBrains+Mono:wght@400..700"),
]
KEEP_SUBSETS = ("cyrillic", "latin")

# Старый UA — и Google отдаёт ttf вместо woff2, уже сабсетнутый по &subset=
UA_LEGACY = "Mozilla/4.0"
OG_FONTS = [
    ("inter-regular.ttf", "Inter:400"),
    ("inter-medium.ttf", "Inter:500"),
    ("inter-semibold.ttf", "Inter:600"),
    ("inter-bold.ttf", "Inter:700"),
    ("jetbrains-mono-medium.ttf", "JetBrains+Mono:500"),
    ("jetbrains-mono-bold.ttf", "JetBrains+Mono:700"),
]


def slug(family: str, subset: str) -> str:
    return f"{family.lower().replace(' ', '-')}-{subset}.woff2"


def parse_css(css: str) -> list[dict]:
    """Google отдаёт блоки @font-face, каждому предшествует комментарий с именем сабсета."""
    faces = []
    subset = "unknown"
    for chunk in re.split(r"(/\*\s*[a-z-]+\s*\*/)", css):
        m = re.fullmatch(r"/\*\s*([a-z-]+)\s*\*/", chunk.strip())
        if m:
            subset = m.group(1)
            continue
        for block in re.findall(r"@font-face\s*\{[^}]*\}", chunk):
            url = re.search(r"url\((https://[^)]+\.woff2)\)", block)
            family = re.search(r"font-family:\s*'([^']+)'", block)
            weight = re.search(r"font-weight:\s*([^;]+);", block)
            unicode_range = re.search(r"unicode-range:\s*([^;]+);", block)
            if not (url and family):
                continue
            faces.append({
                "subset": subset,
                "url": url.group(1),
                "family": family.group(1),
                "weight": weight.group(1).strip() if weight else "400",
                "range": unicode_range.group(1).strip() if unicode_range else "",
            })
    return faces


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    css_rules: list[str] = [
        "/* Локальные шрифты. Сгенерировано scripts/fetch_fonts.py — руками не править. */",
    ]
    total = 0

    for family, spec in FAMILIES:
        url = f"https://fonts.googleapis.com/css2?family={spec}&display=swap"
        r = requests.get(url, headers={"User-Agent": UA}, timeout=30)
        r.raise_for_status()
        faces = [f for f in parse_css(r.text) if f["subset"] in KEEP_SUBSETS]
        if not faces:
            raise RuntimeError(f"{family}: не нашли ни одного нужного сабсета")

        for face in faces:
            name = slug(family, face["subset"])
            blob = requests.get(face["url"], headers={"User-Agent": UA}, timeout=30)
            blob.raise_for_status()
            (OUT / name).write_bytes(blob.content)
            total += len(blob.content)
            print(f"  {name:<34} {len(blob.content) / 1024:6.1f} KB  {face['weight']}")
            css_rules.append(
                "\n@font-face {\n"
                f"  font-family: '{face['family']}';\n"
                "  font-style: normal;\n"
                f"  font-weight: {face['weight']};\n"
                "  font-display: swap;\n"
                f"  src: url('./fonts/{name}') format('woff2');\n"
                f"  unicode-range: {face['range']};\n"
                "}"
            )

    CSS_OUT.write_text("\n".join(css_rules) + "\n", encoding="utf-8")
    print(f"\nwrote {len(list(OUT.glob('*.woff2')))} files, {total / 1024:.1f} KB total")
    print(f"wrote {CSS_OUT.relative_to(ROOT)}")

    fetch_og_fonts()
    return 0


def fetch_og_fonts() -> None:
    OG_OUT.mkdir(parents=True, exist_ok=True)
    print("\nog-fonts (ttf для Pillow):")
    for name, spec in OG_FONTS:
        css = requests.get(
            f"https://fonts.googleapis.com/css?family={spec}&subset=cyrillic,latin",
            headers={"User-Agent": UA_LEGACY}, timeout=30,
        )
        css.raise_for_status()
        m = re.search(r"url\((https://[^)]+\.ttf)\)", css.text)
        if not m:
            raise RuntimeError(f"{spec}: ttf не найден — Google сменил формат ответа?")
        blob = requests.get(m.group(1), headers={"User-Agent": UA_LEGACY}, timeout=30)
        blob.raise_for_status()
        (OG_OUT / name).write_bytes(blob.content)
        print(f"  {name:<34} {len(blob.content) / 1024:6.1f} KB")


if __name__ == "__main__":
    if "--og-only" in sys.argv[1:]:
        fetch_og_fonts()
        sys.exit(0)
    sys.exit(main())
