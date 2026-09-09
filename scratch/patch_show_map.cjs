const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

app = app.replace(
  /function show\(id\)\{/,
  `function show(id){
  if (id === 'capture') {
    // Legacy redirect to visual canvas for 'New Entry'
    id = 'preview-pane';
    if (typeof newEntry === 'function' && !$('#entry-form').elements.existingId.value) {
      newEntry('memory'); // Default type if opening directly
    }
  }`
);

fs.writeFileSync('capture/app.js', app);
console.log("Mapped 'capture' to 'preview-pane' in show()");
