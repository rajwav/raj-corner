const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

// Remove history stack reset from upload()
app = app.replace(
  /if \(typeof captureSnapshot === 'function'\) captureSnapshot\('Uploaded cover'\);\n  setTimeout\(\(\) => \{\n    historyStack = \[\]; historyIndex = -1;\n    captureSnapshot\('Loaded entry'\);\n    savedStateStr = JSON\.stringify\(historyStack\[0\]\.state\);\n    updateHistoryUI\(\);\n  \}, 50\);/g,
  `if (typeof captureSnapshot === 'function') captureSnapshot('Uploaded cover');`
);

// Remove history stack reset from layoutSelect.onchange
app = app.replace(
  /setTimeout\(\(\) => \{\n    historyStack = \[\]; historyIndex = -1;\n    captureSnapshot\('New entry'\);\n    savedStateStr = JSON\.stringify\(historyStack\[0\]\.state\);\n    updateHistoryUI\(\);\n  \}, 50\);/g,
  ``
);

// Ensure newEntry and editEntry reset history!
app = app.replace(
  /form\.scrollIntoView\(\{behavior:'smooth',block:'start'\}\);\}/,
  `form.scrollIntoView({behavior:'smooth',block:'start'}); setTimeout(() => { historyStack = []; historyIndex = -1; captureSnapshot('New entry'); savedStateStr = JSON.stringify(historyStack[0].state); updateHistoryUI(); }, 50); }`
);

app = app.replace(
  /previewBtn\.hidden = false; updatePreview\(\); \}/,
  `previewBtn.hidden = false; updatePreview(); setTimeout(() => { historyStack = []; historyIndex = -1; captureSnapshot('Loaded entry'); savedStateStr = JSON.stringify(historyStack[0].state); updateHistoryUI(); }, 50); }`
);

fs.writeFileSync('capture/app.js', app);
console.log("Fixed historyStack resetting.");
