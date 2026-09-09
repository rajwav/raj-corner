const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

const targetShow = `function show(id){document.querySelectorAll('.panel').forEach(x=>x.hidden=x.id!==id);if(id==='entries')renderEntryList();if(id==='currently')loadCurrently();if(id==='life-list')loadLife();location.hash=id;}`;
const newShow = `function show(id){
  document.querySelectorAll('.panel').forEach(x=>x.hidden=x.id!==id);
  const header = document.querySelector('header');
  const navTabs = document.querySelector('nav.tabs');
  if (id === 'preview-pane') {
    if (header) header.style.display = 'none';
    if (navTabs) navTabs.style.display = 'none';
    document.body.style.background = 'var(--bg)';
  } else {
    if (header) header.style.display = '';
    if (navTabs) navTabs.style.display = '';
    document.body.style.background = '';
  }
  if(id==='entries')renderEntryList();
  if(id==='currently')loadCurrently();
  if(id==='life-list')loadLife();
  location.hash=id;
}`;

app = app.replace(targetShow, newShow);

fs.writeFileSync('capture/app.js', app);
console.log("Updated show()");
