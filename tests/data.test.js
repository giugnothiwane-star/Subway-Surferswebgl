import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, migrateLegacy, validateSave } from '../src/core/save.js';
import { checkGLTF, inspectGLB, sanitizeZipPath, sniff } from '../src/core/files.js';
import { claim, ensureMissions, snapshotBase, trackRun } from '../src/gameplay/Missions.js';
import { readFileSync, existsSync } from 'node:fs';

test('sauvegarde : valeurs invalides réparées, champs inconnus ignorés', () => {
  const bad = validateSave({ bank: -5, best: 'x', hoverboards: 1e9, selected: { map: '<script>', version: 'online', character: 'rex' }, settings: { quality: 'ultra', master: 7 }, look: { shirt: 'red', hair: 'bun' }, hack: 1 });
  assert.equal(bad.bank, 0);
  assert.equal(bad.best, 0);
  assert.equal(bad.hoverboards, 999);
  assert.equal(bad.selected.map, 'metro');
  assert.equal(bad.selected.version, 'ultimate'); // édition en développement non sélectionnable
  assert.equal(bad.selected.character, 'nova'); // non débloqué
  assert.equal(bad.settings.quality, 'auto');
  assert.equal(bad.settings.master, 1);
  assert.equal(bad.look.shirt, undefined);
  assert.equal(bad.look.hair, 'bun');
  assert.equal(bad.hack, undefined);
  assert.deepEqual(validateSave(null), defaultSave());
  assert.deepEqual(validateSave('corrompu'), defaultSave());
});

test('sauvegarde : texture de pièce choisie validée', () => {
  assert.equal(validateSave({ studio: { coinPreset: 'husky' } }).studio.coinPreset, 'husky');
  assert.equal(validateSave({ studio: { coinPreset: 'samoyede' } }).studio.coinPreset, 'husky');
  assert.equal(validateSave({ studio: { coinPreset: '../../etc' } }).studio.coinPreset, null);
});

test('sauvegarde : lueur des pièces validée et bornée', () => {
  const g = validateSave({ studio: { coinGlow: { enabled: true, color: '#ff00aa', intensity: 9 } } }).studio.coinGlow;
  assert.deepEqual(g, { enabled: true, color: '#ff00aa', intensity: 1 });
  assert.equal(validateSave({ studio: { coinGlow: { enabled: 'oui', color: 'rouge' } } }).studio.coinGlow.color, '#ffd23a');
});

test('sauvegarde : aller-retour JSON sans perte', () => {
  const s = defaultSave();
  s.bank = 1234;
  s.unlocked.characters.push('kiko');
  s.selected.character = 'kiko';
  s.studio.trainLivery.enabled = true;
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(s))), s);
});

test('migration des données du prototype d\'origine', () => {
  const mem = new Map([['mnnrow_best', '321'], ['mnnrow_custom', JSON.stringify({ charColor: '#123456', boardColor: '#abcdef', coinImage: 'data:image/png;base64,AAAA' })]]);
  const save = defaultSave();
  const r = migrateLegacy({ getItem: (k) => mem.get(k) ?? null }, save);
  assert.equal(save.best, 321);
  assert.equal(save.look.shirt, '#123456');
  assert.equal(save.board.color, '#abcdef');
  assert.ok(r.images.coin.startsWith('data:image/png'));
});

test('détection des formats par signature (pas par extension)', () => {
  assert.equal(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(sniff(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')), 'webp');
  assert.equal(sniff(new TextEncoder().encode('glTF\x02\0\0\0\0\0\0\0')), 'glb');
  assert.equal(sniff(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), 'zip');
  assert.equal(sniff(new TextEncoder().encode('  {"asset":{}}')), 'json');
  assert.equal(sniff(new TextEncoder().encode('<html>')), 'unknown');
});

test('validation GLB : fichier réel accepté, fichiers corrompus refusés', () => {
  const path = 'public/assets/models/coins/coin.glb';
  if (existsSync(path)) {
    const ok = inspectGLB(new Uint8Array(readFileSync(path)));
    assert.equal(ok.ok, true, ok.error);
    assert.ok(ok.stats.meshes >= 1);
    const truncated = inspectGLB(new Uint8Array(readFileSync(path)).slice(0, 100));
    assert.equal(truncated.ok, false);
  }
  assert.equal(inspectGLB(new TextEncoder().encode('pas un glb du tout')).ok, false);
});

test('validation glTF : références externes dangereuses et fichiers manquants', () => {
  const base = { asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ count: 3 }] };
  assert.equal(checkGLTF({ ...base, buffers: [{ uri: 'https://exemple.com/x.bin' }] }).ok, false);
  assert.equal(checkGLTF({ ...base, buffers: [{ uri: '../../secret.bin' }] }).ok, false);
  assert.equal(checkGLTF({ ...base, buffers: [{ uri: 'model.bin' }] }, { available: [] }).ok, false);
  assert.equal(checkGLTF({ ...base, buffers: [{ uri: 'model.bin' }] }, { available: ['model.bin'] }).ok, true);
  assert.equal(checkGLTF({ ...base, accessors: [{ count: 10_000_000 }] }).ok, false);
  assert.equal(checkGLTF({ asset: { version: '1.0' } }).ok, false);
});

test('chemins d\'archive ZIP assainis', () => {
  assert.equal(sanitizeZipPath('model/scene.gltf'), 'model/scene.gltf');
  assert.equal(sanitizeZipPath('../evil.glb'), null);
  assert.equal(sanitizeZipPath('/abs/x.glb'), null);
  assert.equal(sanitizeZipPath('__MACOSX/._x.glb'), null);
  assert.equal(sanitizeZipPath('C:/x.glb'), null);
});

test('missions : progression réelle, récompense une seule fois, montée de niveau', () => {
  const save = defaultSave();
  const st = save.missions;
  st.active = [
    { id: 'coins_run_50', progress: 0, done: false, claimed: false },
    { id: 'jumps_total_20', progress: 15, done: false, claimed: false },
    { id: 'dist_run_500', progress: 0, done: false, claimed: false },
  ];
  const base = snapshotBase(st);
  const done = trackRun(st, { coins: 60, distance: 300, score: 100, stats: { jumps: 3 } }, base);
  assert.deepEqual(done.map((d) => d.id), ['coins_run_50']);
  assert.equal(st.active[1].progress, 18);
  const r1 = claim(st, save);
  assert.equal(r1.coins, 100);
  assert.equal(claim(st, save).coins, 0); // pas de double récompense
  trackRun(st, { coins: 0, distance: 600, score: 0, stats: { jumps: 5 } }, base);
  const r2 = claim(st, save);
  assert.equal(r2.levelUp, true);
  assert.equal(st.level, 2);
  assert.equal(save.hoverboards, 4);
  assert.equal(st.active.length, 3);
  assert.ok(ensureMissions(st).active.every((m) => !m.done));
});

test('Mes images : liste locale validée, sélection locale seulement si elle existe', () => {
  const v = validateSave({ studio: { coinLib: [{ id: 'abc1', name: 'Sonic' }, { id: '../x' }, 'mauvais'], coinPreset: 'local:abc1' } });
  assert.deepEqual(v.studio.coinLib, [{ id: 'abc1', name: 'Sonic' }]);
  assert.equal(v.studio.coinPreset, 'local:abc1');
  assert.equal(validateSave({ studio: { coinLib: [], coinPreset: 'local:zzz' } }).studio.coinPreset, null);
});

test('modes Entraînement / Floor is Lava et option Invincible validés', () => {
  assert.equal(validateSave({ selected: { mode: 'lava' } }).selected.mode, 'lava');
  assert.equal(validateSave({ selected: { mode: 'training' } }).selected.mode, 'training');
  assert.equal(validateSave({ selected: { mode: 'triche' } }).selected.mode, 'standard');
  assert.equal(validateSave({ settings: { invincible: true } }).settings.invincible, true);
  assert.equal(validateSave({ settings: { invincible: 'oui' } }).settings.invincible, false);
});
