const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'desktop-dist');
const { version } = require('../src-tauri/tauri.conf.json');

fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'desktop-version.js'), `globalThis.MTDesktopVersion = ${JSON.stringify(version)};\n`);
for (const file of ['style.css', 'core.js', 'app.js', 'desktop.js']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<script src="core.js"></script>', '<script src="desktop-version.js"></script>\n  <script src="core.js"></script>');
html = html.replace('<script src="update.js"></script>', '<script src="desktop.js"></script>');
fs.writeFileSync(path.join(output, 'index.html'), html);
