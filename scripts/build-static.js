/**
 * Copies browser assets from public/ to dist/ for Azure Static Web Apps (or any static host).
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public');
const appEntry = path.join(root, 'src', 'main.jsx');
const dest = path.join(root, 'dist');
const configSrc = path.join(root, 'staticwebapp.config.json');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'app.js') continue;
    const f = path.join(from, entry.name);
    const t = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(f, t);
    else fs.copyFileSync(f, t);
  }
}

async function build() {
  if (!fs.existsSync(src)) {
    console.error('Missing public/ folder.');
    process.exit(1);
  }

  if (!fs.existsSync(appEntry)) {
    console.error('Missing React entry at src/main.jsx.');
    process.exit(1);
  }

  fs.mkdirSync(dest, { recursive: true });
  copyDir(src, dest);

  await esbuild.build({
    entryPoints: [appEntry],
    bundle: true,
    format: 'esm',
    outfile: path.join(dest, 'app.js'),
    loader: {
      '.js': 'js',
      '.jsx': 'jsx',
    },
    target: ['es2020'],
  });

  if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, path.join(dest, 'staticwebapp.config.json'));
  }

  console.log('Built static site to dist/');
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
