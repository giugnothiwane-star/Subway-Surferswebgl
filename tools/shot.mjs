// Capture rapide d'une URL (outil de développement).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [url, out, w = 1200, h = 700] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__done, null, { timeout: 60000 }).catch(() => errors.push('timeout'));
await page.screenshot({ path: out });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
