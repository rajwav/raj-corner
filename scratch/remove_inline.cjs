const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

// Completely strip inlineEditor creation block
app = app.replace(/const inlineEditor = document\.createElement\('div'\);[\s\S]*?document\.body\.appendChild\(inlineEditor\);/g, '');

// Strip openInlineEditor
app = app.replace(/function openInlineEditor\([\s\S]*?\}\n\n/g, `
function openInlineEditor(field, title, rect) {
  // Disabled. All editing is now direct on the canvas.
}
`);

// Strip closeInlineEditor
app = app.replace(/function closeInlineEditor\([\s\S]*?\}\n/g, `
function closeInlineEditor(save) {
  // Disabled.
}
`);

// Strip the old click listener that triggers openInlineEditor
app = app.replace(/previewContent\.addEventListener\('click', \(e\) => \{[\s\S]*?openInlineEditor[\s\S]*?\}\);/g, '');

fs.writeFileSync('capture/app.js', app);
console.log("Removed inline editor logic.");
