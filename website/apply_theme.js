const fs = require('fs');
const path = require('path');

const websiteDir = 'c:/Users/Subhodhraj/Downloads/valli-finops/website';
const files = fs.readdirSync(websiteDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const filePath = path.join(websiteDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Add head script
  const headScript = `\n  <script>
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark-mode');
    }
  </script>\n</head>`;
  
  if (!content.includes('localStorage.getItem(\'theme\')') && content.includes('</head>')) {
    content = content.replace('</head>', headScript);
    changed = true;
  }

  // 2. Add theme.js at the end of body
  const bodyScript = `\n  <script src="js/theme.js"></script>\n</body>`;
  if (!content.includes('js/theme.js') && content.includes('</body>')) {
    content = content.replace('</body>', bodyScript);
    changed = true;
  }

  // 3. Add button
  if (!content.includes('id="themeToggleBtn"')) {
    // Check if dash-topnav-right exists
    if (content.includes('<div class="dash-topnav-right">')) {
      const dashBtn = `\n          <button id="themeToggleBtn" class="dash-icon-btn" aria-label="Toggle Theme"><i class="bi bi-moon"></i></button>`;
      content = content.replace('<div class="dash-topnav-right">', `<div class="dash-topnav-right">${dashBtn}`);
      changed = true;
    } else if (content.includes('class="nav-links"')) {
      // Landing pages: Add to nav-links before </div>
      // Or simply before nav-menu-btn
      const landingBtn = `\n    <button id="themeToggleBtn" class="nav-menu-btn" aria-label="Toggle Theme" style="display:flex;margin-left:auto;margin-right:16px;background:none;border:none;cursor:pointer;font-size:20px;color:var(--text);"><i class="bi bi-moon"></i></button>\n    <button class="nav-menu-btn" id="menuBtn"`;
      
      if (content.includes('<button class="nav-menu-btn" id="menuBtn"')) {
         content = content.replace('<button class="nav-menu-btn" id="menuBtn"', landingBtn);
         changed = true;
      } else {
         // Some pages might not have menuBtn. Try inserting before </nav>
         const altBtn = `\n    <button id="themeToggleBtn" class="nav-menu-btn" aria-label="Toggle Theme" style="display:flex;margin-left:auto;margin-right:16px;background:none;border:none;cursor:pointer;font-size:20px;color:var(--text);"><i class="bi bi-moon"></i></button>\n  </nav>`;
         content = content.replace('</nav>', altBtn);
         changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});

console.log('Done updating HTML files.');
