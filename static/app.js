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
  const SITE_URL = "swim-russia-records.borozdov.ru";

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

  const renderShareCanvas = () => {
    const records = getVisibleRecords();
    const dpr = 2;
    const W = 1200;
    const pad = 48;
    const headerH = 220;
    const rowH = 58;
    const footerH = 90;

    const catTitle = getActiveCategoryTitle();
    const filtersText = getActiveFiltersText();
    const bodyH = records.length === 0 ? 140 : (rowH * records.length + 56);
    const H = headerH + bodyH + footerH;

    const canvas = document.createElement("canvas");
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#f0f4f8";
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, W, headerH);
    grad.addColorStop(0, "#0057b8");
    grad.addColorStop(0.6, "#0098d4");
    grad.addColorStop(1, "#00bcd4");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, headerH);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let y = 20; y < headerH; y += 60) {
      for (let x = 20 + (y % 120 ? 30 : 0); x < W; x += 60) {
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = "#fff";
    ctx.font = "800 38px -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("🇷🇺  Рекорды России по плаванию", pad, 42);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 20px -apple-system, system-ui, sans-serif";
    ctx.fillText(catTitle, pad, 96);

    if (filtersText) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "400 15px -apple-system, system-ui, sans-serif";
      ctx.fillText("Фильтры: " + filtersText, pad, 126);
    }

    const pillY = 160;
    const drawPill = (text, x) => {
      ctx.font = "600 14px -apple-system, system-ui, sans-serif";
      const w = ctx.measureText(text).width + 24;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      const h = 30, r = 15;
      ctx.beginPath();
      ctx.moveTo(x + r, pillY);
      ctx.arcTo(x + w, pillY, x + w, pillY + h, r);
      ctx.arcTo(x + w, pillY + h, x, pillY + h, r);
      ctx.arcTo(x, pillY + h, x, pillY, r);
      ctx.arcTo(x, pillY, x + w, pillY, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.fillText(text, x + 12, pillY + 7);
      return x + w + 8;
    };
    let px = pad;
    px = drawPill(records.length + " рекордов", px);
    px = drawPill("на " + new Date().toLocaleDateString("ru-RU"), px);

    const showCat = state.categoryId === "all";
    const tableY = headerH + 28;
    const cols = showCat
      ? [
          { label: "Дисциплина", x: pad, w: 260 },
          { label: "Категория", x: pad + 260, w: 170 },
          { label: "Спортсмен", x: pad + 430, w: 270 },
          { label: "Результат", x: pad + 700, w: 150, align: "right" },
          { label: "Место", x: pad + 860, w: 130 },
          { label: "Дата", x: pad + 1000, w: 104, align: "right" },
        ]
      : [
          { label: "Дисциплина", x: pad, w: 320 },
          { label: "Спортсмен", x: pad + 320, w: 360 },
          { label: "Результат", x: pad + 680, w: 170, align: "right" },
          { label: "Место", x: pad + 860, w: 130 },
          { label: "Дата", x: pad + 1000, w: 104, align: "right" },
        ];

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(pad - 8, tableY - 8, W - 2 * pad + 16, bodyH);
    ctx.strokeStyle = "#dae2ec";
    ctx.lineWidth = 1;
    ctx.strokeRect(pad - 8, tableY - 8, W - 2 * pad + 16, bodyH);

    ctx.fillStyle = "#f7f9fc";
    ctx.fillRect(pad - 8, tableY - 8, W - 2 * pad + 16, 40);

    ctx.fillStyle = "#5a7184";
    ctx.font = "700 11px -apple-system, system-ui, sans-serif";
    for (const c of cols) {
      const label = c.label.toUpperCase();
      if (c.align === "right") {
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, c.x + c.w - tw, tableY + 6);
      } else {
        ctx.fillText(label, c.x, tableY + 6);
      }
    }

    if (records.length === 0) {
      ctx.fillStyle = "#8fa3b1";
      ctx.font = "500 18px -apple-system, system-ui, sans-serif";
      const msg = "Ничего не найдено по текущим фильтрам";
      const tw = ctx.measureText(msg).width;
      ctx.fillText(msg, (W - tw) / 2, tableY + 80);
    } else {
      let rowY = tableY + 40;
      records.forEach((r, i) => {
        if (i % 2 === 1) {
          ctx.fillStyle = "#f7f9fc";
          ctx.fillRect(pad - 8, rowY, W - 2 * pad + 16, rowH);
        }

        ctx.fillStyle = "#0d1b2a";
        ctx.font = "600 14.5px -apple-system, system-ui, sans-serif";
        const discCol = cols[0];
        const discLines = wrapText(ctx, r.discipline, discCol.w - 10);
        ctx.fillText(discLines[0], discCol.x, rowY + 10);
        if (discLines[1]) {
          ctx.font = "500 12.5px -apple-system, system-ui, sans-serif";
          ctx.fillText(discLines[1], discCol.x, rowY + 30);
        }
        if (r.relay) {
          ctx.fillStyle = "#6554c0";
          ctx.font = "600 10.5px -apple-system, system-ui, sans-serif";
          ctx.fillText("◆ ЭСТАФЕТА", discCol.x, rowY + rowH - 16);
        } else if (isFresh(r.date)) {
          ctx.fillStyle = "#00875a";
          ctx.font = "600 10.5px -apple-system, system-ui, sans-serif";
          ctx.fillText("● НОВОЕ", discCol.x, rowY + rowH - 16);
        }

        let ci = 1;
        if (showCat) {
          ctx.fillStyle = "#5a7184";
          ctx.font = "500 12.5px -apple-system, system-ui, sans-serif";
          const catLines = wrapText(ctx, r._category_title, cols[ci].w - 10);
          ctx.fillText(catLines[0], cols[ci].x, rowY + 12);
          if (catLines[1]) ctx.fillText(catLines[1], cols[ci].x, rowY + 30);
          ci++;
        }

        ctx.fillStyle = "#0d1b2a";
        ctx.font = "500 14px -apple-system, system-ui, sans-serif";
        const athleteCol = cols[ci];
        const athleteLines = wrapText(ctx, r.athlete, athleteCol.w - 10);
        ctx.fillText(athleteLines[0], athleteCol.x, rowY + 10);
        if (r.roster) {
          ctx.fillStyle = "#8fa3b1";
          ctx.font = "italic 400 11.5px -apple-system, system-ui, sans-serif";
          const rLines = wrapText(ctx, r.roster.join(" · "), athleteCol.w - 10);
          ctx.fillText(rLines[0], athleteCol.x, rowY + 32);
          if (rLines[1]) ctx.fillText(rLines[1], athleteCol.x, rowY + 46);
        }
        ci++;

        ctx.fillStyle = "#0057b8";
        ctx.font = "700 16px ui-monospace, SFMono-Regular, Menlo, monospace";
        const resCol = cols[ci];
        const resTW = ctx.measureText(r.result).width;
        ctx.fillText(r.result, resCol.x + resCol.w - resTW, rowY + 18);
        ci++;

        ctx.fillStyle = "#5a7184";
        ctx.font = "500 13px -apple-system, system-ui, sans-serif";
        ctx.fillText(r.location, cols[ci].x, rowY + 20);
        ci++;

        ctx.fillStyle = "#5a7184";
        ctx.font = "500 13px -apple-system, system-ui, sans-serif";
        const dateStr = fmtDate(r.date, r.date_original);
        const dtw = ctx.measureText(dateStr).width;
        ctx.fillText(dateStr, cols[ci].x + cols[ci].w - dtw, rowY + 20);

        if (i < records.length - 1) {
          ctx.strokeStyle = "#e4eaf2";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pad - 8, rowY + rowH);
          ctx.lineTo(W - pad + 8, rowY + rowH);
          ctx.stroke();
        }
        rowY += rowH;
      });
    }

    const footY = headerH + bodyH + 10;
    ctx.fillStyle = "#0057b8";
    ctx.fillRect(0, footY, W, 4);

    ctx.fillStyle = "#0d1b2a";
    ctx.font = "700 16px -apple-system, system-ui, sans-serif";
    ctx.fillText("🏊 " + SITE_URL, pad, footY + 22);

    ctx.fillStyle = "#5a7184";
    ctx.font = "400 13px -apple-system, system-ui, sans-serif";
    ctx.fillText("Источник данных: russwimming.ru · обновление раз в сутки", pad, footY + 50);

    const stamp = new Date().toLocaleString("ru-RU");
    ctx.textAlign = "right";
    ctx.font = "400 12px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "#8fa3b1";
    ctx.fillText(stamp, W - pad, footY + 50);
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

  // --- Init ---
  if (searchEl) searchEl.value = state.search;
  render();
})();
