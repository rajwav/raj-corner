const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

// Inject CSS for empty contenteditable placeholders
const cssPatch = `
const style = document.createElement('style');
style.textContent = \`
  [contenteditable="true"]:empty:before {
    content: attr(data-placeholder);
    color: rgba(30, 37, 30, 0.3);
    pointer-events: none;
    display: block; /* Ensures empty block has height */
  }
  .canvas-block-content {
    min-height: 1.5em;
  }
\`;
document.head.appendChild(style);
`;

if (!app.includes('contenteditable="true"]:empty:before')) {
  app = app.replace('function initCanvasEditor() {', cssPatch + '\nfunction initCanvasEditor() {');
}

// Add placeholder to title
app = app.replace(
  /titleEl\.dataset\.field = 'title';/,
  `titleEl.dataset.field = 'title';\n    titleEl.dataset.placeholder = 'Entry Title';\n    if (titleEl.innerText === 'Untitled') titleEl.innerText = '';`
);

// Add placeholder to description
app = app.replace(
  /descEl\.style\.outline = 'none';/,
  `descEl.style.outline = 'none';\n    descEl.dataset.placeholder = 'Optional brief summary...';`
);

// Add placeholder to story block
app = app.replace(
  /content\.className = 'canvas-block-content';/,
  `content.className = 'canvas-block-content';\n    if (index === 0 && storyBlocks.length === 1 && !block.raw) content.dataset.placeholder = 'Start writing...';`
);

// Fix the "@" bug for new entries
app = app.replace(
  /if \(e\.story && \(e\.story\.toLowerCase\(\)\.includes\('@'\+t\) \|\| e\.story\.toLowerCase\(\)\.includes\('@'\+currentId\)\)\) addTrace\(e\);/,
  `if (e.story && ((t !== 'untitled' && e.story.toLowerCase().includes('@'+t)) || (currentId && e.story.toLowerCase().includes('@'+currentId)))) addTrace(e);`
);

fs.writeFileSync('capture/app.js', app);
console.log("Patched empty states and placeholders");
