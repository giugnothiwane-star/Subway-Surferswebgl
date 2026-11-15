// Exporte les modèles procéduraux en fichiers GLB réels (public/assets/models/)
// via un navigateur headless (GLTFExporter de Three.js).
// Prérequis : serveur de dev lancé (npm run dev). Usage : node tools/export-models.mjs [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:5199/dev/export.html';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
const files = await page.evaluate(() => window.exportAll());
let total = 0;
for (const [name, b64] of Object.entries(files)) {
  const buf = Buffer.from(b64, 'base64');
  const path = `public/assets/models/${name}`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  total += buf.length;
  console.log(`${path}\t${(buf.length / 1024).toFixed(1)} Ko`);
}
console.log(`Total : ${(total / 1048576).toFixed(2)} Mo`);
if (errors.length) console.log('Erreurs :\n' + errors.join('\n'));
await browser.close();
