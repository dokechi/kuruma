(() => {
  const state = {
    vehicles: [],
    summary: {},
    meta: {},
    search: "",
    status: "all",
    category: "all",
  };

  const fmtMoney = (value) => {
    const num = Number(value || 0);
    return "¥" + new Intl.NumberFormat("ja-JP").format(num);
  };

  const fmtDate = (value) => {
    if (!value) return "—";
    return value;
  };

  const statusClass = (status) => {
    if (status === "稼働中") return "active";
    if (status === "売却済") return "sold";
    if (status === "廃車") return "scrapped";
    return "review";
  };

  const safeText = (value) => (value === null || value === undefined || value === "" ? "—" : String(value));

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`${path} の取得に失敗しました (${res.status})`);
    }
    return res.json();
  }

  function setError(message) {
    const root = document.getElementById("root");
    root.innerHTML = `
      <div class="notice">
        <strong>表示に必要なデータを読み込めませんでした。</strong><br>
        ${message}
      </div>
    `;
  }

  function getFilteredVehicles() {
    const keyword = state.search.trim().toLowerCase();
    return state.vehicles.filter((v) => {
      const statusOk = state.status === "all" || v.status === state.status;
      const categoryOk = state.category === "all" || v.category === state.category;
      const hay = [v.id, v.name, v.chassisNo, v.registrationNo, v.saleTo, v.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const keywordOk = !keyword || hay.includes(keyword);
      return statusOk && categoryOk && keywordOk;
    });
  }

  function renderCards() {
    const s = state.summary;
    const cards = [
      { label: "総台数", value: `${s.totalVehicles || 0}台`, note: "レンタル + 売買" },
      { label: "稼働中", value: `${s.activeCount || 0}台`, note: "現在貸出・保有中" },
      { label: "売却済", value: `${s.soldCount || 0}台`, note: "売買でクローズ済み" },
      { label: "廃車 / 要確認", value: `${(s.scrappedCount || 0) + (s.needsReviewCount || 0)}台`, note: "廃車・未整理含む" },
      { label: "現行月額合計", value: fmtMoney(s.currentMonthlySum), note: "稼働中車両の月額合計" },
      { label: "累計仕入", value: fmtMoney(s.totalPurchase), note: "サンプルJSONベース" },
      { label: "累計売上", value: fmtMoney(s.totalSale), note: "売却額の合計" },
      { label: "累計売却益", value: fmtMoney(s.totalProfit), note: "利益の単純合計" },
    ];
    return cards.map(c => `
      <div class="card">
        <h3>${c.label}</h3>
        <div class="value">${c.value}</div>
        <small>${c.note}</small>
      </div>
    `).join("");
  }

  function renderRows(list) {
    if (!list.length) {
      return `<tr><td colspan="10" class="empty">条件に合う車両がありません。</td></tr>`;
    }
    return list.map(v => `
      <tr>
        <td>${safeText(v.id)}</td>
        <td>${fmtDate(v.purchaseDate)}</td>
        <td>${safeText(v.name)}</td>
        <td>${safeText(v.chassisNo)}</td>
        <td>${safeText(v.registrationNo)}</td>
        <td>${safeText(v.saleTo)}</td>
        <td class="money">${v.currentMonthly ? fmtMoney(v.currentMonthly) : "—"}</td>
        <td class="money">${v.purchaseAmount ? fmtMoney(v.purchaseAmount) : "—"}</td>
        <td class="money">${v.saleAmount ? fmtMoney(v.saleAmount) : "—"}</td>
        <td><span class="tag ${statusClass(v.status)}">${safeText(v.status)}</span></td>
      </tr>
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
          <div class="sub">${safeText(v.saleTo)} / ${safeText(v.chassisNo)}</div>
        </div>
        <div style="text-align:right">
          <div class="money">${v.saleAmount ? fmtMoney(v.saleAmount) : "—"}</div>
          <div class="sub">利益 ${v.profit ? fmtMoney(v.profit) : "—"}</div>
        </div>
      </div>
    `).join("");
  }

  function renderMonthlyList(list) {
    const active = list.filter(v => v.status === "稼働中" && Number(v.currentMonthly || 0) > 0)
      .sort((a, b) => Number(b.currentMonthly || 0) - Number(a.currentMonthly || 0))
      .slice(0, 8);
    if (!active.length) {
      return `<div class="empty">月額データがありません。</div>`;
    }
    return active.map(v => `
      <div class="item">
        <div>
          <div class="name">${safeText(v.name)}</div>
          <div class="sub">${safeText(v.registrationNo)}</div>
        </div>
        <div class="money">${fmtMoney(v.currentMonthly)}</div>
      </div>
    `).join("");
  }

  function render() {
    const filtered = getFilteredVehicles();
    const closed = state.vehicles.filter(v => v.status === "売却済" || v.status === "廃車")
      .sort((a,b) => String(b.purchaseDate).localeCompare(String(a.purchaseDate)));
    document.getElementById("summaryCards").innerHTML = renderCards();
    document.getElementById("resultCount").textContent = `${filtered.length}件`;
    document.getElementById("vehicleRows").innerHTML = renderRows(filtered);
    document.getElementById("closedList").innerHTML = renderClosedList(closed);
    document.getElementById("monthlyList").innerHTML = renderMonthlyList(state.vehicles);
    const metaText = [
      `最終更新: ${safeText(state.meta.refreshedAt)}`,
      `データソース: ${safeText(state.meta.source)}`,
      state.meta.sheetLinked ? "スプシ連動: ON" : "スプシ連動: OFF"
    ].join(" / ");
    document.getElementById("metaInfo").textContent = metaText;
    const noteEl = document.getElementById("noticeText");
    noteEl.textContent = state.meta.notes || "最初の表示確認用にJSONを同梱しています。";
  }

  async function boot() {
    try {
      const [vehicles, summary, meta] = await Promise.all([
        fetchJson("./data/vehicles.json"),
        fetchJson("./data/summary.json"),
        fetchJson("./data/meta.json"),
      ]);
      state.vehicles = Array.isArray(vehicles) ? vehicles : [];
      state.summary = summary || {};
      state.meta = meta || {};
      render();
      document.getElementById("searchInput").addEventListener("input", (e) => {
        state.search = e.target.value || "";
        render();
      });
      document.getElementById("statusFilter").addEventListener("change", (e) => {
        state.status = e.target.value;
        render();
      });
      document.getElementById("categoryFilter").addEventListener("change", (e) => {
        state.category = e.target.value;
        render();
      });
      document.getElementById("resetBtn").addEventListener("click", () => {
        state.search = "";
        state.status = "all";
        state.category = "all";
        document.getElementById("searchInput").value = "";
        document.getElementById("statusFilter").value = "all";
        document.getElementById("categoryFilter").value = "all";
        render();
      });
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
    }
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
