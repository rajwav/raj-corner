const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

// Instead of show('capture'), let's show('preview-pane') in editEntry and newEntry
app = app.replace(/show\('capture'\);/g, `show('preview-pane');`);

// Wait, the editEntry logic does:
// previewBtn.hidden = false; if (!previewPane.hidden) updatePreview();
// Let's just unconditionally call updatePreview() inside editEntry and newEntry.
app = app.replace(/if \(\!previewPane\.hidden\) updatePreview\(\);/g, `updatePreview();`);

fs.writeFileSync('capture/app.js', app);
console.log("Updated editEntry and newEntry to show preview-pane.");
