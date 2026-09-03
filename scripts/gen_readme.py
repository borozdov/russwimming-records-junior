#!/usr/bin/env python3
"""README репозитория собирается из тех же данных, что и сайт.

Числа в описании (сколько рекордов, сколько обновилось за год, когда
синхронизировали) руками не поддерживаются: их пишет сюда build.py на каждой
сборке, а workflow коммитит README вместе с data/ и public/. Поэтому в файле
не должно появляться цифр, набранных вручную, — они разъедутся молча.

Читает `_fresh`, который проставляет build.enrich(): признак свежести считается
от даты сборки, а не в браузере и не тут.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "README.md"

DEFAULT_REPO_URL = "https://github.com/borozdov/russwimming-records-junior"
BRANCH = "main"

TEMPLATE = """# Юношеские рекорды России по плаванию

{badges}

Автообновляемое зеркало таблицы юношеских рекордов с [russwimming.ru]({source_url}).
Раз в сутки GitHub Actions забирает страницу источника, пересобирает статический
сайт и коммитит его в репозиторий вместе с выгрузками в пяти форматах; Timeweb Apps
выкладывает закоммиченный `public/` по каждому push.

**Сайт:** [{domain}](https://{domain}) · **Источник:** [russwimming.ru]({source_url})

## Сейчас в данных

| | |
|---|---|
| Действующих рекордов | **{total}** |
| Категорий | **{categories}** |
| Обновлено за 12 месяцев | **{fresh}** |
| Даты рекордов | {year_min}–{year_max} |
| Синхронизировано с источником | {fetched_human} |

## Категории

| Категория | Рекордов | Страница |
|---|---:|---|
{category_rows}

Фильтры, поиск и сортировка попадают в адрес страницы — отфильтрованный вид
можно переслать ссылкой. Любую таблицу можно выгрузить картинкой или PDF-плакатом
прямо из браузера.

## Скачать данные

Файлы пересобираются в той же сборке, что и сайт: и на сайте, и в репозитории
лежит одно и то же.

| Формат | Что внутри | С сайта | Из репозитория |
|---|---|---|---|
{download_rows}

`records.json` — чистый API: служебные поля сборки в него не попадают,
структура повторяет `data/junior.json`.

```bash
curl -s https://{domain}/records.json | jq '.total_records'
```

## Как это устроено

Однонаправленный конвейер, ручных шагов нет:

```
russwimming.ru  →  scripts/fetch.py  →  data/junior.json  →  scripts/build.py  →  public/  →  Timeweb Apps
```

- **`scripts/fetch.py`** — парсит таблицы источника, нормализует дисциплины,
  результаты и даты. Перезаписывает `data/junior.json` только при реальных
  изменениях, поэтому история файла = история рекордов. Падает, если структура
  страницы поехала или число рекордов упало больше чем на 10%: молчаливая
  деградация хуже упавшего workflow.
- **`data/junior.json`** — канонические данные в репозитории.
- **`scripts/build.py`** — генерирует весь `public/`: главную, страницы категорий,
  выгрузки, sitemap, OG-картинку, иконки и этот README.
- **`static/app.js`** — прогрессивное улучшение поверх серверного рендера:
  без JavaScript сайт остаётся читаемой таблицей со ссылками.

## Локальная сборка

```bash
pip install -r requirements.txt
```

```bash
python scripts/fetch.py && python scripts/build.py && python -m unittest discover -s tests
```

`build.py` сети не требует — при правках вёрстки, стилей или скриптов достаточно
его одного. Локальный просмотр:

```bash
python3 -m http.server 4173 --directory public
```

## Структура

```
data/junior.json     канонические данные
scripts/fetch.py     скрейпер источника
scripts/build.py     генератор сайта и выгрузок
scripts/gen_og.py    OG-картинка
scripts/gen_icons.py фавикон и иконки приложений
scripts/gen_readme.py этот файл
static/              исходные CSS/JS, копируются в public/assets
public/              собранный сайт (Timeweb Apps раздаёт его как есть)
tests/               парсер, контракт разметки, геометрия иконок
```

## Вопросы и предложения

[Issues]({repo_url}/issues) · [borozdov.ru](https://borozdov.ru/)

## Лицензия

Код — [MIT](LICENSE). Данные принадлежат Всероссийской федерации плавания;
этот сайт — зеркало с атрибуцией источника.
"""


def _badges(repo_url: str, domain: str, total: int, fetched_human: str) -> str:
    workflow = f"{repo_url}/actions/workflows/update.yml"
    return " ".join([
        f"[![Ежедневное обновление]({workflow}/badge.svg)]({workflow})",
        f"[![Рекордов](https://img.shields.io/badge/рекордов-{total}-0d0d0d)]"
        f"(https://{domain}/records.json)",
        f"[![Обновлено](https://img.shields.io/badge/обновлено-{fetched_human}-0d0d0d)]"
        f"(https://{domain})",
        "[![License: MIT](https://img.shields.io/badge/license-MIT-0d0d0d)](LICENSE)",
    ])


def render(data: dict, *, domain: str, fetched_human: str, formats: list[tuple],
           repo_url: str | None = None) -> str:
    repo_url = (repo_url or DEFAULT_REPO_URL).rstrip("/")
    records = [r for cat in data["categories"] for r in cat["records"]]
    years = sorted(r["date"][:4] for r in records if r["date"])

    category_rows = "\n".join(
        f"| {cat['title']} | {len(cat['records'])} | "
        f"[/{cat['id']}/](https://{domain}/{cat['id']}/) |"
        for cat in data["categories"]
    )
    download_rows = "\n".join(
        f"| {label} | {note} | [{name}](https://{domain}/{name}) | "
        f"[raw]({repo_url}/raw/{BRANCH}/public/{name}) |"
        for name, label, note in formats
    )

    return TEMPLATE.format(
        badges=_badges(repo_url, domain, len(records), fetched_human),
        source_url=data["source_url"],
        domain=domain,
        total=len(records),
        categories=len(data["categories"]),
        fresh=sum(1 for r in records if r.get("_fresh")),
        year_min=years[0] if years else "—",
        year_max=years[-1] if years else "—",
        fetched_human=fetched_human,
        category_rows=category_rows,
        download_rows=download_rows,
        repo_url=repo_url,
    )


def write(data: dict, out: Path = OUT, **kw) -> None:
    out.write_text(render(data, **kw), encoding="utf-8")
