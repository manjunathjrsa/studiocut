const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', '..', 'src', 'renderer');
const html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');

// Collect all renderer JS code
const jsFiles = [];
function findJs(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) findJs(full);
    else if (f.endsWith('.js')) jsFiles.push(full);
  }
}
findJs(srcDir);

let allJsCode = '';
jsFiles.forEach(f => {
  allJsCode += fs.readFileSync(f, 'utf8') + '\n';
});

// Check all IDs in index.html
const idRegex = /id=["']([^"']+)["']/g;
let m;
const htmlIds = [];
while ((m = idRegex.exec(html)) !== null) {
  htmlIds.push(m[1]);
}

console.log('Total HTML IDs found:', htmlIds.length);
const missingFromAllJs = htmlIds.filter(id => !allJsCode.includes(id));
console.log('HTML IDs not referenced in ANY renderer JS file:', missingFromAllJs);

// Check menubar items specifically
const menuItems = [];
const menuRegex = /class="menubar__dropdown-item"\s+id=["']([^"']+)["']/g;
while ((m = menuRegex.exec(html)) !== null) {
  menuItems.push(m[1]);
}
console.log('\nMenubar dropdown items:');
for (const item of menuItems) {
  const referenced = allJsCode.includes(item);
  console.log(` - ${item}: ${referenced ? 'WIRED' : '⚠️ UNWIRED'}`);
}
