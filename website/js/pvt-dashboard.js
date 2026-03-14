/**
 * Private Org Enterprise Dashboard — pvt-dashboard.js
 * ======================================================
 * Handles: Setup panel, project cost overview, team analytics,
 * AI cost optimization, and profit impact chart.
 */

// ── Utility ───────────────────────────────────────────────
function fmtINR(v) {
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(2) + ' Cr';
  if (v >= 100000)   return '₹' + (v / 100000).toFixed(2) + ' L';
  if (v >= 1000)     return '₹' + (v / 1000).toFixed(1) + 'K';
  return '₹' + (v || 0).toFixed(0);
}

const COLORS = ['#4285F4','#34A853','#FBBC05','#EA4335','#A142F4',
                '#00BCD4','#FF5722','#8BC34A','#9C27B0','#FF9800'];

// ── State ─────────────────────────────────────────────────
let pvtProjects    = [];
let pvtTeamMembers = []; // array of {name, email, role}
let currentAccessRole = 'admin'; // current user's RBAC role

const ROLE_LABELS = {
  admin: 'Admin',
  finance_manager: 'Finance Manager',
  project_lead: 'Project Lead',
  viewer: 'Viewer'
};
const ROLE_COLORS = {
  admin: '#EA4335',
  finance_manager: '#4285F4',
  project_lead: '#FBBC05',
  viewer: '#34A853'
};

// ── Setup Panel Logic ──────────────────────────────────────
function renderTags(containerId, items, onRemove) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = items.map((item, i) => `
    <span class="pvt-tag">
      ${item}
      <button onclick="(${onRemove.toString()})(${i})" class="pvt-tag-remove">
        <i class="bi bi-x"></i>
      </button>
    </span>`).join('');
}

function refreshProjectTags() {
  renderTags('pvtProjectTags', pvtProjects, (i) => { pvtProjects.splice(i, 1); refreshProjectTags(); });
}
function refreshTeamTags() {
  const el = document.getElementById('pvtTeamTags');
  if (!el) return;
  el.innerHTML = pvtTeamMembers.map((m, i) => {
    const name = typeof m === 'object' ? m.name : m;
    const email = typeof m === 'object' ? m.email : '';
    const role = typeof m === 'object' ? m.role : 'viewer';
    const roleLabel = ROLE_LABELS[role] || role;
    const roleColor = ROLE_COLORS[role] || '#888';
    return `
      <span class="pvt-tag" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;">
        <span style="font-weight:600;">${name}</span>
        <span style="font-size:10px;color:var(--text3);">${email}</span>
        <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:${roleColor}18;color:${roleColor};text-transform:uppercase;letter-spacing:0.3px;">${roleLabel}</span>
        <button onclick="removeTeamMember(${i})" class="pvt-tag-remove"><i class="bi bi-x"></i></button>
      </span>`;
  }).join('');
}

function removeTeamMember(idx) {
  pvtTeamMembers.splice(idx, 1);
  refreshTeamTags();
}

function showSetupPanel(show) {
  const panel = document.getElementById('pvtSetupPanel');
  if (panel) panel.style.display = show ? 'block' : 'none';
}

async function loadSetup() {
  const res  = await fetch('/api/pvt/setup');
  const data = await res.json();
  pvtProjects    = data.projects    || [];
  // Support both old string[] and new object[] format
  pvtTeamMembers = (data.teamMembers || []).map(m => {
    if (typeof m === 'string') return { name: m, email: '', role: 'viewer' };
    return m;
  });
  return data;
}

async function saveSetup() {
  await fetch('/api/pvt/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projects: pvtProjects, teamMembers: pvtTeamMembers })
  });
}

// ── Dashboard Rendering ────────────────────────────────────
function renderKpis(data) {
  const el = document.getElementById('pvtKpiGrid');
  if (!el) return;

  // Compute actual total savings from optimizations returned by API
  const totalSavings = (data.optimizations || []).reduce((s, o) => s + (o.savings || 0), 0);
  const savingsPct = data.totalSpend > 0
    ? Math.round((totalSavings / data.totalSpend) * 100)
    : 0;
  const savingsLabel = totalSavings > 0 ? `~${savingsPct}% Savings` : 'AI Insights';

  el.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-header">
        <div class="kpi-icon" style="background:var(--blue-light);color:var(--blue);"><i class="bi bi-currency-rupee"></i></div>
        <div class="kpi-change up"><i class="bi bi-arrow-up-short"></i> Total</div>
      </div>
      <div class="kpi-value">${fmtINR(data.totalSpend)}</div>
      <div class="kpi-label">Total Enterprise Spend</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">
        <div class="kpi-icon" style="background:var(--green-light);color:var(--green);"><i class="bi bi-folder2-open"></i></div>
        <div class="kpi-change up" style="background:var(--green-light);color:var(--green);">${data.projects.length} Projects</div>
      </div>
      <div class="kpi-value" style="color:var(--green);">${Object.keys(data.projectCosts).length}</div>
      <div class="kpi-label">Active Projects</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">
        <div class="kpi-icon" style="background:var(--yellow-light);color:#B06D00;"><i class="bi bi-people"></i></div>
        <div class="kpi-change" style="background:var(--yellow-light);color:#B06D00;">${(data.teamNames || data.teamMembers || []).length} Members</div>
      </div>
      <div class="kpi-value" style="color:#B06D00;">${(data.teamNames || data.teamMembers || []).length}</div>
      <div class="kpi-label">Team Members</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">
        <div class="kpi-icon" style="background:var(--red-light);color:var(--red);"><i class="bi bi-robot"></i></div>
        <div class="kpi-change up" style="background:var(--green-light);color:var(--green);">${savingsLabel}</div>
      </div>
      <div class="kpi-value" style="color:var(--green);">${totalSavings > 0 ? fmtINR(totalSavings) : '—'}</div>
      <div class="kpi-label">Possible AI Savings</div>
    </div>`;
}

function renderProjectGrid(projectCosts, optimizations) {
  const el = document.getElementById('pvtProjectGrid');
  if (!el) return;
  const entries = Object.entries(projectCosts).filter(([, v]) => v > 0);
  if (!entries.length) {
    el.innerHTML = `<div class="pvt-empty"><i class="bi bi-folder-x"></i><div>No project data yet.</div><div style="font-size:12px;margin-top:6px;">Upload a CSV with a <code>project</code> or <code>department</code> column, or add projects in Setup.</div></div>`;
    return;
  }
  const total = entries.reduce((s, [, v]) => s + v, 0);
  // Build a savings map from actual optimizations (keyed by vendor amount proportions)
  const totalOptSavings = (optimizations || []).reduce((s, o) => s + (o.savings || 0), 0);
  const totalOptSpend   = (optimizations || []).reduce((s, o) => s + (o.amount || 0), 0);
  const savingsRate     = totalOptSpend > 0 ? totalOptSavings / totalOptSpend : 0;

  el.innerHTML = entries.map(([proj, amt], i) => {
    const color = COLORS[i % COLORS.length];
    const pct = total ? Math.round((amt / total) * 100) : 0;
    const savings = savingsRate > 0 ? Math.round(amt * savingsRate) : null;
    return `
      <div class="pvt-project-card" style="border-top:4px solid ${color};">
        <div class="pvt-project-icon" style="background:${color}22;color:${color};">
          <i class="bi bi-folder2-open"></i>
        </div>
        <div class="pvt-project-name">${proj}</div>
        <div class="pvt-project-amount">${fmtINR(amt)}</div>
        <div style="margin:10px 0 5px;">
          <div class="pvt-progress-track">
            <div class="pvt-progress-fill" style="width:${pct}%;background:${color};"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--text3);">
            <span>${pct}% of total</span>
            ${savings !== null ? `<span style="color:var(--green);">Save ≈ ${fmtINR(savings)}</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderTeamAnalytics(teamUsage, data) {
  // Donut chart
  const ctx = document.getElementById('teamDonutChart');
  if (ctx) {
    const entries = Object.entries(teamUsage).filter(([, v]) => v > 0);
    if (entries.length) {
      new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: entries.map(([m]) => m),
          datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map((_, i) => COLORS[i % COLORS.length]), borderWidth: 2, borderColor: '#fff', hoverOffset: 5 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, padding: 10, boxWidth: 10 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtINR(ctx.raw)}` } }
          }
        }
      });
    }
  }

  // Team table
  const table = document.getElementById('pvtTeamTable');
  if (table) {
    const entries = Object.entries(teamUsage).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      table.innerHTML = `<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px;">Add team members in Setup to see analytics.</div>`;
      return;
    }
    const totalTeam = entries.reduce((s, [, v]) => s + v, 0);
    // Build a role lookup from teamMembers
    const roleLookup = {};
    (pvtTeamMembers || []).forEach(m => {
      if (typeof m === 'object') roleLookup[m.name] = m.role || 'viewer';
    });
    table.innerHTML = `<table class="data-table">
      <thead><tr><th>Member</th><th>Role</th><th>Attributed Spend</th><th>Share</th></tr></thead>
      <tbody>
        ${entries.map(([name, amt], i) => {
          const role = roleLookup[name] || 'viewer';
          const roleLabel = ROLE_LABELS[role] || role;
          const roleColor = ROLE_COLORS[role] || '#888';
          return `
          <tr>
            <td style="display:flex;align-items:center;gap:10px;">
              <div style="width:28px;height:28px;border-radius:50%;background:${COLORS[i % COLORS.length]};display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:700;">${name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}</div>
              ${name}
            </td>
            <td><span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;background:${roleColor}18;color:${roleColor};text-transform:uppercase;letter-spacing:0.3px;">${roleLabel}</span></td>
            <td><strong>${fmtINR(amt)}</strong></td>
            <td><span class="status-badge active">${totalTeam ? Math.round((amt / totalTeam) * 100) : 0}%</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  }
}

function renderAiPanel(optimizations, totalSpend) {
  const el = document.getElementById('pvtAiPanel');
  if (!el) return;
  if (!optimizations || !optimizations.length) {
    el.innerHTML = `<div class="pvt-empty" style="grid-column:1/-1;"><i class="bi bi-robot"></i><div>Upload transaction data to get AI cost optimization hints.</div></div>`;
    return;
  }
  el.innerHTML = optimizations.map((o, i) => `
    <div class="pvt-ai-card">
      <div class="pvt-ai-card-top">
        <div class="pvt-ai-vendor-icon" style="background:${COLORS[i % COLORS.length]}22;color:${COLORS[i % COLORS.length]};">
          <i class="bi bi-lightning-charge-fill"></i>
        </div>
        <div>
          <div class="pvt-ai-vendor-name">${o.vendor}</div>
          <div class="pvt-ai-vendor-spend">${fmtINR(o.amount)}</div>
        </div>
      </div>
      <div class="pvt-ai-tip"><i class="bi bi-lightbulb-fill"></i> ${o.tip}</div>
      <div class="pvt-ai-savings">
        <span>Potential Savings</span>
        <span class="pvt-ai-savings-val">≈ ${fmtINR(o.savings)}</span>
      </div>
    </div>`).join('');
}

function renderProfitChart(monthlyTrend, totalSpend) {
  const ctx = document.getElementById('pvtProfitChart');
  if (!ctx) return;
  const months = Object.keys(monthlyTrend).sort((a, b) => new Date('1 ' + a) - new Date('1 ' + b));
  if (!months.length) return;

  const spendData   = months.map(m => monthlyTrend[m]);
  const savingsData = months.map(m => Math.round(monthlyTrend[m] * 0.12));
  const cgCtx = ctx.getContext('2d');
  const grad = cgCtx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, 'rgba(66,133,244,0.18)');
  grad.addColorStop(1, 'rgba(66,133,244,0.02)');

  new Chart(cgCtx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Monthly Spend',
          data: spendData,
          backgroundColor: 'rgba(66,133,244,0.75)',
          borderRadius: 6, borderSkipped: false, yAxisID: 'y'
        },
        {
          label: 'Projected Savings (12%)',
          data: savingsData,
          type: 'line',
          borderColor: '#34A853',
          backgroundColor: 'rgba(52,168,83,0.08)',
          fill: true,
          borderWidth: 2, tension: 0.4, pointRadius: 4,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { family: 'Inter', size: 12 }, padding: 16, boxWidth: 12 } },
        tooltip: {
          backgroundColor: '#fff', titleColor: '#202124', bodyColor: '#5F6368',
          borderColor: '#E5E7EB', borderWidth: 1, padding: 12,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtINR(ctx.raw)}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#9AA0A6' } },
        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { family: 'Inter', size: 11 }, color: '#9AA0A6', callback: v => fmtINR(v) } }
      }
    }
  });
}

// ── Init ───────────────────────────────────────────────────
async function init() {
  // Sidebar mobile toggle
  const menuBtn = document.getElementById('dashMenuBtn');
  const sidebar  = document.getElementById('sidebar');
  if (menuBtn && sidebar) menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

  // Load setup
  const setup = await loadSetup();
  pvtProjects    = setup.projects    || [];
  pvtTeamMembers = (setup.teamMembers || []).map(m => {
    if (typeof m === 'string') return { name: m, email: '', role: 'viewer' };
    return m;
  });

  const orgRes = await fetch('/api/me');
  const orgData = await orgRes.json();
  if (orgData.loggedIn) {
    const titleEl = document.getElementById('pvtOrgTitle');
    const subEl   = document.getElementById('pvtOrgSub');
    if (titleEl) titleEl.textContent = orgData.user.orgName + ' — Enterprise Dashboard';
    if (subEl)   subEl.textContent = 'Project-level spending · Team analytics · AI optimization · ' + (orgData.user.userName || '');

    // Set RBAC role
    currentAccessRole = orgData.user.accessRole || 'admin';
    applyRBAC(currentAccessRole);
  }

  const hasSetup = pvtProjects.length > 0 || pvtTeamMembers.length > 0;
  if (!hasSetup) {
    document.getElementById('pvtFirstRun').style.display = 'flex';
    document.getElementById('pvtDashboardContent').style.display = 'none';
  } else {
    document.getElementById('pvtFirstRun').style.display = 'none';
    await loadDashboard();
  }

  // Setup panel events
  setupPanelEvents();
}

async function loadDashboard() {
  document.getElementById('pvtDashboardContent').style.display = 'block';
  const res  = await fetch('/api/pvt/analytics');
  const data = await res.json();
  renderKpis(data);
  renderProjectGrid(data.projectCosts, data.optimizations);
  renderTeamAnalytics(data.teamUsage, data);
  renderAiPanel(data.optimizations, data.totalSpend);
  renderProfitChart(data.monthlyTrend, data.totalSpend);
}

function setupPanelEvents() {
  const openSetupBtn    = document.getElementById('openSetupBtn');
  const pvtSetupBtn     = document.getElementById('pvtSetupBtn');
  const setupToggleBtn  = document.getElementById('setupToggleBtn');
  const closePvtSetup   = document.getElementById('closePvtSetup');
  const cancelPvtSetup  = document.getElementById('cancelPvtSetup');
  const savePvtSetup    = document.getElementById('savePvtSetup');
  const addProjectBtn   = document.getElementById('addProjectBtn');
  const addTeamBtn      = document.getElementById('addTeamBtn');
  const projectInput    = document.getElementById('pvtProjectInput');
  const teamInput       = document.getElementById('pvtTeamInput');

  const openSetup = () => {
    refreshProjectTags();
    refreshTeamTags();
    showSetupPanel(true);
    document.getElementById('pvtSetupPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (openSetupBtn)   openSetupBtn.addEventListener('click',   openSetup);
  if (pvtSetupBtn)    pvtSetupBtn.addEventListener('click',    openSetup);
  if (setupToggleBtn) setupToggleBtn.addEventListener('click', openSetup);
  if (closePvtSetup)  closePvtSetup.addEventListener('click',  () => showSetupPanel(false));
  if (cancelPvtSetup) cancelPvtSetup.addEventListener('click', () => showSetupPanel(false));

  if (addProjectBtn && projectInput) {
    const addProject = () => {
      const val = projectInput.value.trim();
      if (val && !pvtProjects.includes(val)) { pvtProjects.push(val); refreshProjectTags(); }
      projectInput.value = '';
      projectInput.focus();
    };
    addProjectBtn.addEventListener('click', addProject);
    projectInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addProject(); } });
  }

  if (addTeamBtn && teamInput) {
    const emailInput = document.getElementById('pvtTeamEmailInput');
    const roleInput  = document.getElementById('pvtTeamRoleInput');
    const addMember = () => {
      const name  = teamInput.value.trim();
      const email = emailInput ? emailInput.value.trim() : '';
      const role  = roleInput  ? roleInput.value : 'viewer';
      if (!name || !email) return;
      // Check if email already exists
      if (pvtTeamMembers.some(m => (typeof m === 'object' ? m.email : '') === email)) {
        alert('A team member with this email already exists.');
        return;
      }
      pvtTeamMembers.push({ name, email, role });
      refreshTeamTags();
      teamInput.value = '';
      if (emailInput) emailInput.value = '';
      if (roleInput) roleInput.value = 'viewer';
      teamInput.focus();
    };
    addTeamBtn.addEventListener('click', addMember);
    teamInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addMember(); } });
    if (emailInput) emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addMember(); } });
  }

  if (savePvtSetup) {
    savePvtSetup.addEventListener('click', async () => {
      savePvtSetup.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';
      savePvtSetup.disabled = true;
      await saveSetup();
      showSetupPanel(false);
      document.getElementById('pvtFirstRun').style.display    = 'none';
      document.getElementById('pvtDashboardContent').style.display = 'block';
      // Destroy old charts before re-rendering
      Chart.instances && Object.values(Chart.instances).forEach(c => c.destroy());
      await loadDashboard();
      savePvtSetup.innerHTML = '<i class="bi bi-check-lg"></i> Save & Reload';
      savePvtSetup.disabled = false;
    });
  }
}

document.addEventListener('DOMContentLoaded', init);

// ── RBAC Enforcement ───────────────────────────────────────
function applyRBAC(role) {
  // Hide setup/edit buttons for non-admins
  const adminOnly = [
    document.getElementById('setupToggleBtn'),
    document.getElementById('pvtSetupBtn'),
    document.getElementById('openSetupBtn')
  ];

  // Viewers cannot upload or edit
  const notViewer = [
    ...document.querySelectorAll('a[href="upload.html"].btn-primary')
  ];

  if (role === 'viewer') {
    adminOnly.forEach(el => { if (el) el.style.display = 'none'; });
    notViewer.forEach(el => { if (el) el.style.display = 'none'; });
  } else if (role === 'project_lead' || role === 'finance_manager') {
    adminOnly.forEach(el => { if (el) el.style.display = 'none'; });
  }
  // admin sees everything

  // Filter sidebar links based on role
  const restrictedLinks = {
    viewer:         ['policies.html', 'erp.html', 'upload.html'],
    project_lead:   ['policies.html'],
    finance_manager: []
  };
  const blocked = restrictedLinks[role] || [];
  document.querySelectorAll('.sidebar-item').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (blocked.some(b => href.includes(b))) {
      link.style.display = 'none';
    }
  });
}
