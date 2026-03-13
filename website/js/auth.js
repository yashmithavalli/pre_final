/**
 * Unified FinOps Platform — Auth Logic
 * =======================================
 * Login and Registration form handling.
 * Connects to /api/login and /api/register endpoints.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ══════════════════════════════════════════════════════════
  // LOGIN FORM
  // ══════════════════════════════════════════════════════════
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value.trim();

      if (!email || !password) {
        shakeForm(loginForm);
        return;
      }

      const btn = loginForm.querySelector('.btn-auth');
      btn.innerHTML = '<div class="auth-spinner"></div> Signing in...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success) {
          document.getElementById('loginCard').innerHTML = `
            <div class="success-state">
              <div class="success-icon"><i class="bi bi-check-lg"></i></div>
              <div class="success-title">Welcome Back, ${data.user.userName}!</div>
              <div class="success-desc">Redirecting to your dashboard...</div>
            </div>
          `;
          setTimeout(() => {
            const dest = data.user.orgType === 'private' ? 'pvt-dashboard.html' : 'dashboard.html';
            window.location.href = dest;
          }, 1200);
        } else {
          btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Sign In';
          btn.disabled = false;
          shakeForm(loginForm);
          showError(loginForm, data.error || 'Login failed');
        }
      } catch (err) {
        btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Sign In';
        btn.disabled = false;
        shakeForm(loginForm);
        showError(loginForm, 'Connection error — is the server running?');
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // REGISTRATION FORM
  // ══════════════════════════════════════════════════════════
  const regStep1 = document.getElementById('regStep1');
  const regStep2 = document.getElementById('regStep2');
  const btnNext = document.getElementById('btnNextStep');
  const btnBack = document.getElementById('btnBackStep');
  const stepDots = document.querySelectorAll('.step-dot');
  const stepLine = document.querySelector('.step-line');

  let selectedOrgType = null;

  // Org type selection
  document.querySelectorAll('.org-type-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.org-type-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedOrgType = card.dataset.type;
    });
  });

  // Next step
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (!selectedOrgType) {
        document.querySelectorAll('.org-type-card').forEach(c => {
          c.style.borderColor = 'rgba(234,67,53,0.5)';
          setTimeout(() => { c.style.borderColor = ''; }, 1500);
        });
        return;
      }
      regStep1.classList.remove('active');
      regStep2.classList.add('active');
      stepDots[1].classList.add('active');
      if (stepLine) stepLine.classList.add('active');
    });
  }

  // Back step
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      regStep2.classList.remove('active');
      regStep1.classList.add('active');
      stepDots[1].classList.remove('active');
      if (stepLine) stepLine.classList.remove('active');
    });
  }

  // Username auto-preview
  const orgNameInput = document.getElementById('regOrgName');
  const usernamePreview = document.getElementById('usernamePreview');

  if (orgNameInput && usernamePreview) {
    orgNameInput.addEventListener('input', () => {
      const name = orgNameInput.value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      if (name) {
        const suffix = selectedOrgType === 'public' ? '_govt' : '_pub';
        usernamePreview.textContent = name + suffix;
      } else {
        usernamePreview.textContent = 'your_org_name' + (selectedOrgType === 'public' ? '_govt' : '_pub');
      }
    });
  }

  // Registration submit
  const regForm = document.getElementById('registerForm');
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const orgName = document.getElementById('regOrgName').value.trim();
      const userName = document.getElementById('regUserName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value.trim();

      if (!orgName || !userName || !email || !password) {
        shakeForm(regForm);
        return;
      }

      const btn = regForm.querySelector('.btn-auth');
      btn.innerHTML = '<div class="auth-spinner"></div> Creating account...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgName, userName, email, password, orgType: selectedOrgType })
        });
        const data = await res.json();

        if (data.success) {
          document.getElementById('registerCard').innerHTML = `
            <div class="success-state">
              <div class="success-icon"><i class="bi bi-check-lg"></i></div>
              <div class="success-title">Account Created!</div>
              <div class="success-desc">
                Your username is: <strong style="color: var(--blue); font-family: monospace;">${data.username}</strong>
                <br/><br/>You can now <a href="login.html" style="color: var(--blue); font-weight: 600;">sign in</a> to your account.
              </div>
            </div>
          `;
        } else {
          btn.innerHTML = '<i class="bi bi-person-plus"></i> Create Account';
          btn.disabled = false;
          shakeForm(regForm);
          showError(regForm, data.error || 'Registration failed');
        }
      } catch (err) {
        btn.innerHTML = '<i class="bi bi-person-plus"></i> Create Account';
        btn.disabled = false;
        shakeForm(regForm);
        showError(regForm, 'Connection error — is the server running?');
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  function shakeForm(form) {
    form.style.animation = 'none';
    form.offsetHeight;
    form.style.animation = 'shake 0.4s ease';
    setTimeout(() => { form.style.animation = ''; }, 500);
  }

  function showError(formEl, msg) {
    let errEl = formEl.querySelector('.auth-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'auth-error';
      errEl.style.cssText = 'padding:10px 14px;background:var(--red-light);border:1px solid rgba(234,67,53,0.2);border-radius:8px;font-size:13px;color:var(--red);margin-bottom:14px;text-align:center;';
      formEl.insertBefore(errEl, formEl.firstChild);
    }
    errEl.textContent = msg;
    setTimeout(() => { if (errEl.parentNode) errEl.remove(); }, 5000);
  }
});

// Add shake keyframes dynamically
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
  .auth-spinner { width:16px;height:16px;border:2px solid rgba(66,133,244,0.2);border-top-color:var(--blue);border-radius:50%;animation:spin 0.6s linear infinite;display:inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
document.head.appendChild(shakeStyle);
