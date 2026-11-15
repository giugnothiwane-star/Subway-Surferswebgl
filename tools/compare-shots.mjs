// Captures comparatives (avant / après) : menu, chaque carte en course avec des
// trains en vue, train du studio, hoverboard. Usage :
//   npx vite preview --port 4173 & node tools/compare-shots.mjs <dossier> [largeur] [hauteur]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] || 'test-results/compare';
const W = +(process.argv[3] || 1280);
const H = +(process.argv[4] || 720);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4173/Subway-Surferswebgl/');
await page.waitForFunction(() => window.__MNNROW?.game && window.__MNNROW.info().state === 'menu', null, { timeout: 120000 });
await page.evaluate(() => { const g = window.__MNNROW.game; g.save.settings.quality = 'high'; g.r.setQuality('high'); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/01-menu.png` });
const maps = ['metro', 'neon', 'beach', 'snow', 'desert', 'forest'];
for (const [i, id] of maps.entries()) {
  await page.evaluate((id) => {
    const g = window.__MNNROW.game;
    if (g.state !== 'menu') g.quitToMenu();
    g.setMap(id); g.autopilot = true; g.startRun('SHOW' + id); g.fastForward(60);
    // avance jusqu'à avoir un train bien en vue devant le joueur
    for (let k = 0; k < 120; k++) {
      const s = g.sim.s;
      if (g.sim.entities.some((e) => e.kind === 'train' && e.s > s + 16 && e.s < s + 38 && Math.abs(e.lane - g.sim.lane) === 1)) break;
      g.fastForward(6);
    }
    g.rig.blend = null; // pas de transition menu -> course en cours sur la capture
  }, id);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${String(i + 2).padStart(2, '0')}-${id}.png` });
}
await page.evaluate(() => { const g = window.__MNNROW.game; g.quitToMenu(); g.setMap('metro'); g.enterStudio('train'); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/08-studio-train.png` });
for (const style of ['modern', 'freight']) {
  const ok = await page.evaluate((style) => { const g = window.__MNNROW.game; if (!g.setStudioTrainStyle) return false; g.setStudioTrainStyle(style); return true; }, style);
  if (ok) { await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/0${style === 'modern' ? 9 : '9b'}-studio-${style}.png` }); }
}
await page.evaluate(() => { const g = window.__MNNROW.game; g.exitStudio(); g.setMap('metro'); g.autopilot = true; g.startRun('BOARD'); g.fastForward(80); g.rig.blend = null; g.sim.input('board'); });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${out}/10-hoverboard.png` });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
