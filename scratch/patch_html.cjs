const fs = require('fs');
let html = fs.readFileSync('capture/index.html', 'utf8');

// Hide #capture form
html = html.replace(/<section id="capture" class="panel"[^>]*>/, '<section id="capture" class="panel" style="display:none !important;">');

// Make #preview-pane full width and remove borders
html = html.replace(/<section id="preview-pane" class="panel"[^>]*>/, '<section id="preview-pane" class="panel" style="width:100%; border:none; background:var(--bg); padding:0; flex:1;">');

// Change capture-workspace from display:flex; flex-wrap:wrap; gap:20px; to column layout
html = html.replace(/<div id="capture-workspace"[^>]*>/, '<div id="capture-workspace" style="display:flex; flex-direction:column; gap:0; align-items:stretch;">');

// Add the minimal toolbar if it's not already there.
// If my previous script failed on toolbar, let's inject it cleanly.
if (!html.includes('id="editor-toolbar"')) {
  // Let's replace the existing sticky header inside preview-pane.
  html = html.replace(/<div style="position:sticky; top:0; background:var\(--paper\); padding:10px 20px; border-bottom:1px solid var\(--line\); display:flex; justify-content:space-between; align-items:center; z-index:100;">[\s\S]*?<\/div>/, `
    <div id="editor-toolbar" style="position:sticky; top:0; background:var(--bg); padding:12px 20px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; z-index:100; font-family:var(--mono); font-size:11px;">
      <div style="display:flex; gap:16px; align-items:center;">
        <button type="button" id="btn-back-entries" class="secondary" style="border:none; padding:4px;">← Archive</button>
        <span id="dirty-indicator" style="color:var(--text-light);">Saved</span>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button type="button" id="btn-undo" class="secondary" disabled title="Undo (Cmd/Ctrl + Z)">↩</button>
        <button type="button" id="btn-redo" class="secondary" disabled title="Redo (Cmd/Ctrl + Y)">↪</button>
        <button type="button" id="btn-save-canvas" class="primary">Save</button>
      </div>
    </div>
  `);
}

fs.writeFileSync('capture/index.html', html);
console.log("Updated index.html");
