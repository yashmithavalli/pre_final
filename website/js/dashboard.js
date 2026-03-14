/**
 * Dashboard — Live API-Driven Financial Platform
 * ================================================
 * All data fetched from /api/transactions, /api/stats, /api/alerts
 * No hardcoded demo data.
 */

// ── Utility ──────────────────────────────────────────────────
function fmtINR(amount) {
  if (amount >= 10000000) return '₹' + (amount / 10000000).toFixed(2) + ' Cr';
  if (amount >= 100000)   return '₹' + (amount / 100000).toFixed(2) + ' L';
  if (amount >= 1000)     return '₹' + (amount / 1000).toFixed(1) + ' K';
  return '₹' + amount.toFixed(0);
}

function pct(part, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

const CARD_COLORS = [
  '#4285F4','#34A853','#FBBC05','#EA4335','#A142F4',
  '#00BCD4','#FF5722','#8BC34A','#9C27B0','#FF9800'
];

// ── GROUP transactions by a key ───────────────────────────────
function groupBy(txns, key) {
  const map = {};
  txns.forEach(t => {
    const k = (t[key] || 'Unknown').trim();
    if (!map[k]) map[k] = { name: k, total: 0, count: 0, vendors: new Set(), depts: new Set(), months: {} };
    const amt = parseFloat(t.amount) || 0;
    map[k].total += amt;
    map[k].count++;
    if (t.vendor)     map[k].vendors.add(t.vendor);
    if (t.department) map[k].depts.add(t.department);
    // month bucket
    const d = t.date ? new Date(t.date) : new Date(t.uploadedAt);
    if (!isNaN(d)) {
      const mo = d.toLocaleString('en-IN', { month: 'short' });
      map[k].months[mo] = (map[k].months[mo] || 0) + amt;
    }
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

// ── EMPTY STATE ───────────────────────────────────────────────
function emptyState(containerId, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text3);">
      <i class="bi bi-cloud-upload" style="font-size:40px;opacity:0.4;"></i>
      <div style="margin-top:16px;font-size:15px;font-weight:600;color:var(--text2);">${message}</div>
      <div style="margin-top:8px;font-size:13px;">Upload a CSV file with columns: <code>department, vendor, amount, date</code></div>
      <a href="upload.html" class="btn-primary" style="display:inline-block;margin-top:18px;padding:10px 24px;text-decoration:none;">
        <i class="bi bi-cloud-arrow-up"></i> Upload Data
      </a>
    </div>`;
}

// ──────────────────────────────────────────────────────────────
// DASHBOARD PAGE
// ──────────────────────────────────────────────────────────────
async function initDashboard() {
  // Sidebar toggle
  const menuBtn = document.getElementById('dashMenuBtn');
  const sidebar  = document.getElementById('sidebar');
  if (menuBtn && sidebar) menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

  const [statsRes, txnRes, alertRes] = await Promise.all([
    fetch('/api/stats').then(r => r.json()).catch(() => ({})),
    fetch('/api/transactions').then(r => r.json()).catch(() => []),
    fetch('/api/alerts').then(r => r.json()).catch(() => [])
  ]);

  const txns  = Array.isArray(txnRes) ? txnRes : [];
  const stats = statsRes || {};
  const alerts = Array.isArray(alertRes) ? alertRes : [];

  // ── KPI Summary ──
  renderExecSummary(stats, txns);
  renderUnitEconomics(stats);

  // ── Department Domain Cards ──
  renderDomainCards(txns);

  // ── Alerts Panel ──
  renderAlertsPanel(alerts, stats);

  // ── Charts ──
  renderCharts(txns);
}

function renderExecSummary(stats, txns) {
  const el = document.getElementById('execSummary');
  if (!el) return;

  const totalSpend  = stats.totalSpend  || 0;
  const totalTxns   = stats.totalTransactions || 0;
  const deptCount   = stats.departments || 0;
  const vendorCount = stats.vendors     || 0;

  if (totalTxns === 0) {
    el.innerHTML = `
      <div class="exec-card blue" style="grid-column:1/-1;text-align:center;padding:40px;">
        <i class="bi bi-cloud-upload" style="font-size:36px;color:var(--blue);opacity:0.6;"></i>
        <div style="margin-top:12px;font-size:16px;font-weight:700;color:var(--text1);">No Financial Data Yet</div>
        <div style="margin-top:6px;font-size:13px;color:var(--text3);">Upload a CSV file to start tracking your spending.</div>
        <a href="upload.html" class="btn-primary" style="display:inline-block;margin-top:18px;padding:10px 24px;text-decoration:none;">
          <i class="bi bi-cloud-arrow-up"></i> Upload Data
        </a>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="exec-card blue">
      <div class="exec-label">Total Spending</div>
      <div class="exec-value" style="color:var(--blue);">${fmtINR(totalSpend)}</div>
      <div class="exec-sub"><i class="bi bi-currency-rupee"></i> All uploaded transactions</div>
    </div>
    <div class="exec-card red">
      <div class="exec-label">Total Transactions</div>
      <div class="exec-value" style="color:var(--red);">${totalTxns.toLocaleString('en-IN')}</div>
      <div class="exec-sub"><i class="bi bi-receipt"></i> Records in database</div>
    </div>
    <div class="exec-card yellow">
      <div class="exec-label">Departments</div>
      <div class="exec-value">${deptCount}</div>
      <div class="exec-sub"><span class="health-dot healthy"></span> Active departments</div>
    </div>
    <div class="exec-card green">
      <div class="exec-label">Vendors</div>
      <div class="exec-value" style="color:var(--green);">${vendorCount}</div>
      <div class="exec-sub"><i class="bi bi-shop"></i> Unique vendors</div>
    </div>`;
}

function renderUnitEconomics(stats) {
  const el = document.getElementById('unitEconomicsGrid');
  if (!el) return;

  const totalSpend = stats.totalSpend || 0;
  const ctzServed = stats.citizensServed || 0;
  const txnsProc = stats.transactionsProcessed || 0;
  const srvHours = stats.serverHours || 0;

  const costPerCitizen = ctzServed > 0 ? (totalSpend / ctzServed) : 0;
  const costPerTxn = txnsProc > 0 ? (totalSpend / txnsProc) : 0;
  const costPerSrvHr = srvHours > 0 ? (totalSpend / srvHours) : 0;

  el.innerHTML = `
    <div class="exec-card blue">
      <div class="exec-label">Cost per Citizen Served</div>
      <div class="exec-value" style="color:var(--blue);">₹${costPerCitizen.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="exec-card red">
      <div class="exec-label">Cost per Transaction</div>
      <div class="exec-value" style="color:var(--red);">₹${costPerTxn.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="exec-card yellow">
      <div class="exec-label">Cost per Server Hour</div>
      <div class="exec-value" style="color:var(--yellow);">₹${costPerSrvHr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>`;
}

function renderDomainCards(txns) {
  const grid = document.getElementById('domainGrid');
  if (!grid) return;

  if (!txns.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text3);">
      <i class="bi bi-inbox" style="font-size:32px;opacity:0.4;"></i>
      <div style="margin-top:12px;font-size:14px;">Upload data to see business unit spending cards.</div>
    </div>`;
    return;
  }

  const depts = groupBy(txns, 'department');
  const total = depts.reduce((s, d) => s + d.total, 0);

  grid.innerHTML = '';
  depts.forEach((dept, i) => {
    const color = CARD_COLORS[i % CARD_COLORS.length];
    const share = pct(dept.total, total);
    const card  = document.createElement('div');
    card.className = 'domain-card';
    card.innerHTML = `
      <div class="domain-card-top" style="background:${color};">
        <i class="bi bi-building"></i>
      </div>
      <div class="domain-card-body">
        <div class="domain-card-name">${dept.name}</div>
        <div class="domain-card-stats">
          <div class="domain-stat">
            <div class="domain-stat-value">${fmtINR(dept.total)}</div>
            <div class="domain-stat-label">Spent</div>
          </div>
          <div class="domain-stat">
            <div class="domain-stat-value">${dept.count}</div>
            <div class="domain-stat-label">Txns</div>
          </div>
          <div class="domain-stat">
            <div class="domain-stat-value">${dept.vendors.size}</div>
            <div class="domain-stat-label">Vendors</div>
          </div>
        </div>
        <div class="domain-util-bar">
          <div class="domain-util-fill" style="width:${share}%;background:${color};"></div>
        </div>
        <div class="domain-util-text">
          <span>${share}% of total spend</span>
          <span>${fmtINR(dept.total)}</span>
        </div>
      </div>
      <div class="domain-card-action"><span>View Details</span> <i class="bi bi-chevron-right"></i></div>`;
    card.addEventListener('click', () => expandDept(dept, color));
    grid.appendChild(card);
  });
}

function expandDept(dept, color) {
  const panel = document.getElementById('projectPanel');
  if (!panel) return;
  document.querySelectorAll('.domain-card').forEach(c => c.classList.remove('active'));

  // Top vendors for this dept
  const vendorArr = [...dept.vendors].slice(0, 5).join(', ') || '—';

  panel.innerHTML = `
    <div class="project-panel-header">
      <div>
        <div class="project-panel-title"><i class="bi bi-building" style="color:${color};"></i> ${dept.name}</div>
        <div class="project-panel-sub">${dept.count} transactions  ·  ${dept.vendors.size} vendors  ·  Total Assets: ${fmtINR(dept.total)}</div>
      </div>
      <button class="btn-secondary" onclick="document.getElementById('projectPanel').innerHTML='';document.querySelectorAll('.domain-card').forEach(c=>c.classList.remove('active'));">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>
    <div class="project-list">
      <div class="project-row" style="pointer-events:none;">
        <div class="project-row-main">
          <div class="project-row-name">Top Vendors</div>
          <div class="project-row-agency"><i class="bi bi-shop"></i> ${vendorArr}</div>
        </div>
        <div class="project-row-stats">
          <div class="project-row-stat">
            <div class="project-row-stat-value">${fmtINR(dept.total)}</div>
            <div class="project-row-stat-label">Total Spent</div>
          </div>
          <div class="project-row-stat">
            <div class="project-row-stat-value">${dept.count}</div>
            <div class="project-row-stat-label">Transactions</div>
          </div>
          <div class="project-row-stat">
            <div class="project-row-stat-value">${dept.vendors.size}</div>
            <div class="project-row-stat-label">Vendors</div>
          </div>
        </div>
      </div>
    </div>`;
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAlertsPanel(alerts, stats) {
  const el = document.getElementById('alertsPanel');
  if (!el) return;

  if (!alerts.length) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;">
      <i class="bi bi-shield-check" style="font-size:24px;color:var(--green);"></i>
      <div style="margin-top:8px;">No alerts — all clear.</div>
    </div>`;
    return;
  }

  el.innerHTML = alerts.slice(0, 8).map(a => `
    <div class="smart-alert">
      <div class="smart-alert-severity warning"></div>
      <div class="smart-alert-content">
        <div class="smart-alert-title">${a.title || 'Alert'}</div>
        <div class="smart-alert-detail">${a.desc || ''}</div>
      </div>
      <div class="smart-alert-meta">
        <span class="smart-alert-badge" style="background:var(--yellow-light);color:#B06D00;">Warning</span>
      </div>
    </div>`).join('');
}

function renderCharts(txns) {
  if (!window.Chart) return;

  const chartDefaults = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { font: { family: 'Inter', size: 12 }, padding: 14, boxWidth: 10 } },
      tooltip: {
        backgroundColor: '#FFF', titleColor: '#202124', bodyColor: '#5F6368',
        borderColor: '#E5E7EB', borderWidth: 1, padding: 12,
        titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Inter' }
      }
    }
  };

  // ── 1. Dept Distribution Doughnut ──
  const deptCtx = document.getElementById('domainDistChart');
  if (deptCtx && txns.length) {
    const depts = groupBy(txns, 'department').slice(0, 8);
    new Chart(deptCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: depts.map(d => d.name),
        datasets: [{ data: depts.map(d => d.total), backgroundColor: depts.map((_, i) => CARD_COLORS[i % CARD_COLORS.length]), borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }]
      },
      options: { ...chartDefaults, cutout: '65%', plugins: { ...chartDefaults.plugins, legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, padding: 10, boxWidth: 10 } } } }
    });
  }

  // ── 2. Top Vendors Bar Chart ──
  const vendCtx = document.getElementById('topProjectsChart');
  if (vendCtx && txns.length) {
    const vendors = groupBy(txns, 'vendor').slice(0, 8);
    new Chart(vendCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: vendors.map(v => v.name.length > 22 ? v.name.substring(0, 22) + '…' : v.name),
        datasets: [{
          label: 'Total Spend',
          data: vendors.map(v => v.total),
          backgroundColor: vendors.map((_, i) => CARD_COLORS[i % CARD_COLORS.length]),
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        ...chartDefaults,
        indexAxis: 'y',
        plugins: { ...chartDefaults.plugins, legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#9AA0A6', callback: v => fmtINR(v) } },
          y: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 }, color: '#5F6368' } }
        }
      }
    });
  }

  // ── 3. Monthly Spend Trend ──
  const trendCtx = document.getElementById('spendTrendChart');
  if (trendCtx && txns.length) {
    // Aggregate by month
    const monthMap = {};
    txns.forEach(t => {
      const d = t.date ? new Date(t.date) : new Date(t.uploadedAt);
      if (isNaN(d)) return;
      const key = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
      monthMap[key] = (monthMap[key] || 0) + (parseFloat(t.amount) || 0);
    });
    const months = Object.keys(monthMap).sort((a, b) => {
      const parse = s => new Date('1 ' + s);
      return parse(a) - parse(b);
    });
    const ctx = trendCtx.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 260);
    grad.addColorStop(0, 'rgba(66,133,244,0.15)');
    grad.addColorStop(1, 'rgba(66,133,244,0.01)');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{ label: 'Monthly Spend', data: months.map(m => monthMap[m]), borderColor: '#4285F4', backgroundColor: grad, fill: true, borderWidth: 2, tension: 0.4, pointRadius: 3, pointHoverRadius: 5 }]
      },
      options: {
        ...chartDefaults,
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#9AA0A6' } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#9AA0A6', callback: v => fmtINR(v) } }
        }
      }
    });
  }

  // ── Dept Spend Chart (departments.html) ──
  const deptSpendCtx = document.getElementById('deptSpendChart');
  if (deptSpendCtx && txns.length) {
    const depts = groupBy(txns, 'department').slice(0, 8);
    new Chart(deptSpendCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: depts.map(d => d.name.length > 20 ? d.name.substring(0, 20) + '…' : d.name),
        datasets: [{
          label: 'Total Spend',
          data: depts.map(d => d.total),
          backgroundColor: depts.map((_, i) => CARD_COLORS[i % CARD_COLORS.length]),
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        ...chartDefaults,
        plugins: { ...chartDefaults.plugins, legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#5F6368' } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#9AA0A6', callback: v => fmtINR(v) } }
        }
      }
    });
  }

  // ── Vendor Trend Chart (vendors.html) ──
  const vendorTrendCtx = document.getElementById('vendorTrendChart');
  if (vendorTrendCtx && txns.length) {
    const topVendors = groupBy(txns, 'vendor').slice(0, 4);
    const monthSet = new Set();
    txns.forEach(t => {
      const d = t.date ? new Date(t.date) : new Date(t.uploadedAt);
      if (!isNaN(d)) monthSet.add(d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }));
    });
    const months = [...monthSet].sort((a, b) => new Date('1 ' + a) - new Date('1 ' + b)).slice(-6);
    const colors = ['#FF9900','#00A4EF','#4285F4','#34A853'];
    const datasets = topVendors.map((v, i) => {
      const vTxns = txns.filter(t => (t.vendor || '').trim() === v.name);
      return {
        label: v.name.length > 18 ? v.name.substring(0, 18) + '…' : v.name,
        data: months.map(m => {
          return vTxns.reduce((s, t) => {
            const d = t.date ? new Date(t.date) : new Date(t.uploadedAt);
            if (isNaN(d)) return s;
            const key = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
            return key === m ? s + (parseFloat(t.amount) || 0) : s;
          }, 0);
        }),
        borderColor: colors[i] || CARD_COLORS[i],
        borderWidth: 2, tension: 0.4, pointRadius: 3
      };
    });
    new Chart(vendorTrendCtx.getContext('2d'), {
      type: 'line',
      data: { labels: months, datasets },
      options: {
        ...chartDefaults,
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#9AA0A6' } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#9AA0A6', callback: v => fmtINR(v) } }
        }
      }
    });
  }
}

// ──────────────────────────────────────────────────────────────
// DEPARTMENTS PAGE
// ──────────────────────────────────────────────────────────────
async function initDepartments() {
  const txns = await fetch('/api/transactions').then(r => r.json()).catch(() => []);

  const kpiGrid  = document.getElementById('deptKpiGrid');
  const tbody    = document.getElementById('deptTableBody');

  if (!txns.length) {
    if (kpiGrid) emptyState('deptKpiGrid', 'No department data yet.');
    if (tbody)   tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text3);">Upload transaction data to see department details.</td></tr>`;
    return;
  }

  const depts = groupBy(txns, 'department');
  const total = depts.reduce((s, d) => s + d.total, 0);

  if (kpiGrid) {
    kpiGrid.innerHTML = depts.slice(0, 8).map((dept, i) => {
      const color = CARD_COLORS[i % CARD_COLORS.length];
      const share = pct(dept.total, total);
      return `
        <div class="kpi-card">
          <div class="kpi-header">
            <div class="kpi-icon" style="background:${color}22;color:${color};"><i class="bi bi-building"></i></div>
            <div class="kpi-change up"><i class="bi bi-arrow-up-short"></i> ${share}%</div>
          </div>
          <div class="kpi-value">${fmtINR(dept.total)}</div>
          <div class="kpi-label">${dept.name}</div>
          <div style="margin-top:10px;">
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width:${share}%;background:${color};"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--text3);">
              <span>${dept.count} transactions</span><span>${dept.vendors.size} vendors</span>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  if (tbody) {
    tbody.innerHTML = depts.map(dept => `
      <tr>
        <td><strong>${dept.name}</strong></td>
        <td>${fmtINR(dept.total)}</td>
        <td>${dept.count}</td>
        <td>${dept.vendors.size}</td>
        <td>${[...dept.vendors].slice(0, 3).join(', ') || '—'}</td>
      </tr>`).join('');
  }
}

// ──────────────────────────────────────────────────────────────
// VENDORS PAGE
// ──────────────────────────────────────────────────────────────
async function initVendors() {
  const txns = await fetch('/api/transactions').then(r => r.json()).catch(() => []);

  const kpiGrid = document.getElementById('vendorKpiGrid');
  const tbody   = document.getElementById('vendorTableBody');

  if (!txns.length) {
    if (kpiGrid) emptyState('vendorKpiGrid', 'No vendor data yet.');
    if (tbody)   tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text3);">Upload transaction data to see vendor details.</td></tr>`;
    return;
  }

  const vendors = groupBy(txns, 'vendor');
  const total   = vendors.reduce((s, v) => s + v.total, 0);

  if (kpiGrid) {
    kpiGrid.innerHTML = vendors.slice(0, 4).map((v, i) => {
      const color = ['#FF9900','#00A4EF','#4285F4','#34A853'][i] || CARD_COLORS[i];
      return `
        <div class="kpi-card">
          <div class="kpi-header">
            <div class="kpi-icon" style="background:${color}22;color:${color};"><i class="bi bi-shop"></i></div>
            <div class="kpi-change up"><i class="bi bi-arrow-up-short"></i> ${pct(v.total, total)}%</div>
          </div>
          <div class="kpi-value">${fmtINR(v.total)}</div>
          <div class="kpi-label">${v.name}</div>
        </div>`;
    }).join('');
  }

  if (tbody) {
    tbody.innerHTML = vendors.map(v => {
      const share = pct(v.total, total);
      return `
        <tr>
          <td><strong>${v.name}</strong></td>
          <td>${fmtINR(v.total)}</td>
          <td>${v.count}</td>
          <td>${[...v.depts].slice(0, 2).join(', ') || '—'}</td>
          <td><span class="status-badge active">↑ ${share}%</span></td>
        </tr>`;
    }).join('');
  }
}

// ──────────────────────────────────────────────────────────────
// EXPORT (reports.html / dashboard header button)
// ──────────────────────────────────────────────────────────────
async function exportDashboard() {
  const txns = await fetch('/api/transactions').then(r => r.json()).catch(() => []);
  if (!txns.length) { alert('No data to export. Please upload a CSV first.'); return; }
  const rows = [['Department','Vendor','Amount','Date','Source']];
  txns.forEach(t => rows.push([t.department || '', t.vendor || '', t.amount || '', t.date || '', t.source || '']));
  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'finops_transactions.csv' });
  a.click();
}

async function exportReport(type) {
  const txns = await fetch('/api/transactions').then(r => r.json()).catch(() => []);
  if (!txns.length) { alert('No data to export.'); return; }
  let rows;
  if (type === 'department') {
    rows = [['Department','Total Spend','Transactions','Vendors']];
    groupBy(txns, 'department').forEach(d => rows.push([d.name, d.total, d.count, d.vendors.size]));
  } else if (type === 'vendor') {
    rows = [['Vendor','Total Spend','Transactions','Departments']];
    groupBy(txns, 'vendor').forEach(v => rows.push([v.name, v.total, v.count, v.depts.size]));
  } else {
    rows = [['Department','Vendor','Amount','Date']];
    txns.forEach(t => rows.push([t.department || '', t.vendor || '', t.amount || '', t.date || '']));
  }
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a   = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `finops_${type}_report.csv` });
  a.click();
}

// ──────────────────────────────────────────────────────────────
// BOOT — detect which page we're on and initialise accordingly
// ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Sidebar mobile toggle (universal)
  const menuBtn = document.getElementById('dashMenuBtn');
  const sidebar  = document.getElementById('sidebar');
  if (menuBtn && sidebar) menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

  // Page detection
  if (document.getElementById('execSummary'))  initDashboard();
  if (document.getElementById('deptKpiGrid'))  initDepartments();
  if (document.getElementById('vendorKpiGrid')) initVendors();

  // Also render charts if page has chart canvases but no dedicated grid
  // (e.g. departments.html and vendors.html also call charts via shared dashboard.js)
  if (document.getElementById('deptSpendChart') || document.getElementById('vendorTrendChart')) {
    fetch('/api/transactions').then(r => r.json()).then(txns => renderCharts(txns || [])).catch(() => {});
  }
});
