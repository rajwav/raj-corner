const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

app = app.replace(
  /if \(btnBackEntries\) btnBackEntries\.onclick = \(\) => \{ closeInlineEditor\(true\); \$\('#preview-pane'\)\.hidden = true; \$\('#entries'\)\.hidden = false; \};/,
  `if (btnBackEntries) btnBackEntries.onclick = () => { show('entries'); };`
);

fs.writeFileSync('capture/app.js', app);
console.log("Updated btnBackEntries");
