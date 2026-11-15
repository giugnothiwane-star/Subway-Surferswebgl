import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Owner, lockoutDelay, openToken, sealToken, verifyOwnerCode } from '../src/core/Owner.js';
import { BRANCH, FILE, SharedContent, decryptShared, encryptShared, siteKeyFromBase } from '../src/core/SharedContent.js';

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
// Code de test (le vrai code n'apparaît nulle part dans le dépôt, seulement son empreinte).
const TEST = { code: '424242', salt: '00112233445566778899aabbccddeeff' };

test('code propriétaire : seule l\'empreinte est stockée, comparaison exacte', async () => {
  const { pbkdf2Sync } = await import('node:crypto');
  const hash = pbkdf2Sync(TEST.code, Buffer.from(TEST.salt, 'hex'), 1000, 32, 'sha256').toString('hex');
  assert.equal(await verifyOwnerCode(TEST.code, { salt: TEST.salt, hash, iterations: 1000 }), true);
  assert.equal(await verifyOwnerCode('424243', { salt: TEST.salt, hash, iterations: 1000 }), false);
  assert.equal(await verifyOwnerCode('abc', { salt: TEST.salt, hash, iterations: 1000 }), false);
  assert.equal(await verifyOwnerCode(''), false);
  const src = (await import('node:fs')).readFileSync('src/core/Owner.js', 'utf8');
  assert.ok(!/2761985/.test(src), 'le code en clair ne doit pas être dans le source');
});

test('verrouillage progressif après 5 échecs', () => {
  assert.equal(lockoutDelay(4), 0);
  assert.equal(lockoutDelay(5), 30000);
  assert.equal(lockoutDelay(6), 60000);
  assert.equal(lockoutDelay(30), 3600000);
});

test('mauvais code : refus puis attente imposée, persistée', async () => {
  const st = memStore();
  const o = new Owner(st);
  for (let i = 0; i < 5; i++) assert.equal((await o.unlock('1111111')).ok, false);
  assert.ok(o.waitSeconds() >= 29);
  const r = await o.unlock('1111111');
  assert.equal(r.ok, false);
  assert.ok(r.wait > 0, 'essai refusé sans calcul pendant l\'attente');
  assert.equal(new Owner(st).waitSeconds() > 0, true, 'attente conservée après rechargement');
  assert.equal(o.unlocked, false);
});

test('jeton GitHub chiffré avec le code, illisible sans lui', async () => {
  const sealed = await sealToken('github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345', '2468');
  assert.ok(!sealed.includes('github_pat_'));
  assert.equal(await openToken(sealed, '2468'), 'github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
  await assert.rejects(openToken(sealed, '2469'));
});

test('clé du site lue dans le chemin du lien privé seulement', () => {
  assert.equal(siteKeyFromBase('/Subway-Surferswebgl/CléTropCourte/'), null);
  assert.equal(siteKeyFromBase('/Subway-Surferswebgl/'), null);
  assert.equal(siteKeyFromBase('/Subway-Surferswebgl/Abcdefghijklmnop_123/'), 'Abcdefghijklmnop_123');
});

test('image partagée chiffrée (AES-GCM) : illisible sans la clé du site', async () => {
  const img = new TextEncoder().encode('RIFF....WEBPVP8 contenu de test');
  const data = await encryptShared(img, 'Abcdefghijklmnop_123');
  assert.ok(!Buffer.from(data).includes(Buffer.from('WEBP')), 'aucun octet de l\'image en clair');
  assert.deepEqual([...await decryptShared(data, 'Abcdefghijklmnop_123')], [...img]);
  await assert.rejects(decryptShared(data, 'Zbcdefghijklmnop_123'));
});

// Faux GitHub : une branche, un fichier, des commits.
function fakeGitHub(key) {
  const state = { head: null, file: null, fileSha: null, calls: [] };
  const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, arrayBuffer: async () => new ArrayBuffer(0) });
  const fetch = async (url, opt = {}) => {
    const m = opt.method || 'GET';
    state.calls.push(`${m} ${url.replace(/https:\/\/[^/]+/, '')}`);
    if (url.includes(`/commits/${BRANCH}`)) return state.head ? json({ sha: state.head }) : json({}, 404);
    if (url.startsWith('https://raw.githubusercontent.com/')) {
      if (!state.file) return json({}, 404);
      return { ok: true, status: 200, arrayBuffer: async () => state.file.buffer.slice(0) };
    }
    if (url.includes('/git/ref/heads/')) return state.head || url.endsWith('/main') ? json({ object: { sha: 'main1' } }) : json({}, 404);
    if (url.includes('/git/refs')) { state.head = 'b0'; return json({}, 201); }
    if (url.includes(`/contents/${FILE}`)) {
      if (m === 'GET') return state.fileSha ? json({ sha: state.fileSha }) : json({}, 404);
      const body = JSON.parse(opt.body);
      assert.equal(opt.headers.Authorization, 'Bearer github_pat_test');
      if (m === 'PUT') { state.file = new Uint8Array(Buffer.from(body.content, 'base64')); state.fileSha = 'f' + state.calls.length; state.head = 'c' + state.calls.length; state.lastBody = body; return json({ commit: { sha: state.head } }); }
      if (m === 'DELETE') { state.file = null; state.fileSha = null; state.head = 'd' + state.calls.length; return json({ commit: { sha: state.head } }); }
    }
    return json({}, 500);
  };
  return { state, fetch, key };
}

test('partage : publication chiffrée, autres joueurs mis à jour sans recharger, retrait', async () => {
  const key = 'Abcdefghijklmnop_123';
  const gh = fakeGitHub(key);
  const owner = new SharedContent({ siteKey: key, fetch: gh.fetch });
  const seen = [];
  const visitor = new SharedContent({ siteKey: key, fetch: gh.fetch, onImage: (b) => seen.push(b ? b.size : null) });
  await visitor.check();
  assert.deepEqual(seen, [], 'rien de partagé : aucun changement');
  const img = new TextEncoder().encode('image webp de test');
  await owner.publish(img, 'github_pat_test');
  assert.equal(gh.state.lastBody.branch, BRANCH);
  assert.ok(!Buffer.from(gh.state.lastBody.content, 'base64').includes(Buffer.from('image webp')), 'contenu envoyé chiffré');
  await visitor.check();
  assert.deepEqual(seen, [img.length], 'le visiteur reçoit l\'image');
  await visitor.check();
  assert.equal(seen.length, 1, 'pas de nouveau téléchargement si rien n\'a changé');
  assert.equal(await owner.remove('github_pat_test'), true);
  await visitor.check();
  assert.deepEqual(seen, [img.length, null], 'retrait appliqué');
  // sans clé du site (adresse publique) : partage désactivé
  await assert.rejects(new SharedContent({ siteKey: null, fetch: gh.fetch }).publish(img, 'github_pat_test'));
});
