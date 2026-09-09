const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

app = app.replace(
  /const currentText = storyBlocks\.map\(b => b\.raw\)\.join\('\\n\\n'\)\.trim\(\);/,
  `const currentText = storyBlocks ? storyBlocks.map(b => b.raw).join('\\n\\n').trim() : '';`
);

fs.writeFileSync('capture/app.js', app);
console.log("Patched storyBlocks.map safety");
