#!/usr/bin/env python3
"""Fetch Russian swimming records from russwimming.ru and write a normalized JSON."""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SOURCE_URL = "https://russwimming.ru/records/junior/"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "junior.json"

CATEGORIES = [
    {"id": "women-lcm", "title": "Женщины, бассейн 50 м", "sex": "women", "pool": "lcm"},
    {"id": "women-scm", "title": "Женщины, бассейн 25 м", "sex": "women", "pool": "scm"},
    {"id": "men-lcm",   "title": "Мужчины, бассейн 50 м", "sex": "men",   "pool": "lcm"},
    {"id": "men-scm",   "title": "Мужчины, бассейн 25 м", "sex": "men",   "pool": "scm"},
    {"id": "mixed",     "title": "Смешанные эстафеты",    "sex": "mixed", "pool": "mixed"},
]

STROKES = [
    ("вольный стиль", "freestyle"),
    ("на спине", "backstroke"),
    ("брасс", "breaststroke"),
    ("баттерфляй", "butterfly"),
    ("комплексное плавание", "im"),
    ("комплекс", "im"),
    ("комбинированная", "medley_relay"),
]


def fetch_html(url: str) -> str:
    r = requests.get(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "ru,en;q=0.8"}, timeout=30)
    r.raise_for_status()
    r.encoding = r.apparent_encoding or "utf-8"
    return r.text


def result_to_seconds(raw: str) -> float | None:
    raw = raw.strip()
    if not raw:
        return None
    try:
        if ":" in raw:
            minutes, seconds = raw.split(":", 1)
            return int(minutes) * 60 + float(seconds)
        return float(raw)
    except ValueError:
        return None


def date_to_iso(raw: str) -> str | None:
    raw = raw.strip()
    try:
        return datetime.strptime(raw, "%d.%m.%Y").date().isoformat()
    except ValueError:
        return None


def parse_discipline(text: str) -> dict:
    """Extract stroke / distance / relay info from the discipline cell."""
    t = text.strip()
    # Relay? e.g. "4 х 100 м вольный стиль" (Cyrillic «х»)
    relay_match = re.match(r"^(\d+)\s*[хx]\s*(\d+)\s*м\s*(.*)$", t, flags=re.IGNORECASE)
    if relay_match:
        count = int(relay_match.group(1))
        leg = int(relay_match.group(2))
        tail = relay_match.group(3).strip()
        stroke_id = "unknown"
        for label, sid in STROKES:
            if label in tail.lower():
                stroke_id = sid
                break
        return {
            "relay": True,
            "relay_count": count,
            "leg_distance_m": leg,
            "total_distance_m": count * leg,
            "distance_m": leg,
            "stroke_id": stroke_id,
            "is_25m_pool": "(бассейн 25 м)" in t,
        }
    dist_match = re.search(r"(\d+)\s*м", t)
    distance = int(dist_match.group(1)) if dist_match else None
    low = t.lower()
    stroke_id = "unknown"
    for label, sid in STROKES:
        if label in low:
            stroke_id = sid
            break
    return {
        "relay": False,
        "relay_count": None,
        "leg_distance_m": None,
        "total_distance_m": distance,
        "distance_m": distance,
        "stroke_id": stroke_id,
        "is_25m_pool": "(бассейн 25 м)" in t,
    }


def parse_athlete(raw: str) -> tuple[str, list[str] | None]:
    """Split «Сборная России (A, B, C, D)» into team + roster."""
    m = re.match(r"^(.*?)\s*\((.*)\)\s*$", raw.strip())
    if not m:
        return raw.strip(), None
    team = m.group(1).strip()
    roster = [p.strip() for p in m.group(2).split(",") if p.strip()]
    return team, roster or None


def parse_records_from_html(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    tables = soup.select("table.table-rating")
    if len(tables) != len(CATEGORIES):
        raise RuntimeError(f"expected {len(CATEGORIES)} tables, got {len(tables)} — layout changed?")

    categories: list[dict] = []
    for cat, table in zip(CATEGORIES, tables):
        records = []
        for tr in table.select("tr.table__row"):
            cells = [c.get_text(" ", strip=True) for c in tr.select("div.table__text")]
            if len(cells) < 5:
                continue
            discipline, athlete_raw, result_raw, location, date_raw = cells[:5]
            athlete, roster = parse_athlete(athlete_raw)
            rec = {
                "discipline": discipline,
                **parse_discipline(discipline),
                "athlete": athlete,
                "roster": roster,
                "result": result_raw.strip(),
                "result_seconds": result_to_seconds(result_raw),
                "location": location.strip(),
                "date": date_to_iso(date_raw),
                "date_original": date_raw.strip(),
            }
            records.append(rec)
        if not records:
            raise RuntimeError(f"no records parsed for category '{cat['id']}'")
        # Stable sort: by distance, then relay flag, then stroke, then result
        records.sort(key=lambda r: (
            r["relay"],
            r["total_distance_m"] or 0,
            r["stroke_id"],
            r["result_seconds"] or 0,
        ))
        categories.append({**cat, "records": records})
    return categories


def main() -> int:
    html = fetch_html(SOURCE_URL)
    categories = parse_records_from_html(html)
    total = sum(len(c["records"]) for c in categories)
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    prior_categories = None
    if OUT.exists():
        try:
            prior = json.loads(OUT.read_text(encoding="utf-8"))
            prior_categories = prior.get("categories")
        except (json.JSONDecodeError, OSError):
            pass

    payload = {
        "source_url": SOURCE_URL,
        "fetched_at": now_iso,
        "total_records": total,
        "categories": categories,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    changed = prior_categories != categories
    print(
        f"wrote {OUT.relative_to(ROOT)} ({total} records across {len(categories)} categories) "
        f"— {'CHANGED' if changed else 'no changes'}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
