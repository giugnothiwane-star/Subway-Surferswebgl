import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_KEYS, actionFor, bindKey, cloneDefaults, keyLabel, validateKeys } from '../src/gameplay/keymap.js';

test('touches par défaut : AZERTY et QWERTY couverts', () => {
  const m = cloneDefaults();
  assert.equal(actionFor(m, 'ArrowLeft'), 'left');
  assert.equal(actionFor(m, 'q'), 'left');
  assert.equal(actionFor(m, 'A'), 'left');
  assert.equal(actionFor(m, ' '), 'jump');
  assert.equal(actionFor(m, 'z'), 'jump');
  assert.equal(actionFor(m, 'Escape'), 'pause');
  assert.equal(actionFor(m, 'x'), null);
});

test('réattribution : une touche déjà utilisée quitte son ancienne action', () => {
  const m = cloneDefaults();
  const r = bindKey(m, 'jump', 0, 'D');
  assert.equal(r.ok, true);
  assert.equal(r.movedFrom, 'right');
  assert.equal(actionFor(m, 'd'), 'jump');
  assert.ok(!m.right.includes('d'));
  assert.equal(bindKey(m, 'left', 1, 'F5').ok, false); // réservée
});

test('configuration sauvegardée validée (doublons, types, actions vides)', () => {
  const v = validateKeys({ left: ['k', 'k', 42], right: ['k'], jump: 'x', pause: ['', '', ''] });
  assert.deepEqual(v.left, ['k', '', '']);
  assert.ok(!v.right.includes('k'));
  assert.deepEqual(v.jump, DEFAULT_KEYS.jump);
  assert.ok(v.pause.some(Boolean)); // jamais d'action sans touche
  assert.deepEqual(validateKeys(null), DEFAULT_KEYS);
});

test('libellés lisibles', () => {
  assert.equal(keyLabel(' '), 'Espace');
  assert.equal(keyLabel('arrowleft'), '←');
  assert.equal(keyLabel('q'), 'Q');
  assert.equal(keyLabel(''), '—');
});
