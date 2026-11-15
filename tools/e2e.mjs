// Tests de bout en bout dans Chromium (Playwright) sur la version compilée,
// servie sous /Subway-Surferswebgl/ comme sur GitHub Pages.
// Usage : npm run build && npx vite preview --port 4173 & node tools/e2e.mjs
// Produit test-results/e2e-report.json et des captures d'écran.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:4173/Subway-Surferswebgl/';
const OUT = process.argv[3] || 'test-results';
mkdirSync(OUT, { recursive: true });
const results = [];
const failedRequests = [];
const pageErrors = [];
const consoleErrors = [];

async function check(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail: detail ?? '' });
    console.log(`✔ ${name}${detail ? ' — ' + detail : ''}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, detail: e.message });
    console.log(`✘ ${name} — ${e.message}`);
  }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' });
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });
page.on('requestfailed', (r) => failedRequests.push(`ÉCHEC ${r.url()}`));
const info = () => page.evaluate(() => window.__MNNROW.info());
const game = (fn, arg) => page.evaluate(fn, arg);
const visible = (id) => page.evaluate((id) => document.getElementById(id).classList.contains('active'), id);
const wait = (ms) => page.waitForTimeout(ms);
async function waitFor(fn, arg, timeout = 15000) {
  await page.waitForFunction(fn, arg, { timeout, polling: 100 });
}

await check('1. Chargement du site (GitHub Pages, chemin de base)', async () => {
  const r = await page.goto(BASE);
  assert(r.ok(), `HTTP ${r.status()}`);
  await waitFor(() => window.__MNNROW && document.getElementById('menu').classList.contains('active'), null, 120000);
  return `HTTP ${r.status()}`;
});

await check('2. Initialisation Three.js / WebGL', async () => {
  const r = await game(() => ({ gl2: window.__MNNROW.game.r.renderer.capabilities.isWebGL2, calls: window.__MNNROW.game.r.info().calls }));
  assert(r.calls > 0, 'aucun draw call');
  return `WebGL${r.gl2 ? '2' : '1'}, ${r.calls} draw calls`;
});

await check('3. Chargement des modèles GLB', async () => {
  const i = await info();
  assert(i.character === 'glb', `personnage chargé depuis : ${i.character}`);
  const status = await game(async (base) => {
    const files = ['characters/mnnrow_runner.glb', 'trains/train_urban.glb', 'coins/coin.glb', 'powerups/hoverboard_neon.glb', 'environment/ramp.glb'];
    const out = [];
    for (const f of files) {
      const r = await fetch(`${base}assets/models/${f}`);
      const b = new Uint8Array(await r.arrayBuffer());
      out.push(`${f}:${r.status}:${String.fromCharCode(...b.slice(0, 4))}`);
    }
    return out;
  }, BASE);
  assert(status.every((s) => s.endsWith(':200:glTF')), status.join(', '));
  return 'personnage GLB + 4 autres GLB vérifiés (signature glTF)';
});

await check('4. Affichage du menu', async () => {
  assert(await visible('menu'), 'menu non affiché');
  const n = await page.locator('#menu button:visible').count();
  assert(n >= 8, `${n} boutons visibles`);
  await page.screenshot({ path: `${OUT}/01-menu.png` });
  return `${n} boutons`;
});

await check('5. Démarrage d\'une partie (bouton JOUER)', async () => {
  // mode Zen pour les tests de commandes : un obstacle ne termine pas la partie
  await game(() => { window.__MNNROW.game.save.selected.mode = 'zen'; });
  await page.click('[data-nav="play"]');
  await waitFor(() => window.__MNNROW.info().state === 'playing');
  assert(await visible('hud'), 'HUD absent');
  await waitFor(() => window.__MNNROW.info().sim.s > 3, null, 15000).catch(() => {});
  const i = await info();
  assert(i.sim.s > 3, `distance ${i.sim.s}`);
  return `s=${i.sim.s.toFixed(1)} m`;
});

await check('6. Déplacement gauche / droite (clavier)', async () => {
  await page.keyboard.press('ArrowLeft');
  await waitFor(() => Math.abs(window.__MNNROW.info().sim.x + 2.5) < 0.05, null, 8000).catch(() => {});
  const a = (await info()).sim;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await waitFor(() => Math.abs(window.__MNNROW.info().sim.x - 2.5) < 0.05, null, 8000).catch(() => {});
  const b = (await info()).sim;
  assert(a.lane === -1 && Math.abs(a.x + 2.5) < 0.05, `gauche : lane ${a.lane} x ${a.x}`);
  assert(b.lane === 1 && Math.abs(b.x - 2.5) < 0.05, `droite : lane ${b.lane} x ${b.x}`);
  await page.keyboard.press('ArrowLeft');
  return 'voies -1 puis +1';
});

await check('7. Saut', async () => {
  await waitFor(() => { const s = window.__MNNROW.info().sim; return s.onGround && !s.rolling; }, null, 8000);
  await page.keyboard.press('Space');
  await waitFor(() => window.__MNNROW.info().sim.y > 0.5, null, 4000).catch(() => {});
  let maxY = (await info()).sim.y;
  for (let k = 0; k < 4; k++) { await wait(60); maxY = Math.max(maxY, (await info()).sim.y); }
  assert(maxY > 0.8, `hauteur max ${maxY}`);
  await wait(700);
  return `hauteur max ${maxY.toFixed(2)} m`;
});

await check('8. Roulade (hauteur de collision réduite)', async () => {
  await waitFor(() => window.__MNNROW.info().sim.onGround, null, 8000);
  await page.keyboard.press('ArrowDown');
  await waitFor(() => window.__MNNROW.game.sim.rollTime > 0, null, 3000).catch(() => {});
  const r = await game(() => ({ rolling: window.__MNNROW.game.sim.rollTime > 0, h: window.__MNNROW.game.sim.height, anim: window.__MNNROW.game.player.state }));
  assert(r.rolling && r.h < 1, JSON.stringify(r));
  return `hauteur ${r.h} m, animation ${r.anim}`;
});

await check('20. Compatibilité tactile (swipes Pointer Events)', async () => {
  await wait(700);
  const before = (await info()).sim.lane;
  const lc0 = await game(() => window.__MNNROW.game.sim.stats.laneChanges);
  await page.evaluate(() => {
    const el = document.getElementById('gesture');
    const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
    ev('pointerdown', 200, 500); ev('pointermove', 230, 502); ev('pointermove', 290, 505); ev('pointerup', 290, 505);
  });
  await waitFor((lc0) => window.__MNNROW.game.sim.stats.laneChanges > lc0, lc0, 5000).catch(() => {});
  const lc1 = await game(() => window.__MNNROW.game.sim.stats.laneChanges);
  await wait(400);
  const after = (await info()).sim.lane;
  await page.evaluate(() => {
    const el = document.getElementById('gesture');
    const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 8, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
    ev('pointerdown', 200, 500); ev('pointermove', 202, 420); ev('pointerup', 202, 420);
  });
  await waitFor(() => window.__MNNROW.info().sim.y > 0.2, null, 3000).catch(() => {});
  const y = (await info()).sim.y;
  // un trébuchement en mode Zen peut ramener le joueur : on vérifie que le geste a été pris en compte
  assert(lc1 === lc0 + 1 || (before === 1 && lc1 === lc0), `changement de voie non reçu (${lc0} -> ${lc1})`);
  assert(y > 0.2, `pas de saut après swipe haut (y=${y})`);
  await page.screenshot({ path: `${OUT}/02-course.png` });
  return `swipe droite : voie ${before}→${after}, swipe haut : y=${y.toFixed(2)}`;
});

await check('11a. Activation du hoverboard (touche E) et décompte de l\'inventaire', async () => {
  const before = await game(() => window.__MNNROW.game.save.hoverboards);
  await page.keyboard.press('e');
  await waitFor(() => window.__MNNROW.game.sim.powerups.active('hoverboard'), null, 5000).catch(() => {});
  await wait(200);
  const r = await game(() => ({ active: window.__MNNROW.game.sim.powerups.active('hoverboard'), n: window.__MNNROW.game.save.hoverboards, view: window.__MNNROW.game.player.boardHolder.visible }));
  assert(r.active && r.n === before - 1 && r.view, JSON.stringify(r));
  return `stock ${before} -> ${r.n}, planche visible`;
});

await check('10/11b. Collecte des pièces et bonus ramassés en course (pilote automatique)', async () => {
  await game(() => { const g = window.__MNNROW.game; g.save.selected.mode = 'standard'; g.autopilot = true; g.startRun('E2EPOWER'); });
  await wait(500);
  const ff = await game(() => window.__MNNROW.game.fastForward(900));
  const r = await game(() => { const s = window.__MNNROW.game.sim; return { coins: s.coins, powerups: s.stats.powerups, alive: s.alive, s: s.s }; });
  assert(ff.alive && r.coins > 50, JSON.stringify(r));
  assert(r.powerups >= 1, `aucun bonus ramassé (${JSON.stringify(r)})`);
  await wait(1500);
  await page.screenshot({ path: `${OUT}/03-course-900m.png` });
  return `${r.coins} pièces, ${r.powerups} bonus ramassés sur ${Math.round(r.s)} m`;
});

await check('11c. Chaque bonus s\'active et apparaît dans le HUD', async () => {
  const out = [];
  for (const t of ['magnet', 'multiplier', 'sneakers', 'shield', 'jetpack']) {
    const r = await game((t) => { const g = window.__MNNROW.game; g.sim.activatePowerup(t); return g.sim.powerups.active(t); }, t);
    await page.locator(`#h-powers [data-p="${t}"]`).waitFor({ timeout: 5000 }).catch(() => {});
    const hud = await page.locator(`#h-powers [data-p="${t}"]`).count();
    assert(r && hud === 1, `${t}: actif=${r} hud=${hud}`);
    out.push(t);
  }
  await wait(1200);
  await page.screenshot({ path: `${OUT}/04-bonus.png` });
  return out.join(', ');
});

await check('9/12. Collision réelle puis écran de fin de partie', async () => {
  await game(() => { const g = window.__MNNROW.game; g.autopilot = false; g.startRun('E2ECRASH'); });
  await waitFor(() => window.__MNNROW.info().state === 'gameover', null, 60000);
  assert(await visible('gameover'), 'écran de fin absent');
  const t = await page.textContent('#go-cause');
  const s = await page.textContent('#go-score');
  await page.screenshot({ path: `${OUT}/05-fin.png` });
  return `cause « ${t.trim()} », score ${s}`;
});

await check('13. Redémarrage (bouton Rejouer)', async () => {
  await page.click('#gameover [data-nav="restart"]');
  await waitFor(() => window.__MNNROW.info().state === 'playing');
  const s = (await info()).sim.s;
  assert(s < 20, `s=${s}`);
  await page.click('#hud [data-act="pause"]', { force: true });
  await waitFor(() => window.__MNNROW.info().state === 'paused');
  assert(await visible('pause'), 'écran pause absent');
  await page.click('#pause [data-nav="quit"]');
  await waitFor(() => window.__MNNROW.info().state === 'menu');
  return 'rejouer, pause, quitter';
});

await check('14. Changement de carte (écran Cartes)', async () => {
  await page.click('[data-nav="maps"]');
  await page.locator('#maplist .card', { hasText: 'Neon Tokyo' }).locator('button').click();
  await waitFor(() => window.__MNNROW.info().map === 'neon');
  const sky = await game(() => window.__MNNROW.game.scene.fog.color.getHexString());
  await wait(800);
  await page.screenshot({ path: `${OUT}/06-cartes.png` });
  await page.click('#maps [data-nav="menu"]');
  return `carte neon, brouillard #${sky}`;
});

await check('15. Changement de version (Winter Update -> carte imposée)', async () => {
  await page.click('[data-nav="versions"]');
  await page.locator('#versionlist .card', { hasText: 'Winter Update' }).locator('button').click();
  await waitFor(() => window.__MNNROW.info().map === 'snow');
  const online = await page.locator('#versionlist .card', { hasText: 'MNNROW Online' }).locator('button').isDisabled();
  assert(online, 'l\'édition en développement devrait être désactivée');
  await page.screenshot({ path: `${OUT}/07-versions.png` });
  await page.click('#versions [data-nav="menu"]');
  return 'snow chargée, édition « en développement » non sélectionnable';
});

await check('16/17. Sauvegarde et rechargement', async () => {
  await page.click('[data-nav="settings"]');
  await page.check('#s-reduced');
  await page.selectOption('#s-quality', 'low');
  await page.click('#settings [data-nav="back"]');
  await page.reload();
  await waitFor(() => window.__MNNROW && document.getElementById('menu').classList.contains('active'), null, 120000);
  const r = await game(() => ({ v: window.__MNNROW.game.save.selected.version, map: window.__MNNROW.info().map, reduced: window.__MNNROW.game.rig.reduced, q: window.__MNNROW.game.save.settings.quality, best: window.__MNNROW.game.save.best }));
  assert(r.v === 'winter' && r.map === 'snow' && r.reduced && r.q === 'low', JSON.stringify(r));
  return JSON.stringify(r);
});

await check('18. Import GLB dans le studio (valide puis invalide)', async () => {
  await page.click('[data-nav="studio"]');
  await page.locator('#st-tabs [data-tab="model"]').click();
  const glb = readFileSync('public/assets/models/powerups/jetpack.glb');
  await page.setInputFiles('#st-modelfile', { name: 'mon-perso.glb', mimeType: 'model/gltf-binary', buffer: glb });
  await waitFor(() => /Modèle chargé|✗/.test(document.getElementById('st-modelinfo').textContent), null, 30000);
  const ok = await page.textContent('#st-modelinfo');
  await page.setInputFiles('#st-modelfile', { name: 'faux.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from('<html>pas un modèle</html>') });
  await waitFor(() => document.getElementById('st-modelinfo').textContent.startsWith('✗'), null, 15000);
  const bad = await page.textContent('#st-modelinfo');
  assert(ok.includes('Modèle chargé'), ok);
  await page.screenshot({ path: `${OUT}/08-studio.png` });
  await page.locator('[data-clear="model"]').click();
  await wait(800);
  return `valide : « ${ok.slice(0, 60)}… » / invalide : « ${bad.slice(0, 70)} »`;
});

await check('15b. Studio : couleur et image appliquées puis réinitialisées', async () => {
  await page.locator('#st-tabs [data-tab="coin"]').click();
  // PNG 1×1 valide
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#st-coinfile', { name: 'piece.png', mimeType: 'image/png', buffer: png });
  await waitFor(() => document.getElementById('st-msg').textContent.includes('appliquée'), null, 10000);
  await page.setInputFiles('#st-coinfile', { name: 'piece.png', mimeType: 'image/png', buffer: Buffer.from('GIF89a fausse image') });
  await waitFor(() => document.getElementById('st-msg').textContent.startsWith('✗'), null, 10000);
  const err = await page.textContent('#st-msg');
  page.once('dialog', (d) => d.accept());
  await page.click('#st-reset');
  await waitFor(() => document.getElementById('st-msg').textContent.includes('réinitialisées'), null, 15000);
  await page.click('[data-nav="studio-exit"]');
  return `refus : « ${err.trim()} »`;
});

await check('Studio : glisser un sélecteur de couleur ne fait pas fuir la mémoire GPU', async () => {
  await page.click('[data-nav="studio"]');
  await page.locator('#st-tabs [data-tab="train"]').click();
  const t0 = await game(() => window.__MNNROW.game.r.renderer.info.memory.textures);
  for (let i = 0; i < 40; i++) {
    await page.evaluate((i) => { const el = document.getElementById('st-t1'); el.value = '#' + (0x102030 + i * 0x030507).toString(16).slice(-6); el.dispatchEvent(new Event('input', { bubbles: true })); }, i);
    await wait(30);
  }
  await wait(1500);
  const t1 = await game(() => window.__MNNROW.game.r.renderer.info.memory.textures);
  await page.click('[data-nav="studio-exit"]');
  assert(t1 - t0 < 25, `textures ${t0} -> ${t1}`);
  return `textures GPU ${t0} -> ${t1} après 40 couleurs`;
});

await check('Rejouer juste après une fin de partie : pas de ralenti ni de danse résiduels', async () => {
  const r = await game(() => { const g = window.__MNNROW.game; g.slowMo = 0.6; g.celebrate = 2; g.startRun('RESET'); return { slow: g.slowMo, cel: g.celebrate }; });
  await game(() => window.__MNNROW.game.quitToMenu());
  assert(r.slow === 0 && r.cel === 0, JSON.stringify(r));
  return 'slowMo = 0, celebrate = 0';
});

await check('19. Redimensionnement / orientation paysage', async () => {
  await page.setViewportSize({ width: 915, height: 412 });
  await wait(700);
  const r = await game(() => ({ w: window.__MNNROW.game.r.renderer.domElement.width, a: window.__MNNROW.game.rig.aspect }));
  assert(r.a > 2, JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/09-paysage.png` });
  await page.setViewportSize({ width: 412, height: 915 });
  await wait(400);
  return `aspect ${r.a.toFixed(2)}`;
});

await check('21. Perte puis restauration du contexte WebGL', async () => {
  await game(() => { window.__MNNROW.game.autopilot = true; window.__MNNROW.game.startRun('CTX'); });
  await wait(800);
  await game(() => { window.__lose = window.__MNNROW.game.r.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
  await waitFor(() => document.getElementById('ctxlost').classList.contains('active'), null, 10000);
  const st = (await info()).state;
  await game(() => window.__lose.restoreContext());
  await waitFor(() => !document.getElementById('ctxlost').classList.contains('active'), null, 15000);
  await wait(1500);
  const calls = await game(() => window.__MNNROW.game.r.info().calls);
  assert(st === 'paused' && calls > 0, `état ${st}, calls ${calls}`);
  await page.click('#pause [data-nav="resume"]');
  await wait(800);
  return `pause automatique puis rendu restauré (${calls} draw calls)`;
});

await check('Pause automatique quand la page est masquée', async () => {
  const st = (await info()).state;
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const after = (await info()).state;
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  assert(st === 'playing' && after === 'paused', `${st} -> ${after}`);
  return 'playing -> paused';
});

await check('Bouton retour (Android) : pause en course, sans quitter le site', async () => {
  await game(() => window.__MNNROW.game.resume());
  await waitFor(() => window.__MNNROW.info().state === 'playing', null, 5000);
  await page.goBack();
  await waitFor(() => window.__MNNROW && window.__MNNROW.info().state === 'paused', null, 5000);
  const url = page.url();
  await game(() => window.__MNNROW.game.resume());
  assert(url.includes('/Subway-Surferswebgl/'), url);
  return 'playing -> paused, page conservée';
});

await check('Commandes ignorées pendant la saisie de texte', async () => {
  await game(() => window.__MNNROW.game.resume());
  await game(() => { window.__MNNROW.game.autopilot = false; });
  const before = await game(() => window.__MNNROW.game.sim.targetLane);
  await page.evaluate(() => { const i = document.getElementById('s-seed'); i.closest('section').classList.add('active'); i.focus(); });
  await page.keyboard.press('ArrowLeft');
  const after = await game(() => window.__MNNROW.game.sim.targetLane);
  await page.evaluate(() => document.getElementById('s-seed').closest('section').classList.remove('active'));
  assert(before === after, `${before} -> ${after}`);
  return 'aucune action déclenchée';
});

await check('24. Performances (rendu logiciel SwiftShader, non représentatif d\'un mobile)', async () => {
  await game(() => window.__MNNROW.game.startRun('PERF'));
  await wait(6000);
  const r = await game(() => window.__MNNROW.game.r.info());
  return `${r.fps.toFixed(1)} FPS, profil ${r.profile}, ×${r.dpr.toFixed(2)}, ${r.calls} draw calls, ${(r.triangles / 1000).toFixed(0)}k triangles`;
});

await check('22/23. Aucune erreur JS critique ni ressource manquante', async () => {
  const critical = pageErrors.filter((e) => !/ResizeObserver/.test(e));
  const missing = failedRequests.filter((u) => !u.includes('favicon'));
  assert(!critical.length, critical.join(' | '));
  assert(!missing.length, missing.join(' | '));
  return `${consoleErrors.length} message(s) console.error (attendus : ${consoleErrors.slice(0, 3).join(' | ') || 'aucun'})`;
});

await browser.close();
const ok = results.filter((r) => r.ok).length;
writeFileSync(`${OUT}/e2e-report.json`, JSON.stringify({ date: new Date().toISOString(), base: BASE, ok, total: results.length, results, pageErrors, consoleErrors, failedRequests }, null, 2));
console.log(`\n${ok}/${results.length} vérifications réussies`);
process.exit(ok === results.length ? 0 : 1);
