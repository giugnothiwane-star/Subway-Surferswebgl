// Génère les vignettes des cartes (public/assets/maps/<id>.jpg) en jouant
// quelques secondes avec le pilote automatique, et des captures de contrôle.
// Usage : node tools/screenshots.mjs [url] [dossier-captures]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:5199/';
const shots = process.argv[3] || 'test-results';
const only = process.argv[4] ? process.argv[4].split(',') : null;
mkdirSync('public/assets/maps', { recursive: true });
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__MNNROW, null, { timeout: 90000 });
const maps = await page.evaluate(() => ['metro', 'neon', 'beach', 'snow', 'desert', 'forest']);
for (const id of maps) {
  if (only && !only.includes(id)) continue;
  await page.evaluate((id) => {
    const g = window.__MNNROW.game;
    g.save.selected.version = 'ultimate';
    g.setMap(id);
    g.autopilot = true;
    g.startRun('THUMB' + id.toUpperCase());
    document.getElementById('ui').style.visibility = 'hidden';
  }, id);
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `public/assets/maps/${id}.jpg`, type: 'jpeg', quality: 78 });
  console.log(id, JSON.stringify(await page.evaluate(() => window.__MNNROW.info().sim)));
}
// vignette de l'édition Ultimate : le personnage dans le menu
await page.evaluate(() => { const g = window.__MNNROW.game; g.quitToMenu(); g.setMap('metro'); document.getElementById('ui').style.visibility = 'hidden'; });
await page.waitForTimeout(4000);
await page.screenshot({ path: 'public/assets/maps/ultimate.jpg', type: 'jpeg', quality: 78 });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
