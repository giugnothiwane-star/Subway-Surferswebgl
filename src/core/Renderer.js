// Rendu WebGL : détection de compatibilité, profils de qualité (LOW / MEDIUM /
// HIGH / AUTO), résolution adaptative mesurée, ombres configurables,
// perte / restauration du contexte WebGL.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { setMaxAnisotropy } from '../models/textures.js';

export const PROFILES = {
  low: { name: 'LOW', dprMax: 1.25, dprMin: 0.85, shadows: false, shadowSize: 0, drawDistance: 160, density: 0.55, particles: 0.4, antialias: false, lod: 60 },
  medium: { name: 'MEDIUM', dprMax: 1.75, dprMin: 1.0, shadows: true, shadowSize: 1024, drawDistance: 200, density: 0.8, particles: 0.7, antialias: true, lod: 85 },
  high: { name: 'HIGH', dprMax: 2.0, dprMin: 1.25, shadows: true, shadowSize: 2048, drawDistance: 250, density: 1, particles: 1, antialias: true, lod: 110 },
};

// Three.js 0.170 exige WebGL 2 : WebGL 1 seul est refusé avec un message clair
// (sinon le moteur échouerait plus tard et laisserait un écran noir).
export function detectWebGL(doc = globalThis.document) {
  try {
    if (!doc || typeof doc.createElement !== 'function') return { ok: false, webgl2: false, reason: 'Environnement sans page web : impossible de créer un canevas 3D.' };
    const c = doc.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) {
      let gl1 = null;
      try { gl1 = doc.createElement('canvas').getContext('webgl'); } catch { /* ignoré */ }
      return {
        ok: false,
        webgl2: false,
        webgl1: !!gl1,
        reason: gl1
          ? 'Ton navigateur ne gère que WebGL 1. MNNROW a besoin de WebGL 2 : mets à jour Chrome, Firefox, Edge ou Safari (15 ou plus), ou active l\'accélération matérielle.'
          : 'Ton navigateur ne fournit pas WebGL 2 (accélération graphique désactivée, pilote bloqué ou navigateur trop ancien). Active l\'accélération matérielle ou essaie Chrome / Firefox à jour.',
      };
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'inconnu';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, webgl2: true, gpu: String(gpu) };
  } catch (e) {
    return { ok: false, webgl2: false, reason: `Erreur pendant la détection de WebGL 2 : ${e.message}` };
  }
}

// Profil initial « raisonnable » pour le mode AUTO.
export function guessProfile(gpuInfo = {}) {
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const gpu = (gpuInfo.gpu || '').toLowerCase();
  const weakGpu = /mali-4|mali-t|adreno \(tm\) [1-5]\d\d|powervr|swiftshader|llvmpipe/.test(gpu);
  if (weakGpu || (mobile && (cores <= 4 || mem <= 3))) return 'low';
  if (mobile) return 'medium';
  return 'high';
}

export class Renderer {
  constructor(canvas, { quality = 'auto', shadows = null, gpuInfo = {} } = {}) {
    this.canvas = canvas;
    this.qualitySetting = quality;
    this.profileKey = quality === 'auto' ? guessProfile(gpuInfo) : quality;
    this.profile = { ...PROFILES[this.profileKey] };
    if (shadows === false) this.profile.shadows = false;
    this.shadowOverride = shadows;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.profile.antialias,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = this.profile.shadows;
    r.shadowMap.type = this.profileKey === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    setMaxAnisotropy(this.profileKey === 'low' ? 4 : r.capabilities.getMaxAnisotropy());
    this.dpr = Math.min(window.devicePixelRatio || 1, this.profile.dprMax);
    r.setPixelRatio(this.dpr);
    this.contextLost = false;
    this.listeners = { lost: [], restored: [], profile: [] };
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // autorise la restauration
      this.contextLost = true;
      this.listeners.lost.forEach((f) => f());
    }, false);
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.envMap = null; // régénéré à la demande
      this.listeners.restored.forEach((f) => f());
    }, false);
    // Mesure des performances (AUTO)
    this.perf = { acc: 0, frames: 0, window: 0, slowStreak: 0, fastStreak: 0, fps: 60, frameMs: 16.7, warm: 2 };
  }

  on(evt, fn) {
    this.listeners[evt].push(fn);
  }

  environment() {
    if (!this.envMap) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    return this.envMap;
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    return { w, h, aspect: w / h };
  }

  setQuality(key) {
    // Note : l'anticrénelage ne peut être changé qu'au rechargement.
    this.qualitySetting = key;
    this.profileKey = key === 'auto' ? this.profileKey : key;
    this.profile = { ...PROFILES[this.profileKey] };
    if (this.shadowOverride === false) this.profile.shadows = false;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.profile.dprMax);
    this.applyProfile();
  }

  setShadows(on) {
    this.shadowOverride = on;
    this.profile.shadows = on === null ? PROFILES[this.profileKey].shadows : on;
    this.applyProfile();
  }

  applyProfile() {
    this.perf.warm = 1; // la fenêtre suivante (compilation, rechargement) n'est pas mesurée
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.listeners.profile.forEach((f) => f(this.profile));
    this.resize();
  }

  // Ajustement automatique selon les performances observées (fenêtres de 2 s).
  measure(dt) {
    const p = this.perf;
    p.acc += dt;
    p.frames++;
    if (p.acc < 2) return;
    p.frameMs = (p.acc / p.frames) * 1000;
    p.fps = p.frames / p.acc;
    p.acc = 0;
    p.frames = 0;
    if (this.qualitySetting !== 'auto' || document.hidden) return;
    const maxDpr = Math.min(window.devicePixelRatio || 1, this.profile.dprMax);
    if (p.warm > 0) { p.warm--; return; }
    if (p.fps < 45) {
      p.slowStreak++;
      p.fastStreak = 0;
      // ordre : ombres d'abord (gros gain, peu visible), puis résolution, puis profil.
      // La résolution ne descend jamais sous dprMin : l'image ne devient pas pixelisée.
      if (this.profile.shadows) {
        this.profile.shadows = false;
        this.applyProfile();
      } else if (this.dpr > this.profile.dprMin + 0.01) {
        this.dpr = Math.max(this.profile.dprMin, this.dpr - 0.15);
        this.applyProfile();
      } else if (p.slowStreak >= 3 && this.profileKey !== 'low') {
        this.profileKey = this.profileKey === 'high' ? 'medium' : 'low';
        const keepDpr = this.dpr;
        this.profile = { ...PROFILES[this.profileKey] };
        this.profile.shadows = false;
        this.dpr = Math.min(window.devicePixelRatio || 1, Math.max(this.profile.dprMin, Math.min(keepDpr, this.profile.dprMax)));
        p.slowStreak = 0;
        this.applyProfile();
      }
    } else if (p.fps > 57) {
      p.fastStreak++;
      p.slowStreak = 0;
      if (p.fastStreak >= 3 && this.dpr < maxDpr - 0.01) {
        this.dpr = Math.min(maxDpr, this.dpr + 0.1);
        p.fastStreak = 0;
        this.applyProfile();
      }
    } else {
      p.slowStreak = 0;
      p.fastStreak = 0;
    }
  }

  render(scene, camera) {
    if (this.contextLost) return;
    this.renderer.render(scene, camera);
  }

  info() {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, dpr: this.dpr, profile: this.profile.name, fps: this.perf.fps };
  }
}
