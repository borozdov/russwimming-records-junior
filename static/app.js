(() => {
  "use strict";

  const dataEl = document.getElementById("records-data");
  if (!dataEl) return;
  const DATA = JSON.parse(dataEl.textContent);

  const SITE_URL = "russwimming-records-junior.borozdov.ru";

  const state = {
    search: "",
    filters: {
      sex: "all",        // all | women | men | mixed
      pool: "all",       // all | lcm | scm
      stroke: "all",     // all | freestyle | backstroke | breaststroke | butterfly | im | medley_relay
      relay: "all",      // all | relay | solo
    },
    sort: { key: null, dir: 1 },
  };

  const LS_KEY = "rus-records-state-v2";
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (saved && typeof saved === "object") {
      if (saved.filters) Object.assign(state.filters, saved.filters);
      if (saved.sort) state.sort = saved.sort;
    }
  } catch (_) {}

  const persist = () => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) {}
  };

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  // --- Все рекорды одним списком, с категорией ---
  const allRecords = [];
  for (const cat of DATA.categories) {
    for (const r of cat.records) {
      allRecords.push({ ...r, _category_id: cat.id, _category_title: cat.title, _sex: cat.sex, _pool: cat.pool });
    }
  }

  /* ── Лик: по умолчанию следует за средой, ручной выбор с памятью.
     Иконка показывает, куда переключит клик: в тёмном — солнце, в светлом — луна. */
  const LIK_KEY = "lik";
  const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  const themeBtn = document.getElementById("theme-toggle");
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const systemLik = () => (media.matches ? "titan" : "obsidian");

  const applyLik = (lik) => {
    document.documentElement.dataset.theme = lik;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.removeAttribute("media");
      m.setAttribute("content", lik === "obsidian" ? "#0d0d0d" : "#fafafa");
    });
    if (themeBtn) {
      themeBtn.innerHTML = lik === "obsidian" ? ICON_SUN : ICON_MOON;
      themeBtn.setAttribute("aria-label", lik === "obsidian" ? "Светлый лик" : "Тёмный лик");
      themeBtn.title = lik === "obsidian" ? "Светлый лик" : "Тёмный лик";
    }
  };

  let manualLik = null;
  try { manualLik = localStorage.getItem(LIK_KEY); } catch (_) {}
  if (manualLik !== "obsidian" && manualLik !== "titan") manualLik = null;
  applyLik(manualLik || systemLik());

  media.addEventListener("change", () => { if (!manualLik) applyLik(systemLik()); });

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "obsidian" ? "titan" : "obsidian";
      manualLik = next;
      try { localStorage.setItem(LIK_KEY, next); } catch (_) {}
      applyLik(next);
    });
  }

  // --- Фильтры ---
  const filterGroups = [
    { key: "sex",    label: "Пол",     options: [["all","Все"],["women","Женщины"],["men","Мужчины"],["mixed","Смешанные"]] },
    { key: "pool",   label: "Бассейн", options: [["all","Все"],["lcm","50 м"],["scm","25 м"]] },
    { key: "stroke", label: "Стиль",   options: [["all","Все"],["freestyle","Вольный"],["backstroke","На спине"],["breaststroke","Брасс"],["butterfly","Баттерфляй"],["im","Комплекс"],["medley_relay","Комб. эстафета"]] },
    { key: "relay",  label: "Тип",     options: [["all","Все"],["solo","Личные"],["relay","Эстафеты"]] },
  ];

  const hasActiveFilters = () =>
    state.search !== "" || Object.values(state.filters).some((v) => v !== "all");

  const resetFilters = () => {
    state.filters = { sex: "all", pool: "all", stroke: "all", relay: "all" };
    state.search = "";
    if (searchEl) searchEl.value = "";
    persist();
    render();
  };

  const filtersEl = document.getElementById("filters");
  const filtersToggle = document.getElementById("filters-toggle");
  if (filtersToggle && filtersEl) {
    filtersToggle.addEventListener("click", () => {
      const open = filtersEl.classList.toggle("open");
      filtersToggle.setAttribute("aria-expanded", String(open));
    });
  }

  const renderFilters = () => {
    if (!filtersEl) return;
    if (filtersToggle) {
      const n = Object.values(state.filters).filter((v) => v !== "all").length;
      filtersToggle.textContent = n ? `Фильтры · ${n}` : "Фильтры";
    }
    let html = filterGroups.map((g) =>
      `<div class="filter-group" role="group" aria-label="${g.label}">` +
      `<span class="label">${g.label}</span>` +
      g.options.map(([v, l]) =>
        `<button class="chip ${state.filters[g.key] === v ? "active" : ""}" data-group="${g.key}" data-value="${v}" aria-pressed="${state.filters[g.key] === v}">${l}</button>`
      ).join("") +
      `</div>`
    ).join("");
    if (hasActiveFilters()) {
      html += `<div class="filter-group"><span class="label"></span><button class="chip chip-reset" id="reset-filters">Сбросить всё</button></div>`;
    }
    filtersEl.innerHTML = html;
    filtersEl.querySelectorAll(".chip[data-group]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filters[btn.dataset.group] = btn.dataset.value;
        persist();
        render();
      });
    });
    const resetBtn = document.getElementById("reset-filters");
    if (resetBtn) resetBtn.addEventListener("click", resetFilters);
  };

  // --- Поиск ---
  const searchEl = document.getElementById("search");
  if (searchEl) {
    searchEl.addEventListener("input", () => {
      state.search = searchEl.value.trim().toLowerCase();
      render();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchEl &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      searchEl && searchEl.focus();
    }
    if (e.key === "Escape" && document.activeElement === searchEl) {
      searchEl.value = "";
      state.search = "";
      render();
    }
  });

  // --- Отбор и сортировка ---
  const isFresh = (dateIso) => !!dateIso && dateIso.startsWith(String(new Date().getFullYear()));

  const matches = (r) => {
    if (state.filters.sex !== "all" && r._sex !== state.filters.sex) {
      if (!(r._sex === "mixed" && state.filters.sex === "mixed")) return false;
    }
    if (state.filters.pool !== "all" && r._pool !== state.filters.pool) {
      if (r._pool === "mixed") {
        if (state.filters.pool === "scm" && !r.is_25m_pool) return false;
        if (state.filters.pool === "lcm" && r.is_25m_pool) return false;
      } else {
        return false;
      }
    }
    if (state.filters.stroke !== "all" && r.stroke_id !== state.filters.stroke) return false;
    if (state.filters.relay === "relay" && !r.relay) return false;
    if (state.filters.relay === "solo" && r.relay) return false;
    if (state.search) {
      const hay = [
        r.discipline, r.athlete, r.location,
        (r.roster || []).join(" "),
        r._category_title,
      ].join(" ").toLowerCase();
      if (!hay.includes(state.search)) return false;
    }
    return true;
  };

  const sortRecords = (records) => {
    const { key, dir } = state.sort;
    if (!key) return records;
    const accessor = {
      discipline: (r) => [r.stroke_id, r.total_distance_m || 0, r.relay ? 1 : 0, r.discipline.toLowerCase()],
      athlete: (r) => r.athlete.toLowerCase(),
      result: (r) => (r.result_seconds == null ? Infinity : r.result_seconds),
      location: (r) => r.location.toLowerCase(),
      date: (r) => r.date || "",
    }[key];
    if (!accessor) return records;
    const arr = records.slice();
    arr.sort((a, b) => {
      const av = accessor(a), bv = accessor(b);
      if (Array.isArray(av)) {
        for (let i = 0; i < av.length; i++) {
          if (av[i] < bv[i]) return -1 * dir;
          if (av[i] > bv[i]) return 1 * dir;
        }
        return 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  };

  const fmtDate = (iso, orig) => (iso ? iso.split("-").reverse().join(".") : orig || "");

  const getVisibleRecords = () => sortRecords(allRecords.filter(matches));

  // --- Таблица + карточки ---
  const ICON_ARROW_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  const ICON_ARROW_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';

  const badgesHtml = (r) => {
    let out = "";
    if (isFresh(r.date)) out += '<span class="badge badge-fresh">Новое</span>';
    if (r.relay) out += '<span class="badge badge-relay">Эстафета</span>';
    return out;
  };

  const rowHtml = (r, showCat) => {
    const roster = r.roster ? `<div class="roster">${escapeHtml(r.roster.join(" · "))}</div>` : "";
    const cat = showCat ? `<span class="cell-cat">${escapeHtml(r._category_title)}</span>` : "";
    return `<tr>
      <td class="col-disc">${escapeHtml(r.discipline)}${badgesHtml(r)}${cat}</td>
      <td>${escapeHtml(r.athlete)}${roster}</td>
      <td class="col-result">${escapeHtml(r.result)}</td>
      <td class="col-loc">${escapeHtml(r.location)}</td>
      <td class="col-date">${fmtDate(r.date, r.date_original)}</td>
    </tr>`;
  };

  const cardHtml = (r, showCat) => {
    const roster = r.roster ? ` · ${escapeHtml(r.roster.join(", "))}` : "";
    const cat = showCat ? `${escapeHtml(r._category_title)} · ` : "";
    return `<article class="card">
      <div class="card-top">
        <span class="card-disc">${escapeHtml(r.discipline)}${badgesHtml(r)}</span>
        <span class="card-result">${escapeHtml(r.result)}</span>
      </div>
      <div class="card-athlete">${escapeHtml(r.athlete)}${roster}</div>
      <div class="card-meta">${cat}${escapeHtml(r.location)} · <span class="mono">${fmtDate(r.date, r.date_original)}</span></div>
    </article>`;
  };

  const renderTable = () => {
    const visible = getVisibleRecords();
    const grouped = !state.sort.key; // без сортировки — группируем по категориям
    const cols = [
      { key: "discipline", label: "Дисциплина" },
      { key: "athlete", label: "Спортсмен" },
      { key: "result", label: "Результат", num: true },
      { key: "location", label: "Место" },
      { key: "date", label: "Дата", num: true },
    ];

    const headerHtml = cols.map((c) => {
      const sorted = state.sort.key === c.key;
      const ind = sorted ? (state.sort.dir > 0 ? ICON_ARROW_UP : ICON_ARROW_DOWN) : "";
      const aria = sorted ? (state.sort.dir > 0 ? "ascending" : "descending") : "none";
      return `<th class="${c.num ? "num" : ""}" data-key="${c.key}" aria-sort="${aria}" title="Сортировать">${c.label}<span class="sort-ind">${ind}</span></th>`;
    }).join("");

    let bodyHtml = "";
    let cardsHtml = "";
    if (visible.length === 0) {
      const emptyMsg = 'Ничего не найдено по текущим фильтрам.<br><button class="btn" id="empty-reset">Сбросить фильтры</button>';
      bodyHtml = `<tr><td colspan="5" class="empty-state">${emptyMsg}</td></tr>`;
      cardsHtml = `<div class="empty-state">${emptyMsg.replace('id="empty-reset"', 'id="empty-reset-m"')}</div>`;
    } else if (grouped) {
      for (const cat of DATA.categories) {
        const rows = visible.filter((r) => r._category_id === cat.id);
        if (!rows.length) continue;
        bodyHtml += `<tr class="group-row"><td colspan="5">${escapeHtml(cat.title)}<span class="group-count">${rows.length}</span></td></tr>`;
        bodyHtml += rows.map((r) => rowHtml(r, false)).join("");
        cardsHtml += `<div class="card-group-head">${escapeHtml(cat.title)}</div>`;
        cardsHtml += rows.map((r) => cardHtml(r, false)).join("");
      }
    } else {
      bodyHtml = visible.map((r) => rowHtml(r, true)).join("");
      cardsHtml = visible.map((r) => cardHtml(r, true)).join("");
    }

    document.getElementById("table").innerHTML = `
      <div class="table-frame">
        <div class="table-scroll">
          <table class="records">
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </div>
        <div class="cards">${cardsHtml}</div>
      </div>
    `;

    document.querySelectorAll("table.records th[data-key]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (state.sort.key === key) {
          // второй клик — обратный порядок, третий — сброс к группировке
          if (state.sort.dir === 1) state.sort.dir = -1;
          else state.sort = { key: null, dir: 1 };
        } else {
          state.sort = { key, dir: 1 };
        }
        persist();
        renderTable();
      });
    });
    ["empty-reset", "empty-reset-m"].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener("click", resetFilters);
    });

    const countEl = document.getElementById("visible-count");
    if (countEl) countEl.innerHTML = `<b class="mono">${visible.length}</b> из <span class="mono">${allRecords.length}</span>`;
  };

  const render = () => {
    renderFilters();
    renderTable();
  };

  // --- Тост (инверсия) ---
  const toastEl = document.getElementById("toast");
  let toastTimer = null;
  const showToast = (msg = "Скачивание началось") => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3000);
  };

  // --- Меню скачивания ---
  const dlBtn = document.getElementById("dl-btn");
  const dlMenu = document.getElementById("dl-menu");
  if (dlBtn && dlMenu) {
    dlBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dlMenu.classList.toggle("open");
      dlBtn.setAttribute("aria-expanded", dlMenu.classList.contains("open"));
    });
    document.addEventListener("click", (e) => {
      if (!dlMenu.contains(e.target)) dlMenu.classList.remove("open");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") dlMenu.classList.remove("open");
    });
  }

  document.querySelectorAll(".dl-panel a[download]").forEach((a) => {
    a.addEventListener("click", () => { if (dlMenu) dlMenu.classList.remove("open"); showToast(); });
  });

  // --- Печать: чёрным по белому ---
  const setPrintDate = () => {
    const sig = document.querySelector(".print-signature .print-date");
    if (sig) sig.textContent = "Распечатано " + new Date().toLocaleDateString("ru-RU") + " · " + SITE_URL;
  };
  setPrintDate();
  window.addEventListener("beforeprint", setPrintDate);

  const printBtn = document.getElementById("print-btn");
  if (printBtn) printBtn.addEventListener("click", () => { setPrintDate(); window.print(); });

  /* ── Экспорт-картинка: монохром по текущему лику.
     Рецепт §7: канва canvas, карта surface с hairline, шапка inset,
     зебра zebra, главная цифра — инверсия. Без градиентов и теней. */

  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const getActiveFiltersText = () => {
    const parts = [];
    const f = state.filters;
    const byKey = (k, v) => {
      const g = filterGroups.find((x) => x.key === k);
      const o = g && g.options.find(([vv]) => vv === v);
      return o ? o[1] : "";
    };
    if (f.sex !== "all") parts.push(byKey("sex", f.sex));
    if (f.pool !== "all") parts.push(byKey("pool", f.pool));
    if (f.stroke !== "all") parts.push(byKey("stroke", f.stroke));
    if (f.relay !== "all") parts.push(byKey("relay", f.relay));
    if (state.search) parts.push("«" + state.search + "»");
    return parts.join(" · ");
  };

  /* Обрезка с многоточием: канва иначе уродливо сжимает текст через maxWidth */
  const ellipsize = (ctx, text, maxW) => {
    let t = String(text);
    if (ctx.measureText(t).width <= maxW) return t;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  };

  /* Перенос по словам, не больше maxLines строк; хвост — в многоточие */
  const wrapLines = (ctx, text, maxW, maxLines) => {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (line && ctx.measureText(test).width > maxW) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const cut = lines.slice(0, maxLines);
      cut[maxLines - 1] = ellipsize(ctx, cut[maxLines - 1] + " " + lines.slice(maxLines).join(" "), maxW);
      return cut;
    }
    return lines;
  };

  /* «(бассейн 25 м)» в экспорте избыточно — бассейн уже в колонке «Категория» */
  const stripPool = (s) => String(s).replace(/\s*\(бассейн 25 м\)/, "");

  const pluralRecords = (n) => {
    const t = n % 100;
    if (t >= 11 && t <= 14) return "РЕКОРДОВ";
    switch (n % 10) {
      case 1: return "РЕКОРД";
      case 2: case 3: case 4: return "РЕКОРДА";
      default: return "РЕКОРДОВ";
    }
  };

  const renderShareCanvas = () => {
    const records = getVisibleRecords();
    const T = {
      canvas: cssVar("--canvas"),
      inset: cssVar("--inset"),
      surface: cssVar("--surface"),
      zebra: cssVar("--zebra"),
      hairline: cssVar("--hairline"),
      strong: cssVar("--strong"),
      slate: cssVar("--slate"),
      soft: cssVar("--soft"),
      ink: cssVar("--ink"),
    };

    const DPR = 2;
    const W = 1200;
    const PAD = 56;
    const SANS = "Inter, -apple-system, system-ui, sans-serif";
    const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

    const HEADER_H = 176;
    const COL_H = 44;
    const ROW_H = 54;
    const FOOTER_H = 88;
    const tableW = W - PAD * 2;

    const cols = [
      { label: "ДИСЦИПЛИНА", w: 250 },
      { label: "КАТЕГОРИЯ", w: 160 },
      { label: "СПОРТСМЕН", w: 260 },
      { label: "РЕЗУЛЬТАТ", w: 130, align: "right" },
      { label: "МЕСТО", w: 160 },
      { label: "ДАТА", w: 108, align: "right" },
    ];
    let cx = PAD + 20;
    cols.forEach((c) => { c.x = cx; cx += c.w; });
    cols[4].x += 16; // зазор между «Результат» и «Место»

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Измерения до задания размеров: смена width/height сбрасывает состояние контекста
    ctx.font = `400 10px ${SANS}`;
    const rosterLines = records.map((r) =>
      r.roster ? wrapLines(ctx, r.roster.join(", "), cols[2].w - 16, 2) : null
    );
    const rowHeights = records.map((r, i) =>
      rosterLines[i] ? (rosterLines[i].length > 1 ? 74 : 62) : ROW_H
    );
    const bodyH = COL_H + (records.length === 0 ? 100 : rowHeights.reduce((a, b) => a + b, 0));
    const H = HEADER_H + bodyH + 2 + FOOTER_H;

    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.scale(DPR, DPR);

    // Канва
    ctx.fillStyle = T.canvas;
    ctx.fillRect(0, 0, W, H);

    // Шапка
    ctx.textBaseline = "top";
    ctx.fillStyle = T.slate;
    ctx.font = `500 11px ${SANS}`;
    ctx.fillText("Р Е К О Р Д Ы   Р О С С И И   ·   П Л А В А Н И Е   ·   Ю Н И О Р Ы", PAD, 46);

    ctx.fillStyle = T.ink;
    ctx.font = `600 40px ${SANS}`;
    ctx.fillText("ЮНОШЕСКИЕ РЕКОРДЫ", PAD, 68);

    const ft = getActiveFiltersText();
    ctx.fillStyle = T.soft;
    ctx.font = `400 14px ${SANS}`;
    ctx.fillText(ft ? "Фильтры: " + ft : "Полная таблица", PAD, 120);

    // Главная цифра — инверсия; ширина плашки — по большему из числа и подписи
    const countStr = String(records.length);
    const countLabel = pluralRecords(records.length);
    ctx.font = `700 34px ${MONO}`;
    const cw = ctx.measureText(countStr).width;
    ctx.font = `600 9px ${SANS}`;
    const lw = ctx.measureText(countLabel).width;
    const plaqueH = 68;
    const plaqueW = Math.max(Math.max(cw, lw) + 36, plaqueH); // не уже, чем высота
    const plaqueX = W - PAD - plaqueW;
    const plaqueY = 48;
    const plaqueCX = plaqueX + plaqueW / 2;
    ctx.fillStyle = T.ink;
    ctx.beginPath();
    ctx.roundRect(plaqueX, plaqueY, plaqueW, plaqueH, 4);
    ctx.fill();
    ctx.fillStyle = T.canvas;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.font = `700 34px ${MONO}`;
    ctx.fillText(countStr, plaqueCX, plaqueY + 12);
    ctx.font = `600 9px ${SANS}`;
    ctx.fillText(countLabel, plaqueCX, plaqueY + 49);
    ctx.textAlign = "left";

    // Карта таблицы: surface + hairline, радиус 8
    const cardY = HEADER_H;
    const cardH = bodyH;
    ctx.fillStyle = T.surface;
    ctx.beginPath();
    ctx.roundRect(PAD, cardY, tableW, cardH, 8);
    ctx.fill();
    ctx.strokeStyle = T.hairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(PAD + 0.5, cardY + 0.5, tableW - 1, cardH - 1, 8);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(PAD, cardY, tableW, cardH, 8);
    ctx.clip();

    // Шапка таблицы — inset
    ctx.fillStyle = T.inset;
    ctx.fillRect(PAD, cardY, tableW, COL_H);
    ctx.strokeStyle = T.hairline;
    ctx.beginPath();
    ctx.moveTo(PAD, cardY + COL_H - 0.5);
    ctx.lineTo(PAD + tableW, cardY + COL_H - 0.5);
    ctx.stroke();

    ctx.textBaseline = "middle";
    ctx.fillStyle = T.slate;
    ctx.font = `500 10px ${SANS}`;
    for (const c of cols) {
      ctx.textAlign = c.align === "right" ? "right" : "left";
      ctx.fillText(c.label, c.align === "right" ? c.x + c.w - 8 : c.x, cardY + COL_H / 2);
    }
    ctx.textAlign = "left";

    if (records.length === 0) {
      ctx.fillStyle = T.slate;
      ctx.font = `500 15px ${SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("Нет данных", W / 2, cardY + COL_H + 50);
      ctx.textAlign = "left";
    } else {
      let ry = cardY + COL_H;
      records.forEach((rec, i) => {
        const rowH = rowHeights[i];
        const mid = ry + rowH / 2;

        // Зебра
        ctx.fillStyle = i % 2 === 1 ? T.zebra : T.surface;
        ctx.fillRect(PAD, ry, tableW, rowH);

        // Hairline между строками
        if (i > 0) {
          ctx.strokeStyle = T.hairline;
          ctx.beginPath();
          ctx.moveTo(PAD, ry + 0.5);
          ctx.lineTo(PAD + tableW, ry + 0.5);
          ctx.stroke();
        }

        // Дисциплина (+ бейдж «НОВОЕ» — инверсия)
        ctx.textBaseline = "middle";
        ctx.fillStyle = T.ink;
        ctx.font = `500 13px ${SANS}`;
        const badgeSpace = isFresh(rec.date) ? 64 : 0;
        const discipline = ellipsize(ctx, stripPool(rec.discipline), cols[0].w - 20 - badgeSpace);
        ctx.fillText(discipline, cols[0].x, mid);
        if (isFresh(rec.date)) {
          const bx = cols[0].x + ctx.measureText(discipline).width + 8;
          ctx.font = `600 8px ${SANS}`;
          const bw = ctx.measureText("НОВОЕ").width + 12;
          ctx.fillStyle = T.ink;
          ctx.beginPath();
          ctx.roundRect(bx, mid - 8, bw, 16, 2);
          ctx.fill();
          ctx.fillStyle = T.canvas;
          ctx.fillText("НОВОЕ", bx + 6, mid + 0.5);
        }

        // Категория
        ctx.fillStyle = T.slate;
        ctx.font = `400 11.5px ${SANS}`;
        ctx.fillText(ellipsize(ctx, rec._category_title, cols[1].w - 12), cols[1].x, mid);

        // Спортсмен (+ состав эстафеты в 1–2 строки)
        ctx.fillStyle = T.soft;
        ctx.font = `500 13px ${SANS}`;
        const athleteMaxW = cols[2].w - 16;
        if (rosterLines[i]) {
          const lines = rosterLines[i];
          const blockH = 17 + lines.length * 14;
          let ty = ry + (rowH - blockH) / 2 + 8;
          ctx.fillText(ellipsize(ctx, rec.athlete, athleteMaxW), cols[2].x, ty);
          ctx.fillStyle = T.slate;
          ctx.font = `400 10px ${SANS}`;
          ty += 17;
          for (const line of lines) {
            ctx.fillText(line, cols[2].x, ty);
            ty += 14;
          }
        } else {
          ctx.fillText(ellipsize(ctx, rec.athlete, athleteMaxW), cols[2].x, mid);
        }

        // Результат — моно, главный герой строки
        ctx.fillStyle = T.ink;
        ctx.font = `700 16px ${MONO}`;
        ctx.textAlign = "right";
        ctx.fillText(rec.result, cols[3].x + cols[3].w - 8, mid);
        ctx.textAlign = "left";

        // Место
        ctx.fillStyle = T.soft;
        ctx.font = `400 12px ${SANS}`;
        ctx.fillText(ellipsize(ctx, rec.location, cols[4].w - 12), cols[4].x, mid);

        // Дата — моно
        ctx.fillStyle = T.slate;
        ctx.font = `400 12px ${MONO}`;
        ctx.textAlign = "right";
        ctx.fillText(fmtDate(rec.date, rec.date_original), cols[5].x + cols[5].w - 8, mid);
        ctx.textAlign = "left";

        ry += rowH;
      });
    }

    ctx.restore();

    // Подвал: hairline во всю ширину, домен и подпись
    const footY = H - FOOTER_H;
    ctx.strokeStyle = T.hairline;
    ctx.beginPath();
    ctx.moveTo(PAD, footY + 24.5);
    ctx.lineTo(W - PAD, footY + 24.5);
    ctx.stroke();

    ctx.textBaseline = "middle";
    ctx.fillStyle = T.slate;
    ctx.font = `500 11px ${SANS}`;
    ctx.fillText(SITE_URL.toUpperCase() + "  ·  ДАННЫЕ: RUSSWIMMING.RU", PAD, footY + 54);

    ctx.textAlign = "right";
    ctx.fillText("BY BOROZDOV", W - PAD, footY + 54);
    ctx.textAlign = "left";

    return canvas;
  };

  const canvasToBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const stamp = () => new Date().toISOString().slice(0, 10);

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

  // --- PNG ---
  const dlPngBtn = document.getElementById("dl-png-btn");
  if (dlPngBtn) {
    let busy = false;
    dlPngBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      if (dlMenu) dlMenu.classList.remove("open");
      showToast("Создаём PNG…");
      try {
        const blob = await canvasToBlob(renderShareCanvas());
        if (!blob) throw new Error("пустой blob");
        downloadBlob(blob, `records-${stamp()}.png`);
      } catch (err) {
        console.error(err);
        showToast("Не удалось создать PNG");
      } finally {
        busy = false;
      }
    });
  }

  // --- PDF ---
  const dlPdfBtn = document.getElementById("dl-pdf-btn");
  if (dlPdfBtn) {
    let busy = false;
    dlPdfBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      if (dlMenu) dlMenu.classList.remove("open");
      showToast("Создаём PDF…");
      try {
        if (!window.jspdf) {
          await new Promise((res, rej) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
          });
        }
        const canvas = renderShareCanvas();
        // JPEG: PNG jsPDF кладёт несжатым растром — файл раздувается до сотни МБ
        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        const { jsPDF } = window.jspdf;
        const px2mm = 1 / 3.7795275591;
        const w = canvas.width * px2mm;
        const h = canvas.height * px2mm;
        const pdf = new jsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "mm", format: [w, h], compress: true });
        pdf.addImage(imgData, "JPEG", 0, 0, w, h);
        pdf.save(`records-${stamp()}.pdf`);
      } catch (err) {
        console.error(err);
        showToast("Не удалось создать PDF");
      } finally {
        busy = false;
      }
    });
  }

  // --- Инициализация ---
  if (searchEl) searchEl.value = state.search;
  render();
})();
