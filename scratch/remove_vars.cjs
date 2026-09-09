const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

const regexVars = /const inlineInput[\s\S]*?inlineCancel\.onclick[\s\S]*?;/g;
app = app.replace(regexVars, '');

// Also remove the keydown listener for escape
app = app.replace(/document\.addEventListener\('keydown', \(e\) => \{\n  if \(e\.key === 'Escape'\) closeInlineEditor\(true\);\n\}\);/, '');

fs.writeFileSync('capture/app.js', app);
console.log("Removed inline variables.");
