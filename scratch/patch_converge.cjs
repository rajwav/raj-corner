const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

// Remove updatePreview from setupForm
app = app.replace(
  /if \(typeof previewPane !== 'undefined' && !previewPane\.hidden\) updatePreview\(\);/,
  ``
);

// Add updatePreview explicitly to the end of newEntry
app = app.replace(
  /form\.scrollIntoView\(\{behavior:'smooth',block:'start'\}\); setTimeout/,
  `form.scrollIntoView({behavior:'smooth',block:'start'}); updatePreview(); setTimeout`
);

fs.writeFileSync('capture/app.js', app);
console.log("Converged rendering pipeline");
