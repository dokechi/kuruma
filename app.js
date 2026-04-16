const state = {
  vehicles: [],
  summary: {},
  meta: {},
  filters: {
    search: "",
    status: "all",
    category: "all"
  }
};

const DATA_FILES = {
  vehicles: "./data/vehicles.json",
  summary: "./data/summary.json",
  meta: "./data/meta.json"
};

function safeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
}

function fmtNumber(value) {
  return new Intl.NumberFormat("ja-JP").format(Number(value || 0));
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return safeText(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function categoryLabel(category) {
  return category === "trade" ? "売買" : category === "rental" ? "レンタル" : "—";
}

function statusClass(status) {
  if (status === "稼働中") return "active";
  if (status === "売却済") return "sold";
  if (status === "廃車") return "scrapped";
  return "review";
}

function sumBy(list, key) {
  return list.reduce((acc, item) => acc + Number(item[key] || 0), 0);
}

function computeSummary(vehicles) {
  const active = vehicles.filter(v => v.status === "稼働中");
  const sold = vehicles.filter(v => v.status === "売却済");
  const scrapped = vehicles.filter(v => v.status === "廃車");
  const needs = vehicles.filter(v => v.status === "要確認");
  return {
    totalVehicles: vehicles.length,
    activeCount: active.length,
    soldCount: sold.length,
    scrappedCount: scrapped.length,
    needsReviewCount: needs.length,
    currentMonthlySum: sumBy(active, "currentMonthly"),
    totalPurchase: sumBy(vehicles, "purchaseAmount"),
    totalSale: sumBy(vehicles, "saleAmount"),
    totalProfit: sumBy(vehicles, "profit"),
    rentalCount: vehicles.filter(v => v.category === "rental").length,
    tradeCount: vehicles.filter(v => v.category === "trade").length
  };
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${path} の読み込みに失敗しました (${res.status})`);
  }
  return res.json();
}

async function loadDataset() {
  const [vehicles, summary, meta] = await Promise.all([
    fetchJson(DATA_FILES.vehicles),
    fetchJson(DATA_FILES.summary).catch(() => null),
    fetchJson(DATA_FILES.meta).catch(() => null)
  ]);

  return {
    vehicles: Array.isArray(vehicles) ? vehicles : [],
    summary: summary && typeof summary === "object" ? summary : computeSummary(Array.isArray(vehicles) ? vehicles : []),
    meta: meta && typeof meta === "object" ? meta : {
      title: "レンタカー台帳ダッシュボード",
      source: "local-json",
      refreshedAt: new Date().toISOString(),
      sheetLinked: false,
      notes: "data/*.json を読み込んでいます。"
    }
  };
}

function getSearchTarget(v) {
  return [
    v.id,
    v.name,
    v.chassisNo,
    v.registrationNo,
    v.oldNo,
    v.newNo,
    v.note,
    v.saleTo,
    categoryLabel(v.category),
    v.status
  ].filter(Boolean).join(" ").toLowerCase();
}

function sortByPurchaseDateDesc(list) {
  return [...list].sort((a, b) => String(b.purchaseDate || "").localeCompare(String(a.purchaseDate || "")));
}

function getFilteredVehicles() {
  const search = state.filters.search.trim().toLowerCase();
  return sortByPurchaseDateDesc(state.vehicles).filter(v => {
    if (state.filters.status !== "all" && v.status !== state.filters.status) return false;
    if (state.filters.category !== "all" && v.category !== state.filters.category) return false;
    if (search && !getSearchTarget(v).includes(search)) return false;
    return true;
  });
}

function renderCards() {
  const s = { ...computeSummary(state.vehicles), ...state.summary };
  const cards = [
    { title: "総台数", value: `${fmtNumber(s.totalVehicles)}台`, note: `レンタル ${fmtNumber(s.rentalCount)} / 売買 ${fmtNumber(s.tradeCount)}` },
    { title: "稼働中", value: `${fmtNumber(s.activeCount)}台`, note: `要確認 ${fmtNumber(s.needsReviewCount)}` },
    { title: "売却済 / 廃車", value: `${fmtNumber(s.soldCount + s.scrappedCount)}台`, note: `売却済 ${fmtNumber(s.soldCount)} / 廃車 ${fmtNumber(s.scrappedCount)}` },
    { title: "月額合計", value: fmtMoney(s.currentMonthlySum), note: "稼働中のみ" },
    { title: "総仕入", value: fmtMoney(s.totalPurchase), note: "登録済み全車両" },
    { title: "総売却", value: fmtMoney(s.totalSale), note: `利益合計 ${fmtMoney(s.totalProfit)}` }
  ];

  return cards.map(card => `
    <article class="card">
      <h3>${safeText(card.title)}</h3>
      <div class="value">${safeText(card.value)}</div>
      <small>${safeText(card.note)}</small>
    </article>
  `).join("");
}

function renderNameMeta(v) {
  const lines = [
    `区分: ${categoryLabel(v.category)} / 旧${safeText(v.oldNo || "—")} → 新${safeText(v.newNo || "—")}`,
    [v.registrationNo ? `登録 ${safeText(v.registrationNo)}` : null, v.chassisNo ? `車体 ${safeText(v.chassisNo)}` : null].filter(Boolean).join(" / "),
    v.note ? `備考: ${safeText(v.note)}` : null
  ].filter(Boolean);

  return `
    <div class="cell-meta">
      ${lines.map(line => `<div class="cell-sub">${line}</div>`).join("")}
    </div>
  `;
}

function renderRows(list) {
  if (!list.length) {
    return `<tr><td colspan="6" class="empty">条件に合う車両がありません。</td></tr>`;
  }

  return list.map(v => `
    <tr>
      <td>${safeText(v.id)}</td>
      <td>${fmtDate(v.purchaseDate)}</td>
      <td>
        <div class="cell-title">${safeText(v.name)}</div>
        ${renderNameMeta(v)}
      </td>
      <td class="money">${v.currentMonthly ? fmtMoney(v.currentMonthly) : "—"}</td>
      <td class="money">${v.saleAmount ? fmtMoney(v.saleAmount) : "—"}</td>
      <td><span class="tag ${statusClass(v.status)}">${safeText(v.status)}</span></td>
    </tr>
  `).join("");
}

function renderMobileRows(list) {
  if (!list.length) {
    return `<div class="empty">条件に合う車両がありません。</div>`;
  }

  return list.map(v => `
    <article class="mobile-vehicle">
      <div class="mobile-vehicle-head">
        <div>
          <div class="mobile-vehicle-title">${safeText(v.name)}</div>
          <div class="cell-sub">ID: ${safeText(v.id)} / 購入日: ${fmtDate(v.purchaseDate)}</div>
        </div>
        <span class="tag ${statusClass(v.status)}">${safeText(v.status)}</span>
      </div>
      <div class="mobile-vehicle-body">
        <div class="mobile-vehicle-row">
          <span class="mobile-vehicle-label">現行月額</span>
          <span class="money">${v.currentMonthly ? fmtMoney(v.currentMonthly) : "—"}</span>
        </div>
        <div class="mobile-vehicle-row">
          <span class="mobile-vehicle-label">売却額</span>
          <span class="money">${v.saleAmount ? fmtMoney(v.saleAmount) : "—"}</span>
        </div>
        <div class="mobile-vehicle-row">
          <span class="mobile-vehicle-label">区分</span>
          <span>${safeText(categoryLabel(v.category))}</span>
        </div>
      </div>
    </article>
  `).join("");
}

function renderClosedList(list) {
  if (!list.length) {
    return `<div class="empty">売却済・廃車データがありません。</div>`;
  }

  return list.slice(0, 8).map(v => `
    <div class="item">
      <div>
        <div class="name">${safeText(v.name)}</div>
        <div class="sub">${[
          v.saleTo ? safeText(v.saleTo) : null,
          v.insurance ? `保険 ${fmtMoney(v.insurance)}` : null,
          v.recycleOut ? `売上リサイクル ${fmtMoney(v.recycleOut)}` : null
        ].filter(Boolean).join(" / ") || "—"}</div>
      </div>
      <div style="text-align:right">
        <div class="money">${v.saleAmount ? fmtMoney(v.saleAmount) : "—"}</div>
        <div class="sub">利益 ${v.profit ? fmtMoney(v.profit) : "—"}</div>
      </div>
    </div>
  `).join("");
}

function renderMonthlyList(list) {
  const active = list
    .filter(v => v.status === "稼働中" && Number(v.currentMonthly || 0) > 0)
    .sort((a, b) => Number(b.currentMonthly || 0) - Number(a.currentMonthly || 0))
    .slice(0, 8);

  if (!active.length) {
    return `<div class="empty">月額データがありません。</div>`;
  }

  return active.map(v => `
    <div class="item">
      <div>
        <div class="name">${safeText(v.name)}</div>
        <div class="sub">${[
          v.registrationNo ? `登録 ${safeText(v.registrationNo)}` : null,
          v.insurance ? `保険 ${fmtMoney(v.insurance)}` : null,
          v.innerPurchase ? `内仕入 ${fmtMoney(v.innerPurchase)}` : null
        ].filter(Boolean).join(" / ") || "—"}</div>
      </div>
      <div class="money">${fmtMoney(v.currentMonthly)}</div>
    </div>
  `).join("");
}

function render() {
  const filtered = getFilteredVehicles();
  const closed = sortByPurchaseDateDesc(state.vehicles.filter(v => v.status === "売却済" || v.status === "廃車"));

  document.getElementById("summaryCards").innerHTML = renderCards();
  document.getElementById("resultCount").textContent = `${filtered.length}件`;

  const tableRowsEl = document.getElementById("vehicleRows");
  if (tableRowsEl) {
    tableRowsEl.innerHTML = renderRows(filtered);
  }

  const mobileListEl = document.getElementById("vehicleMobileList");
  if (mobileListEl) {
    mobileListEl.innerHTML = renderMobileRows(filtered);
  }

  document.getElementById("closedList").innerHTML = renderClosedList(closed);
  document.getElementById("monthlyList").innerHTML = renderMonthlyList(state.vehicles);

  const metaText = [
    `最終更新: ${safeText(state.meta.refreshedAt || "—")}`,
    `データソース: ${safeText(state.meta.source || "local-json")}`,
    state.meta.sheetLinked ? "スプシ連動: ON" : "スプシ連動: OFF"
  ].join(" / ");
  document.getElementById("metaInfo").textContent = metaText;
  document.getElementById("noticeText").textContent = state.meta.notes || "data/*.json を読み込んでいます。";
  document.getElementById("pageTitle").textContent = state.meta.title || "レンタカー台帳ダッシュボード";
}

function bindEvents() {
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.filters.search = e.target.value || "";
    render();
  });

  document.getElementById("statusFilter").addEventListener("change", (e) => {
    state.filters.status = e.target.value;
    render();
  });

  document.getElementById("categoryFilter").addEventListener("change", (e) => {
    state.filters.category = e.target.value;
    render();
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    state.filters = { search: "", status: "all", category: "all" };
    document.getElementById("searchInput").value = "";
    document.getElementById("statusFilter").value = "all";
    document.getElementById("categoryFilter").value = "all";
    render();
  });
}

function renderFatalError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const el = document.getElementById("vehicleRows");
  if (el) {
    el.innerHTML = `<tr><td colspan="6"><div class="error-box">${safeText(message)}</div></td></tr>`;
  }
  const mobile = document.getElementById("vehicleMobileList");
  if (mobile) {
    mobile.innerHTML = `<div class="error-box">${safeText(message)}</div>`;
  }
  document.getElementById("noticeText").textContent = "ファイル配置を確認してください。index.html と同じ階層に data フォルダが必要です。";
  document.getElementById("metaInfo").textContent = "読み込み失敗";
}

async function boot() {
  bindEvents();
  try {
    const dataset = await loadDataset();
    state.vehicles = dataset.vehicles;
    state.summary = dataset.summary;
    state.meta = dataset.meta;
    render();
  } catch (error) {
    console.error(error);
    renderFatalError(error);
  }
}

window.addEventListener("DOMContentLoaded", boot);
