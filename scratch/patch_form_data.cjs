const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

app = app.replace(
  /title:form\.elements\.title\.value\.trim\(\),/,
  `title:form.elements.title.value.trim() || 'Untitled',`
);

fs.writeFileSync('capture/app.js', app);
console.log("Patched formData to always provide a title");
