(() => {
  "use strict";

  const dataEl = document.getElementById("records-data");
  if (!dataEl) return;
  const DATA = JSON.parse(dataEl.textContent);

  const state = {
    categoryId: "all",
    search: "",
    filters: {
      sex: "all",        // all | women | men | mixed
      pool: "all",       // all | lcm | scm
      stroke: "all",     // all | freestyle | backstroke | breaststroke | butterfly | im | medley_relay
      relay: "all",      // all | relay | solo
    },
    sort: { key: null, dir: 1 }, // dir: 1 asc, -1 desc
  };

  const LS_KEY = "rus-records-state-v1";
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (saved && typeof saved === "object") {
      if (saved.categoryId) state.categoryId = saved.categoryId;
      if (saved.filters) Object.assign(state.filters, saved.filters);
      if (saved.sort) state.sort = saved.sort;
    }
  } catch (_) {}

  const persist = () => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) {}
  };

  // --- All records combined, annotated with their category ---
  const allRecords = [];
  for (const cat of DATA.categories) {
    for (const r of cat.records) {
      allRecords.push({ ...r, _category_id: cat.id, _category_title: cat.title, _sex: cat.sex, _pool: cat.pool });
    }
  }

  const categories = DATA.categories;

  // --- Theme toggle ---
  const themeBtn = document.getElementById("theme-toggle");
  const applyTheme = (t) => {
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    if (themeBtn) themeBtn.textContent = t === "dark" ? "☀ Светлая" : t === "light" ? "☾ Тёмная" : "⌁ Авто";
  };
  const savedTheme = localStorage.getItem("rus-records-theme") || "auto";
  applyTheme(savedTheme);
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const cur = localStorage.getItem("rus-records-theme") || "auto";
      const next = cur === "auto" ? "light" : cur === "light" ? "dark" : "auto";
      localStorage.setItem("rus-records-theme", next);
      applyTheme(next);
    });
  }

  // --- Tabs ---
  const tabsEl = document.getElementById("tabs");
  const renderTabs = () => {
    const tabs = [
      { id: "all", title: "Все", count: allRecords.length },
      ...categories.map((c) => ({ id: c.id, title: c.title, count: c.records.length })),
    ];
    tabsEl.innerHTML = tabs.map((t) => `
      <button class="tab ${t.id === state.categoryId ? "active" : ""}" data-id="${t.id}">
        ${t.title}<span class="count">${t.count}</span>
      </button>
    `).join("");
    tabsEl.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.categoryId = btn.dataset.id;
        persist();
        render();
      });
    });
  };

  // --- Filters ---
  const filterGroups = [
    { key: "sex",    label: "Пол",    options: [["all","Все"],["women","Женщины"],["men","Мужчины"],["mixed","Смешанные"]] },
    { key: "pool",   label: "Бассейн",options: [["all","Все"],["lcm","50 м"],["scm","25 м"]] },
    { key: "stroke", label: "Стиль",  options: [["all","Все"],["freestyle","Вольный"],["backstroke","На спине"],["breaststroke","Брасс"],["butterfly","Баттерфляй"],["im","Комплекс"],["medley_relay","Комб. эстафета"]] },
    { key: "relay",  label: "Тип",    options: [["all","Все"],["solo","Личные"],["relay","Эстафеты"]] },
  ];
  const filtersEl = document.getElementById("filters");
  const renderFilters = () => {
    filtersEl.innerHTML = filterGroups.map((g, i) =>
      (i > 0 ? '<span class="filter-sep" aria-hidden="true"></span>' : "") +
      g.options.map(([v, l]) => `
        <button class="chip ${state.filters[g.key] === v ? "active" : ""}" data-group="${g.key}" data-value="${v}" title="${g.label}">${l}</button>
      `).join("")
    ).join("");
    filtersEl.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filters[btn.dataset.group] = btn.dataset.value;
        persist();
        render();
      });
    });
  };

  // --- Search ---
  const searchEl = document.getElementById("search");
  searchEl.addEventListener("input", () => {
    state.search = searchEl.value.trim().toLowerCase();
    render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.activeElement === searchEl) {
      searchEl.value = "";
      state.search = "";
      render();
    }
  });

  // --- Rendering ---
  const isFresh = (dateIso) => {
    if (!dateIso) return false;
    return dateIso.startsWith(String(new Date().getFullYear()));
  };

  const matches = (r) => {
    if (state.filters.sex !== "all" && r._sex !== state.filters.sex) {
      // Mixed relays fit only when sex=mixed or all
      if (!(r._sex === "mixed" && state.filters.sex === "mixed")) return false;
    }
    if (state.filters.pool !== "all" && r._pool !== state.filters.pool) {
      // For mixed category pool is "mixed" — show only when filter is "all" or derived from discipline
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

  const baseRecords = () => state.categoryId === "all"
    ? allRecords
    : allRecords.filter((r) => r._category_id === state.categoryId);

  const sortRecords = (records) => {
    const { key, dir } = state.sort;
    if (!key) return records;
    const accessor = {
      discipline: (r) => [r.stroke_id, r.total_distance_m || 0, r.relay ? 1 : 0, r.discipline.toLowerCase()],
      athlete: (r) => r.athlete.toLowerCase(),
      result: (r) => r.result_seconds == null ? Infinity : r.result_seconds,
      location: (r) => r.location.toLowerCase(),
      date: (r) => r.date || "",
      category: (r) => r._category_title,
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

  const fmtDate = (iso, orig) => {
    if (!iso) return orig || "";
    return iso.split("-").reverse().join(".");
  };

  const renderTable = () => {
    const visible = sortRecords(baseRecords().filter(matches));
    const showCat = state.categoryId === "all";
    const cols = [
      { key: "discipline", label: "Дисциплина" },
      ...(showCat ? [{ key: "category", label: "Категория" }] : []),
      { key: "athlete", label: "Спортсмен" },
      { key: "result", label: "Результат" },
      { key: "location", label: "Место" },
      { key: "date", label: "Дата" },
    ];
    const headerHtml = cols.map((c) => {
      const sortedCls = state.sort.key === c.key ? "sorted" : "";
      const ind = state.sort.key === c.key ? (state.sort.dir > 0 ? "↑" : "↓") : "";
      return `<th class="sortable ${sortedCls}" data-key="${c.key}">${c.label}<span class="sort-ind">${ind}</span></th>`;
    }).join("");

    const bodyHtml = visible.length === 0
      ? `<tr><td colspan="${cols.length}" class="empty-state">Ничего не найдено по текущим фильтрам.</td></tr>`
      : visible.map((r) => {
        const freshBadge = isFresh(r.date) ? '<span class="badge fresh">новое</span>' : "";
        const relayBadge = r.relay ? '<span class="badge relay">эстафета</span>' : "";
        const roster = r.roster ? `<div class="roster">${escapeHtml(r.roster.join(" · "))}</div>` : "";
        const catCell = showCat ? `<td>${escapeHtml(r._category_title)}</td>` : "";
        return `<tr>
          <td class="col-discipline">${escapeHtml(r.discipline)}${freshBadge}${relayBadge}</td>
          ${catCell}
          <td>${escapeHtml(r.athlete)}${roster}</td>
          <td class="col-result">${escapeHtml(r.result)}</td>
          <td class="col-location">${escapeHtml(r.location)}</td>
          <td class="col-date">${fmtDate(r.date, r.date_original)}</td>
        </tr>`;
      }).join("");

    document.getElementById("table").innerHTML = `
      <div class="table-scroll">
        <table class="records">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    `;
    document.querySelectorAll("table.records th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (state.sort.key === key) state.sort.dir = -state.sort.dir;
        else state.sort = { key, dir: 1 };
        persist();
        renderTable();
      });
    });
    document.getElementById("visible-count").textContent =
      `${visible.length} из ${baseRecords().length}`;
  };

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  const render = () => {
    renderTabs();
    renderFilters();
    renderTable();
  };

  // --- Download menu ---
  const dlBtn = document.getElementById("dl-btn");
  const dlMenu = document.getElementById("dl-menu");
  if (dlBtn && dlMenu) {
    dlBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dlMenu.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!dlMenu.contains(e.target)) dlMenu.classList.remove("open");
    });
  }
  const setPrintDate = () => {
    const sig = document.querySelector(".print-signature .print-date");
    if (sig) sig.textContent = "Распечатано " + new Date().toLocaleDateString("ru-RU");
  };
  setPrintDate();
  window.addEventListener("beforeprint", setPrintDate);

  const printBtn = document.getElementById("print-btn");
  if (printBtn) printBtn.addEventListener("click", () => {
    setPrintDate();
    window.print();
  });

  // --- Share as PNG ---
  const SITE_URL = "russwimming-records.borozdov.ru";

  const getVisibleRecords = () => sortRecords(baseRecords().filter(matches));

  const getActiveCategoryTitle = () => {
    if (state.categoryId === "all") return "Все категории";
    const c = categories.find((x) => x.id === state.categoryId);
    return c ? c.title : "Все категории";
  };

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
    if (state.search) parts.push(`«${state.search}»`);
    return parts.join(" · ");
  };

  const wrapText = (ctx, text, maxWidth) => {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  // helper: rounded rect path
  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  };

  const renderShareCanvas = () => {
    const records = getVisibleRecords();
    const DPR   = 2;
    const W     = 1200;
    const PAD   = 52;
    const SANS  = "-apple-system,system-ui,'Segoe UI',Roboto,sans-serif";
    const MONO  = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";

    // ── layout constants ──────────────────────────────────────
    const HEADER_H  = 200;
    const COL_H     = 42;
    const ROW_H     = 56;
    const FOOTER_H  = 72;
    const CARD_PAD  = 0;
    const tableW    = W - PAD * 2;

    const showCat = state.categoryId === "all";
    const cols = showCat
      ? [
          { label: "Дисциплина",  w: 210 },
          { label: "Категория",   w: 152 },
          { label: "Спортсмен",   w: 248 },
          { label: "Результат",   w: 120, align: "right" },
          { label: "Место",       w: 140 },
          { label: "Дата",        w: 98,  align: "right" },
        ]
      : [
          { label: "Дисциплина",  w: 268 },
          { label: "Спортсмен",   w: 320 },
          { label: "Результат",   w: 120, align: "right" },
          { label: "Место",       w: 164 },
          { label: "Дата",        w: 96,  align: "right" },
        ];

    let cx = PAD + 20;
    cols.forEach(c => { c.x = cx; cx += c.w; });

    const bodyH   = COL_H + (records.length === 0 ? 100 : ROW_H * records.length);
    const H       = HEADER_H + 16 + bodyH + 16 + FOOTER_H;

    const canvas  = document.createElement("canvas");
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    const ctx     = canvas.getContext("2d");
    ctx.scale(DPR, DPR);

    // ══ BACKGROUND ═══════════════════════════════════════════
    // subtle dot-grid pattern
    ctx.fillStyle = "#edf2f9";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,87,184,0.06)";
    for (let gy = 18; gy < H; gy += 22) {
      for (let gx = 18; gx < W; gx += 22) {
        ctx.beginPath(); ctx.arc(gx, gy, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // ══ HEADER ═══════════════════════════════════════════════
    // main gradient
    const hGrad = ctx.createLinearGradient(0, 0, W, HEADER_H);
    hGrad.addColorStop(0,   "#002d6e");
    hGrad.addColorStop(0.55,"#0057b8");
    hGrad.addColorStop(1,   "#0098d4");
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, W, HEADER_H);

    // decorative circle blobs top-right
    const blobs = [
      { x: W - 60,  y: -40,  r: 140, a: 0.07 },
      { x: W - 180, y: 30,   r: 90,  a: 0.05 },
      { x: W + 20,  y: 120,  r: 110, a: 0.06 },
    ];
    blobs.forEach(b => {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${b.a})`; ctx.fill();
    });

    // wave at bottom of header
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H - 30);
    for (let x = 0; x <= W; x += 90) {
      ctx.bezierCurveTo(x + 22, HEADER_H - 48, x + 68, HEADER_H - 12, x + 90, HEADER_H - 30);
    }
    ctx.lineTo(W, HEADER_H); ctx.lineTo(0, HEADER_H); ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fill();
    ctx.restore();

    // left vertical accent bar
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(PAD, 32, 3, 96);

    // eyebrow label
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.60)";
    ctx.font = `600 11px ${SANS}`;
    ctx.fillText("РЕКОРДЫ ПЛАВАНИЯ  ·  РОССИЯ", PAD + 16, 36);

    // main title
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 36px ${SANS}`;
    ctx.fillText(getActiveCategoryTitle(), PAD + 16, 60);

    // filter subtitle
    const ft = getActiveFiltersText();
    if (ft) {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = `400 14px ${SANS}`;
      ctx.fillText("Фильтры: " + ft, PAD + 16, 106);
    }

    // stats pills row
    const pillsY = ft ? 130 : 112;
    const drawPill = (text, px) => {
      ctx.font = `600 12px ${SANS}`;
      const tw = ctx.measureText(text).width;
      const pw = tw + 24, ph = 28, pr = 14;
      roundRect(ctx, px, pillsY, pw, ph, pr);
      ctx.fillStyle = "rgba(255,255,255,0.13)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      ctx.fillText(text, px + 12, pillsY + ph / 2);
      ctx.textBaseline = "top";
      return px + pw + 8;
    };
    let pillX = PAD + 16;
    pillX = drawPill(`${records.length} рекордов`, pillX);
    pillX = drawPill(new Date().toLocaleDateString("ru-RU"), pillX);

    // site URL top-right
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `400 11px ${SANS}`;
    ctx.fillText(SITE_URL, W - PAD, 38);
    ctx.textAlign = "left";

    // ══ TABLE CARD ════════════════════════════════════════════
    const cardY = HEADER_H + 16;
    const cardH = bodyH;
    const R = 12;

    // card shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,50,120,0.14)";
    ctx.shadowBlur = 28; ctx.shadowOffsetY = 6;
    roundRect(ctx, PAD, cardY, tableW, cardH, R);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.restore();

    // clip card content
    ctx.save();
    roundRect(ctx, PAD, cardY, tableW, cardH, R);
    ctx.clip();

    // ── column header ─────────────────────────────────────────
    const colGrad = ctx.createLinearGradient(PAD, 0, PAD + tableW, 0);
    colGrad.addColorStop(0, "#003f96");
    colGrad.addColorStop(1, "#0086c3");
    ctx.fillStyle = colGrad;
    ctx.fillRect(PAD, cardY, tableW, COL_H);

    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `700 10.5px ${SANS}`;
    for (const c of cols) {
      if (c.align === "right") {
        ctx.textAlign = "right";
        ctx.fillText(c.label.toUpperCase(), c.x + c.w - 6, cardY + COL_H / 2);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(c.label.toUpperCase(), c.x, cardY + COL_H / 2);
      }
    }
    ctx.textAlign = "left";

    // ── data rows ─────────────────────────────────────────────
    if (records.length === 0) {
      ctx.fillStyle = "#a0b8cc";
      ctx.font = `500 15px ${SANS}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Нет данных", W / 2, cardY + COL_H + 50);
      ctx.textAlign = "left";
    } else {
      records.forEach((rec, i) => {
        const ry = cardY + COL_H + i * ROW_H;

        // stripe
        ctx.fillStyle = i % 2 === 0 ? "#f6f9ff" : "#ffffff";
        ctx.fillRect(PAD, ry, tableW, ROW_H);

        // row separator
        if (i > 0) {
          ctx.strokeStyle = "#e4ecf6"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(PAD + 16, ry); ctx.lineTo(PAD + tableW - 16, ry); ctx.stroke();
        }

        // left accent stripe
        const accentColor = rec.relay ? "#6554c0" : isFresh(rec.date) ? "#00875a" : null;
        if (accentColor) {
          ctx.fillStyle = accentColor;
          ctx.fillRect(PAD, ry + 8, 4, ROW_H - 16);
        }

        ctx.textBaseline = "top"; ctx.textAlign = "left";
        let ci = 0;
        const mid = ry + ROW_H / 2;

        // Discipline
        ctx.fillStyle = "#0d1b2a";
        ctx.font = `600 13px ${SANS}`;
        const disc = wrapText(ctx, rec.discipline, cols[ci].w - 10);
        ctx.fillText(disc[0], cols[ci].x + 8, ry + (disc[1] ? 10 : 20));
        if (disc[1]) {
          ctx.fillStyle = "#7090a8"; ctx.font = `400 11px ${SANS}`;
          ctx.fillText(disc[1], cols[ci].x + 8, ry + 27);
        }
        ci++;

        if (showCat) {
          ctx.fillStyle = "#6080a0"; ctx.font = `400 11.5px ${SANS}`;
          ctx.textBaseline = "middle";
          const catL = wrapText(ctx, rec._category_title, cols[ci].w - 8);
          ctx.fillText(catL[0], cols[ci].x, mid - (catL[1] ? 7 : 0));
          if (catL[1]) ctx.fillText(catL[1], cols[ci].x, mid + 8);
          ctx.textBaseline = "top";
          ci++;
        }

        // Athlete
        ctx.fillStyle = "#1a2d42"; ctx.font = `500 13px ${SANS}`;
        ctx.textBaseline = "middle";
        const ath = wrapText(ctx, rec.athlete, cols[ci].w - 8);
        ctx.fillText(ath[0], cols[ci].x, mid - (rec.roster ? 8 : 0));
        if (rec.roster) {
          ctx.fillStyle = "#8fa8be"; ctx.font = `italic 400 10.5px ${SANS}`;
          const rl = wrapText(ctx, rec.roster.join(", "), cols[ci].w - 8);
          ctx.fillText(rl[0], cols[ci].x, mid + 8);
        }
        ctx.textBaseline = "top";
        ci++;

        // Result — gold pill for top result highlight
        const isBest = i === 0;
        const resultX = cols[ci].x + cols[ci].w - 6;
        const resultStr = rec.result;
        ctx.font = `700 14px ${MONO}`;
        const rw = ctx.measureText(resultStr).width + 20;
        const rpx = resultX - rw;
        roundRect(ctx, rpx, mid - 14, rw, 28, 7);
        ctx.fillStyle = isBest ? "#fff3cd" : "#eef3fb"; ctx.fill();
        ctx.fillStyle = isBest ? "#b35900" : "#0057b8";
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillText(resultStr, resultX - 4, mid);
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ci++;

        // Location
        ctx.fillStyle = "#4a6070"; ctx.font = `400 12px ${SANS}`;
        ctx.textBaseline = "middle";
        ctx.fillText(rec.location, cols[ci].x, mid);
        ctx.textBaseline = "top";
        ci++;

        // Date
        ctx.fillStyle = "#7090a8"; ctx.font = `400 12px ${SANS}`;
        const ds = fmtDate(rec.date, rec.date_original);
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillText(ds, cols[ci].x + cols[ci].w - 6, mid);
        ctx.textAlign = "left";
      });
    }

    ctx.restore(); // end card clip

    // ══ FOOTER ════════════════════════════════════════════════
    const footY = H - FOOTER_H;
    const fMid  = footY + FOOTER_H / 2;

    // footer top line
    ctx.fillStyle = "#d0dcea";
    ctx.fillRect(PAD, footY + 4, tableW, 1);

    // left: branding
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillStyle = "#0057b8"; ctx.font = `700 13px ${SANS}`;
    ctx.fillText("🏊  " + SITE_URL, PAD, fMid - 9);
    ctx.fillStyle = "#8fa3b1"; ctx.font = `400 11px ${SANS}`;
    ctx.fillText("Данные: russwimming.ru · обновление раз в сутки", PAD, fMid + 11);

    // right: legend
    ctx.textAlign = "right";
    const legend = [
      { color: "#00875a", label: "новый рекорд" },
      { color: "#6554c0", label: "эстафета" },
    ];
    let lx = W - PAD;
    legend.forEach(({ color, label }) => {
      ctx.font = `400 11px ${SANS}`;
      const lw = ctx.measureText(label).width;
      ctx.fillStyle = "#8fa3b1"; ctx.fillText(label, lx, fMid + 11); lx -= lw + 18;
      ctx.beginPath(); ctx.arc(lx + 8, fMid + 11, 5, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill(); lx -= 14;
    });

    ctx.textAlign = "left";
    return canvas;
  };

  const canvasToBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

  const shareBtn = document.getElementById("share-btn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const orig = shareBtn.textContent;
      shareBtn.textContent = "⏳ Создаём…";
      shareBtn.disabled = true;
      try {
        const canvas = renderShareCanvas();
        const blob = await canvasToBlob(canvas);
        if (!blob) throw new Error("Не удалось создать PNG");
        const filename = `records-${new Date().toISOString().slice(0, 10)}.png`;
        const file = new File([blob], filename, { type: "image/png" });
        const shareData = {
          title: "Рекорды России по плаванию",
          text: `Рекорды России по плаванию — ${SITE_URL}`,
          files: [file],
        };
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share(shareData);
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch (err) {
        if (err && err.name !== "AbortError") {
          console.error(err);
          alert("Не удалось создать изображение: " + (err.message || err));
        }
      } finally {
        shareBtn.textContent = orig;
        shareBtn.disabled = false;
      }
    });
  }

  // --- Download PNG ---
  const dlPngBtn = document.getElementById("dl-png-btn");
  if (dlPngBtn) {
    let pngBusy = false;
    dlPngBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (pngBusy) return;
      pngBusy = true;
      dlPngBtn.classList.add("loading");
      dlMenu.classList.remove("open");
      try {
        const canvas = renderShareCanvas();
        const blob = await canvasToBlob(canvas);
        const filename = `records-${new Date().toISOString().slice(0, 10)}.png`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        console.error(err);
        alert("Не удалось создать PNG: " + (err.message || err));
      } finally {
        dlPngBtn.classList.remove("loading");
        pngBusy = false;
      }
    });
  }

  // --- Download PDF ---
  const dlPdfBtn = document.getElementById("dl-pdf-btn");
  if (dlPdfBtn) {
    let pdfBusy = false;
    dlPdfBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (pdfBusy) return;
      pdfBusy = true;
      dlPdfBtn.classList.add("loading");
      dlMenu.classList.remove("open");
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
        const imgData = canvas.toDataURL("image/png");
        const { jsPDF } = window.jspdf;
        const px2mm = 1 / 3.7795275591;
        const w = canvas.width * px2mm;
        const h = canvas.height * px2mm;
        const orientation = w > h ? "landscape" : "portrait";
        const pdf = new jsPDF({ orientation, unit: "mm", format: [w, h] });
        pdf.addImage(imgData, "PNG", 0, 0, w, h);
        pdf.save(`records-${new Date().toISOString().slice(0, 10)}.pdf`);
      } catch (err) {
        console.error(err);
        alert("Не удалось создать PDF: " + (err.message || err));
      } finally {
        dlPdfBtn.classList.remove("loading");
        pdfBusy = false;
      }
    });
  }

  // --- Init ---
  if (searchEl) searchEl.value = state.search;
  render();
})();
