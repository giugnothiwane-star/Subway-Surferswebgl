import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/models/Character.js';
import { SkinManager, defaultSkins, validateSkins, applyGalaxyToEquipment, removeSkinEverywhere, GALAXY_TARGETS, CLOTHES } from '../src/skins/SkinManager.js';

function names(root) {
  const out = [];
  root.traverse((o) => { if (o.isMesh) out.push(...[].concat(o.material).map((m) => m.name)); });
  return out;
}

test('Galaxie complète : tout le personnage sauf yeux et bouche, SkinnedMesh conservés', () => {
  const ch = createCharacter();
  const before = [];
  ch.root.traverse((o) => { if (o.isMesh) before.push([o, o.material, o.type]); });
  const m = new SkinManager();
  const cfg = defaultSkins(); cfg.character.skin = 'galaxy';
  m.setConfig(cfg);
  m.applyCharacter(ch.root);
  const n = names(ch.root);
  assert.ok(n.includes('Skin_galaxy'));
  assert.ok(!n.some((x) => ['Skin', 'Shirt', 'Pants', 'Hair'].includes(x)));
  assert.ok(n.includes('EyeWhite') && n.includes('Mouth'));
  for (const [o, , type] of before) assert.equal(o.type, type); // animations préservées
  // retour à Normal : exactement les matériaux d'origine
  cfg.character.skin = 'normal';
  m.applyCharacter(ch.root);
  for (const [o, mat] of before) assert.equal(o.material, mat);
});

test('mode Vêtements : seuls les vêtements et accessoires changent', () => {
  const ch = createCharacter();
  const m = new SkinManager();
  const cfg = defaultSkins(); cfg.character.skin = 'neon'; cfg.character.mode = 'clothes';
  m.setConfig(cfg);
  m.applyCharacter(ch.root);
  const n = names(ch.root);
  assert.ok(n.includes('Skin_neon') && n.includes('Skin') && n.includes('Hair'));
  assert.ok(!n.some((x) => CLOTHES.includes(x)));
});

test('bouton Galaxie : personnage, cape, pièces, hoverboard — jamais les trains', () => {
  const cfg = applyGalaxyToEquipment(defaultSkins());
  assert.equal(cfg.character.skin, 'galaxy');
  assert.equal(cfg.cape.skin, 'galaxy');
  assert.equal(cfg.cape.enabled, true);
  assert.equal(cfg.coin.skin, 'galaxy');
  assert.equal(cfg.board.skin, 'galaxy');
  assert.ok(!GALAXY_TARGETS.includes('trains'));
  assert.equal(cfg.trains, undefined);
  removeSkinEverywhere(cfg);
  assert.equal(cfg.character.skin, 'normal');
  assert.equal(cfg.coin.skin, 'normal');
});

test('sauvegarde des skins validée et bornée', () => {
  const v = validateSkins({ character: { skin: 'galaxy', mode: 'x' }, coin: { skin: 'pirate', zoom: 99, fit: 'cover', edgeColor: 'rouge' }, galaxy: { starDensity: 7, colorA: '#123456', animated: false }, cape: { enabled: true, color: '#00ff00' } });
  assert.equal(v.character.skin, 'galaxy');
  assert.equal(v.character.mode, 'full');
  assert.equal(v.coin.skin, 'normal');
  assert.equal(v.coin.zoom, 3);
  assert.equal(v.coin.fit, 'cover');
  assert.equal(v.coin.edgeColor, '#d9a21e');
  assert.equal(v.galaxy.starDensity, 1);
  assert.equal(v.galaxy.colorA, '#123456');
  assert.equal(v.galaxy.animated, false);
  assert.equal(v.cape.enabled, true);
  assert.deepEqual(validateSkins('corrompu'), defaultSkins());
});
