"""Контракт разметки с app.js.

Таблицу рендерит только build.py; app.js опирается на её data-атрибуты и классы.
Переименовать тут что-нибудь — и фильтры с поиском молча перестанут работать,
причём тихо: ошибок в консоли не будет, просто ничего не найдётся.
Производные поля и парсер проверяются в test_parse.py.
"""
import json
import re
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build  # noqa: E402

TODAY = date(2026, 8, 31)


def record(**kw):
    base = dict(
        discipline="вольный стиль 50 м", relay=False, relay_count=None,
        leg_distance_m=None, total_distance_m=50, distance_m=50,
        stroke_id="freestyle", is_25m_pool=False, athlete="Иванов Иван",
        roster=None, result="24.20", result_seconds=24.20,
        location="Казань", date="2021-04-09", date_original="09.04.2021",
    )
    base.update(kw)
    return base


def data(*cats):
    return {"source_url": "https://example.org", "fetched_at": "2026-08-27T17:33:28Z",
            "total_records": sum(len(c["records"]) for c in cats), "categories": list(cats)}


def cat(cid, sex, pool, records):
    return {"id": cid, "title": f"{cid} title", "sex": sex, "pool": pool, "records": records}


class TableMarkup(unittest.TestCase):
    """Контракт с app.js: он читает эти data-атрибуты и классы."""

    def setUp(self):
        d = data(cat("w", "women", "lcm", [record(), record(relay=True, relay_count=4)]))
        build.enrich(d, TODAY)
        self.html = build.render_table(d["categories"], "caption")

    def test_filter_attributes_present(self):
        for attr in ('data-sex="women"', 'data-pool="lcm"', 'data-stroke="freestyle"',
                     'data-relay="0"', 'data-relay="1"', 'data-date="2021-04-09"',
                     'data-sec="24.2"'):
            self.assertIn(attr, self.html, attr)

    def test_every_column_is_sortable(self):
        # заголовок каждой колонки — кнопка: сортировка должна работать по всем пяти
        for key in ("disc", "athlete", "result", "location", "date"):
            self.assertIn(f'data-key="{key}"', self.html, key)
        self.assertEqual(self.html.count("th-sortable"), 5)
        self.assertEqual(self.html.count('<button type="button" class="th-btn">'), 5)

    def test_no_age_or_pool_comparison(self):
        # обе подписи убраны по просьбе: они мешали читать результат и дату
        self.assertNotIn('class="age"', self.html)
        self.assertNotIn('class="alt"', self.html)

    def test_search_source_classes_present(self):
        # app.js собирает строку поиска именно из этих ячеек
        for cls in ("disc-name", "col-athlete", "col-location", "result-value", "col-date"):
            self.assertIn(cls, self.html, cls)

    def test_roles_for_mobile_grid(self):
        # ниже 720px CSS меняет display и стирает табличную семантику
        for role in ('role="table"', 'role="rowgroup"', 'role="row"', 'role="cell"',
                     'role="columnheader"'):
            self.assertIn(role, self.html, role)

    def test_data_label_for_mobile(self):
        for label in ("Результат", "Место", "Дата"):
            self.assertIn(f'data-label="{label}"', self.html, label)

    def test_no_group_header_for_single_category(self):
        d = data(cat("w", "women", "lcm", [record()]))
        build.enrich(d, TODAY)
        self.assertNotIn("group-row", build.render_table(d["categories"], "c"))

    def test_escapes_source_text(self):
        d = data(cat("w", "women", "lcm", [record(athlete='<img src=x onerror=alert(1)>')]))
        build.enrich(d, TODAY)
        html = build.render_table(d["categories"], "c")
        self.assertNotIn("<img", html)
        self.assertIn("&lt;img", html)


class ExportContract(unittest.TestCase):
    """Канва экспорта рисует лист, читая страницу через DOM.

    Здесь закреплено то, что она ищет: без этих узлов картинка молча
    потеряет заголовок, статистику или QR — ошибок в консоли не будет.
    """

    def setUp(self):
        d = data(cat("w", "women", "lcm", [
            record(date="2026-08-01", date_original="01.08.2026"),   # свежий — с бейджем
            record(relay=True, relay_count=4, roster=["Иванова Анна", "Петрова Мария"]),
        ]))
        build.enrich(d, TODAY)
        self.page = build.render_page(
            data=d, categories=d["categories"],
            canonical="https://example.org/", title="t", og_title="t", description="d",
            h1="Женщины, бассейн 50 м", eyebrow="Рекорды России по плаванию", intro="i",
            current="w", fetched_human="27.08.2026", with_faq=False,
            table_h2="h2", caption="c",
        )

    def test_sources_canvas_reads(self):
        for needle in ("<h1>", 'class="label"', 'class="stat-strip"', 'class="stat-value"',
                       'class="disc-name"', 'class="result-value"', 'class="roster"',
                       'class="badge badge-fresh"'):
            self.assertIn(needle, self.page, needle)

    def test_export_dialog_present(self):
        self.assertIn('id="export"', self.page)
        for control in ("ex-lik", "ex-shape", "ex-title",
                        "ex-stats", "ex-badges", "ex-roster"):
            self.assertIn(control, self.page, control)
        self.assertIn('id="export-canvas"', self.page)

    def test_fixed_settings_have_no_switches(self):
        # разрешение, формат PDF, размер текста и поисковый запрос зафиксированы:
        # QR и подпись авторства — выходные данные листа, их тоже не выключают
        for gone in ("ex-qr", "ex-size", "ex-paper", "ex-text", "ex-filters"):
            self.assertNotIn(gone, self.page, gone)

    def test_images_first_in_download_menu(self):
        panel = self.page[self.page.index('id="dl-panel"'):]
        panel = panel[:panel.index("</div>")]
        order = re.findall(r'class="fmt">([A-Z]+)<', panel)
        self.assertEqual(order[:2], ["PNG", "PDF"], order)

    def test_qr_points_at_redirect(self):
        # QR ведёт на переходник, а не на домен: цель можно поменять,
        # не перевыпуская уже напечатанные плакаты
        self.assertIn(f'data-qr="https://{build.SITE_DOMAIN}/go/"', self.page)

    def test_print_button_gone(self):
        self.assertNotIn("print-btn", self.page)

    def test_export_before_toast(self):
        # селектор `.export:not([hidden]) ~ .toast` поднимает тост над кнопками
        # окна экспорта — работает только пока окно стоит в разметке раньше тоста
        self.assertLess(self.page.index('id="export"'), self.page.index('id="toast"'))
        self.assertIn('<span class="toast-text" role="status" aria-live="polite"></span>', self.page)

    def test_download_button_anchor_exists(self):
        # без JS кнопка «Скачать» — обычная ссылка на выгрузки в подвале
        anchor = re.search(r'id="dl-btn" href="#([a-z]+)"', build.PAGE_TEMPLATE).group(1)
        self.assertIn(f'id="{anchor}"', build.PAGE_TEMPLATE)

    def test_install_entry_in_download_menu(self):
        # пункт «Установить» скрыт до beforeinstallprompt и без JS не существует
        self.assertIn('class="js-only" id="install" hidden', self.page)
        self.assertIn('id="install-sep" role="separator" hidden', self.page)
        self.assertIn('id="net-note" hidden', self.page)


class FaqAndFooter(unittest.TestCase):
    """FAQ отдаёт HTML, а не текст: внутри ответов живут ссылки.

    Отсюда два молчаливых риска. Кто-нибудь вернёт html.escape в faq_section() —
    и на странице появятся <a href=…> текстом, без единой ошибки. Или видимый
    ответ разъедется с FAQPage в JSON-LD, а Google считает это нарушением.
    """

    def setUp(self):
        d = data(cat("w", "women", "lcm", [record()]))
        build.enrich(d, TODAY)
        self.page = build.render_page(
            data=d, categories=d["categories"],
            canonical="https://example.org/", title="t", og_title="t", description="d",
            h1="Рекорды России по плаванию", eyebrow="e", intro="i",
            current="", fetched_human="27.08.2026", with_faq=True,
            table_h2="h2", caption="c",
        )
        raw = re.search(r'<script type="application/ld\+json">(.*?)</script>',
                        self.page, re.S).group(1)
        graph = json.loads(raw)["@graph"]
        self.faq = next(n for n in graph if n["@type"] == "FAQPage")

    def test_visible_answers_match_jsonld(self):
        # один источник: JSON-LD получает тот же ответ со снятыми тегами
        want = [(q, build.faq_plain(a)) for q, a in build.FAQ_ITEMS]
        got = [(e["name"], e["acceptedAnswer"]["text"]) for e in self.faq["mainEntity"]]
        self.assertEqual(want, got)
        for _, text in got:
            # разметка в <script> не течёт: json.dumps не экранирует '<'
            self.assertNotIn("<", text)

    def test_answers_render_as_markup(self):
        # защита от возврата html.escape на ответ
        for _, a in build.FAQ_ITEMS:
            self.assertIn(f"<p>{a}</p>", self.page)
        self.assertNotIn("&lt;a href", self.page)

    def test_utm_on_every_brand_link(self):
        # три точки: шапка, кнопка выхода в подвале и ссылка в ответе
        # про автора. Если ответ вдруг попадёт в JSON-LD с тегами — станет четыре
        self.assertEqual(3, self.page.count("utm_source="))
        for campaign in ("header", "footer", "faq_author"):
            self.assertIn(f"utm_campaign={campaign}", self.page)
        self.assertIn('<a href="https://borozdov.ru/?utm_source=', self.page)
        self.assertNotIn("fina.borozdov.ru", self.page)
        # сырой & в href — невалидный HTML
        self.assertNotIn(f"utm_source={build.SITE_DOMAIN}&utm_medium", self.page)

    def test_telegram_gone(self):
        self.assertNotIn("t.me", self.page)

    def test_signature_is_plain_text(self):
        # подпись стоит дважды — в полосе под шапкой и в подвале — и обязана
        # совпадать: обе приходят из одной константы
        sigs = re.findall(r'<div class="signature">(.*?)</div>', self.page, re.S)
        self.assertEqual([build.SIGNATURE] * 2, sigs)
        self.assertEqual("СДЕЛАЛ <b>NIKITA BOROZDOV</b><br>МАСТЕР СПОРТА", build.SIGNATURE)
        self.assertNotIn("<a", build.SIGNATURE)  # подпись перестала быть ссылкой

    def test_author_strip_under_header(self):
        # полоса автора — между шапкой и main, в потоке; мелкой ссылки
        # «By Borozdov» в самой шапке больше нет, её метку забрала полоса
        strip = re.search(r'</header>(.*?)<main', self.page, re.S).group(1)
        self.assertIn('<div class="author-strip">', strip)
        self.assertIn('class="signature"', strip)
        self.assertIn('class="btn author-link"', strip)
        self.assertIn('rel="author noopener"', strip)
        self.assertIn("utm_campaign=header", strip)
        self.assertNotIn("header-by", self.page)

    def test_exit_button_next_to_signature(self):
        # подпись — текст, выход — кнопка: третьим ребёнком .footer-inner она
        # уехала бы в центр из-за space-between, поэтому обе лежат в .footer-exit
        exit_block = re.search(r'<div class="footer-exit">(.*?)\n    </div>',
                               self.page, re.S).group(1)
        self.assertIn('class="signature"', exit_block)
        self.assertIn('class="btn author-link"', exit_block)
        self.assertIn('rel="author noopener"', exit_block)
        # стрелка скрыта от скринридера: иначе он читает «стрелка вправо»
        self.assertIn('<span class="arrow" aria-hidden="true">', exit_block)

    def test_history_link_still_in_template(self):
        # {history_link} переехал в абзац про синхронизацию. Потерять его при
        # переносе легко, а str.format лишний kwarg молча игнорирует — ссылка
        # на историю просто исчезнет из подвала, без единой ошибки
        tpl = build.PAGE_TEMPLATE
        self.assertIn("{history_link}", tpl)
        self.assertLess(tpl.index("{history_link}"), tpl.index("footer-downloads"))


class RedirectPage(unittest.TestCase):
    def test_noindex_and_target(self):
        self.assertIn('content="noindex', build.REDIRECT_HTML)
        self.assertIn(build.QR_TARGET, build.REDIRECT_HTML)


if __name__ == "__main__":
    unittest.main()
