/**
 * Theme Toggle Logic
 */
document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  
  if (themeToggleBtn) {
    // Set initial icon based on current theme
    if (document.documentElement.classList.contains('dark-mode')) {
      themeToggleBtn.innerHTML = '<i class="bi bi-sun"></i>';
    } else {
      themeToggleBtn.innerHTML = '<i class="bi bi-moon"></i>';
    }

    themeToggleBtn.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark-mode');
      let theme = 'light';
      if (document.documentElement.classList.contains('dark-mode')) {
        theme = 'dark';
        themeToggleBtn.innerHTML = '<i class="bi bi-sun"></i>';
      } else {
        themeToggleBtn.innerHTML = '<i class="bi bi-moon"></i>';
      }
      localStorage.setItem('theme', theme);
    });
  }
});
