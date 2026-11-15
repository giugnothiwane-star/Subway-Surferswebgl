// Rendu WebGL : détection de compatibilité, profils de qualité (LOW / MEDIUM /
// HIGH / AUTO), résolution adaptative mesurée, ombres configurables,
// perte / restauration du contexte WebGL.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { setMaxAnisotropy } from '../models/textures.js';

export const PROFILES = {
  low: { name: 'LOW', dprMax: 1.0, dprMin: 0.6, shadows: false, shadowSize: 0, drawDistance: 160, density: 0.55, particles: 0.4, antialias: false, lod: 60 },
  medium: { name: 'MEDIUM', dprMax: 1.5, dprMin: 0.75, shadows: true, shadowSize: 1024, drawDistance: 200, density: 0.8, particles: 0.7, antialias: false, lod: 85 },
  high: { name: 'HIGH', dprMax: 2.0, dprMin: 1.0, shadows: true, shadowSize: 2048, drawDistance: 250, density: 1, particles: 1, antialias: true, lod: 110 },
};

export function detectWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { ok: false, reason: 'Ce navigateur ne fournit pas de contexte WebGL.' };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'inconnu';
    const v2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, webgl2: v2, gpu: String(gpu) };
  } catch (e) {
    return { ok: false, reason: e.message };
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
    setMaxAnisotropy(this.profileKey === 'low' ? 2 : r.capabilities.getMaxAnisotropy());
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
    this.perf = { acc: 0, frames: 0, window: 0, slowStreak: 0, fastStreak: 0, fps: 60, frameMs: 16.7 };
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
    if (p.fps < 45) {
      p.slowStreak++;
      p.fastStreak = 0;
      if (this.dpr > this.profile.dprMin + 0.01) {
        this.dpr = Math.max(this.profile.dprMin, this.dpr - 0.15);
        this.applyProfile();
      } else if (p.slowStreak >= 2 && this.profile.shadows) {
        this.profile.shadows = false;
        this.applyProfile();
      } else if (p.slowStreak >= 3 && this.profileKey !== 'low') {
        this.profileKey = this.profileKey === 'high' ? 'medium' : 'low';
        const keepDpr = this.dpr;
        this.profile = { ...PROFILES[this.profileKey] };
        this.dpr = Math.min(keepDpr, this.profile.dprMax);
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
