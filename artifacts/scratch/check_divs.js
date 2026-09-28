const fs = require('fs');
const html = fs.readFileSync('src/renderer/index.html', 'utf8');
const lines = html.split('\n');
let depth = 0;
lines.forEach((l, i) => {
  const opens = (l.match(/<div(\s|>)/g) || []).length;
  const closes = (l.match(/<\/div>/g) || []).length;
  depth += opens - closes;
  if (l.includes('class="app"') || l.includes('class="titlebar"') || l.includes('class="menubar"') || l.includes('class="toolbar"') || l.includes('class="workspace"')) {
    console.log((i+1) + ': depth=' + depth + ' | ' + l.trim());
  }
});
console.log('Final depth:', depth);
