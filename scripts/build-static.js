/**
 * Copies browser assets from public/ to dist/ for Azure Static Web Apps (or any static host).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public');
const dest = path.join(root, 'dist');
const configSrc = path.join(root, 'staticwebapp.config.json');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const f = path.join(from, entry.name);
    const t = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(f, t);
    else fs.copyFileSync(f, t);
  }
}

if (!fs.existsSync(src)) {
  console.error('Missing public/ folder.');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
copyDir(src, dest);

if (fs.existsSync(configSrc)) {
  fs.copyFileSync(configSrc, path.join(dest, 'staticwebapp.config.json'));
}

console.log('Built static site to dist/');
