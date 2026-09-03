"""README собирается из данных, а не пишется руками.

Проверяем ровно то, что ломается молча: числа разъехались с data/junior.json,
пропала строка формата из DOWNLOAD_FORMATS, в шаблоне остался незакрытый
плейсхолдер, или закоммиченный README отстал от сборки.
"""
import re
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build  # noqa: E402
import gen_readme  # noqa: E402

TODAY = date(2026, 8, 31)
DOMAIN = "example.test"
REPO = "https://github.com/user/repo"


def sample():
    def rec(iso):
        return {"discipline": "вольный стиль 50 м", "relay": False, "is_25m_pool": False,
                "athlete": "Иванов Иван", "roster": None, "result": "24.20",
                "result_seconds": 24.20, "location": "Казань", "date": iso,
                "date_original": "09.04." + iso[:4]}

    return {
        "source_url": "https://russwimming.ru/records/junior/",
        "fetched_at": "2026-08-27T17:33:28Z",
        "total_records": 3,
        "categories": [
            {"id": "women-lcm", "title": "Женщины, бассейн 50 м", "sex": "women",
             "pool": "lcm", "records": [rec("2009-04-09"), rec("2026-06-01")]},
            {"id": "mixed", "title": "Смешанные эстафеты", "sex": "mixed",
             "pool": "mixed", "records": [rec("2018-07-07")]},
        ],
    }


def render(data):
    build.enrich(data, TODAY)
    return gen_readme.render(data, domain=DOMAIN, fetched_human="27.08.2026",
                             formats=build.DOWNLOAD_FORMATS, repo_url=REPO)


class TestReadme(unittest.TestCase):
    def setUp(self):
        self.md = render(sample())

    def test_numbers_match_data(self):
        self.assertIn("| Действующих рекордов | **3** |", self.md)
        self.assertIn("| Категорий | **2** |", self.md)
        # свежим считается только рекорд 2026 года — от TODAY, а не от «сегодня»
        self.assertIn("| Обновлено за 12 месяцев | **1** |", self.md)
        self.assertIn("| Даты рекордов | 2009–2026 |", self.md)
        self.assertIn("27.08.2026", self.md)

    def test_every_category_listed(self):
        self.assertIn(f"[/women-lcm/](https://{DOMAIN}/women-lcm/)", self.md)
        self.assertIn(f"[/mixed/](https://{DOMAIN}/mixed/)", self.md)

    def test_every_download_format_listed(self):
        for name, label, _ in build.DOWNLOAD_FORMATS:
            self.assertIn(f"| {label} |", self.md)
            self.assertIn(f"(https://{DOMAIN}/{name})", self.md)
            self.assertIn(f"({REPO}/raw/{gen_readme.BRANCH}/public/{name})", self.md)

    def test_contact_matches_site(self):
        # телеграм убран и с сайта, и отсюда: контакт идёт через borozdov.ru
        self.assertNotIn("t.me", self.md)
        self.assertIn(f"({REPO}/issues)", self.md)
        self.assertIn("(https://borozdov.ru/)", self.md)

    def test_no_unfilled_placeholders(self):
        self.assertEqual([], re.findall(r"\{[a-z_]+\}", self.md))

    def test_repo_url_defaults_when_env_missing(self):
        data = sample()
        build.enrich(data, TODAY)
        md = gen_readme.render(data, domain=DOMAIN, fetched_human="27.08.2026",
                               formats=build.DOWNLOAD_FORMATS, repo_url=None)
        self.assertIn(gen_readme.DEFAULT_REPO_URL, md)

    def test_committed_readme_is_current(self):
        """README в репозитории должен совпадать с тем, что собрал бы build.py."""
        data = build.load_data()
        build.enrich(data, TODAY)
        expected = gen_readme.render(
            data, domain=build.SITE_DOMAIN, fetched_human="27.08.2026",
            formats=build.DOWNLOAD_FORMATS, repo_url=None)
        actual = (ROOT / "README.md").read_text(encoding="utf-8")
        # дата синхронизации и счётчик свежих зависят от прогона — сравниваем скелет
        strip = lambda t: re.sub(r"\d[\d.\-–]*", "#", t)  # noqa: E731
        self.assertEqual(strip(expected), strip(actual))


if __name__ == "__main__":
    unittest.main()
