/**
 * Sidebar Profile — Dynamic user info from /api/me session
 * Populates: #sidebarAvatar, #sidebarName, #sidebarRole
 */
(async function loadSidebarProfile() {
  const isPvtPage = window.location.pathname.includes('pvt-dashboard');
  try {
    const res  = await fetch('/api/me');
    const data = await res.json();
    const avatarEl = document.getElementById('sidebarAvatar');
    const nameEl   = document.getElementById('sidebarName');
    const roleEl   = document.getElementById('sidebarRole');
    if (!avatarEl || !nameEl || !roleEl) return;

    if (data.loggedIn && data.user) {
      const { userName, orgName, role, orgType } = data.user;
      // Cross-route: private org → pvt-dashboard, public org → dashboard
      if (orgType === 'private' && !isPvtPage && window.location.pathname.includes('dashboard')) {
        window.location.href = 'pvt-dashboard.html'; return;
      }
      if (orgType !== 'private' && isPvtPage) {
        window.location.href = 'dashboard.html'; return;
      }
      const initials = userName
        ? userName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
        : 'A';
      avatarEl.textContent = initials;
      nameEl.textContent   = userName  || 'Admin';
      roleEl.textContent   = orgName   || role || 'Finance Controller';
    } else {
      window.location.href = 'login.html';
    }
  } catch (_) {
    window.location.href = 'login.html';
  }
})();
