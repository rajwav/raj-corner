const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

// Disable old renderBlockEditor safely
app = app.replace(
  /function renderBlockEditor\(\) \{[\s\S]*?inlineBlocks\.appendChild\(wrap\);\n  \}\);\n/g,
  `function renderBlockEditor() {
    // Disabled in Phase 8H.5, we use updatePreview() and initCanvasEditor() instead.
`
);

// We should also look for inlineInput, inlineBlocks usages and null check them or replace them
app = app.replace(/inlineBlocks\.innerHTML = '';/g, '');

fs.writeFileSync('capture/app.js', app);
console.log("Patched renderBlockEditor");
