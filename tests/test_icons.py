"""Фавикон, иконки приложений и манифест.

Три вещи ломаются молча и одинаково незаметно: литера уезжает из центра,
иконка перестаёт попадать в <head>, манифест разъезжается со списком
отрендеренных файлов. Всё это видно только на чужом телефоне, поэтому
проверяем числами здесь.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build  # noqa: E402
import gen_icons  # noqa: E402
import gen_screens  # noqa: E402

OBSIDIAN = (13, 13, 13)
SURFACE = (255, 255, 255)


def ink_box(img):
    """Границы краски в процентах канвы: (сверху, снизу, слева, справа).

    Краска всегда тёмная: в иконках бренда инверсии нет, все они — чёрная
    литера на белом. Прозрачное (срезанные скруглением углы фавикона) кладём
    на белое, иначе convert("RGB") сделает из него чёрное и вся канва сойдёт
    за краску — центровка тогда «сходится» на любой картинке.
    """
    size = img.size[0]
    flat = Image.alpha_composite(
        Image.new("RGBA", img.size, (255, 255, 255, 255)), img.convert("RGBA"))
    px = flat.convert("RGB").load()
    xs, ys = [], []
    for y in range(size):
        for x in range(size):
            if px[x, y][0] < 150:
                xs.append(x)
                ys.append(y)
    assert xs, "на иконке нет краски"
    p = lambda v: v / size * 100
    return p(min(ys)), p(size - 1 - max(ys)), p(min(xs)), p(size - 1 - max(xs))


LETTER = build.ICON_LETTER


class LetterCentering(unittest.TestCase):
    """Литера центруется по фактическому очку, а не по метрикам шрифта.

    Допуск — один пиксель канвы: на 48px это уже 2%, меньше не выжать
    целочисленной вставкой.
    """

    def assert_centered(self, img):
        top, bottom, left, right = ink_box(img)
        tol = 100 / img.size[0] + 0.1
        self.assertAlmostEqual(top, bottom, delta=tol, msg="литера не по центру по вертикали")
        self.assertAlmostEqual(left, right, delta=tol, msg="литера не по центру по горизонтали")

    def test_favicon_centered(self):
        self.assert_centered(gen_icons.favicon(48, LETTER))

    def test_app_icon_centered(self):
        self.assert_centered(gen_icons.app_icon(180, LETTER))

    def test_maskable_centered(self):
        self.assert_centered(gen_icons.app_icon(512, LETTER, maskable=True))

    def test_maskable_fits_safe_zone(self):
        """Android кропит maskable до круга ⌀80% — литера обязана быть внутри."""
        top, bottom, left, right = ink_box(gen_icons.app_icon(512, LETTER, maskable=True))
        self.assertGreaterEqual(min(top, bottom, left, right), 10.0)


class Materials(unittest.TestCase):
    """Константа вне зеркала: любая иконка бренда — чёрная литера на белом.

    Инверсии в наборе нет. Раньше фавикон был титановым, а иконки приложений
    обсидиановыми, и набор читался как два разных бренда: одно на вкладке,
    другое на домашнем экране.
    """

    def test_favicon_is_white_with_obsidian_letter(self):
        img = gen_icons.favicon(64, LETTER).convert("RGB")
        self.assertEqual(img.getpixel((32, 6)), SURFACE)   # плашка
        self.assertEqual(img.getpixel((0, 0)), (0, 0, 0))  # угол срезан скруглением

    def test_app_icon_is_white_without_alpha(self):
        img = gen_icons.app_icon(180, LETTER)
        # Без альфа-канала намеренно: на iOS маска даёт белую кайму даже по
        # полностью непрозрачной альфе.
        self.assertEqual(img.mode, "RGB")
        self.assertEqual(img.getpixel((0, 0)), SURFACE)

    def test_app_icon_is_not_rounded(self):
        """Скругление кладут iOS и Android — свой радиус проступил бы вторым контуром."""
        img = gen_icons.app_icon(180, LETTER)
        for corner in ((0, 0), (179, 0), (0, 179), (179, 179)):
            self.assertEqual(img.getpixel(corner), SURFACE)

    def test_letter_is_one_height_across_roles(self):
        """Фавикон и иконка приложения несут литеру одного роста.

        Это то, что держит набор единым между сайтами: рост задан долей краски,
        а не кеглем, поэтому «Р», «Ю» и «B» встают одинаково.
        """
        for img, expected in ((gen_icons.favicon(512, LETTER), gen_icons.FAVICON_LETTER),
                              (gen_icons.app_icon(512, LETTER), gen_icons.APP_LETTER)):
            top, bottom, _, _ = ink_box(img)
            self.assertAlmostEqual(100 - top - bottom, expected * 100, delta=1.5)

    def test_missing_glyph_raises(self):
        with self.assertRaises(RuntimeError):
            gen_icons.app_icon(64, "⁣")


class RenderSet(unittest.TestCase):
    def test_render_writes_every_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            names = gen_icons.render(out, LETTER)
            for name in names:
                self.assertTrue((out / name).exists(), name)

    def test_ico_carries_three_sizes(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            gen_icons.render(out, LETTER)
            with Image.open(out / "favicon.ico") as im:
                self.assertEqual(sorted(im.info["sizes"]), [(16, 16), (32, 32), (48, 48)])


class Splash(unittest.TestCase):
    """Стартовые экраны iOS: белое поле, литера по центру, файлы = теги."""

    def test_sizes_are_pt_times_scale(self):
        for item in gen_icons.splash_set():
            w, h, scale = map(int, __import__("re").match(
                r"splash/(\d+)x(\d+)-(\d)x", item["name"]).groups())
            expect = (h * scale, w * scale) if "landscape" in item["name"] else (w * scale, h * scale)
            self.assertEqual((item["width"], item["height"]), expect, item["name"])
            self.assertIn(f"(device-width: {w}px)", item["media"])
            self.assertIn(f"(-webkit-device-pixel-ratio: {scale})", item["media"])

    def test_iphone_portrait_only_ipad_both(self):
        names = [i["name"] for i in gen_icons.splash_set()]
        self.assertIn("splash/393x852-3x.png", names)
        self.assertNotIn("splash/393x852-3x-landscape.png", names)
        self.assertIn("splash/1024x1366-2x.png", names)
        self.assertIn("splash/1024x1366-2x-landscape.png", names)

    def test_white_with_centered_obsidian_letter(self):
        img = gen_icons.splash(1170, 2532, LETTER)
        self.assertEqual(img.mode, "RGB")
        self.assertEqual(img.getpixel((0, 0)), SURFACE)
        self.assertEqual(img.getpixel((1169, 2531)), SURFACE)
        px = img.load()
        xs, ys = [], []
        for y in range(0, 2532, 3):
            for x in range(0, 1170, 3):
                if px[x, y][0] < 150:
                    xs.append(x)
                    ys.append(y)
        self.assertTrue(xs, "литеры нет")
        self.assertAlmostEqual(min(xs) + max(xs), 1169, delta=6)
        self.assertAlmostEqual(min(ys) + max(ys), 2531, delta=6)
        # литера — примерно 12% меньшей стороны, не крупнее иконки лаунчера
        self.assertLess(max(xs) - min(xs), 1170 * 0.2)

    def test_template_links_every_splash(self):
        tags = build.startup_images()
        for item in gen_icons.splash_set():
            self.assertIn(f'href="/{item["name"]}"', tags, item["name"])
            self.assertIn(f'media="{item["media"]}"', tags, item["name"])
        # без этой меты iOS игнорирует стартовые экраны
        self.assertIn('<meta name="apple-mobile-web-app-capable" content="yes">', build.PAGE_TEMPLATE)
        self.assertIn("{startup_images}", build.PAGE_TEMPLATE)
        # один титановый набор: лик ручной, сплэш ему не следует
        self.assertNotIn("prefers-color-scheme", tags)


class Manifest(unittest.TestCase):
    def setUp(self):
        self.cats = [
            {"id": "women-lcm", "title": "Женщины, бассейн 50 м", "sex": "women", "pool": "lcm"},
            {"id": "mixed", "title": "Смешанные эстафеты", "sex": "mixed", "pool": "mixed"},
        ]
        self.m = json.loads(build.webmanifest(self.cats))

    def test_icons_match_rendered_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            rendered = set(gen_icons.render(Path(tmp), build.ICON_LETTER))
        listed = {i["src"].lstrip("/") for i in self.m["icons"]}
        listed |= {i["src"].lstrip("/") for s in self.m["shortcuts"] for i in s["icons"]}
        self.assertTrue(listed <= rendered, listed - rendered)

    def test_has_any_and_maskable(self):
        purposes = {i["purpose"] for i in self.m["icons"]}
        self.assertEqual(purposes, {"any", "maskable"})

    def test_colors_follow_the_icon_and_the_bars(self):
        """theme_color красит системные панели, background_color — фон сплэша.

        Второй идёт за иконкой: она белая, значит перед стартом не должно
        мелькать тёмного кадра.
        """
        self.assertEqual(self.m["theme_color"], "#0d0d0d")
        self.assertEqual(self.m["background_color"], "#ffffff")

    def test_start_url_and_shortcuts_inside_scope(self):
        # UTM-словарь brand_link: в Метрике запуски из PWA видны отдельно
        self.assertEqual(self.m["scope"], "/")
        self.assertTrue(self.m["start_url"].startswith("/?utm_source=pwa"))
        self.assertEqual([s["url"].split("?")[0] for s in self.m["shortcuts"]],
                         ["/women-lcm/", "/mixed/"])
        for s in self.m["shortcuts"]:
            self.assertIn("utm_source=pwa&utm_medium=shortcut", s["url"])
            self.assertLessEqual(len(s["short_name"]), 12, s["short_name"])
        self.assertEqual([s["short_name"] for s in self.m["shortcuts"]], ["Жен. 50 м", "Микст"])

    def test_installability_fields(self):
        self.assertEqual(self.m["display"], "standalone")
        self.assertEqual(self.m["display_override"][0], "standalone")
        self.assertIn("navigate-existing", self.m["launch_handler"]["client_mode"])
        self.assertNotIn("prefer_related_applications", self.m)
        self.assertNotIn("share_target", self.m)
        self.assertEqual(self.m["orientation"], "any")

    def test_screenshots_match_rendered_files(self):
        """Richer Install UI: файл существует, размер в манифесте = размер PNG,
        пропорция ≤ 2.3, у каждого form_factor — своя картинка."""
        data = {
            "fetched_at": "2026-08-27T17:33:28Z", "total_records": 1,
            "categories": [{"id": "women-lcm", "title": "Женщины, бассейн 50 м",
                            "sex": "women", "pool": "lcm", "records": [{
                                "discipline": "вольный стиль 50 м", "relay": False,
                                "athlete": "Иванова Анна", "result": "24.20",
                                "location": "Казань", "date": "2026-08-01",
                                "date_original": "01.08.2026"}]}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            names = gen_screens.render(data, Path(tmp), title="t", eyebrow="e",
                                       fresh_days=365, today="2026-08-31")
            shots = self.m["screenshots"]
            self.assertEqual({s["form_factor"] for s in shots}, {"narrow", "wide"})
            for shot in shots:
                name = shot["src"].lstrip("/")
                self.assertIn(name, names)
                with Image.open(Path(tmp) / name) as im:
                    self.assertEqual(shot["sizes"], f"{im.width}x{im.height}")
                    self.assertLessEqual(max(im.size) / min(im.size), 2.3)
                    self.assertTrue(320 <= min(im.size) and max(im.size) <= 3840)
                    self.assertEqual(im.getpixel((2, 2)), OBSIDIAN)  # константа вне зеркала


class HeadLinks(unittest.TestCase):
    """Отрендеренная иконка бесполезна, если на неё никто не ссылается."""

    def test_template_links_every_icon(self):
        head = build.PAGE_TEMPLATE
        for needle in ('rel="apple-touch-icon" href="/apple-touch-icon.png"',
                       'rel="icon" type="image/png" sizes="120x120" href="/favicon-120.png"',
                       'rel="icon" href="/favicon.ico"',
                       'rel="manifest" href="/site.webmanifest"',
                       '<meta name="mobile-web-app-capable" content="yes">',
                       '<meta name="apple-mobile-web-app-capable" content="yes">'):
            self.assertIn(needle, head, needle)


if __name__ == "__main__":
    unittest.main()
