/**
 * Sidebar Profile — Dynamic user info from /api/me session
 * Populates: #sidebarAvatar, #sidebarName, #sidebarRole
 */
(async function loadSidebarProfile() {
  try {
    const res  = await fetch('/api/me');
    const data = await res.json();
    const avatarEl = document.getElementById('sidebarAvatar');
    const nameEl   = document.getElementById('sidebarName');
    const roleEl   = document.getElementById('sidebarRole');
    if (!avatarEl || !nameEl || !roleEl) return;

    if (data.loggedIn && data.user) {
      const { userName, orgName, role } = data.user;
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
