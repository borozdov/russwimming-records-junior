# Юношеские рекорды России по плаванию

[![Ежедневное обновление](https://github.com/borozdov/russwimming-records-junior/actions/workflows/update.yml/badge.svg)](https://github.com/borozdov/russwimming-records-junior/actions/workflows/update.yml) [![Рекордов](https://img.shields.io/badge/рекордов-90-0d0d0d)](https://russwimming-records-junior.borozdov.ru/records.json) [![Обновлено](https://img.shields.io/badge/обновлено-02.09.2026-0d0d0d)](https://russwimming-records-junior.borozdov.ru) [![License: MIT](https://img.shields.io/badge/license-MIT-0d0d0d)](LICENSE)

Автообновляемое зеркало таблицы юношеских рекордов с [russwimming.ru](https://russwimming.ru/records/junior/).
Раз в сутки GitHub Actions забирает страницу источника, пересобирает статический
сайт и коммитит его в репозиторий вместе с выгрузками в пяти форматах; Timeweb Apps
выкладывает закоммиченный `public/` по каждому push.

**Сайт:** [russwimming-records-junior.borozdov.ru](https://russwimming-records-junior.borozdov.ru) · **Источник:** [russwimming.ru](https://russwimming.ru/records/junior/)

## Сейчас в данных

| | |
|---|---|
| Действующих рекордов | **90** |
| Категорий | **5** |
| Обновлено за 12 месяцев | **28** |
| Даты рекордов | 2009–2026 |
| Синхронизировано с источником | 02.09.2026 |

## Категории

| Категория | Рекордов | Страница |
|---|---:|---|
| Женщины, бассейн 50 м | 20 | [/women-lcm/](https://russwimming-records-junior.borozdov.ru/women-lcm/) |
| Женщины, бассейн 25 м | 23 | [/women-scm/](https://russwimming-records-junior.borozdov.ru/women-scm/) |
| Мужчины, бассейн 50 м | 20 | [/men-lcm/](https://russwimming-records-junior.borozdov.ru/men-lcm/) |
| Мужчины, бассейн 25 м | 23 | [/men-scm/](https://russwimming-records-junior.borozdov.ru/men-scm/) |
| Смешанные эстафеты | 4 | [/mixed/](https://russwimming-records-junior.borozdov.ru/mixed/) |

Фильтры, поиск и сортировка попадают в адрес страницы — отфильтрованный вид
можно переслать ссылкой. Любую таблицу можно выгрузить картинкой или PDF-плакатом
прямо из браузера.

## Скачать данные

Файлы пересобираются в той же сборке, что и сайт: и на сайте, и в репозитории
лежит одно и то же.

| Формат | Что внутри | С сайта | Из репозитория |
|---|---|---|---|
| JSON | структурированные данные | [records.json](https://russwimming-records-junior.borozdov.ru/records.json) | [raw](https://github.com/borozdov/russwimming-records-junior/raw/main/public/records.json) |
| CSV | Excel / Numbers | [records.csv](https://russwimming-records-junior.borozdov.ru/records.csv) | [raw](https://github.com/borozdov/russwimming-records-junior/raw/main/public/records.csv) |
| XLSX | книга по листам | [records.xlsx](https://russwimming-records-junior.borozdov.ru/records.xlsx) | [raw](https://github.com/borozdov/russwimming-records-junior/raw/main/public/records.xlsx) |
| MD | таблицы Markdown | [records.md](https://russwimming-records-junior.borozdov.ru/records.md) | [raw](https://github.com/borozdov/russwimming-records-junior/raw/main/public/records.md) |
| TXT | фиксированная ширина | [records.txt](https://russwimming-records-junior.borozdov.ru/records.txt) | [raw](https://github.com/borozdov/russwimming-records-junior/raw/main/public/records.txt) |

`records.json` — чистый API: служебные поля сборки в него не попадают,
структура повторяет `data/junior.json`.

```bash
curl -s https://russwimming-records-junior.borozdov.ru/records.json | jq '.total_records'
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

[Issues](https://github.com/borozdov/russwimming-records-junior/issues) · [borozdov.ru](https://borozdov.ru/)

## Лицензия

Код — [MIT](LICENSE). Данные принадлежат Всероссийской федерации плавания;
этот сайт — зеркало с атрибуцией источника.
