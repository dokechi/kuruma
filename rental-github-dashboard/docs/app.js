const fmtYen = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const fmtDateTime = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const statusMap = {
  active: '稼働中',
  sold: '売却済',
  scrapped: '廃車済',
};

const summaryConfig = [
  { key: 'record_count', label: '総レコード数', type: 'count' },
  { key: 'active_count', label: '稼働中', type: 'count' },
  { key: 'sold_count', label: '売却済', type: 'count' },
  { key: 'scrapped_count', label: '廃車済', type: 'count' },
  { key: 'rental_count', label: 'レンタル区分', type: 'count' },
  { key: 'trade_count', label: '売買区分', type: 'count' },
  { key: 'purchase_total', label: '取得合計', type: 'currency' },
  { key: 'profit_total', label: '売却益合計', type: 'currency' },
];

const state = {
  vehicles: [],
  filtered: [],
  summary: {},
  meta: {},
};

function formatCount(value) {
  return `${Number(value || 0).toLocaleString('ja-JP')}件`;
}

function formatCurrency(value) {
  return value == null ? '-' : fmtYen.format(value);
}

function formatSummaryValue(type, value) {
  if (type === 'currency') return formatCurrency(value);
  return formatCount(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadData() {
  const [vehiclesRes, summaryRes, metaRes] = await Promise.all([
    fetch('./data/vehicles.json', { cache: 'no-store' }),
    fetch('./data/summary.json', { cache: 'no-store' }),
    fetch('./data/meta.json', { cache: 'no-store' }),
  ]);

  state.vehicles = await vehiclesRes.json();
  state.summary = await summaryRes.json();
  state.meta = await metaRes.json();
  state.filtered = [...state.vehicles];
}

function renderSummaryCards() {
  const root = document.getElementById('summaryCards');
  root.innerHTML = summaryConfig
    .map(
      ({ key, label, type }) => `
        <article class="summary-card">
          <div class="label">${escapeHtml(label)}</div>
          <div class="value">${escapeHtml(formatSummaryValue(type, state.summary[key]))}</div>
        </article>
      `,
    )
    .join('');
}

function renderMeta() {
  const lastUpdatedEl = document.getElementById('lastUpdated');
  const sheetNameEl = document.getElementById('sheetName');

  if (state.meta.updated_at) {
    lastUpdatedEl.textContent = fmtDateTime.format(new Date(state.meta.updated_at));
  }
  if (state.meta.worksheet_title) {
    sheetNameEl.textContent = state.meta.worksheet_title;
  }
}

function applyFilters() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const category = document.getElementById('categoryFilter').value;

  state.filtered = state.vehicles.filter((item) => {
    const matchQuery = !query || (item.search_text || '').includes(query);
    const matchStatus = status === 'all' || item.status === status;
    const matchCategory = category === 'all' || item.category === category;
    return matchQuery && matchStatus && matchCategory;
  });

  state.filtered.sort((a, b) => {
    const aDate = a.purchase_date || '';
    const bDate = b.purchase_date || '';
    if (aDate === bDate) return String(a.vehicle_id).localeCompare(String(b.vehicle_id), 'ja');
    return bDate.localeCompare(aDate);
  });

  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('vehicleTableBody');
  const tableCount = document.getElementById('tableCount');
  tableCount.textContent = `${state.filtered.length.toLocaleString('ja-JP')}件を表示`;

  tbody.innerHTML = state.filtered
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.purchase_date_raw || item.purchase_date || '-')}</td>
          <td class="mono">${escapeHtml(item.new_no || item.old_no || '-')}</td>
          <td>${escapeHtml(item.name || '-')}</td>
          <td class="mono">${escapeHtml(item.chassis_no || '-')}</td>
          <td>${escapeHtml(item.registration_no || '-')}</td>
          <td>${escapeHtml(item.current_monthly_fee_label || '-')}</td>
          <td>${escapeHtml(item.purchase_amount_label || '-')}</td>
          <td>${escapeHtml(item.sale_amount_label || '-')}</td>
          <td>${escapeHtml(item.profit_amount_label || '-')}</td>
          <td><span class="badge ${escapeHtml(item.status)}">${escapeHtml(item.status_label || statusMap[item.status] || '-')}</span></td>
        </tr>
      `,
    )
    .join('');
}

function bindEvents() {
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('statusFilter').addEventListener('change', applyFilters);
  document.getElementById('categoryFilter').addEventListener('change', applyFilters);
}

async function main() {
  try {
    await loadData();
    renderSummaryCards();
    renderMeta();
    bindEvents();
    applyFilters();
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `
      <main class="page">
        <section class="panel">
          <h1>データの読み込みに失敗しました</h1>
          <p class="muted">docs/data 配下の JSON が生成されているか確認してください。</p>
          <pre class="muted">${escapeHtml(String(error))}</pre>
        </section>
      </main>
    `;
  }
}

main();
