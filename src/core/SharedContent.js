// Image de pièce partagée par le propriétaire avec TOUS les joueurs du lien privé.
//
// - Stockage : branche `contenu-partage` du dépôt GitHub (fichier partage/piece.bin),
//   écrite avec le jeton GitHub du propriétaire (API REST, CORS autorisé).
// - Confidentialité : le fichier est CHIFFRÉ (AES-GCM 256). La clé est dérivée
//   (HKDF) de la clé secrète du site, présente uniquement dans le lien privé.
//   Sur GitHub on ne voit qu'un fichier illisible ; seuls les visiteurs du lien
//   privé peuvent le déchiffrer. L'image est ré-encodée avant envoi (les
//   métadonnées comme la position GPS sont supprimées).
// - Mise à jour sans rechargement : chaque joueur vérifie la branche toutes les
//   30 s (requête conditionnelle ETag : un « rien de neuf » ne compte pas dans
//   les quotas de GitHub) et remplace la texture des pièces à chaud.

export const REPO = { owner: 'giugnothiwane-star', repo: 'Subway-Surferswebgl' };
export const BRANCH = 'contenu-partage';
export const FILE = 'partage/piece.bin';
const MAGIC = [0x4d, 0x4e, 0x53, 0x31]; // « MNS1 »
const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

const enc = new TextEncoder();

// Clé du site lue dans le chemin de publication : /Subway-Surferswebgl/<clé>/
export function siteKeyFromBase(base) {
  const m = /\/Subway-Surferswebgl\/([A-Za-z0-9_-]{16,64})\/?$/.exec(base || '');
  return m ? m[1] : null;
}

async function aesKey(siteKey) {
  const s = globalThis.crypto.subtle;
  const base = await s.importKey('raw', enc.encode(siteKey), 'HKDF', false, ['deriveKey']);
  return s.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('mnnrow-partage-v1'), info: enc.encode('piece') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptShared(bytes, siteKey) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(siteKey), bytes));
  const out = new Uint8Array(4 + 12 + ct.length);
  out.set(MAGIC, 0);
  out.set(iv, 4);
  out.set(ct, 16);
  return out;
}

export async function decryptShared(data, siteKey) {
  const u8 = new Uint8Array(data);
  if (u8.length < 17 || MAGIC.some((b, i) => u8[i] !== b)) throw new Error('fichier partagé illisible');
  const pt = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(4, 16) }, await aesKey(siteKey), u8.slice(16));
  return new Uint8Array(pt);
}

export function toBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

// Ré-encode l'image (≤ 512 px, WebP) : plus légère et sans métadonnées.
export async function prepareImage(blob, max = 512) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const out = await new Promise((res) => c.toBlob(res, 'image/webp', 0.9));
  if (!out) throw new Error('conversion de l\'image impossible');
  return new Uint8Array(await out.arrayBuffer());
}

export class SharedContent {
  constructor({ siteKey, fetch = globalThis.fetch?.bind(globalThis), onImage = () => {}, interval = 30000 } = {}) {
    this.siteKey = siteKey;
    this.fetch = fetch;
    this.onImage = onImage;
    this.interval = interval;
    this.sha = undefined; // dernier état vu (undefined = jamais vérifié, null = rien de partagé)
    this.timer = null;
    this.busy = false;
    this.current = null; // image partagée affichée (Blob) ou null
  }

  get enabled() {
    return !!this.siteKey;
  }

  start() {
    if (!this.enabled || this.timer) return;
    this.check();
    this.timer = setInterval(() => { if (!document.hidden) this.check(); }, this.interval);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  // Vérifie la branche partagée ; ne fait rien si rien n'a changé.
  async check() {
    if (!this.enabled || this.busy) return;
    this.busy = true;
    try {
      const r = await this.fetch(`${API}/repos/${REPO.owner}/${REPO.repo}/commits/${BRANCH}`, { cache: 'no-cache', headers: { Accept: 'application/vnd.github+json' } });
      if (r.status === 404 || r.status === 422) return this.apply(null, null);
      if (!r.ok) return; // quota, réseau : on garde l'image actuelle et on réessaiera
      const sha = (await r.json()).sha;
      if (sha === this.sha) return;
      const f = await this.fetch(`${RAW}/${REPO.owner}/${REPO.repo}/${sha}/${FILE}`, { cache: 'force-cache' });
      if (f.status === 404) return this.apply(sha, null);
      if (!f.ok) return;
      const bytes = await decryptShared(await f.arrayBuffer(), this.siteKey);
      await this.apply(sha, new Blob([bytes], { type: 'image/webp' }));
    } catch (e) {
      console.warn('[MNNROW] contenu partagé indisponible :', e.message);
    } finally {
      this.busy = false;
    }
  }

  // Prévient le jeu seulement si quelque chose change à l'écran.
  async apply(sha, blob) {
    this.sha = sha;
    const had = !!this.current;
    this.current = blob;
    if (!blob && !had) return;
    await this.onImage(blob);
  }

  // ---- propriétaire : publication via l'API GitHub ----------------------------
  async api(token, method, path, body) {
    const r = await this.fetch(`${API}/repos/${REPO.owner}/${REPO.repo}${path}`, {
      method,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) throw new Error('jeton GitHub refusé (expiré ou incorrect)');
    if (r.status === 403) throw new Error('jeton GitHub sans droit d\'écriture sur ce dépôt (permission « Contents : Read and write »)');
    return r;
  }

  async ensureBranch(token) {
    const b = await this.api(token, 'GET', `/git/ref/heads/${BRANCH}`);
    if (b.ok) return;
    const main = await this.api(token, 'GET', '/git/ref/heads/main');
    if (!main.ok) throw new Error(`branche main introuvable (${main.status})`);
    const sha = (await main.json()).object.sha;
    const c = await this.api(token, 'POST', '/git/refs', { ref: `refs/heads/${BRANCH}`, sha });
    if (!c.ok && c.status !== 422) throw new Error(`création de la branche impossible (${c.status})`);
  }

  async fileSha(token) {
    const r = await this.api(token, 'GET', `/contents/${FILE}?ref=${BRANCH}`);
    return r.ok ? (await r.json()).sha : null;
  }

  async publish(imageBytes, token) {
    if (!this.enabled) throw new Error('ouvre le jeu depuis ton lien privé pour partager');
    const data = await encryptShared(imageBytes, this.siteKey);
    await this.ensureBranch(token);
    const sha = await this.fileSha(token);
    const r = await this.api(token, 'PUT', `/contents/${FILE}`, { message: 'Contenu partagé (chiffré)', content: toBase64(data), branch: BRANCH, ...(sha ? { sha } : {}) });
    if (!r.ok) throw new Error(`publication refusée par GitHub (${r.status})`);
    const commit = (await r.json()).commit?.sha;
    this.sha = commit; // déjà appliquée localement : pas de second téléchargement
    this.current = new Blob([imageBytes], { type: 'image/webp' });
    return commit;
  }

  async remove(token) {
    if (!this.enabled) throw new Error('ouvre le jeu depuis ton lien privé');
    const sha = await this.fileSha(token);
    if (!sha) return false;
    const r = await this.api(token, 'DELETE', `/contents/${FILE}`, { message: 'Contenu partagé retiré', sha, branch: BRANCH });
    if (!r.ok) throw new Error(`suppression refusée par GitHub (${r.status})`);
    this.sha = (await r.json()).commit?.sha;
    this.current = null;
    return true;
  }
}
