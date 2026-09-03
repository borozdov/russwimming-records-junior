/* Юношеские рекорды России по плаванию — прогрессивное улучшение поверх серверного рендера.
   Таблицу собирает build.py; здесь только прячем строки, переставляем их и считаем.
   Никакого innerHTML по таблице: узлы живут от загрузки до выгрузки, поэтому фокус
   переживает клик по фильтру, а фильтрация стоит один проход по строкам. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const table = $("table.records");
  if (!table) return;

  const SITE_URL = "russwimming-records-junior.borozdov.ru";

  /* --- Метрика: цели ------------------------------------------------------
     ym() — очередь-стаб, которую build.py создаёт синхронно в <head> (см. METRIKA
     в build.py) специально ради этого: цели могут прилетать с первого клика,
     раньше чем догрузится сам tag.js, и стаб копит их, не теряя. */
  const goal = (name, params) => {
    if (typeof window.ym !== "function" || !window.YM_COUNTER_ID) return;
    try { window.ym(window.YM_COUNTER_ID, "reachGoal", name, params); } catch (_) {}
  };

  /* Переходы на borozdov.ru (шапка, подвал, ссылка в FAQ) — все три открываются
     в новой вкладке (target="_blank"), поэтому цель успевает уйти без риска
     оборвать переход; trackLinks:true уже пишет их как внешние ссылки сам по
     себе, это — именованная цель поверх того же клика для отдельного отчёта */
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href*="borozdov.ru"]');
    if (a) goal("brand_click", { from: a.className || "link" });
  });

  /* --- Лик -------------------------------------------------------------- */

  const LIK_KEY = "lik";
  const root = document.documentElement;
  const readLik = () => {
    try {
      const v = localStorage.getItem(LIK_KEY);
      return v === "titan" || v === "obsidian" ? v : null;
    } catch (_) { return null; }
  };
  let lik = readLik() || root.getAttribute("data-theme") || "obsidian";

  const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';

  const themeBtn = $("#theme-toggle");
  const applyLik = (persist) => {
    /* Глушим transition на время смены и форсируем reflow между сменой
       атрибута и снятием класса: иначе чипы и кнопки докрашиваются каскадом.
       requestAnimationFrame тут не годится — схлопывается в один пересчёт стилей. */
    root.classList.add("theme-switching");
    root.setAttribute("data-theme", lik);
    void root.offsetHeight;
    root.classList.remove("theme-switching");
    const meta = document.getElementById("theme-color");
    if (meta) meta.setAttribute("content", lik === "titan" ? "#fafafa" : "#0d0d0d");
    if (themeBtn) {
      themeBtn.innerHTML = lik === "titan" ? ICON_MOON : ICON_SUN;
      themeBtn.setAttribute("aria-label", lik === "titan" ? "Включить тёмный лик" : "Включить светлый лик");
    }
    if (persist) { try { localStorage.setItem(LIK_KEY, lik); } catch (_) {} }
  };
  applyLik(false);
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      lik = lik === "titan" ? "obsidian" : "titan";
      applyLik(true);
      goal("theme_switch", { lik });
    });
  }
  window.addEventListener("storage", (e) => {
    if (e.key === LIK_KEY) { lik = readLik() || lik; applyLik(false); }
  });

  /* --- Модель: строки как они есть в DOM --------------------------------- */

  const bodies = $$("tbody[data-cat]", table);

  const norm = (s) => String(s).toLowerCase().replace(/ё/g, "е");
  const text = (root_, sel) => {
    const el = root_.querySelector(sel);
    return el ? el.textContent.trim() : "";
  };
  /* Имя спортсмена — первый текстовый узел ячейки: состав эстафеты лежит
     там же, в .roster, и в ключ сортировки попадать не должен */
  const athleteName = (el) => {
    const cell = el.querySelector(".col-athlete");
    return cell && cell.firstChild ? cell.firstChild.textContent.trim() : "";
  };

  /* Стог для поиска собираем из конкретных ячеек, а не из textContent строки:
     иначе в него попадут возраст рекорда и время соседнего бассейна,
     и запрос «25 м» найдёт половину таблицы. */
  const haystack = (el) => norm([
    text(el, ".disc-name"),
    athleteName(el),
    text(el, ".roster"),
    text(el, ".col-location"),
    text(el, ".result-value"),
    text(el, ".col-date time"),
    el.parentNode.getAttribute("aria-label") || "",
  ].join(" "));

  const rows = $$("tbody[data-cat] tr[data-i]", table).map((el) => ({
    el,
    i: Number(el.dataset.i) || 0,
    sex: el.dataset.sex || "",
    pool: el.dataset.pool || "",
    stroke: el.dataset.stroke || "",
    relay: el.dataset.relay === "1",
    date: el.dataset.date || "",
    sec: Number(el.dataset.sec) || 0,
    athlete: athleteName(el),
    disc: text(el, ".disc-name"),
    location: text(el, ".col-location"),
    q: haystack(el),
  }));

  /* Раскладка: «rjhjktd» → «королев». Часто набирают, не переключив язык. */
  const LAYOUT = {
    q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з",
    a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л", l: "д",
    z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь",
  };
  /* Только буквы: если гнать через карту и пунктуацию, запрос «26.91»
     превращается в «26ю91» и поиск по результату перестаёт работать. */
  const toCyrillic = (s) => s.replace(/[a-z]/g, (c) => LAYOUT[c] || c);

  const STROKE_LABELS = {
    freestyle: "Вольный стиль",
    backstroke: "На спине",
    breaststroke: "Брасс",
    butterfly: "Баттерфляй",
    im: "Комплексное плавание",
    medley_relay: "Комбинированная",
    unknown: "Прочее",
  };

  const GROUPS = [
    { key: "sex", label: "Пол", options: [["women", "Женщины"], ["men", "Мужчины"], ["mixed", "Смешанные"]] },
    { key: "pool", label: "Бассейн", options: [["lcm", "50 м"], ["scm", "25 м"]] },
    {
      key: "stroke", label: "Стиль",
      options: Object.keys(STROKE_LABELS).map((k) => [k, STROKE_LABELS[k]]),
    },
    { key: "relay", label: "Тип", options: [["solo", "Личные"], ["relay", "Эстафеты"]] },
  ];

  const valueOf = (row, key) => (key === "relay" ? (row.relay ? "relay" : "solo") : row[key]);

  /* Группу показываем, только если по ней вообще есть выбор */
  const liveGroups = GROUPS
    .map((g) => {
      const present = new Set(rows.map((r) => valueOf(r, g.key)));
      return { ...g, options: g.options.filter(([v]) => present.has(v)) };
    })
    .filter((g) => g.options.length > 1);

  /* --- Состояние --------------------------------------------------------- */

  const SORT_KEYS = ["disc", "athlete", "result", "location", "date"];
  const defaults = () => ({ search: "", sort: "", dir: 1, filters: {} });
  const state = defaults();
  liveGroups.forEach((g) => { state.filters[g.key] = "all"; });

  const STATE_KEY = "rus-records-v3";

  const sanitize = (raw) => {
    if (!raw || typeof raw !== "object") return;
    if (typeof raw.search === "string") state.search = raw.search.slice(0, 100);
    if (raw.sort === "" || SORT_KEYS.includes(raw.sort)) state.sort = raw.sort || "";
    if (raw.dir === 1 || raw.dir === -1) state.dir = raw.dir;
    const f = raw.filters;
    if (f && typeof f === "object") {
      liveGroups.forEach((g) => {
        const v = f[g.key];
        if (v === "all" || g.options.some(([opt]) => opt === v)) state.filters[g.key] = v || "all";
      });
    }
  };

  try { sanitize(JSON.parse(localStorage.getItem(STATE_KEY) || "null")); } catch (_) {}

  /* Свои ключи адреса. Чужие (utm_* из start_url и ярлыков манифеста) состоянием
     не считаются, но и не стираются: Метрика стартует по load и читает
     location.href — метка запуска из приложения должна дожить до неё */
  const OWN_KEYS = ["q", "sort"].concat(liveGroups.map((g) => g.key));

  const readUrl = () => {
    const p = new URLSearchParams(location.search);
    if (!OWN_KEYS.some((k) => p.has(k))) return false;
    const raw = { filters: {} };
    if (p.has("q")) raw.search = p.get("q");
    if (p.has("sort")) {
      raw.sort = p.get("sort").replace(/-desc$/, "");
      raw.dir = /-desc$/.test(p.get("sort")) ? -1 : 1;
    }
    liveGroups.forEach((g) => { if (p.has(g.key)) raw.filters[g.key] = p.get(g.key); });
    sanitize(raw);
    return true;
  };
  readUrl();

  const persist = () => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
    const p = new URLSearchParams(location.search);
    OWN_KEYS.forEach((k) => p.delete(k));
    if (state.search) p.set("q", state.search);
    if (state.sort) p.set("sort", state.sort + (state.dir < 0 ? "-desc" : ""));
    liveGroups.forEach((g) => {
      if (state.filters[g.key] !== "all") p.set(g.key, state.filters[g.key]);
    });
    const qs = p.toString();
    history.replaceState(null, "", qs ? `${location.pathname}?${qs}` : location.pathname);
  };

  /* --- Отбор ------------------------------------------------------------- */

  const matchesFilters = (row, filters) =>
    liveGroups.every((g) => {
      const want = filters[g.key];
      return want === "all" || valueOf(row, g.key) === want;
    });

  let needle = "";
  const matchesSearch = (row) => !needle || row.q.includes(needle);
  const visible = (row) => matchesFilters(row, state.filters) && matchesSearch(row);

  /* --- Сортировка -------------------------------------------------------- */

  const collator = new Intl.Collator("ru", { sensitivity: "base", numeric: true });
  const byText = (field) => (a, b) => collator.compare(a[field], b[field]);
  const comparators = {
    disc: byText("disc"),
    athlete: byText("athlete"),
    location: byText("location"),
    result: (a, b) => a.sec - b.sec,
    date: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
  };

  /* Сортируем всегда ВНУТРИ категорий: группировка — единственный контекст,
     в котором результат вообще сравним. */
  let sortedAs = null;
  const applySort = () => {
    const token = state.sort ? `${state.sort}:${state.dir}` : "";
    if (token !== sortedAs) {
      const cmp = comparators[state.sort];
      bodies.forEach((tbody) => {
        const mine = rows.filter((r) => r.el.parentNode === tbody);
        mine.sort(cmp
          ? (a, b) => cmp(a, b) * state.dir || a.i - b.i
          : (a, b) => a.i - b.i);
        const frag = document.createDocumentFragment();
        mine.forEach((r) => frag.appendChild(r.el));
        tbody.appendChild(frag);
      });
      sortedAs = token;
    }

    /* Индикаторы обновляем ВСЕГДА, а не только когда порядок поменялся:
       иначе на свежей странице aria-sort остаётся серверным «none»,
       а после круга по сортировкам начинает расходиться с порядком строк. */
    $$("th.th-sortable", table).forEach((th) => {
      const on = th.dataset.key === state.sort;
      th.setAttribute("aria-sort", on ? (state.dir < 0 ? "descending" : "ascending") : "none");
      th.classList.toggle("is-sorted", on);
      th.classList.toggle("is-desc", on && state.dir < 0);
    });
  };

  /* --- Фильтры ----------------------------------------------------------- */

  const filtersEl = $("#filters");
  const countEl = $("#visible-count");
  const searchEl = $("#search");
  const emptyEl = $(".empty-state");

  const chips = new Map(); // `${group}:${value}` → button

  const buildFilters = () => {
    if (!filtersEl) return;
    const frag = document.createDocumentFragment();
    liveGroups.forEach((g) => {
      const wrap = document.createElement("div");
      wrap.className = "filter-group";
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", g.label);
      const title = document.createElement("span");
      title.className = "filter-label label";
      title.textContent = g.label;
      wrap.appendChild(title);

      [["all", "Все"]].concat(g.options).forEach(([value, label]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.dataset.group = g.key;
        btn.dataset.value = value;
        btn.setAttribute("aria-pressed", "false");
        btn.textContent = label;
        btn.addEventListener("click", () => {
          state.filters[g.key] = state.filters[g.key] === value ? "all" : value;
          apply();
          goal("filter", { group: g.key, value: state.filters[g.key] });
        });
        wrap.appendChild(btn);
        chips.set(`${g.key}:${value}`, btn);
      });
      frag.appendChild(wrap);
    });

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "btn-reset";
    reset.textContent = "Сбросить";
    reset.hidden = true;
    reset.addEventListener("click", resetFilters);
    frag.appendChild(reset);
    filtersEl.appendChild(frag);
  };

  function resetFilters() {
    liveGroups.forEach((g) => { state.filters[g.key] = "all"; });
    state.search = "";
    state.sort = "";
    state.dir = 1;
    if (searchEl) searchEl.value = "";
    apply();
    if (searchEl) searchEl.focus();
    goal("reset_filters");
  }

  const isDirty = () =>
    Boolean(state.search.trim()) || Boolean(state.sort) ||
    liveGroups.some((g) => state.filters[g.key] !== "all");

  const updateChips = () => {
    liveGroups.forEach((g) => {
      [["all"]].concat(g.options).forEach(([value]) => {
        const btn = chips.get(`${g.key}:${value}`);
        if (!btn) return;
        const on = state.filters[g.key] === value;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.classList.toggle("is-on", on);
      });
    });
    const reset = $(".filters .btn-reset");
    if (reset) reset.hidden = !isDirty();
  };

  /* --- Применение -------------------------------------------------------- */

  const apply = () => {
    needle = norm(state.search.trim());
    if (/[a-z]/.test(needle) && !/[а-я]/.test(needle)) needle = toCyrillic(needle);

    let shown = 0;
    const perBody = new Map();
    rows.forEach((r) => {
      const ok = visible(r);
      r.el.classList.toggle("is-hidden", !ok);
      if (ok) {
        shown += 1;
        perBody.set(r.el.parentNode, (perBody.get(r.el.parentNode) || 0) + 1);
      }
    });

    bodies.forEach((tbody) => {
      const n = perBody.get(tbody) || 0;
      tbody.classList.toggle("is-empty", n === 0);
    });

    applySort();
    updateChips();

    if (countEl) {
      countEl.innerHTML = shown === rows.length
        ? `Показано <b class="mono">${rows.length}</b>`
        : `Показано <b class="mono">${shown}</b> из <span class="mono">${rows.length}</span>`;
    }
    if (emptyEl) emptyEl.hidden = shown !== 0;
    persist();
  };

  buildFilters();

  /* Высоту липкой панели CSS знать не может: она зависит от переносов
     в конкретной ширине. Без этого заголовок категории прилипает ПОД панель. */
  const controlsEl = $(".controls");
  if (controlsEl && window.ResizeObserver) {
    const syncStick = () => {
      const h = controlsEl.getBoundingClientRect().height;
      root.style.setProperty("--controls-h", `${Math.round(h)}px`);
    };
    new ResizeObserver(syncStick).observe(controlsEl);
    syncStick();
  }

  /* Экранная клавиатура: панель схлопывается до одного поля, но только когда
     клавиатура реально на экране. Фокус — не сигнал: на десктопе клавиатуры нет.
     Порог 140px отделяет клавиатуру от схлопывания адресной строки. */
  const coarse = matchMedia("(pointer: coarse)").matches;
  const vv = window.visualViewport;
  if (vv && coarse) {
    let base = Math.max(window.innerHeight, vv.height);
    const syncKeyboard = () => {
      if (vv.height > base) base = vv.height;
      const active = document.activeElement;
      const typing = Boolean(active && active.matches("input, textarea"));
      root.classList.toggle("keyboard-open", base - vv.height > 140 && typing);
    };
    vv.addEventListener("resize", syncKeyboard);
    document.addEventListener("focusin", () => setTimeout(syncKeyboard, 100));
    document.addEventListener("focusout", () => setTimeout(syncKeyboard, 100));
    window.addEventListener("orientationchange", () => {
      base = 0;
      setTimeout(syncKeyboard, 300);
    });
  }

  if (searchEl) {
    searchEl.value = state.search;
    /* Цель — раз за «сессию» поиска (пауза 800мс в наборе), а не на каждую
       клавишу: иначе один запрос даёт десяток одинаковых по смыслу целей */
    let searchGoalTimer = 0;
    searchEl.addEventListener("input", () => {
      state.search = searchEl.value;
      apply();
      clearTimeout(searchGoalTimer);
      if (state.search.trim()) {
        searchGoalTimer = setTimeout(() => goal("search", { length: state.search.trim().length }), 800);
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      if (searchEl) searchEl.focus();
    }
    if (e.key === "Escape" && document.activeElement === searchEl && searchEl.value) {
      state.search = "";
      searchEl.value = "";
      apply();
    }
    /* Enter в поле — «готово»: фильтр уже применён по input, остаётся убрать
       клавиатуру, которая иначе висит над таблицей */
    if (e.key === "Enter" && document.activeElement
        && document.activeElement.matches("#search, #ex-title")) {
      e.preventDefault();
      document.activeElement.blur();
    }
  });

  $$("th.th-sortable .th-btn", table).forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.closest("th").dataset.key;
      if (state.sort !== key) {          // другая колонка — начинаем с возрастания
        state.sort = key;
        state.dir = 1;
      } else if (state.dir === 1) {      // та же колонка — разворачиваем
        state.dir = -1;
      } else {                           // третий клик — снимаем сортировку
        state.sort = "";
        state.dir = 1;
      }
      apply();
      if (state.sort) goal("sort", { column: state.sort, dir: state.dir });
    });
  });

  $$(".btn-reset").forEach((b) => b.addEventListener("click", resetFilters));

  /* --- Тост -------------------------------------------------------------- */

  const toastEl = $("#toast");
  const toastText = toastEl ? $(".toast-text", toastEl) : null;
  let toastTimer = 0;
  /* Тост с кнопкой («Обновить») — закреплённый: проходной тост («Файл скачивается»)
     показывается поверх, а по таймеру возвращается закреплённый, иначе предложение
     обновиться исчезало бы до следующей перезагрузки — в приложении это недели */
  let pinned = null;
  const hideToast = () => { if (toastEl) toastEl.classList.remove("show"); };
  /* opts.action (+ необязательный opts.onAction) — кнопка в тосте; opts.sticky —
     не прятать по таймеру. Статус зачитывается со span, кнопка — отдельно. */
  const showToast = (msg, opts = {}) => {
    if (!toastEl || !toastText) return;
    toastText.textContent = msg;
    $$(".toast-action", toastEl).forEach((b) => b.remove());
    if (opts.action) {
      pinned = opts.sticky ? { msg, opts } : pinned;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "toast-action";
      b.textContent = opts.action;
      b.addEventListener("click", () => {
        if (pinned && pinned.msg === msg) pinned = null;
        hideToast();
        if (opts.onAction) opts.onAction();
      });
      toastEl.appendChild(b);
    }
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    if (!opts.sticky) {
      toastTimer = setTimeout(() => (pinned ? showToast(pinned.msg, pinned.opts) : hideToast()), 2600);
    }
  };

  /* --- Блокировка прокрутки под модалкой -------------------------------- */

  /* На iOS overflow: hidden у body тач-скролл не держит — CSS даёт body
     position: fixed на coarse-указателе, а top компенсирует прыжок */
  let lockY = 0;
  const lockScroll = (on) => {
    const b = document.body;
    if (on === b.classList.contains("is-locked")) return;
    if (on) {
      lockY = window.scrollY;
      b.style.top = `-${lockY}px`;
      b.classList.add("is-locked");
    } else {
      b.classList.remove("is-locked");
      b.style.top = "";
      /* Без behavior: "instant" — старый Safari бросает на нём TypeError; smooth
         из html { scroll-behavior } глушим на один вызов, иначе страница «подъедет» */
      const prev = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, lockY);
      root.style.scrollBehavior = prev;
    }
  };

  /* --- Меню скачивания --------------------------------------------------- */

  const dlMenu = $("#dl-menu");
  const dlBtn = $("#dl-btn");
  const isSheet = () => matchMedia("(max-width: 719px)").matches;
  const setMenu = (open) => {
    if (!dlMenu || !dlBtn) return;
    dlMenu.classList.toggle("open", open);
    dlBtn.setAttribute("aria-expanded", open ? "true" : "false");
    /* На телефоне панель — нижний лист со скримом: страница под ним не едет */
    lockScroll(open && isSheet());
    if (open && coarse) {
      const first = $("#dl-panel button:not([hidden]), #dl-panel a", dlMenu);
      if (first) first.focus();
    }
  };
  if (dlMenu && dlBtn) {
    dlBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setMenu(!dlMenu.classList.contains("open"));
    });
    /* Только при открытом меню: setMenu(false) снимает lockScroll, и клик внутри
       окна экспорта (оно вне .dl) отпускал бы страницу под скримом */
    document.addEventListener("click", (e) => {
      if (dlMenu.classList.contains("open") && !dlMenu.contains(e.target)) setMenu(false);
    });
    /* Тап по скриму: псевдоэлемент .dl.open::before отдаёт target = сам .dl,
       и документный обработчик его не ловит. Заодно слушатель на .dl делает
       его «кликабельным» для iOS Safari, который иначе click документу не шлёт */
    dlMenu.addEventListener("click", (e) => {
      if (e.target === dlMenu) setMenu(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dlMenu.classList.contains("open")) {
        setMenu(false);
        dlBtn.focus();
      }
    });
    $$("#dl-panel a").forEach((a) => a.addEventListener("click", () => {
      setMenu(false);
      showToast("Файл скачивается");
    }));
  }

  /* --- Установка приложения ---------------------------------------------- */

  const standalone = matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;
  const installBtn = $("#install");
  const installSep = $("#install-sep");
  const showInstall = (on) => {
    if (installBtn) installBtn.hidden = !on;
    if (installSep) installSep.hidden = !on;
  };
  if (installBtn && !standalone) {
    let deferredPrompt = null;
    /* Chromium: перехватываем системный баннер и показываем пункт в меню */
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstall(true);
    });
    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      showInstall(false);
      goal("pwa_install");
    });
    /* iOS: события нет, есть только «Поделиться → На экран Домой» — подсказываем.
       iPadOS прикидывается Mac, выдаёт себя количеством точек касания */
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) showInstall(true);
    installBtn.addEventListener("click", async () => {
      setMenu(false);
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        /* Второго beforeinstallprompt до перезагрузки не будет; придёт — пункт вернётся */
        showInstall(false);
        return;
      }
      showToast("Safari: «Поделиться» → «На экран Домой»", { action: "Понятно", sticky: true });
    });
  }

  /* --- Service worker: офлайн и обновления -------------------------------- */

  const netNote = $("#net-note");
  const syncedAt = () => {
    const stat = $$(".stat-strip .stat").find((el) => /Синхронизировано/.test(el.textContent));
    return stat ? text(stat, ".stat-value") : "";
  };
  const syncNet = () => {
    if (!netNote) return;
    const off = navigator.onLine === false;
    netNote.hidden = !off;
    if (off) netNote.textContent = `Нет сети · таблица от ${syncedAt()}`;
  };
  window.addEventListener("online", syncNet);
  window.addEventListener("offline", () => {
    syncNet();
    showToast("Нет сети — показана сохранённая таблица");
  });
  syncNet();

  if ("serviceWorker" in navigator && window.isSecureContext) {
    let controlled = Boolean(navigator.serviceWorker.controller);
    let wantReload = false;
    let reloading = false;
    const offerUpdate = (worker) => showToast("Таблица обновилась", {
      action: "Обновить",
      sticky: true,
      onAction: () => {
        wantReload = true;
        if (worker) worker.postMessage({ type: "SKIP_WAITING" });
        else location.reload();
      },
    });
    /* controllerchange приходит и при самой первой установке (clients.claim) —
       перезагружаем только по явному «Обновить», и только один раз */
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      if (wantReload) { reloading = true; location.reload(); return; }
      if (controlled) offerUpdate(null);   // «Обновить» нажали в другой вкладке
      controlled = true;
    });
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
          });
        });
        /* Установленное приложение неделями живёт без навигаций — проверяем
           sw.js при возвращении на экран, не чаще раза в час */
        let checked = Date.now();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible") return;
          if (Date.now() - checked < 60 * 60 * 1000) return;
          checked = Date.now();
          reg.update().catch(() => {});
        });
      } catch (_) { /* без SW сайт работает как раньше */ }
    });
  }

  /* --- Печать ------------------------------------------------------------ */

  const activeFiltersText = () => {
    const parts = [];
    liveGroups.forEach((g) => {
      const v = state.filters[g.key];
      if (v === "all") return;
      const opt = g.options.find(([value]) => value === v);
      if (opt) parts.push(opt[1]);
    });
    if (state.search.trim()) parts.push(`«${state.search.trim()}»`);
    return parts.join(" · ");
  };

  const setPrintMeta = () => {
    const shown = rows.filter((r) => !r.el.classList.contains("is-hidden")).length;
    const filters = activeFiltersText();
    const parts = [
      `${shown} ${shown % 10 === 1 && shown % 100 !== 11 ? "рекорд" : "рекордов"}`,
      filters ? `фильтр: ${filters}` : "",
      new Date().toLocaleDateString("ru-RU"),
    ].filter(Boolean);
    const meta = $(".print-meta");
    if (meta) meta.textContent = parts.join(" · ");
    const d = $(".print-date");
    if (d) d.textContent = SITE_URL;
  };
  window.addEventListener("beforeprint", setPrintMeta);

  /* --- Наверх ------------------------------------------------------------ */

  const toTop = $("#to-top");
  if (toTop) {
    /* На телефоне кнопка накрывает правую колонку карточек (результат, дата) —
       показываем её только пока листают вверх, то есть когда она и нужна.
       Дребезг iOS в пределах 4px за движение не считаем. */
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const up = y < lastY - 4;
      if (Math.abs(y - lastY) > 4) lastY = y;
      toTop.hidden = y < 600 || (coarse && !up);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    toTop.addEventListener("click", () => {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      const skip = $(".skip-link");
      if (skip) skip.focus();
    });
  }
  /* --- Экспорт: лист по брендбуку ----------------------------------------

     Рисуем из DOM, а не из данных: что видно на экране, то и в файле.
     Вёрстка листа считается в условных единицах (ширина листа = 1000),
     поэтому одна и та же разметка годится и для превью, и для 300 dpi. */

  const U = 1000;                 // ширина листа в условных единицах
  const PAGE_RATIO = Math.SQRT2;  // пропорция A-серии; A4 и A3 отличаются только бумагой
  const SHAPES = ["page", "ribbon"];
  const IMG_W = 2480;             // ширина картинки: 300 dpi на A4, 8.7 Мпикс
  const PAPER_MM = [210, 297];    // PDF всегда A4
  const TEXT_SCALE = 1;
  const MAX_AREA = 16e6;          // iOS Safari выше ~16.7 Мпикс отдаёт пустую картинку,
                                  // причём toBlob честно резолвится — файл скачивается пустым

  const M = 44;                   // поле листа
  const FRAME = 22;               // отступ hairline-рамки от края
  const ROW_H = 34;               // строка без состава эстафеты
  const ROSTER_H = 17;            // добавка на состав
  const GROUP_H = 34;
  const THEAD_H = 30;
  const COLS = [0.34, 0.25, 0.14, 0.13, 0.14];
  const COL_LABELS = ["Дисциплина", "Спортсмен", "Результат", "Место", "Дата"];

  /* --- чтение страницы --------------------------------------------------- */

  const pageTitle = () => (($("h1") || {}).textContent || "Рекорды России").trim();
  const pageEyebrow = () => text(document, ".hero .label") || "Юношеские рекорды России по плаванию";

  const pageStats = () => $$(".stat").map((el) => ({
    value: text(el, ".stat-value"),
    label: text(el, ".label"),
  })).filter((s) => s.value);

  const visibleGroups = () => bodies
    .map((tbody) => ({
      title: (tbody.getAttribute("aria-label") || "").trim(),
      rows: rows.filter((r) => r.el.parentNode === tbody && !r.el.classList.contains("is-hidden")),
    }))
    .filter((g) => g.rows.length);

  const rowData = (r) => ({
    disc: text(r.el, ".disc-name"),
    athlete: athleteName(r.el),
    roster: text(r.el, ".roster"),
    result: text(r.el, ".result-value"),
    location: text(r.el, ".col-location"),
    date: text(r.el, ".col-date time"),
    fresh: Boolean($(".badge-fresh", r.el)),
  });

  /* --- текст на канве ----------------------------------------------------- */

  const ellipsize = (ctx, str, maxW) => {
    let t = String(str);
    if (ctx.measureText(t).width <= maxW) return t;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  };

  /* Трекинг рисуем посимвольно: ctx.letterSpacing поддержан не везде,
     а разреженные прописные — голос бренда, без них лист чужой. */
  const trackedWidth = (ctx, str, sp) => {
    let w = 0;
    for (const ch of str) w += ctx.measureText(ch).width + sp;
    return w - sp;
  };
  const tracked = (ctx, str, x, y, sp, align = "left") => {
    let cx = align === "right" ? x - trackedWidth(ctx, str, sp) : x;
    for (const ch of str) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + sp;
    }
  };

  const wrapLines = (ctx, str, maxW, maxLines) => {
    const words = String(str).split(/\s+/);
    const out = [];
    let line = "";
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(probe).width > maxW) {
        out.push(line);
        line = w;
        if (out.length === maxLines) return out;
      } else line = probe;
    }
    if (line && out.length < maxLines) out.push(line);
    return out;
  };

  const plural = (n, one, few, many) => {
    if (n % 10 === 1 && n % 100 !== 11) return one;
    if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return few;
    return many;
  };

  /* --- QR ----------------------------------------------------------------- */

  const exportEl = $("#export");
  const QR_URL = exportEl ? exportEl.dataset.qr : "";
  let qrMatrix = null;

  const loadQr = async () => {
    if (qrMatrix || !QR_URL) return qrMatrix;
    if (!window.qrcode) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "/assets/vendor/qrcode.js";
        s.onload = res;
        s.onerror = () => rej(new Error("qrcode.js не загрузился"));
        document.head.appendChild(s);
      });
    }
    const qr = window.qrcode(0, "H"); // H: печать переживает потёртости и блики
    qr.addData(QR_URL);
    qr.make();
    const n = qr.getModuleCount();
    qrMatrix = { n, dark: (r, c) => qr.isDark(r, c) };
    return qrMatrix;
  };

  /* Константа вне зеркала: тёмные модули на светлой плашке в любом лике —
     инвертированные коды читают не все сканеры. */
  const drawQr = (ctx, x, y, size) => {
    if (!qrMatrix) return;
    const { n, dark } = qrMatrix;
    const quiet = 2;
    const cell = size / (n + quiet * 2);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#0d0d0d";
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (dark(r, c)) {
          ctx.fillRect(
            x + (c + quiet) * cell, y + (r + quiet) * cell,
            Math.ceil(cell), Math.ceil(cell),
          );
        }
      }
    }
  };

  /* --- палитра листа ------------------------------------------------------ */

  const PALETTE = {
    obsidian: { canvas: "#0d0d0d", inset: "#121212", surface: "#1a1a1a", zebra: "#161616",
                hairline: "#2e2e2e", slate: "#8a8a8a", soft: "#d1d1d1", ink: "#fafafa" },
    titan: { canvas: "#ffffff", inset: "#f2f2f2", surface: "#ffffff", zebra: "#fafafa",
             hairline: "#dcdcdc", slate: "#5f5f5f", soft: "#3d3d3d", ink: "#0d0d0d" },
  };

  /* --- раскладка листа ---------------------------------------------------- */

  const ts = () => TEXT_SCALE;

  const rowHeight = (row, opts) => (ROW_H + (opts.roster && row.roster ? ROSTER_H : 0))
    * ts() * (opts.stretch || 1);

  const headHeight = (opts) => {
    let h = M + 30;                       // поле + эйрбрау
    h += opts.titleLines * 40;            // заголовок
    if (opts.subtitle) h += 26;
    if (opts.stats && opts.statsList.length) h += 46;
    return h + 26;                        // отбивка до таблицы
  };

  /* Подвал не масштабируем размером текста: QR и подпись авторства держат
     постоянный размер, иначе плакат «дышит» краями и перестаёт узнаваться. */
  const FOOT_H = () => 132;

  /* Разбиение по фактической высоте. Группу не начинаем в хвосте листа:
     заголовок категории с одной-двумя строками под ним выглядит браком. */
  const paginate = (groups, opts, bodyH) => {
    const pages = [];
    let page = [];
    let used = 0;
    const flush = () => { if (page.length) { pages.push(page); page = []; used = 0; } };

    groups.forEach((g) => {
      const rowsData = g.rows.map(rowData);
      let idx = 0;
      let firstChunk = true;
      while (idx < rowsData.length) {
        // высоту заголовка резервируем, только если он рисуется:
        // на странице категории группы нет, и лишние 34 единицы съедали строку
        const groupH = opts.showGroups ? GROUP_H * ts() : 0;
        const minChunk = groupH + rowsData.slice(idx, idx + 3)
          .reduce((a, r) => a + rowHeight(r, { ...opts, stretch: 1 }), 0);
        if (used > 0 && used + minChunk > bodyH) flush();
        let h = used + groupH;
        const chunk = [];
        while (idx < rowsData.length) {
          const rh = rowHeight(rowsData[idx], { ...opts, stretch: 1 });
          if (h + rh > bodyH && chunk.length) break;
          chunk.push(rowsData[idx]);
          h += rh;
          idx += 1;
        }
        page.push({ title: g.title + (firstChunk ? "" : " (продолжение)"), rows: chunk });
        used = h;
        firstChunk = false;
        if (idx < rowsData.length) flush();
      }
    });
    flush();
    return pages.length ? pages : [[]];
  };

  const drawSheet = (pageGroups, opts, { page, pages, width, height }) => {
    const P = PALETTE[opts.lik] || PALETTE.obsidian;
    const scale = width / U;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.textBaseline = "middle";

    const H = height;
    const k = ts();
    const sans = (size, weight = 400) => `${weight} ${size * k}px Inter, system-ui, sans-serif`;
    const mono = (size, weight = 500) => `${weight} ${size * k}px "JetBrains Mono", ui-monospace, monospace`;
    const line = (x1, y, x2, w = 1) => {
      ctx.strokeStyle = P.hairline;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x1, y + 0.5);
      ctx.lineTo(x2, y + 0.5);
      ctx.stroke();
    };

    ctx.fillStyle = P.canvas;
    ctx.fillRect(0, 0, U, H);

    // Рамка-hairline по периметру — глубина линиями, не тенями
    ctx.strokeStyle = P.hairline;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(FRAME, FRAME, U - FRAME * 2, H - FRAME * 2);

    // --- шапка ---
    let y = M + 22;
    ctx.fillStyle = P.slate;
    ctx.font = sans(11, 500);
    tracked(ctx, opts.eyebrow.toUpperCase(), M, y, 2.2);

    y += 34;
    ctx.fillStyle = P.ink;
    let titleSize = 40;
    let titleLines = [];
    while (titleSize > 20) {
      ctx.font = sans(titleSize, 600);
      titleLines = wrapLines(ctx, opts.title.toUpperCase(), U - M * 2, 2);
      if (titleLines.length <= opts.titleLines) break;
      titleSize -= 3;
    }
    ctx.font = sans(titleSize, 600);
    titleLines.forEach((l, i) => {
      tracked(ctx, l, M, y + i * (titleSize + 4), -0.4);
    });
    y += (titleLines.length - 1) * (titleSize + 4) + 26;

    if (opts.subtitle) {
      ctx.fillStyle = P.slate;
      ctx.font = sans(14);
      ctx.fillText(ellipsize(ctx, opts.subtitle, U - M * 2 - 120), M, y);
      y += 24;
    }

    if (opts.stats && opts.statsList.length) {
      let sx = M;
      opts.statsList.forEach((st) => {
        ctx.fillStyle = P.ink;
        ctx.font = mono(19, 500);
        ctx.fillText(st.value, sx, y + 8);
        ctx.fillStyle = P.slate;
        ctx.font = sans(9.5, 500);
        tracked(ctx, st.label.toUpperCase(), sx, y + 28, 1.4);
        sx += Math.max(trackedWidth(ctx, st.label.toUpperCase(), 1.4), 60) + 34;
      });
      y += 46;
    }

    y += 8;
    line(M, y, U - M);
    y += 18;

    // --- сетка колонок ---
    const inner = U - M * 2;
    const xs = [];
    let acc = M;
    COLS.forEach((f) => { xs.push(acc); acc += inner * f; });
    const widths = COLS.map((f) => inner * f - 14);

    // --- заголовок таблицы ---
    ctx.fillStyle = P.inset;
    const theadH = THEAD_H * k;
    ctx.fillRect(M, y, inner, theadH);
    ctx.fillStyle = P.slate;
    ctx.font = sans(9.5, 500);
    COL_LABELS.forEach((h, i) => tracked(ctx, h.toUpperCase(), xs[i] + 10, y + theadH / 2, 1.4));
    y += theadH;

    // --- тело ---
    pageGroups.forEach((g, gi) => {
      if (opts.showGroups) {
        if (gi) y += 6;
        const gh = GROUP_H * (opts.stretch || 1);
        ctx.fillStyle = P.inset;
        ctx.fillRect(M, y, inner, gh);
        ctx.fillStyle = P.ink;
        ctx.font = sans(12, 600);
        tracked(ctx, g.title.toUpperCase(), M + 10, y + gh / 2, 1.6);
        y += gh;
      }

      g.rows.forEach((r, idx) => {
        const rh = rowHeight(r, opts);
        ctx.fillStyle = idx % 2 ? P.zebra : P.surface;
        ctx.fillRect(M, y, inner, rh);

        const mid = y + (r.roster && opts.roster ? ROW_H / 2 : rh / 2);

        // дисциплина + бейдж «Новое» инверсией — единственный акцент на листе
        const badge = opts.badges && r.fresh;
        /* Плашку меряем по тексту, а не берём фиксированную ширину:
           «НОВОЕ» в кириллице шире, чем кажется, и вылезало за правый край. */
        const BADGE_PAD = 6;
        const BADGE_TRACK = 0.8;
        let badgeW = 0;
        if (badge) {
          ctx.font = sans(8, 600);
          badgeW = trackedWidth(ctx, "НОВОЕ", BADGE_TRACK) + BADGE_PAD * 2;
        }

        ctx.fillStyle = P.ink;
        ctx.font = sans(13, 500);
        const disc = ellipsize(ctx, r.disc, widths[0] - (badge ? badgeW + 8 : 0));
        ctx.fillText(disc, xs[0] + 10, mid);
        if (badge) {
          const bx = xs[0] + 10 + ctx.measureText(disc).width + 8;
          /* textBaseline: middle — это середина em-box, а не оптический центр букв.
             У 13px дисциплины и 8px бейджа середины расходятся, и плашка съезжает
             вверх. Считаем реальные границы обоих и совмещаем их центры. */
          const dm = ctx.measureText(disc);
          const discMid = mid + (dm.actualBoundingBoxDescent - dm.actualBoundingBoxAscent) / 2;
          ctx.font = sans(8, 600);
          const bm = ctx.measureText("НОВОЕ");
          const by = discMid + (bm.actualBoundingBoxAscent - bm.actualBoundingBoxDescent) / 2;
          const padY = 4 * k;
          const bh = bm.actualBoundingBoxAscent + bm.actualBoundingBoxDescent + padY * 2;
          ctx.fillStyle = P.ink;
          ctx.fillRect(bx, by - bm.actualBoundingBoxAscent - padY, badgeW, bh);
          ctx.fillStyle = P.canvas;
          tracked(ctx, "НОВОЕ", bx + BADGE_PAD, by, BADGE_TRACK);
        }

        ctx.fillStyle = P.soft;
        ctx.font = sans(12.5);
        ctx.fillText(ellipsize(ctx, r.athlete, widths[1]), xs[1] + 10, mid);

        ctx.fillStyle = P.ink;
        ctx.font = mono(15, 500);
        ctx.fillText(ellipsize(ctx, r.result, widths[2]), xs[2] + 10, mid);

        ctx.fillStyle = P.slate;
        ctx.font = sans(12);
        ctx.fillText(ellipsize(ctx, r.location, widths[3]), xs[3] + 10, mid);
        ctx.font = mono(12);
        ctx.fillText(ellipsize(ctx, r.date, widths[4]), xs[4] + 10, mid);

        if (opts.roster && r.roster) {
          ctx.fillStyle = P.slate;
          ctx.font = sans(10.5);
          ctx.fillText(ellipsize(ctx, r.roster, inner - 20), xs[1] + 10, y + ROW_H + 2);
        }

        line(M, y + rh - 1, U - M);
        y += rh;
      });
    });

    // --- подвал ---
    const footTop = H - FOOT_H(opts) - M + 20;
    line(M, footTop, U - M);
    const fy = footTop + 30;

    /* QR, домен и подпись авторства рисуются всегда: это выходные данные
       листа, а не украшение. Кегли подвала не зависят от размера текста. */
    if (qrMatrix) drawQr(ctx, M, fy - 10, 82);
    ctx.fillStyle = P.soft;
    ctx.font = `500 12px Inter, system-ui, sans-serif`;
    ctx.fillText("Актуальная таблица", M + 96, fy + 14);
    ctx.fillStyle = P.slate;
    ctx.font = `400 10.5px Inter, system-ui, sans-serif`;
    ctx.fillText("Наведите камеру телефона", M + 96, fy + 32);

    ctx.textAlign = "right";
    ctx.fillStyle = P.soft;
    ctx.font = `500 12px Inter, system-ui, sans-serif`;
    ctx.fillText(SITE_URL, U - M, fy + 12);
    ctx.fillStyle = P.slate;
    ctx.font = `500 9.5px Inter, system-ui, sans-serif`;
    tracked(ctx, "BY BOROZDOV", U - M, fy + 32, 2.2, "right");
    if (pages > 1) {
      ctx.font = `400 10px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillText(`${page} / ${pages}`, U - M, fy + 52);
    }
    ctx.textAlign = "left";

    return canvas;
  };

  /* --- настройки ---------------------------------------------------------- */

  const EXPORT_KEY = "rus-records-export-v1";
  const opts = {
    lik, shape: "page", title: "", stats: true, badges: true, roster: true,
  };

  const readSettings = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(EXPORT_KEY) || "null");
      if (saved && typeof saved === "object") {
        if (PALETTE[saved.lik]) opts.lik = saved.lik;
        if (SHAPES.includes(saved.shape)) opts.shape = saved.shape;
        ["stats", "badges", "roster"].forEach((key) => {
          if (typeof saved[key] === "boolean") opts[key] = saved[key];
        });
      }
    } catch (_) {}
  };
  const saveSettings = () => {
    try {
      localStorage.setItem(EXPORT_KEY, JSON.stringify({
        lik: opts.lik, shape: opts.shape,
        stats: opts.stats, badges: opts.badges, roster: opts.roster,
      }));
    } catch (_) {}
  };

  const buildOpts = () => {
    const groups = visibleGroups();
    const shown = groups.reduce((n, g) => n + g.rows.length, 0);
    const filters = activeFiltersText();
    return {
      ...opts,
      title: (opts.title || pageTitle()).trim(),
      titleLines: 2,
      eyebrow: pageEyebrow(),
      // Фильтры и поисковый запрос на лист не выносим: человек пишет в поиск
      // что угодно, и на плакате это выглядит случайной надписью
      subtitle: "",
      statsList: pageStats(),
      showGroups: groups.length > 1 || $("tr.group-row"),
      groups,
      shown,
    };
  };

  /* Лента: высота по содержимому, масштаб упирается в потолок площади.
     A4/A3: фиксированные пропорции, ширина из таблицы DPI. */
  /* Лента: высота по содержимому, ширина упирается в потолок площади.
     Страница: пропорция A-серии, ширина берётся из выбранного размера. */
  const layout = (o) => {
    const k = ts();
    const bodyOf = (h) => h - headHeight(o) - FOOT_H() - M;
    if (o.shape === "ribbon") {
      const one = paginate(o.groups, o, Infinity)[0];
      let h = headHeight(o) + THEAD_H * k + FOOT_H() + M;
      one.forEach((g) => {
        h += (o.showGroups ? GROUP_H * k : 0);
        g.rows.forEach((r) => { h += rowHeight(r, { ...o, stretch: 1 }); });
      });
      const width = Math.min(IMG_W, Math.sqrt(MAX_AREA * U / h));
      return { pages: [one], width, height: h, stretch: 1 };
    }
    const height = U * PAGE_RATIO;
    const width = IMG_W;
    const avail = bodyOf(height) - THEAD_H * k;
    const pages = paginate(o.groups, o, avail);
    let stretch = 1;
    if (pages.length === 1) {
      const used = pages[0].reduce((h, g) => h
        + (o.showGroups ? GROUP_H * k : 0)
        + g.rows.reduce((a, r) => a + rowHeight(r, { ...o, stretch: 1 }), 0), 0);
      if (used > 0) stretch = Math.min(1.55, Math.max(1, avail / used));
    }
    return { pages, width, height, stretch, capacity: avail };
  };

  const renderPages = (o) => layout(o);

  /* --- окно --------------------------------------------------------------- */

  const previewCanvas = $("#export-canvas");
  const noteEl = $("#export-note");
  let lastTrigger = null;
  let redrawTimer = 0;

  const setNote = (o, plan) => {
    if (!noteEl) return;
    const w = Math.round(plan.width);
    const h = Math.round(plan.height * plan.width / U);
    const pagesTxt = plan.pages.length > 1
      ? ` · ${plan.pages.length} ${plural(plan.pages.length, "лист", "листа", "листов")}`
      : "";
    if (o.shape === "ribbon") {
      noteEl.textContent = `Лента · ${w} × ${h} px`;
      return;
    }
    const dpi = Math.round(w / (PAPER_MM[0] / 25.4));
    /* Ёмкость листа показываем отдельно: размер текста не всегда меняет число
       листов (мешает правило переноса групп), но строк на лист меняет всегда —
       иначе кажется, что настройка ничего не делает */
    const fit = Math.floor(plan.capacity / (ROW_H * ts()));
    let note = `${w} × ${h} px · ${dpi} dpi на A4`
      + ` · ${fit} ${plural(fit, "строка", "строки", "строк")} на лист${pagesTxt}`;
    // Растянуть строки можно лишь в полтора раза; когда записей совсем мало,
    // страница остаётся пустой на две трети — честнее предложить ленту
    const shown = o.groups.reduce((n, g) => n + g.rows.length, 0);
    if (plan.pages.length === 1 && shown < fit * 0.5) {
      note += " · для такой выборки лучше «Лента»";
    }
    noteEl.textContent = note;
  };

  /* Превью рисуем с учётом DPR: 620 условных px на трёхкратном экране телефона —
     размытый лист. CSS max-width: 100% сжимает канву обратно в CSS-пиксели. */
  const PREVIEW_W = Math.round(Math.min(1240, 620 * (window.devicePixelRatio || 1)));

  const drawPreview = () => {
    if (!previewCanvas) return;
    const o = buildOpts();
    const plan = renderPages(o);
    const sheet = drawSheet(plan.pages[0], { ...o, stretch: plan.stretch }, {
      page: 1, pages: plan.pages.length, width: PREVIEW_W, height: plan.height,
    });
    previewCanvas.width = sheet.width;
    previewCanvas.height = sheet.height;
    previewCanvas.getContext("2d").drawImage(sheet, 0, 0);
    setNote(o, plan);
  };

  const scheduleRedraw = () => {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(drawPreview, 150);
  };

  const bindSettings = () => {
    const seg = (name, key, cast = (v) => v) => {
      $$(`input[name="${name}"]`).forEach((el) => el.addEventListener("change", () => {
        opts[key] = cast(el.value);
        saveSettings();
        scheduleRedraw();
      }));
    };
    seg("ex-lik", "lik");
    seg("ex-shape", "shape");

    const titleEl = $("#ex-title");
    if (titleEl) titleEl.addEventListener("input", () => {
      opts.title = titleEl.value; scheduleRedraw();
    });
    [["ex-stats", "stats"], ["ex-badges", "badges"], ["ex-roster", "roster"]]
      .forEach(([id, key]) => {
      const el = $(`#${id}`);
      if (!el) return;
      el.addEventListener("change", () => {
        opts[key] = el.checked;
        saveSettings();
        scheduleRedraw();
      });
    });
  };

  const syncControls = () => {
    const set = (name, value) => {
      const el = $(`input[name="${name}"][value="${value}"]`);
      if (el) el.checked = true;
    };
    set("ex-lik", opts.lik);
    set("ex-shape", opts.shape);
    const titleEl = $("#ex-title");
    if (titleEl) {
      titleEl.value = opts.title;
      titleEl.placeholder = pageTitle();
    }
    [["ex-stats", "stats"], ["ex-badges", "badges"], ["ex-roster", "roster"]]
      .forEach(([id, key]) => {
        const el = $(`#${id}`);
        if (el) el.checked = opts[key];
      });
  };

  const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

  /* Остальная страница на время окна — inert: свайп VoiceOver не уходит
     в таблицу за скримом. Тост не трогаем — в нём может быть «Обновить». */
  const setInert = (on) => {
    Array.from(document.body.children).forEach((el) => {
      if (el !== exportEl && el !== toastEl) el.inert = on;
    });
  };

  /* В standalone нет крестика браузера: системная «Назад» на Android — главный
     жест закрытия. Кладём запись в историю, popstate закрывает окно. */
  let exportPushed = false;

  const openExport = async (trigger) => {
    if (!exportEl) return;
    lastTrigger = trigger || document.activeElement;
    readSettings();
    syncControls();
    exportEl.hidden = false;
    lockScroll(true);
    setInert(true);
    try { history.pushState({ export: 1 }, ""); exportPushed = true; } catch (_) {}
    try { await loadQr(); } catch (_) {}
    await fontsReady();
    drawPreview();
    const first = $(FOCUSABLE, exportEl);
    if (first) first.focus();
  };

  const closeExport = (fromPop) => {
    if (!exportEl || exportEl.hidden) return;
    exportEl.hidden = true;
    setInert(false);
    lockScroll(false);
    /* Пункт меню, из которого пришли, скрыт вместе с панелью скачивания —
       фокус на него не встанет, поэтому возвращаем на саму кнопку «Скачать» */
    const back = lastTrigger && lastTrigger.offsetParent ? lastTrigger : dlBtn;
    if (back && back.focus) back.focus();
    if (exportPushed && fromPop !== true) {
      exportPushed = false;
      history.back();   // снимаем свою запись; popstate уже никого не найдёт
      return;
    }
    exportPushed = false;
  };

  if (exportEl) {
    bindSettings();
    $("#export-close").addEventListener("click", () => closeExport());
    $$("[data-close]", exportEl).forEach((el) => el.addEventListener("click", () => closeExport()));
    window.addEventListener("popstate", () => { if (!exportEl.hidden) closeExport(true); });
    document.addEventListener("keydown", (e) => {
      if (exportEl.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); closeExport(); }
      if (e.key === "Tab") {
        const items = $$(FOCUSABLE, exportEl).filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* --- скачивание --------------------------------------------------------- */

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const stamp = () => new Date().toISOString().slice(0, 10);

  /* Ждём именно те начертания, которыми рисуем: одного fonts.ready мало —
     первая генерация уходит системным шрифтом. */
  const fontsReady = async () => {
    if (!document.fonts) return;
    const want = ['600 40px Inter', '500 13px Inter', '400 12px Inter',
                  '500 15px "JetBrains Mono"', '400 12px "JetBrains Mono"'];
    try { await Promise.all(want.map((f) => document.fonts.load(f))); } catch (_) {}
    try { await document.fonts.ready; } catch (_) {}
  };

  const withBusy = async (btn, label, fn) => {
    if (!btn) return;
    btn.setAttribute("aria-busy", "true");
    showToast(`Создаём ${label}…`);
    try {
      await fontsReady();
      await fn();
    } catch (err) {
      console.error(err);
      showToast(`Не удалось создать ${label}`);
    } finally {
      btn.removeAttribute("aria-busy");
    }
  };

  const pngBtn = $("#export-png");
  if (pngBtn) pngBtn.addEventListener("click", () => withBusy(pngBtn, "PNG", async () => {
    const o = buildOpts();
    const plan = renderPages(o);
    for (let i = 0; i < plan.pages.length; i += 1) {
      const canvas = drawSheet(plan.pages[i], { ...o, stretch: plan.stretch }, {
        page: i + 1, pages: plan.pages.length, width: plan.width, height: plan.height,
      });
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("пустой blob");
      const suffix = plan.pages.length > 1 ? `-${i + 1}` : "";
      downloadBlob(blob, `records-${stamp()}${suffix}.png`);
      if (i < plan.pages.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
    showToast(plan.pages.length > 1 ? `Готово: ${plan.pages.length} файла` : "Готово");
    goal("export_done", { format: "png", pages: plan.pages.length });
  }));

  const pdfBtn = $("#export-pdf");
  if (pdfBtn) pdfBtn.addEventListener("click", () => withBusy(pdfBtn, "PDF", async () => {
    if (!window.jspdf) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "/assets/vendor/jspdf.umd.min.js";
        s.onload = res;
        s.onerror = () => rej(new Error("jsPDF не загрузился"));
        document.head.appendChild(s);
      });
    }
    const o = buildOpts();
    // ленту в PDF не кладём: там страница, а не рулон
    const plan = renderPages({ ...o, shape: "page" });
    const { jsPDF } = window.jspdf;
    const size = PAPER_MM;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: size, compress: true });
    plan.pages.forEach((pageGroups, i) => {
      const canvas = drawSheet(pageGroups, { ...o, shape: "page", stretch: plan.stretch }, {
        page: i + 1, pages: plan.pages.length, width: plan.width, height: plan.height,
      });
      // JPEG: PNG jsPDF кладёт несжатым растром — файл раздувается до сотни МБ
      const img = canvas.toDataURL("image/jpeg", 0.94);
      if (i) pdf.addPage(size, "portrait");
      pdf.addImage(img, "JPEG", 0, 0, size[0], size[1]);
    });
    pdf.save(`records-${stamp()}.pdf`);
    showToast("Готово");
    goal("export_done", { format: "pdf", pages: plan.pages.length });
  }));

  /* Пункты меню больше не скачивают молча, а открывают окно с превью */
  const openFrom = (btn) => {
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (dlMenu) dlMenu.classList.remove("open");
      if (dlBtn) dlBtn.setAttribute("aria-expanded", "false");
      openExport(btn);
      goal("export_open", { format: btn.id.includes("pdf") ? "pdf" : "png" });
    });
  };
  openFrom($("#dl-png-btn"));
  openFrom($("#dl-pdf-btn"));

  /* --- Старт ------------------------------------------------------------- */

  apply();
})();
