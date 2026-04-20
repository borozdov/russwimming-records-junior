#!/usr/bin/env python3
"""Build the public/ site from data/junior.json.

Outputs:
  public/index.html         — main page
  public/assets/style.css   — copied from static/
  public/assets/app.js      — copied from static/
  public/records.json       — same as data/junior.json (canonical API copy)
  public/records.csv        — all records in one CSV
  public/records.xlsx       — multi-sheet workbook (one sheet per category)
  public/records.md         — markdown tables
  public/records.txt        — fixed-width plain text
"""
from __future__ import annotations

import csv
import html
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "junior.json"
STATIC = ROOT / "static"
PUBLIC = ROOT / "public"
ASSETS = PUBLIC / "assets"

SITE_TITLE = "Юношеские рекорды России по плаванию"
SITE_TAGLINE = "Автообновляемое зеркало таблицы с russwimming.ru"
REPO_URL_ENV = "REPO_URL"

CSV_HEADERS = [
    "Категория", "Дисциплина", "Тип", "Спортсмен / Команда", "Состав эстафеты",
    "Результат", "Результат (сек)", "Место", "Дата", "Дата (ISO)",
]


def load_data() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def record_rows_for_csv(data: dict):
    for cat in data["categories"]:
        for r in cat["records"]:
            yield [
                cat["title"],
                r["discipline"],
                "эстафета" if r["relay"] else "личное",
                r["athlete"],
                " · ".join(r["roster"]) if r["roster"] else "",
                r["result"],
                f"{r['result_seconds']:.2f}" if r["result_seconds"] is not None else "",
                r["location"],
                r["date_original"],
                r["date"] or "",
            ]


def write_csv(data: dict, out: Path) -> None:
    with out.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, dialect="excel")
        w.writerow(CSV_HEADERS)
        for row in record_rows_for_csv(data):
            w.writerow(row)


def write_xlsx(data: dict, out: Path) -> None:
    wb = Workbook()
    wb.remove(wb.active)

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="0369A1")
    mono_font = Font(name="Menlo")
    center = Alignment(horizontal="center", vertical="center")

    for cat in data["categories"]:
        title = cat["title"][:31]
        ws = wb.create_sheet(title=title)
        headers = ["Дисциплина", "Спортсмен / Команда", "Состав эстафеты",
                   "Результат", "Место", "Дата"]
        ws.append(headers)
        for c in ws[1]:
            c.font = header_font
            c.fill = header_fill
            c.alignment = center
        for r in cat["records"]:
            ws.append([
                r["discipline"],
                r["athlete"],
                " · ".join(r["roster"]) if r["roster"] else "",
                r["result"],
                r["location"],
                r["date_original"],
            ])
        widths = [34, 26, 42, 12, 22, 14]
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w
        for row_idx in range(2, ws.max_row + 1):
            ws.cell(row=row_idx, column=4).font = mono_font
        ws.freeze_panes = "A2"

    ws = wb.create_sheet(title="Все", index=0)
    ws.append(CSV_HEADERS)
    for c in ws[1]:
        c.font = header_font
        c.fill = header_fill
        c.alignment = center
    for row in record_rows_for_csv(data):
        ws.append(row)
    widths = [28, 34, 10, 24, 42, 12, 14, 22, 14, 14]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"

    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)


def write_markdown(data: dict, out: Path) -> None:
    lines = [
        f"# {SITE_TITLE}",
        "",
        f"Источник: <{data['source_url']}>  ",
        f"Обновлено: {data['fetched_at']}  ",
        f"Всего рекордов: {data['total_records']}",
        "",
    ]
    for cat in data["categories"]:
        lines.append(f"## {cat['title']}")
        lines.append("")
        lines.append("| Дисциплина | Спортсмен | Результат | Место | Дата |")
        lines.append("|---|---|---|---|---|")
        for r in cat["records"]:
            athlete = r["athlete"]
            if r["roster"]:
                athlete += " (" + ", ".join(r["roster"]) + ")"
            lines.append(
                f"| {r['discipline']} | {athlete} | `{r['result']}` | "
                f"{r['location']} | {r['date_original']} |"
            )
        lines.append("")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_txt(data: dict, out: Path) -> None:
    rows = []
    for cat in data["categories"]:
        rows.append(f"=== {cat['title']} ===")
        for r in cat["records"]:
            athlete = r["athlete"]
            if r["roster"]:
                athlete += " (" + ", ".join(r["roster"]) + ")"
            rows.append(f"  {r['discipline']:<42}  {r['result']:>9}  {athlete:<60}  {r['location']:<22}  {r['date_original']}")
        rows.append("")
    out.write_text("\n".join(rows) + "\n", encoding="utf-8")


def copy_static() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    for name in ("style.css", "app.js"):
        shutil.copy2(STATIC / name, ASSETS / name)


INDEX_TEMPLATE = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{description}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta name="theme-color" content="#0057b8">
<title>{title}</title>
<link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><text y='52' font-size='56'>🏊</text></svg>">
<link rel="stylesheet" href="./assets/style.css">
</head>
<body>

<div class="site-hero">
  <div class="hero-inner">
    <div class="hero-top">
      <div>
        <h1 class="site-title">
          <span class="flag">🇷🇺</span> {title}
        </h1>
        <p class="site-subtitle">
          Источник: <a href="{source_url}" rel="noopener" target="_blank">russwimming.ru/records/junior/</a>
          &nbsp;·&nbsp; обновлено <time datetime="{fetched_at_iso}"><strong>{fetched_at_human}</strong></time>
          {history_link}
        </p>
        <div class="stat-row" style="margin-top:12px">
          <div class="stat-pill"><strong id="total-count">{total}</strong> рекордов</div>
          <div class="stat-pill"><strong>5</strong> категорий</div>
          <div class="stat-pill">⟳ раз в сутки</div>
        </div>
      </div>
      <div class="hero-actions">
        <button class="btn" id="theme-toggle">⌁ Авто</button>
        <button class="btn" id="print-btn">🖨 Печать</button>
        <div class="download-menu" id="dl-menu">
          <button class="btn primary" id="dl-btn">⭳ Скачать ▾</button>
          <div class="download-menu-panel">
            <a href="./records.json" download>
              <span><span class="dl-icon">&#x7B;&#x7D;</span> JSON</span>
              <span class="hint">структурированно</span>
            </a>
            <a href="./records.csv" download>
              <span><span class="dl-icon">⊞</span> CSV</span>
              <span class="hint">Excel / Numbers</span>
            </a>
            <a href="./records.xlsx" download>
              <span><span class="dl-icon">⊞</span> XLSX</span>
              <span class="hint">по листам</span>
            </a>
            <a href="./records.md" download>
              <span><span class="dl-icon">#</span> Markdown</span>
              <span class="hint">для README</span>
            </a>
            <a href="./records.txt" download>
              <span><span class="dl-icon">≡</span> TXT</span>
              <span class="hint">фикс-ширина</span>
            </a>
          </div>
        </div>
      </div>
    </div>
    <nav class="hero-tabs" id="tabs" aria-label="Категории"></nav>
  </div>
</div>

<main class="container">
  <div class="controls">
    <label class="search">
      <span class="icon" aria-hidden="true">⌕</span>
      <input id="search" type="search" placeholder="Поиск по фамилии, дисциплине, городу…" autocomplete="off">
    </label>
  </div>

  <div class="filters" id="filters" aria-label="Фильтры"></div>
  <div id="table" class="table-wrap"></div>

  <div class="meta-bar">
    <span>Показано: <strong id="visible-count">—</strong></span>
  </div>

  <footer class="footer">
    Данные синхронизируются раз в сутки с <a href="{source_url}" rel="noopener" target="_blank">russwimming.ru</a>.<br>
    Если рекорд отсутствует или выглядит устаревшим — сайт-источник ещё не обновил свою таблицу.
  </footer>
</main>

<script id="records-data" type="application/json">{data_json}</script>
<script src="./assets/app.js"></script>
</body>
</html>
"""


def write_index(data: dict, out: Path) -> None:
    fetched_dt = datetime.strptime(data["fetched_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    fetched_human = fetched_dt.strftime("%d.%m.%Y")

    import os
    repo_url = os.environ.get(REPO_URL_ENV, "").strip()
    history_link = ""
    if repo_url:
        repo_url = repo_url.rstrip("/")
        history_link = (
            f'· <a href="{repo_url}/commits/main/data/junior.json" '
            f'rel="noopener" target="_blank">история изменений</a>'
        )

    html_doc = INDEX_TEMPLATE.format(
        title=html.escape(SITE_TITLE),
        description=html.escape(SITE_TAGLINE),
        source_url=html.escape(data["source_url"]),
        total=data["total_records"],
        fetched_at_iso=data["fetched_at"],
        fetched_at_human=fetched_human,
        history_link=history_link,
        data_json=json.dumps(data, ensure_ascii=False).replace("</", "<\\/"),
    )
    out.write_text(html_doc, encoding="utf-8")


def main() -> int:
    data = load_data()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)

    copy_static()
    write_index(data, PUBLIC / "index.html")
    (PUBLIC / "records.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    write_csv(data, PUBLIC / "records.csv")
    write_xlsx(data, PUBLIC / "records.xlsx")
    write_markdown(data, PUBLIC / "records.md")
    write_txt(data, PUBLIC / "records.txt")

    print(f"built {PUBLIC.relative_to(ROOT)}/ — {data['total_records']} records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
