/* Service worker — сгенерировано scripts/build.py, руками не править.
   Имена кэшей — хеш содержимого прекэшируемых файлов: версия меняется ровно тогда,
   когда меняются байты, поэтому sw.js стабилен от сборки к сборке. */
"use strict";

const APP = "app-a513d176043f";
const STATIC = "static-243e20ca0f28";
const APP_FILES = ["/", "/women-lcm/", "/women-scm/", "/men-lcm/", "/men-scm/", "/mixed/", "/offline.html", "/assets/style.css?v=80a8dc50", "/assets/app.js?v=3d242b81", "/site.webmanifest"];
const FONTS = ["/assets/fonts/inter-cyrillic.woff2?v=aebf2ab4", "/assets/fonts/inter-latin.woff2?v=c9407645", "/assets/fonts/jetbrains-mono-cyrillic.woff2?v=4995a9a4", "/assets/fonts/jetbrains-mono-latin.woff2?v=2c32b9b3"];
const OFFLINE = "/offline.html";
const NET_TIMEOUT = 3000;

/* Минуя HTTP-кэш: хостинг не шлёт Cache-Control, браузер кэширует эвристически
   по Last-Modified, и addAll мог бы положить в новый кэш вчерашний style.css
   рядом с сегодняшним HTML */
const fresh = (url) => new Request(url, { cache: "reload" });

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const app = await caches.open(APP);
    await app.addAll(APP_FILES.map(fresh));
    const st = await caches.open(STATIC);
    const have = await Promise.all(FONTS.map((url) => st.match(url)));
    await st.addAll(FONTS.filter((_, i) => !have[i]).map(fresh));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([APP, STATIC]);
    for (const key of await caches.keys()) {
      if (!keep.has(key)) await caches.delete(key);
    }
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

const pagePath = (url) => url.pathname.replace(/index\.html$/, "");

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout")), ms);
  promise.then(
    (value) => { clearTimeout(timer); resolve(value); },
    (err) => { clearTimeout(timer); reject(err); },
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Метрика, borozdov.ru — мимо

  /* Выгрузки: сеть без таймаута (xlsx на медленной сети), при обрыве — последняя
     скачанная копия. Ветка стоит ДО navigate: в Chrome клик по <a download>
     приходит как navigate, и офлайн-страница уезжала бы в файл records.xlsx.
     И ДО поиска по кэшам: иначе после первой загрузки — cache-first навсегда. */
  if (url.pathname.startsWith("/records.")) {
    event.respondWith((async () => {
      const st = await caches.open(STATIC);
      try {
        const res = (await event.preloadResponse) || (await fetch(req));
        if (res.ok) st.put(req, res.clone());
        return res;
      } catch (_) {
        return (await st.match(req)) || Response.error();
      }
    })());
    return;
  }

  /* Страницы: сеть с таймаутом, при обрыве — прекэш этой сборки. Сетевой ответ
     в кэш НЕ кладём: в app-<хеш> лежит только одна сборка целиком. */
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await withTimeout(
          (async () => (await event.preloadResponse) || fetch(req))(),
          NET_TIMEOUT,
        );
      } catch (_) {
        const app = await caches.open(APP);
        const path = pagePath(url);
        return (await app.match(path)) || (await app.match(path + "/")) || app.match(OFFLINE);
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const app = await caches.open(APP);
    const st = await caches.open(STATIC);
    /* Только именованные кэши, никакого глобального поиска по всем: между
       install и activate новой версии он мог бы отдать её файлы к старому HTML */
    const hit = (await app.match(req)) || (await st.match(req));
    if (hit) return hit;
    const res = await fetch(req);
    /* jsPDF и qrcode.js — при первом обращении; хеш static-кэша включает их байты,
       так что обновлённая библиотека сама вытеснит старую копию */
    if (res.ok && url.pathname.startsWith("/assets/vendor/")) st.put(req, res.clone());
    return res;
  })());
});
