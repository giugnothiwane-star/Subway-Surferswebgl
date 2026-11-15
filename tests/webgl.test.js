import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectWebGL } from '../src/core/Renderer.js';

// Faux document : chaque canevas renvoie les contextes demandés.
const fakeDoc = (contexts) => ({
  createElement: () => ({ getContext: (type) => contexts[type] ?? null }),
});
const gl2 = { getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 } : { loseContext() {} }), getParameter: () => 'GPU test' };

test('WebGL 2 disponible : accepté, nom du GPU lu', () => {
  const r = detectWebGL(fakeDoc({ webgl2: gl2 }));
  assert.equal(r.ok, true);
  assert.equal(r.webgl2, true);
  assert.equal(r.gpu, 'GPU test');
});

test('WebGL 1 seulement : refusé avec un message clair (Three.js 0.170 exige WebGL 2)', () => {
  const r = detectWebGL(fakeDoc({ webgl: {} }));
  assert.equal(r.ok, false);
  assert.equal(r.webgl1, true);
  assert.match(r.reason, /WebGL 2/);
});

test('aucun WebGL, exception ou pas de document : refus propre, jamais d\'exception', () => {
  assert.equal(detectWebGL(fakeDoc({})).ok, false);
  assert.equal(detectWebGL({ createElement: () => { throw new Error('boum'); } }).ok, false);
  assert.equal(detectWebGL(null).ok, false);
});
