(() => {
  const PUBLISHED_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTn-ScUph7IUQmOwlmWVivM6ddF6ArC9Kmno1yOklHnm2X6irt2KfKNFo_uzFGT_jpoiHxUWLczeqDT/pub?gid=699666833&single=true&output=csv";

  const state = {
    vehicles: [],
    summary: {},
    meta: {},
    search: "",
    status: "all",
    category: "all",
  };

  const MONTH_HEADERS = ["10月", "11月", "12月", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月"];

  const fmtMoney = (value) => {
    const num = Number(value || 0);
    return "¥" + new Intl.NumberFormat("ja-JP").format(num);
  };

  const fmtDate = (value) => value || "—";

  const safeText = (value) => (value === null || value === undefined || value === "" ? "—" : String(value));

  const statusClass = (status) => {
    if (status === "稼働中") return "active";
    if (status === "売却済") return "sold";
    if (status === "廃車") return "scrapped";
    return "review";
  };

  const normalizeHeader = (value) =>
    String(value || "")
      .replace(/\r?\n/g, "")
      .replace(/[ 　\t]/g, "")
      .trim();

  const parseMoney = (value) => {
    if (value === null || value === undefined) return 0;
    const raw = String(value).trim();
    if (!raw || raw === "—" || raw === "未記入" || raw === "ナシ" || raw === "不明") return 0;
    const cleaned = raw.replace(/,/g, "").replace(/¥/g, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(cell);
        cell = "";
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') i += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    if (cell !== "" || row.length) {
      row.push(cell);
      rows.push(row);
    }

    return rows;
  }

  function findIndex(headerMap, names) {
    for (const name of names) {
      const hit = headerMap.get(normalizeHeader(name));
      if (hit !== undefined) return hit;
    }
    return -1;
  }

  function getLastMonthlyValue(record) {
    let last = 0;
    for (const key of MONTH_HEADERS) {
      const raw = record[key];
      const num = parseMoney(raw);
      if (num > 0) last = num;
    }
    return last;
  }

  function buildDataset(csvText) {
    const rows = parseCsv(csvText).filter((r) => r.some((c) => String(c || "").trim() !== ""));
    if (!rows.length) throw new Error("CSVが空です");

    const headers = rows[0].map(normalizeHeader);
    const headerMap = new Map(headers.map((h, i) => [h, i]));

    const idx = {
      purchaseDate: findIndex(headerMap, ["購入年月日"]),
      oldId: findIndex(headerMap, ["旧"]),
      newId: findIndex(headerMap, ["新"]),
      name: findIndex(headerMap, ["名前"]),
      chassisNo: findIndex(headerMap, ["車体ナンバー"]),
      registrationNo: findIndex(headerMap, ["登録番号"]),
      saleTo: findIndex(headerMap, ["売却先"]),
      repairMisc: findIndex(headerMap, ["修理雑費"]),
      purchaseAmount: findIndex(headerMap, ["取得"]),
      saleAmount: findIndex(headerMap, ["売却"]),
      profit: findIndex(headerMap, ["売却益"]),
      insurance: findIndex(headerMap, ["保険"]),
    };

    const monthIndexes = Object.fromEntries(
      MONTH_HEADERS.map((m) => [m, findIndex(headerMap, [m])])
    );

    let section = "rental";
    const vehicles = [];
    let seq = 1;

    for (const row of rows.slice(1)) {
      const read = (i) => (i >= 0 ? String(row[i] || "").trim() : "");
      const purchaseDate = read(idx.purchaseDate);
      const oldId = read(idx.oldId);
      const newId = read(idx.newId);
      const name = read(idx.name);
      const chassisNo = read(idx.chassisNo);
      const registrationNo = read(idx.registrationNo);
      const saleTo = read(idx.saleTo);
      const repairMisc = parseMoney(read(idx.repairMisc));
      const purchaseAmount = parseMoney(read(idx.purchaseAmount));
      const saleAmount = parseMoney(read(idx.saleAmount));
      const profit = parseMoney(read(idx.profit));
      const insurance = parseMoney(read(idx.insurance));
      const monthRaw = Object.fromEntries(
        MONTH_HEADERS.map((m) => [m, read(monthIndexes[m])])
      );

      const mergedText = [purchaseDate, oldId, newId, name, chassisNo, registrationNo, saleTo].join(" ");

      if (/レンタル計/.test(mergedText)) {
        section = "trade";
        continue;
      }
      if (/総仕入|車両仕入税込|レンタル税込|税抜/.test(mergedText)) continue;
      if (/この番号以降/.test(mergedText)) continue;
      if (!purchaseDate && !name && !chassisNo && !saleTo && !purchaseAmount && !saleAmount && !profit) continue;

      const currentMonthly = getLastMonthlyValue(monthRaw);
      const monthText = MONTH_HEADERS.map((m) => monthRaw[m]).join(" ");

      let status = "要確認";
      if (/廃車/.test(monthText + " " + mergedText)) {
        status = "廃車";
      } else if (section === "trade" && (saleTo || saleAmount > 0 || profit !== 0)) {
        status = "売却済";
      } else if (section === "rental" && currentMonthly > 0) {
        status = "稼働中";
      } else if (saleTo || saleAmount > 0) {
        status = "売却済";
      }

      vehicles.push({
        id: newId || oldId || String(seq),
        purchaseDate,
        name,
        chassisNo,
        registrationNo,
        saleTo,
        purchaseAmount,
        saleAmount,
        profit,
        insurance,
        repairMisc,
        currentMonthly,
        status,
        category: section === "trade" ? "trade" : "rental",
        note: MONTH_HEADERS.map((m) => `${m}:${monthRaw[m] || "—"}`).join(" / "),
      });
      seq += 1;
    }

    const summary = {
      totalVehicles: vehicles.length,
      activeCount: vehicles.filter((v) => v.status === "稼働中").length,
      soldCount: vehicles.filter((v) => v.status === "売却済").length,
      scrappedCount: vehicles.filter((v) => v.status === "廃車").length,
      needsReviewCount: vehicles.filter((v) => v.status === "要確認").length,
      currentMonthlySum: vehicles.filter((v) => v.status === "稼働中").reduce((s, v) => s + Number(v.currentMonthly || 0), 0),
      totalPurchase: vehicles.reduce((s, v) => s + Number(v.purchaseAmount || 0), 0),
      totalSale: vehicles.reduce((s, v) => s + Number(v.saleAmount || 0), 0),
      totalProfit: vehicles.reduce((s, v) => s + Number(v.profit || 0), 0),
    };

    const meta = {
      refreshedAt: new Date().toLocaleString("ja-JP"),
      source: "Googleスプレッドシート公開CSV",
      sheetLinked: true,
      notes: "公開CSVから毎回読み込んでいます。スプシを更新すると、この画面も再読込で追随します。",
    };

    return { vehicles, summary, meta };
  }

  async function fetchText(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} の取得に失敗しました (${res.status})`);
    return res.text();
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
      { label: "累計仕入", value: fmtMoney(s.totalPurchase), note: "公開タブベース" },
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
      return `<tr><td colspan="8" class="empty">条件に合う車両がありません。</td></tr>`;
    }
    return list.map(v => `
      <tr>
        <td>${safeText(v.id)}</td>
        <td>${fmtDate(v.purchaseDate)}</td>
        <td>
          <div class="cell-title">${safeText(v.name)}</div>
          ${v.repairMisc ? `<div class="cell-sub">修理雑費 ${fmtMoney(v.repairMisc)}</div>` : ''}
        </td>
        <td class="money">${v.currentMonthly ? fmtMoney(v.currentMonthly) : "—"}</td>
        <td class="money">${v.purchaseAmount ? fmtMoney(v.purchaseAmount) : "—"}</td>
        <td class="money">${v.saleAmount ? fmtMoney(v.saleAmount) : "—"}</td>
        <td class="money">${v.insurance ? fmtMoney(v.insurance) : "—"}</td>
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
          <div class="sub">${[safeText(v.saleTo), v.insurance ? `保険 ${fmtMoney(v.insurance)}` : null, v.repairMisc ? `修理 ${fmtMoney(v.repairMisc)}` : null].filter(Boolean).join(" / ") || "—"}</div>
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
          <div class="sub">${[v.insurance ? `保険 ${fmtMoney(v.insurance)}` : null, v.repairMisc ? `修理 ${fmtMoney(v.repairMisc)}` : null].filter(Boolean).join(" / ") || "—"}</div>
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
    noteEl.textContent = state.meta.notes || "公開CSVから読み込んでいます。";
  }

  async function boot() {
    try {
      const csvText = await fetchText(PUBLISHED_CSV_URL);
      const { vehicles, summary, meta } = buildDataset(csvText);

      state.vehicles = vehicles;
      state.summary = summary;
      state.meta = meta;

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
