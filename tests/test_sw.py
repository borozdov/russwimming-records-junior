"""Service worker, офлайн-страница и версионирование ассетов.

Всё здесь ломается молча: опечатка в пути прекэша роняет `addAll` целиком (SW не
установится ни у кого, а на странице ни одной ошибки), недетерминированный хеш
даёт ежедневный мусорный коммит sw.js, случайный <link> в offline.html делает
фолбэк белым экраном, переименование SKIP_WAITING на одной стороне отключает
кнопку «Обновить».
"""
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build  # noqa: E402

PAGES = ["/w/", "/m/"]


def tree(salt: bytes = b"") -> Path:
    """Мини-public/: все прекэш-файлы существуют, содержимое — их URL плюс соль."""
    d = Path(tempfile.mkdtemp())
    for url in build.app_files(PAGES) + build.font_urls() + build.vendor_urls():
        p = build.fs_path(d, url)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(url.encode() + salt)
    return d


def cache_names(sw: str) -> tuple[str, str]:
    return (re.search(r'const APP = "(app-[0-9a-f]{12})"', sw)[1],
            re.search(r'const STATIC = "(static-[0-9a-f]{12})"', sw)[1])


class ServiceWorker(unittest.TestCase):
    def test_version_stable_across_builds(self):
        d = tree()
        self.assertEqual(build.service_worker(d, PAGES), build.service_worker(d, PAGES))

    def test_version_tracks_bytes(self):
        a = build.service_worker(tree(), PAGES)
        b = build.service_worker(tree(b"x"), PAGES)
        self.assertNotEqual(cache_names(a), cache_names(b))

    def test_missing_precache_file_raises(self):
        d = tree()
        build.fs_path(d, "/offline.html").unlink()
        with self.assertRaises(FileNotFoundError):
            build.service_worker(d, PAGES)

    def test_no_placeholders_left(self):
        self.assertNotRegex(build.service_worker(tree(), PAGES), r"__[A-Z_]+__")

    def test_precache_lists_pages_and_versioned_assets(self):
        sw = build.service_worker(tree(), PAGES)
        files = json.loads(re.search(r"const APP_FILES = (\[.*?\]);", sw)[1])
        fonts = json.loads(re.search(r"const FONTS = (\[.*?\]);", sw)[1])
        self.assertEqual(files[:3], ["/", "/w/", "/m/"])
        self.assertIn("/offline.html", files)
        self.assertIn("/site.webmanifest", files)
        # ассеты — ровно с той версией, что и в HTML (см. test_html_references_same_urls)
        self.assertIn(build.asset_url("style.css"), files)
        self.assertIn(build.asset_url("app.js"), files)
        self.assertTrue(fonts and all(re.search(r"\.woff2\?v=[0-9a-f]{8}$", f) for f in fonts))

    def test_html_references_same_urls(self):
        """HTML и прекэш обязаны сходиться побайтно: иначе старый кэш отдаст
        чужой app.js к новому HTML, и контракт разметки разъедется молча."""
        page = build.render_page(
            data={"source_url": "https://example.org", "fetched_at": "2026-08-27T17:33:28Z",
                  "total_records": 0, "categories": []},
            categories=[], canonical="https://example.org/", title="t", og_title="t",
            description="d", h1="h", eyebrow="e", intro="i", current="",
            fetched_human="27.08.2026", with_faq=False, table_h2="h2", caption="c",
        )
        self.assertIn(f'href="{build.asset_url("style.css")}"', page)
        self.assertIn(f'src="{build.asset_url("app.js")}"', page)
        for url in build.font_urls():
            self.assertIn(f"url('{url}')", page, url)
        # отдельного fonts.css больше нет — шрифты инлайном, в прекэш он не входит
        self.assertNotIn("fonts.css", page)
        self.assertNotIn("/assets/fonts.css", build.app_files([]))

    def test_strategies(self):
        sw = build.SW_TEMPLATE
        self.assertIn('url.origin !== self.location.origin', sw)   # Метрика мимо
        self.assertIn('req.mode === "navigate"', sw)               # страницы — network-first
        self.assertIn('cache: "reload"', sw)                       # прекэш мимо HTTP-кэша
        self.assertIn('"SKIP_WAITING"', sw)
        self.assertNotIn("caches.match(", sw)                      # только именованные кэши
        self.assertNotIn("Date.now", sw)                           # версия — не время
        # Выгрузки — первой веткой: в Chrome <a download> приходит как navigate
        # (офлайн-страница уезжала бы в файл), а поиск по кэшам сделал бы их
        # cache-first навсегда. Порядок веток ломается молча.
        records = sw.index('startsWith("/records.")')
        self.assertLess(records, sw.index('req.mode === "navigate"'))
        self.assertLess(records, sw.index("const hit"))

    def test_update_contract_with_app_js(self):
        app = (build.STATIC / "app.js").read_text(encoding="utf-8")
        self.assertIn('register("/sw.js"', app)
        self.assertIn('{ type: "SKIP_WAITING" }', app)
        self.assertIn("controllerchange", app)

    def test_committed_sw_matches_public(self):
        """Как test_readme: закоммиченный public/ не отстал от сборки."""
        sw = (build.PUBLIC / "sw.js").read_text(encoding="utf-8")
        for arr in re.findall(r"= (\[.*?\]);", sw):
            for url in json.loads(arr):
                self.assertTrue(build.fs_path(build.PUBLIC, url).is_file(), url)
        self.assertEqual(cache_names(sw), cache_names(build.service_worker(build.PUBLIC, [
            p for p in json.loads(re.search(r"const APP_FILES = (\[.*?\]);", sw)[1])
            if p.endswith("/") and p != "/"
        ])))


class OfflinePage(unittest.TestCase):
    def test_self_contained(self):
        page = build.offline_html()
        self.assertNotRegex(page, r'<link|<script[^>]+src=|url\(|href="/assets|https?://')
        self.assertIn("data-theme", page)
        self.assertNotIn("__THEME__", page)
        self.assertNotIn("__DOMAIN__", page)
        self.assertIn(build.SITE_DOMAIN, page)

    def test_not_in_sitemap(self):
        self.assertIn('content="noindex"', build.OFFLINE_HTML)


class Head(unittest.TestCase):
    """Мета-теги, без которых PWA на iOS/Android ведёт себя не так, как задумано."""

    def test_pwa_metas(self):
        tpl = build.PAGE_TEMPLATE
        self.assertIn("viewport-fit=cover", tpl)
        self.assertIn('<meta name="theme-color" id="theme-color"', tpl)
        self.assertIn('<meta name="mobile-web-app-capable" content="yes">', tpl)
        self.assertIn('<meta name="apple-mobile-web-app-capable" content="yes">', tpl)
        # default, не black-translucent: тот игнорирует theme-color и ломает титан
        self.assertIn('<meta name="apple-mobile-web-app-status-bar-style" content="default">', tpl)
        self.assertIn("{startup_images}", tpl)
        self.assertIn("{fonts_css}", tpl)

    def test_theme_script_uses_meta_id(self):
        self.assertIn('getElementById("theme-color")', build.THEME_SCRIPT)
        # мета обязана стоять ДО инлайнового скрипта: он ищет её по id в момент
        # исполнения, и позже её никто не перекрасит (в offline.html app.js нет)
        tpl = build.PAGE_TEMPLATE
        self.assertLess(tpl.index('id="theme-color"'), tpl.index("{theme_script}"))
        off = build.OFFLINE_HTML
        self.assertLess(off.index('id="theme-color"'), off.index("__THEME__"))

    def test_history_link_does_not_depend_on_env(self):
        """HTML входит в хеш sw.js: локальная сборка без REPO_URL обязана совпадать с CI."""
        import os
        saved = os.environ.pop(build.REPO_URL_ENV, None)
        try:
            without = build.history_link()
            os.environ[build.REPO_URL_ENV] = build.repo_url()
            with_env = build.history_link()
        finally:
            if saved is None:
                os.environ.pop(build.REPO_URL_ENV, None)
            else:
                os.environ[build.REPO_URL_ENV] = saved
        self.assertEqual(without, with_env)
        self.assertIn("истории изменений", without)

    def test_metrika_starts_after_load(self):
        self.assertIn('addEventListener("load"', build.METRIKA)

    def test_search_input_mobile_attributes(self):
        tpl = build.PAGE_TEMPLATE
        self.assertIn('id="search" type="search"', tpl)
        for attr in ('autocorrect="off"', 'autocapitalize="off"', 'enterkeyhint="search"'):
            self.assertIn(attr, tpl, attr)


if __name__ == "__main__":
    unittest.main()
