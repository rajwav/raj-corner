const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

app = app.replace(
  /const navTabs = document\.querySelector\('nav\.tabs'\);/,
  `const navTabs = document.querySelector('nav.tabs');\n  const homeSec = document.getElementById('home');`
);

app = app.replace(
  /if \(navTabs\) navTabs\.style\.display = 'none';/,
  `if (navTabs) navTabs.style.display = 'none';\n    if (homeSec) homeSec.style.display = 'none';`
);

app = app.replace(
  /if \(navTabs\) navTabs\.style\.display = '';/,
  `if (navTabs) navTabs.style.display = '';\n    if (homeSec) homeSec.style.display = '';`
);

fs.writeFileSync('capture/app.js', app);
console.log("Patched show() to hide #home");
