// Lance les tests navigateur de bout en bout sans manipulation manuelle :
// 1. compile le jeu (sauf --no-build), 2. démarre `vite preview` sur un port
// libre, 3. attend qu'il réponde, 4. exécute tools/e2e.mjs, 5. arrête le serveur.
// Code de sortie = celui des tests (0 = tout est passé).
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || 'test-results';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

if (!args.includes('--no-build')) {
  const b = spawnSync(npx, ['vite', 'build'], { stdio: 'inherit' });
  if (b.status !== 0) { console.error('La compilation a échoué : tests non lancés.'); process.exit(b.status || 1); }
}

const port = await new Promise((resolve) => {
  const s = createServer();
  s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
});
const server = spawn(npx, ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
const base = `http://localhost:${port}/Subway-Surferswebgl/`;
let ready = false;
for (let i = 0; i < 100 && !ready; i++) {
  try { ready = (await fetch(base)).ok; } catch { /* pas encore prêt */ }
  if (!ready) await new Promise((r) => setTimeout(r, 300));
}
if (!ready) { console.error(`Le serveur de prévisualisation ne répond pas sur ${base}`); server.kill(); process.exit(1); }
console.log(`Serveur prêt : ${base}`);
const e2e = spawn(process.execPath, ['tools/e2e.mjs', base, out], { stdio: 'inherit' });
const code = await new Promise((r) => e2e.on('exit', r));
server.kill();
process.exit(code ?? 1);
