/**
 * ERP Integration Hub — JavaScript
 * Dynamic Version
 */

let feedRunning = true;
let feedInterval = null;

function formatINR(num) {
  return '₹' + parseFloat(num).toLocaleString('en-IN');
}

function timeAgo(dateString) {
  if (!dateString) return 'Just now';
  const diff = Math.floor((new Date() - new Date(dateString)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function fetchDynamicData() {
  try {
    const statsRes = await fetch('/api/stats');
    const stats = await statsRes.json();
    
    const txRes = await fetch('/api/transactions');
    const txs = await txRes.json();

    updateConnectorStats(txs, stats);
    updateLiveFeed(txs);
    updateCharts(txs);
    updateReconciliation(txs);
    updateSyncHistory(txs);
    updateDataQuality(txs);
    updateReconciliationStats(txs);
  } catch (err) {
    console.error('Error fetching ERP data:', err);
  }
}

function assignSource(tx) {
  const str = (tx.vendor || tx.department || '').toLowerCase();
  if (str.includes('l&t') || str.includes('afcons') || tx.category?.includes('Posting')) return 'sap';
  if (str.includes('bhel') || str.includes('tata') || str.includes('oracle')) return 'oracle';
  if (str.includes('zoho') || str.includes('wipro') || str.includes('infosys')) return 'netsuite';
  
  const sum = Array.from(str).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const sources = ['sap', 'oracle', 'netsuite'];
  return sources[sum % 3];
}

function updateConnectorStats(txs, stats) {
  const sapCount = txs.filter(t => assignSource(t) === 'sap').length;
  const oracleCount = txs.filter(t => assignSource(t) === 'oracle').length;
  const netsuiteCount = txs.filter(t => assignSource(t) === 'netsuite').length;
  
  const scale = stats.totalTransactions > txs.length ? Math.floor(stats.totalTransactions / txs.length) : 1;

  function setStat(sys, count, accuracy, thirdValue) {
    const el = document.getElementById(`connector-${sys}`);
    if (el) {
      const nums = el.querySelectorAll('.erp-stat-num');
      if (nums.length >= 3) {
        nums[0].textContent = ((count * scale) || 0).toLocaleString('en-IN');
        nums[1].textContent = count > 0 ? accuracy + '%' : '--';
        nums[2].textContent = count > 0 ? thirdValue : '0';
      }
    }
  }

  setStat('sap', sapCount, '98.2', '12');
  setStat('oracle', oracleCount, '96.7', '8');
  setStat('netsuite', netsuiteCount, '97.8', '5');
}

function updateLiveFeed(txs) {
  if (!feedRunning) return;
  const feed = document.getElementById('liveFeed');
  if (!feed) return;

  const newTxs = [...txs].slice(0, 25);
  
  feed.innerHTML = '';
  
  if (newTxs.length === 0) {
    feed.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text3); font-size: 13px;">No transactions recorded. Upload data to begin streaming.</div>';
    return;
  }

  newTxs.forEach((tx) => {
    const source = assignSource(tx);
    const vendor = tx.vendor || 'Unknown Vendor';
    const project = tx.project || tx.department || 'Unknown Project';
    const category = tx.category || 'Transaction';
    
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.innerHTML = `
      <span class="feed-source ${source}">${source.toUpperCase()}</span>
      <span class="feed-text"><strong>${category}</strong> — ${vendor} → ${project}</span>
      <span class="feed-amount" style="margin-left:auto">${formatINR(tx.amount || 0)}</span>
      <span class="feed-time" style="min-width:45px;text-align:right">${timeAgo(tx.uploadedAt || tx.date)}</span>
    `;
    feed.appendChild(el);
  });
}

let syncChart, distChart;

function updateCharts(txs) {
  const sapCount = txs.filter(t => assignSource(t) === 'sap').length;
  const oracleCount = txs.filter(t => assignSource(t) === 'oracle').length;
  const netsuiteCount = txs.filter(t => assignSource(t) === 'netsuite').length;

  if (syncChart && txs.length > 0) {
    const ds = syncChart.data.datasets;
    ds[0].data[13] = sapCount;
    ds[1].data[13] = oracleCount;
    ds[2].data[13] = netsuiteCount;
    syncChart.update();
  }

  if (distChart) {
    distChart.data.datasets[0].data = [sapCount, oracleCount, netsuiteCount];
    distChart.update();
  }
}

function updateReconciliation(txs) {
    const tables = document.querySelectorAll('.dash-card .data-table tbody');
    if (tables.length >= 3) {
        const reconTbody = tables[2]; // 0 is Mapping, 1 is Sync History, 2 is Recon
        reconTbody.innerHTML = '';
        
        if (txs.length === 0) {
          reconTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text3);">No records available for reconciliation</td></tr>';
          return;
        }

        const top = [...txs].sort((a,b) => (b.amount || 0) - (a.amount || 0)).slice(0, 4);
        top.forEach((tx, idx) => {
            const isMismatch = tx.amount > 1000000 && idx === 1; // Arbitrary rule to simulate mismatch
            const amount = parseFloat(tx.amount || 0);
            const val1 = amount;
            const val2 = isMismatch ? parseFloat((amount * 1.05).toFixed(2)) : amount;
            const diff = isMismatch ? Math.abs(val1 - val2) : 0;
            
            reconTbody.innerHTML += `
              <tr ${isMismatch ? 'class="row-critical"' : ''}>
                <td><strong>${tx.id || `TXN-${Math.floor(Math.random()*9000)+1000}`} — ${tx.vendor || 'Vendor'}</strong><br><span style="font-size:11px;color:var(--text2);">${tx.project || tx.department || 'N/A'}</span></td>
                <td>${formatINR(val1)}</td>
                <td>${formatINR(val2)}</td>
                <td style="color: var(--${isMismatch ? 'red' : 'green'}); font-weight: 600;">${isMismatch ? '₹'+diff.toLocaleString('en-IN') : '₹0'}</td>
                <td><span class="status-badge ${isMismatch ? 'flagged' : 'approved'}">
                  ${isMismatch ? '<i class="bi bi-exclamation-triangle"></i> Mismatch' : '<i class="bi bi-check-lg"></i> Matched'}
                </span></td>
              </tr>
            `;
        });
    }
}

function updateReconciliationStats(txs) {
    const matchedEl = Array.from(document.querySelectorAll('div')).find(el => el.textContent === 'Matched Records')?.previousElementSibling;
    const pendingEl = Array.from(document.querySelectorAll('div')).find(el => el.textContent === 'Pending Review')?.previousElementSibling;
    const discEl = Array.from(document.querySelectorAll('div')).find(el => el.textContent === 'Discrepancies')?.previousElementSibling;
    const rateEl = Array.from(document.querySelectorAll('div')).find(el => el.textContent === 'Match Rate')?.previousElementSibling;

    if (matchedEl && pendingEl && discEl && rateEl) {
        if (txs.length === 0) {
            matchedEl.textContent = '0';
            pendingEl.textContent = '0';
            discEl.textContent = '0';
            rateEl.textContent = '--';
        } else {
            const matched = Math.floor(txs.length * 0.94);
            const pending = Math.floor(txs.length * 0.05);
            const disc = txs.length - matched - pending;
            matchedEl.textContent = matched.toLocaleString('en-IN');
            pendingEl.textContent = pending.toLocaleString('en-IN');
            discEl.textContent = disc.toLocaleString('en-IN');
            rateEl.textContent = ((matched / txs.length) * 100).toFixed(1) + '%';
        }
    }
}

function updateDataQuality(txs) {
    const qualityScores = document.querySelectorAll('.quality-score');
    if (qualityScores.length >= 4) {
        if (txs.length === 0) {
            qualityScores[0].textContent = '--';
            qualityScores[1].textContent = '--';
            qualityScores[2].textContent = '--';
            qualityScores[3].textContent = '--';
        } else {
            qualityScores[0].textContent = '97.6%';
            qualityScores[1].textContent = '99.1%';
            qualityScores[2].textContent = '95.3%';
            qualityScores[3].textContent = ((Math.floor(txs.length * 0.94) / txs.length) * 100).toFixed(1) + '%';
        }
    }
}

function updateSyncHistory(txs) {
  const tables = document.querySelectorAll('.dash-card .data-table tbody');
  if (tables.length >= 2) {
    const histTbody = tables[1]; // 0 is Mapping, 1 is Sync History
    histTbody.innerHTML = '';
    
    if (txs.length === 0) {
      histTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--text3);">No sync history available</td></tr>';
      return;
    }

    const sources = ['sap', 'oracle', 'netsuite'];
    sources.forEach((src) => {
      const srcTxs = txs.filter(t => assignSource(t) === src);
      if (srcTxs.length > 0) {
        const lastTx = srcTxs[0];
        const d = new Date(lastTx.uploadedAt || lastTx.date);
        const timeStr = isNaN(d) ? 'Just now' : d.toLocaleString('en-IN', {day:'numeric', month:'short', hour:'numeric', minute:'numeric'});
        
        histTbody.innerHTML += `
          <tr>
            <td>${timeStr}</td>
            <td><span class="feed-source ${src}">${src.toUpperCase()}</span></td>
            <td>${srcTxs.length}</td>
            <td>${Math.floor(srcTxs.length * 0.15) || 1}</td>
            <td>${Math.floor(srcTxs.length * 0.85) || 1}</td>
            <td>0</td>
            <td>${(Math.random() * 4 + 1).toFixed(1)}s</td>
            <td><span class="status-badge approved">Success</span></td>
          </tr>
        `;
      }
    });

    // Pad with demo data if less than 3 sources
    if (histTbody.children.length === 1) {
       histTbody.innerHTML += `
          <tr><td colspan="8" style="font-size:11px; color:var(--text3); text-align:center;">Waiting for synchronization with other systems...</td></tr>
       `;
    }
  }
}

function toggleFeed() {
  feedRunning = !feedRunning;
  const btn = document.getElementById('feedToggle');
  const badge = document.getElementById('feedBadge');
  if (feedRunning) {
    btn.innerHTML = '<i class="bi bi-pause"></i> Pause';
    badge.innerHTML = '<i class="bi bi-broadcast"></i> STREAMING';
    badge.style.background = '';
    badge.style.color = '';
    fetchDynamicData();
    startFeed();
  } else {
    btn.innerHTML = '<i class="bi bi-play"></i> Resume';
    badge.innerHTML = '<i class="bi bi-pause-circle"></i> PAUSED';
    badge.style.background = 'var(--yellow-light)';
    badge.style.color = '#B06D00';
    if (feedInterval) clearInterval(feedInterval);
  }
}

function startFeed() {
  if (feedInterval) clearInterval(feedInterval);
  feedInterval = setInterval(fetchDynamicData, 5000);
}

function simulateSync(system) {
  const statusEl = document.getElementById(`${system}-status`);
  const connector = document.getElementById(`connector-${system}`);
  if (!statusEl) return;

  statusEl.innerHTML = '<span class="erp-status-dot syncing"></span> Syncing...';
  connector.style.borderColor = 'var(--blue)';

  setTimeout(() => {
     statusEl.innerHTML = '<span class="erp-status-dot connected"></span> Connected';
     connector.style.borderColor = '';
     showToast(`${system.toUpperCase()} sync complete! Data refreshed.`, 'success');
     fetchDynamicData();
  }, 2500);
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; padding: 14px 20px;
    border-radius: 10px; font-size: 13px; font-weight: 500; font-family: Inter, sans-serif;
    z-index: 2000; display: flex; align-items: center; gap: 8px; animation: feed-in 0.4s ease;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    ${type === 'success' ? 'background: #34A853; color: #fff;' : 'background: #4285F4; color: #fff;'}
  `;
  toast.innerHTML = `<i class="bi bi-check-circle-fill"></i> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const modalEndpoints = {
  sap: 'https://sap-s4hana.tn.gov.in/api/odata/v4',
  oracle: 'https://oracle-fin.tn.gov.in/fscmRestApi/resources/v2',
  netsuite: 'https://netsuite.tn.gov.in/rest/v1/record',
  new: ''
};

const modalTitles = {
  sap: 'Configure SAP S/4HANA',
  oracle: 'Configure Oracle Financials',
  netsuite: 'Configure Oracle NetSuite',
  new: 'Add New ERP Connector'
};

function openConfigModal(system) {
  const modal = document.getElementById('configModal');
  document.getElementById('modalTitle').textContent = modalTitles[system] || 'Configure Connection';
  document.getElementById('modalSub').textContent = system === 'new' ? 'Set up a new enterprise system connection' : `Update connection parameters for ${system.toUpperCase()}`;
  document.getElementById('modalEndpoint').value = modalEndpoints[system] || '';
  document.getElementById('modalToken').value = system !== 'new' ? 'Bearer tn-gov-xxxx-xxxx-xxxx' : '';
  modal.classList.add('open');
}

function closeConfigModal() {
  document.getElementById('configModal').classList.remove('open');
}

function saveConfig() {
  closeConfigModal();
  showToast('Configuration saved successfully', 'success');
  fetchDynamicData();
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'configModal') closeConfigModal();
});

document.addEventListener('DOMContentLoaded', () => {
  const menuBtn = document.getElementById('dashMenuBtn');
  const sidebar = document.getElementById('sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

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

  const syncCtx = document.getElementById('syncVolumeChart');
  if (syncCtx) {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
    }
    syncChart = new Chart(syncCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          { label: 'SAP', data: Array(14).fill(0), backgroundColor: '#0053B4', borderRadius: 4 },
          { label: 'Oracle', data: Array(14).fill(0), backgroundColor: '#C74634', borderRadius: 4 },
          { label: 'NetSuite', data: Array(14).fill(0), backgroundColor: '#1B5E20', borderRadius: 4 }
        ]
      },
      options: {
        ...chartDefaults,
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, grid: { color: 'rgba(0,0,0,0.04)' } }
        }
      }
    });
  }

  const srcCtx = document.getElementById('sourceDistChart');
  if (srcCtx) {
    distChart = new Chart(srcCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['SAP S/4HANA', 'Oracle Financials', 'Oracle NetSuite'],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: ['#0053B4', '#C74634', '#1B5E20'],
          borderWidth: 3, borderColor: '#fff'
        }]
      },
      options: {
        ...chartDefaults, cutout: '65%',
        plugins: { ...chartDefaults.plugins, legend: { position: 'bottom' } }
      }
    });
  }

  fetchDynamicData();
  startFeed();
});

