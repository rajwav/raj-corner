const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

const target = `<div class="block-drag-handle" style="position:absolute; left:-30px; top:4px; cursor:grab; color:var(--text-light); opacity:0; transition:opacity 0.2s; padding:4px;" title="Drag to move">≡</div>`;
const replace = `<div class="block-drag-handle" style="position:absolute; left:-40px; top:4px; display:flex; flex-direction:column; gap:4px; opacity:0; transition:opacity 0.2s;">
        <div style="cursor:grab; color:var(--text-light); padding:4px; line-height:1;" title="Drag to move">≡</div>
        <button type="button" onclick="deleteBlock(\\$\\{index\\})" style="background:transparent; border:none; color:red; cursor:pointer; padding:4px; line-height:1; font-size:12px;" title="Delete Block">×</button>
      </div>`;

app = app.replace(target, replace);
fs.writeFileSync('capture/app.js', app);
console.log("Added delete block button.");
