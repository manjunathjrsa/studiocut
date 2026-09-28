const fs = require('fs');
const appJs = fs.readFileSync('src/renderer/app.js', 'utf8');
const indexHtml = fs.readFileSync('src/renderer/index.html', 'utf8');
const regex = /getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const missing = new Set();
while ((match = regex.exec(appJs)) !== null) {
  const id = match[1];
  if (!indexHtml.includes('id="' + id + '"') && !indexHtml.includes("id='" + id + "'")) {
    missing.add(id);
  }
}
console.log('Missing IDs from app.js in index.html:');
for (const id of missing) {
  console.log(' - ' + id);
}
