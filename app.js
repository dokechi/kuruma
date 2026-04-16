 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/app.js b/app.js
index a3c2278a2e163f655c6090f3ebe139568cfa27c4..299c3734047bf476b2b843cea2f019d3eea46758 100644
--- a/app.js
+++ b/app.js
@@ -284,97 +284,132 @@ function renderNameMeta(v) {
 
   return `
     <div class="cell-meta">
       ${lines.map(line => `<div class="cell-sub">${line}</div>`).join('')}
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
+	`).join("");
+}
+
+function renderMobileRows(list) {
+  if (!list.length) {
+    return `<div class="empty">条件に合う車両がありません。</div>`;
+  }
+
+  return list.map((v) => `
+    <article class="mobile-vehicle">
+      <div class="mobile-vehicle-head">
+        <div>
+          <div class="mobile-vehicle-title">${safeText(v.name)}</div>
+          <div class="cell-sub">ID: ${safeText(v.id)} / 購入日: ${fmtDate(v.purchaseDate)}</div>
+        </div>
+        <span class="tag ${statusClass(v.status)}">${safeText(v.status)}</span>
+      </div>
+      <div class="mobile-vehicle-body">
+        <div class="mobile-vehicle-row">
+          <span class="mobile-vehicle-label">現行月額</span>
+          <span class="money">${v.currentMonthly ? fmtMoney(v.currentMonthly) : "—"}</span>
+        </div>
+        <div class="mobile-vehicle-row">
+          <span class="mobile-vehicle-label">売却額</span>
+          <span class="money">${v.saleAmount ? fmtMoney(v.saleAmount) : "—"}</span>
+        </div>
+      </div>
+    </article>
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
-    document.getElementById("vehicleRows").innerHTML = renderRows(filtered);
+    const tableRowsEl = document.getElementById("vehicleRows");
+    if (tableRowsEl) {
+      tableRowsEl.innerHTML = renderRows(filtered);
+    }
+    const mobileListEl = document.getElementById("vehicleMobileList");
+    if (mobileListEl) {
+      mobileListEl.innerHTML = renderMobileRows(filtered);
+    }
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
 
 
EOF
)
