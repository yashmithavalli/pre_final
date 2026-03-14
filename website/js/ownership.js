/**
 * Spend Ownership Graph — Dynamic Data Integration
 */
(function () {
  'use strict';

  let traceData = [];

  function fmtINR(amount) {
    if (amount >= 10000000) return '₹' + (amount / 10000000).toFixed(2) + ' Cr';
    if (amount >= 100000)   return '₹' + (amount / 100000).toFixed(2) + ' L';
    if (amount >= 1000)     return '₹' + (amount / 1000).toFixed(1) + ' K';
    return '₹' + Math.round(amount);
  }

  async function initOwnership() {
    const txns = await fetch('/api/transactions').then(r => r.json()).catch(() => []);
    const grid = document.getElementById('traceGrid');
    
    if (!grid) return;
    
    if (!txns.length) {
      grid.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text3);">
        <i class="bi bi-diagram-3" style="font-size:40px;opacity:0.4;"></i>
        <div style="margin-top:16px;font-size:15px;font-weight:600;color:var(--text2);">No ownership data available</div>
        <div style="margin-top:8px;font-size:13px;">Upload transactions to generate ownership traces.</div>
      </div>`;
      return;
    }

    // Group by Project -> Vendor -> Department (since projects are the main trace)
    const chainsMap = {};
    txns.forEach((t, i) => {
      if (!t.project && !t.vendor) return; // Skip if no trace possible
      
      const key = `${t.project || 'General'}-${t.vendor || 'Unknown'}-${t.department || 'Unknown'}`;
      if (!chainsMap[key]) {
        chainsMap[key] = {
          id: 'chain-' + i,
          expenseRaw: 0,
          vendor: t.vendor || 'Unknown Vendor',
          project: t.project || 'General Spend',
          dept: t.department || 'Various Departments',
          owner: t.owner || (t.department ? t.department + ' Head' : 'System Admin'),
          txnCount: 0,
          status: t.status || 'Approved'
        };
      }
      chainsMap[key].expenseRaw += parseFloat(t.amount) || 0;
      chainsMap[key].txnCount++;
    });

    const chainsList = Object.values(chainsMap).sort((a,b) => b.expenseRaw - a.expenseRaw);
    
    traceData = chainsList.map(c => ({
      ...c,
      expense: fmtINR(c.expenseRaw),
      filterDept: c.dept.toLowerCase().replace(/[^a-z0-9]/g, ''),
      filterVendor: c.vendor.toLowerCase().replace(/[^a-z0-9]/g, ''),
      filterOwner: c.owner.toLowerCase().replace(/[^a-z0-9]/g, ''),
      keywords: [c.vendor, c.project, c.dept, c.owner].map(s => s.toLowerCase())
    }));

    // Update Dropdowns dynamically
    const filterDept = document.getElementById('filterDept');
    const filterVendor = document.getElementById('filterVendor');
    const filterOwner = document.getElementById('filterOwner');
    
    if (filterDept) {
        const depts = [...new Set(traceData.map(t => t.dept))];
        filterDept.innerHTML = '<option value="all">All Departments</option>' + depts.map(d => `<option value="${d.toLowerCase().replace(/[^a-z0-9]/g, '')}">${d}</option>`).join('');
    }
    if (filterVendor) {
        const vendors = [...new Set(traceData.map(t => t.vendor))];
        filterVendor.innerHTML = '<option value="all">All Vendors</option>' + vendors.map(v => `<option value="${v.toLowerCase().replace(/[^a-z0-9]/g, '')}">${v}</option>`).join('');
    }
    if (filterOwner) {
        const owners = [...new Set(traceData.map(t => t.owner))];
        filterOwner.innerHTML = '<option value="all">All Owners</option>' + owners.map(o => `<option value="${o.toLowerCase().replace(/[^a-z0-9]/g, '')}">${o}</option>`).join('');
    }

    renderGrid(traceData);
    attachEvents();
  }

  function renderGrid(data) {
    const grid = document.getElementById('traceGrid');
    if (!grid) return;
    
    grid.innerHTML = data.map((chain, index) => {
      const {id, expense, vendor, project, dept, owner, txnCount, status} = chain;
      
      return `
      <div class="trace-chain" data-dept="${chain.filterDept}" data-vendor="${chain.filterVendor}" data-owner="${chain.filterOwner}" id="${id}">
          <div class="trace-chain-header">
              <div>
                  <div class="trace-chain-label">Total Expense</div>
                  <div class="trace-chain-amount">${expense}</div>
              </div>
              <span class="trace-chain-id"><i class="bi bi-hash"></i> TRC-${1000 + index}</span>
          </div>
          <div class="trace-nodes">
              <!-- Expense -->
              <div class="trace-node" data-detail="detail-${id}-expense">
                  <div class="trace-node-icon expense"><i class="bi bi-currency-rupee"></i></div>
                  <div class="trace-node-content">
                      <div class="trace-node-label">Expense</div>
                      <div class="trace-node-value">${expense}</div>
                  </div>
                  <i class="bi bi-chevron-right trace-node-arrow"></i>
              </div>
              <div class="trace-node-detail" id="detail-${id}-expense">
                  <div class="trace-detail-grid">
                      <div class="trace-detail-item">
                          <div class="trace-detail-item-label">Transactions</div>
                          <div class="trace-detail-item-value">${txnCount}</div>
                      </div>
                      <div class="trace-detail-item">
                          <div class="trace-detail-item-label">Status</div>
                          <div class="trace-detail-item-value green">${status}</div>
                      </div>
                  </div>
              </div>

              <div class="trace-connector"><span class="trace-connector-icon"><i class="bi bi-arrow-down-short"></i></span></div>

              <!-- Vendor -->
              <div class="trace-node" data-detail="detail-${id}-vendor">
                  <div class="trace-node-icon vendor"><i class="bi bi-shop"></i></div>
                  <div class="trace-node-content">
                      <div class="trace-node-label">Vendor</div>
                      <div class="trace-node-value">${vendor}</div>
                  </div>
                  <i class="bi bi-chevron-right trace-node-arrow"></i>
              </div>
              <div class="trace-node-detail" id="detail-${id}-vendor">
                  <div class="trace-detail-grid">
                      <div class="trace-detail-item">
                          <div class="trace-detail-item-label">Vendor Status</div>
                          <div class="trace-detail-item-value green">Active</div>
                      </div>
                  </div>
              </div>

              <div class="trace-connector"><span class="trace-connector-icon"><i class="bi bi-arrow-down-short"></i></span></div>

              <!-- Project -->
              <div class="trace-node" data-detail="detail-${id}-project">
                  <div class="trace-node-icon project"><i class="bi bi-folder2-open"></i></div>
                  <div class="trace-node-content">
                      <div class="trace-node-label">Project</div>
                      <div class="trace-node-value">${project}</div>
                  </div>
                  <i class="bi bi-chevron-right trace-node-arrow"></i>
              </div>
              <div class="trace-node-detail" id="detail-${id}-project">
                  <div class="trace-detail-grid">
                      <div class="trace-detail-item">
                          <div class="trace-detail-item-label">Project Tracking</div>
                          <div class="trace-detail-item-value">Linked</div>
                      </div>
                  </div>
              </div>

              <div class="trace-connector"><span class="trace-connector-icon"><i class="bi bi-arrow-down-short"></i></span></div>

              <!-- Department -->
              <div class="trace-node" data-detail="detail-${id}-dept">
                  <div class="trace-node-icon dept"><i class="bi bi-building"></i></div>
                  <div class="trace-node-content">
                      <div class="trace-node-label">Department</div>
                      <div class="trace-node-value">${dept}</div>
                  </div>
                  <i class="bi bi-chevron-right trace-node-arrow"></i>
              </div>
              <div class="trace-node-detail" id="detail-${id}-dept">
                  <div class="trace-detail-grid">
                      <div class="trace-detail-item">
                          <div class="trace-detail-item-label">Dept Status</div>
                          <div class="trace-detail-item-value">Active</div>
                      </div>
                  </div>
              </div>

              <div class="trace-connector"><span class="trace-connector-icon"><i class="bi bi-arrow-down-short"></i></span></div>

              <!-- Owner -->
              <div class="trace-node" data-detail="detail-${id}-owner">
                  <div class="trace-node-icon owner"><i class="bi bi-person-badge"></i></div>
                  <div class="trace-node-content">
                      <div class="trace-node-label">Business Owner</div>
                      <div class="trace-node-value">${owner}</div>
                  </div>
                  <i class="bi bi-chevron-right trace-node-arrow"></i>
              </div>
              <div class="trace-node-detail" id="detail-${id}-owner">
                  <div class="trace-detail-grid">
                      <div class="trace-detail-item">
                          <div class="trace-detail-item-label">Owner Verification</div>
                          <div class="trace-detail-item-value green">Verified</div>
                      </div>
                  </div>
              </div>
          </div>
      </div>`;
    }).join('');
  }

  function attachEvents() {
    // ── Node click to expand/collapse detail ──────────────────
    document.querySelectorAll('.trace-node[data-detail]').forEach(node => {
      node.addEventListener('click', function () {
        const detailId = this.getAttribute('data-detail');
        const detailEl = document.getElementById(detailId);
        if (!detailEl) return;

        const isOpen = detailEl.classList.contains('open');

        // Close all details in the same chain
        const chain = this.closest('.trace-chain');
        chain.querySelectorAll('.trace-node-detail.open').forEach(d => d.classList.remove('open'));
        chain.querySelectorAll('.trace-node.active').forEach(n => n.classList.remove('active'));

        // Toggle current
        if (!isOpen) {
          detailEl.classList.add('open');
          this.classList.add('active');
        }
      });
    });
  }

  function applyFilters() {
    const filterDept = document.getElementById('filterDept');
    const filterVendor = document.getElementById('filterVendor');
    const filterOwner = document.getElementById('filterOwner');
    
    const deptVal = filterDept ? filterDept.value : 'all';
    const vendorVal = filterVendor ? filterVendor.value : 'all';
    const ownerVal = filterOwner ? filterOwner.value : 'all';

    document.querySelectorAll('.trace-chain').forEach(chain => {
      const dept = chain.getAttribute('data-dept');
      const vendor = chain.getAttribute('data-vendor');
      const owner = chain.getAttribute('data-owner');

      const deptMatch = deptVal === 'all' || dept === deptVal;
      const vendorMatch = vendorVal === 'all' || vendor === vendorVal;
      const ownerMatch = ownerVal === 'all' || owner === ownerVal;

      chain.style.display = (deptMatch && vendorMatch && ownerMatch) ? '' : 'none';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initOwnership();
    
    const filterDept = document.getElementById('filterDept');
    const filterVendor = document.getElementById('filterVendor');
    const filterOwner = document.getElementById('filterOwner');
    
    if (filterDept) filterDept.addEventListener('change', applyFilters);
    if (filterVendor) filterVendor.addEventListener('change', applyFilters);
    if (filterOwner) filterOwner.addEventListener('change', applyFilters);

    const searchInput = document.getElementById('traceSearch');
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => performSearch(this.value.trim()), 250);
      });
    }
  });

  // Reset button attached to window so inline onclick can use it
  window.resetFilters = function () {
    const filterDept = document.getElementById('filterDept');
    const filterVendor = document.getElementById('filterVendor');
    const filterOwner = document.getElementById('filterOwner');
    
    if (filterDept) filterDept.value = 'all';
    if (filterVendor) filterVendor.value = 'all';
    if (filterOwner) filterOwner.value = 'all';
    document.querySelectorAll('.trace-chain').forEach(c => c.style.display = '');

    // Clear search
    const searchInput = document.getElementById('traceSearch');
    const searchResult = document.getElementById('searchResult');
    if (searchInput) searchInput.value = '';
    if (searchResult) {
      searchResult.classList.remove('show');
      searchResult.innerHTML = '';
    }

    // Close all open details
    document.querySelectorAll('.trace-node-detail.open').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.trace-node.active').forEach(n => n.classList.remove('active'));
  };

  function performSearch(query) {
    const searchResult = document.getElementById('searchResult');
    if (!searchResult) return;
    
    if (!query || query.length < 2) {
      searchResult.classList.remove('show');
      searchResult.innerHTML = '';
      return;
    }

    const q = query.toLowerCase();
    const matches = traceData.filter(d =>
      d.keywords.some(k => k.includes(q)) ||
      d.vendor.toLowerCase().includes(q) ||
      d.project.toLowerCase().includes(q) ||
      d.dept.toLowerCase().includes(q) ||
      d.owner.toLowerCase().includes(q)
    );

    if (matches.length === 0) {
      searchResult.innerHTML = `
        <div class="trace-path-flow" style="justify-content: center; color: var(--text2); font-size: 13px;">
          <i class="bi bi-info-circle" style="margin-right: 6px;"></i> No matching expense chain found for "${query}"
        </div>`;
      searchResult.classList.add('show');
      return;
    }

    let html = '';
    matches.forEach(m => {
      html += `
        <div class="trace-path-flow" style="margin-bottom: 8px; cursor: pointer;" onclick="document.getElementById('${m.id}').scrollIntoView({behavior:'smooth',block:'center'})">
          <span class="trace-path-chip expense"><i class="bi bi-currency-rupee"></i> ${m.expense}</span>
          <i class="bi bi-arrow-right trace-path-arrow"></i>
          <span class="trace-path-chip vendor"><i class="bi bi-shop"></i> ${m.vendor}</span>
          <i class="bi bi-arrow-right trace-path-arrow"></i>
          <span class="trace-path-chip project"><i class="bi bi-folder2-open"></i> ${m.project}</span>
          <i class="bi bi-arrow-right trace-path-arrow"></i>
          <span class="trace-path-chip dept"><i class="bi bi-building"></i> ${m.dept}</span>
          <i class="bi bi-arrow-right trace-path-arrow"></i>
          <span class="trace-path-chip owner"><i class="bi bi-person-badge"></i> ${m.owner}</span>
        </div>`;
    });

    searchResult.innerHTML = html;
    searchResult.classList.add('show');
  }

})();
