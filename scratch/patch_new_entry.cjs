const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

app = app.replace(
  /function newEntry\(type\)\{/,
  `function newEntry(type){
  show('preview-pane');`
);

fs.writeFileSync('capture/app.js', app);
console.log("Patched newEntry to show preview-pane.");
