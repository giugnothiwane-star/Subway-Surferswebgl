// Vérifie la compilation : chaque ressource référencée par dist/index.html et
// par le code (modèles, vignettes, textures) existe bien dans dist/, et toutes
// les URL absolues utilisent le chemin GitHub Pages /Subway-Surferswebgl/.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Base attendue (BASE_PATH pour la version privée) et dossier à vérifier (argument).
const BASE = process.env.BASE_PATH || '/Subway-Surferswebgl/';
const DIST = process.argv[2] || 'dist';
const errors = [];
if (!existsSync(join(DIST, 'index.html'))) { console.error(`${DIST}/index.html absent : lance d'abord npm run build`); process.exit(1); }
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (/^(https?:|data:|#|mailto:)/.test(url)) continue;
  if (url.startsWith('/') && !url.startsWith(BASE)) { errors.push(`chemin hors de la base : ${url}`); continue; }
  const rel = url.startsWith(BASE) ? url.slice(BASE.length) : url.replace(/^\.\//, '');
  if (!existsSync(join(DIST, rel.split('?')[0]))) errors.push(`fichier manquant : ${url}`);
}
// ressources chargées par le code à l'exécution (chemins relatifs à la base)
const js = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(DIST, 'assets', f), 'utf8')).join('\n');
const refs = new Set([...js.matchAll(/["'`](assets\/(?:models|maps|textures)\/[^"'`$]+)["'`]/g)].map((m) => m[1]));
for (const r of refs) if (!existsSync(join(DIST, r))) errors.push(`ressource référencée par le code mais absente : ${r}`);
// textures de pièces (chemin construit à partir des identifiants)
const coins = readdirSync('public/assets/textures/coins').filter((f) => f.endsWith('.webp'));
for (const c of coins) if (!existsSync(join(DIST, 'assets/textures/coins', c))) errors.push(`texture de pièce non copiée : ${c}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`${DIST}/ vérifié : ${refs.size} ressources du code et toutes les références de index.html présentes (base ${process.env.BASE_PATH ? 'privée, non affichée' : BASE}).`);
