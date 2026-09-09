const fs = require('fs');
let html = fs.readFileSync('capture/index.html', 'utf8');

html = html.replace(/<input name="title" required placeholder="That evening in Puri">/, '<input name="title" placeholder="That evening in Puri">');

fs.writeFileSync('capture/index.html', html);
console.log("Removed required attribute from title");
