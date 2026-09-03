"""Тесты парсера и производных полей.

Парсер разбирает чужую вёрстку — это единственная по-настоящему хрупкая часть
проекта. Фикстур tests/fixtures/russia.html — срез взрослой таблицы russwimming.ru
(парсер общий с russwimming-records, юношеская страница свёрстана так же); если
источник сменит разметку, тесты продолжат проходить, а упадёт уже боевой
прогон fetch.py (там на это есть структурные проверки). Смысл этих тестов в
другом: не сломать разбор самим при рефакторинге.

  python -m unittest discover -s tests
"""
from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build  # noqa: E402
import fetch  # noqa: E402

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "russia.html"


class ParseFixtureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.categories = fetch.parse_records_from_html(
            FIXTURE.read_text(encoding="utf-8")
        )
        cls.records = [r for c in cls.categories for r in c["records"]]

    def test_five_categories_in_expected_order(self):
        self.assertEqual(
            [c["id"] for c in self.categories],
            ["women-lcm", "women-scm", "men-lcm", "men-scm", "mixed"],
        )

    def test_every_category_has_records(self):
        for cat in self.categories:
            self.assertGreater(len(cat["records"]), 0, cat["id"])

    def test_required_fields_are_filled(self):
        for r in self.records:
            self.assertTrue(r["discipline"], r)
            self.assertTrue(r["athlete"], r)
            self.assertTrue(r["result"], r)
            self.assertIsNotNone(r["result_seconds"], r["discipline"])
            self.assertIsNotNone(r["date"], r["discipline"])

    def test_stroke_recognised_for_every_record(self):
        unknown = [r["discipline"] for r in self.records if r["stroke_id"] == "unknown"]
        self.assertEqual(unknown, [])

    def test_relay_parsed_with_cyrillic_h(self):
        """В источнике «4 х 100 м» пишется кириллической «х», а не латинской «x»."""
        relays = [r for r in self.records if r["relay"]]
        self.assertTrue(relays)
        for r in relays:
            self.assertIsNotNone(r["relay_count"], r["discipline"])
            self.assertIsNotNone(r["leg_distance_m"], r["discipline"])
            self.assertEqual(
                r["total_distance_m"], r["relay_count"] * r["leg_distance_m"]
            )

    def test_relay_roster_extracted(self):
        with_roster = [r for r in self.records if r["roster"]]
        self.assertTrue(with_roster)
        for r in with_roster:
            self.assertTrue(r["relay"], r["discipline"])
            self.assertNotIn("(", r["athlete"])
            self.assertEqual(len(r["roster"]), r["relay_count"])

    def test_short_course_records_marked(self):
        scm = [c for c in self.categories if c["id"] == "men-scm"][0]
        self.assertTrue(all(r["is_25m_pool"] for r in scm["records"]))
        lcm = [c for c in self.categories if c["id"] == "men-lcm"][0]
        self.assertFalse(any(r["is_25m_pool"] for r in lcm["records"]))

    def test_mixed_category_holds_both_pools(self):
        mixed = [c for c in self.categories if c["id"] == "mixed"][0]
        pools = {r["is_25m_pool"] for r in mixed["records"]}
        self.assertEqual(pools, {True, False})


class ScalarParsingTest(unittest.TestCase):
    def test_result_to_seconds(self):
        self.assertAlmostEqual(fetch.result_to_seconds("26.91"), 26.91)
        self.assertAlmostEqual(fetch.result_to_seconds("1:56.16"), 116.16)
        self.assertAlmostEqual(fetch.result_to_seconds("14:32.10"), 872.10)
        self.assertIsNone(fetch.result_to_seconds(""))
        self.assertIsNone(fetch.result_to_seconds("—"))

    def test_date_to_iso(self):
        self.assertEqual(fetch.date_to_iso("12.08.2026"), "2026-08-12")
        self.assertIsNone(fetch.date_to_iso("август 2026"))
        self.assertIsNone(fetch.date_to_iso(""))

    def test_parse_athlete_splits_roster(self):
        team, roster = fetch.parse_athlete("Сборная России (Иванов И., Петров П.)")
        self.assertEqual(team, "Сборная России")
        self.assertEqual(roster, ["Иванов И.", "Петров П."])
        solo, none = fetch.parse_athlete("Гайфутдинова Алина")
        self.assertEqual(solo, "Гайфутдинова Алина")
        self.assertIsNone(none)

    def test_broken_row_is_skipped_not_fatal(self):
        html = """<table class="table-rating"><tr class="table__row">
            <div class="table__text">брасс 50 м</div>
            <div class="table__text">Иванов Иван</div>
        </tr><tr class="table__row">
            <div class="table__text">брасс 100 м</div>
            <div class="table__text">Петров Пётр</div>
            <div class="table__text">58.20</div>
            <div class="table__text">Казань</div>
            <div class="table__text">01.02.2020</div>
        </tr></table>"""
        # пять таблиц парсер требует всегда — проверяем разбор строк отдельно
        with self.assertRaises(RuntimeError):
            fetch.parse_records_from_html(html)


class SanityGuardTest(unittest.TestCase):
    def make(self, n: int):
        return [{"id": "x", "records": [{"stroke_id": "im"}] * n}]

    def test_passes_without_prior(self):
        fetch.check_sanity(self.make(10), None)

    def test_passes_on_small_change(self):
        fetch.check_sanity(self.make(95), {"total_records": 100})

    def test_fails_on_truncated_response(self):
        """Источник отдал 5 таблиц, но вдвое короче — данные затирать нельзя."""
        with self.assertRaises(RuntimeError):
            fetch.check_sanity(self.make(40), {"total_records": 100})


class DerivedFieldsTest(unittest.TestCase):
    def test_display_discipline_strips_pool_note(self):
        self.assertEqual(build.display_discipline("брасс 50 м  (бассейн 25 м)"), "Брасс 50 м")
        self.assertEqual(build.display_discipline("на спине 100 м"), "На спине 100 м")
        self.assertEqual(
            build.display_discipline("4 х 50 м комбинированная (бассейн 25 м)"),
            "4 х 50 м комбинированная",
        )

    def test_enrich_adds_pool_title_and_freshness(self):
        data = {
            "source_url": "x",
            "fetched_at": "2026-08-27T00:00:00Z",
            "total_records": 2,
            "categories": [
                {"id": "men-lcm", "title": "Мужчины, бассейн 50 м", "sex": "men",
                 "pool": "lcm", "records": [self.rec("брасс 50 м", 25.48, False)]},
                {"id": "men-scm", "title": "Мужчины, бассейн 25 м", "sex": "men",
                 "pool": "scm", "records": [self.rec("брасс 50 м (бассейн 25 м)", 24.48, True)]},
            ],
        }
        build.enrich(data, date(2026, 8, 28))
        lcm = data["categories"][0]["records"][0]
        scm = data["categories"][1]["records"][0]

        # бассейн из записи, а не из категории: в смешанных эстафетах обе воды
        self.assertEqual(lcm["_pool"], "lcm")
        self.assertEqual(scm["_pool"], "scm")
        self.assertEqual(lcm["_title"], "Брасс 50 м")
        self.assertTrue(lcm["_fresh"])

    def test_fresh_window_is_12_months(self):
        data = {
            "source_url": "x", "fetched_at": "2026-08-27T00:00:00Z", "total_records": 1,
            "categories": [
                {"id": "men-lcm", "title": "Мужчины, бассейн 50 м", "sex": "men",
                 "pool": "lcm", "records": [self.rec("брасс 50 м", 25.48, False)]},
            ],
        }
        build.enrich(data, date(2030, 1, 1))
        self.assertFalse(data["categories"][0]["records"][0]["_fresh"])

    @staticmethod
    def rec(discipline: str, seconds: float, scm: bool) -> dict:
        return {
            "discipline": discipline,
            **fetch.parse_discipline(discipline),
            "athlete": "Пригода Кирилл",
            "roster": None,
            "result": f"{seconds:.2f}",
            "result_seconds": seconds,
            "location": "Казань",
            "date": "2026-02-14",
            "date_original": "14.02.2026",
            "is_25m_pool": scm,
        }


class PublicJsonTest(unittest.TestCase):
    def test_derived_fields_are_not_leaked_into_public_api(self):
        data = {
            "source_url": "x", "fetched_at": "2026-08-27T00:00:00Z", "total_records": 1,
            "categories": [
                {"id": "men-lcm", "title": "Мужчины, бассейн 50 м", "sex": "men",
                 "pool": "lcm", "records": [DerivedFieldsTest.rec("брасс 50 м", 25.48, False)]},
            ],
        }
        build.enrich(data, date(2026, 8, 28))
        clean = build.public_json(data)
        keys = clean["categories"][0]["records"][0].keys()
        self.assertFalse([k for k in keys if k.startswith("_")])
        self.assertIn("result_seconds", keys)


if __name__ == "__main__":
    unittest.main()
