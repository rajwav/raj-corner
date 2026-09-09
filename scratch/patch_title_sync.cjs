const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

app = app.replace(
  /entryForm\.elements\.title\.value = e\.target\.innerText\.replace\(\/\\n\/g, ' '\)\.trim\(\);/,
  `entryForm.elements.title.value = e.target.innerText.replace(/\\n/g, ' ').trim();\n      if (!entryForm.elements.title.value) entryForm.elements.title.value = 'Untitled';`
);

fs.writeFileSync('capture/app.js', app);
console.log("Patched title sync to avoid silent form validation failure");
