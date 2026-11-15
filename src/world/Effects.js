// Effets visuels de course, dosés selon le profil de qualité :
// - lignes de vitesse (grande vitesse, jetpack) : un seul LineSegments ;
// - champ de l'aimant : anneaux additifs qui s'élargissent autour du joueur ;
// - onde de choc à l'atterrissage ;
// - halo lumineux sous le hoverboard.
// Aucune allocation par image : tampons et objets créés une fois.
import * as THREE from 'three';
import { makeTexture } from '../models/textures.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

function haloTexture() {
  return makeTexture('fxHalo', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: false });
}

function ringTexture() {
  return makeTexture('fxRing', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: false });
}

const additive = (params) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...params });

export class RunEffects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'RunEffects';
    scene.add(this.group);
    this.level = 2; // 0 = LOW, 1 = MEDIUM, 2 = HIGH
    // --- lignes de vitesse
    this.lineCount = 48;
    this.lines = new Float32Array(this.lineCount * 4); // x, y, z (profondeur), longueur — repère caméra
    const pos = new Float32Array(this.lineCount * 6);
    const geo = new THREE.BufferGeometry();
    this.linePos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.linePos);
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.speedLines = new THREE.LineSegments(geo, this.lineMat);
    this.speedLines.frustumCulled = false;
    this.speedLines.renderOrder = 5;
    this.group.add(this.speedLines);
    for (let i = 0; i < this.lineCount; i++) this.respawnLine(i, Math.random() * 30);
    this.speedK = 0;
    // --- aimant : 3 anneaux décalés dans le temps
    const ringGeo = new THREE.PlaneGeometry(1, 1);
    ringGeo.rotateX(-Math.PI / 2);
    this.magnetRings = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(ringGeo, additive({ map: ringTexture(), color: i % 2 ? 0xff4f6d : 0x5fd8ff, opacity: 0 }));
      m.visible = false;
      this.group.add(m);
      this.magnetRings.push(m);
    }
    this.magnetT = 0;
    // --- onde de choc à l'atterrissage
    this.shock = new THREE.Mesh(ringGeo, additive({ map: ringTexture(), color: 0xffffff, opacity: 0 }));
    this.shock.visible = false;
    this.shockT = 1;
    this.group.add(this.shock);
    // --- halo sous le hoverboard
    this.halo = new THREE.Mesh(ringGeo, additive({ map: haloTexture(), color: 0x65d9ff, opacity: 0 }));
    this.halo.visible = false;
    this.group.add(this.halo);
  }

  setProfile(profile) {
    this.level = profile.name === 'LOW' ? 0 : profile.name === 'MEDIUM' ? 1 : 2;
  }

  respawnLine(i, depth) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.2 + Math.random() * 4.5;
    const o = i * 4;
    this.lines[o] = Math.cos(a) * r;
    this.lines[o + 1] = Math.sin(a) * r * 0.75;
    this.lines[o + 2] = depth;
    this.lines[o + 3] = 1.5 + Math.random() * 3;
  }

  // Onde de choc au sol (atterrissage lourd, rebond sur un toit).
  landing(pos, strength = 1) {
    if (this.level === 0) return;
    this.shock.position.set(pos.x, pos.y + 0.04, pos.z);
    this.shockT = 0;
    this.shockStrength = strength;
    this.shock.visible = true;
  }

  update(dt, sim, playerPos, camera, boardColor) {
    // ---- lignes de vitesse
    const jet = sim && (sim.jet === 'rise' || sim.jet === 'fly');
    const target = !sim || !sim.alive || this.level === 0 ? 0 : Math.max(jet ? 0.8 : 0, Math.min(1, (sim.v - 24) / 10));
    this.speedK += (target - this.speedK) * Math.min(1, dt * 3);
    const show = this.speedK > 0.02;
    this.speedLines.visible = show;
    if (show) {
      camera.getWorldDirection(_fwd);
      _right.crossVectors(_fwd, camera.up).normalize();
      _up.crossVectors(_right, _fwd).normalize();
      const speed = (sim.v + (jet ? 10 : 0)) * 1.4;
      const n = this.level === 1 ? this.lineCount / 2 : this.lineCount;
      const p = this.linePos.array;
      const c = camera.position;
      for (let i = 0; i < this.lineCount; i++) {
        const o = i * 4;
        this.lines[o + 2] -= speed * dt;
        if (this.lines[o + 2] < 1) this.respawnLine(i, 26 + Math.random() * 6);
        const k = i * 6;
        if (i >= n) { p.fill(0, k, k + 6); continue; }
        const x = this.lines[o], y = this.lines[o + 1], d = this.lines[o + 2], len = this.lines[o + 3] * (0.5 + this.speedK);
        for (let e = 0; e < 2; e++) {
          const dd = d + e * len;
          p[k + e * 3] = c.x + _fwd.x * dd + _right.x * x + _up.x * y;
          p[k + e * 3 + 1] = c.y + _fwd.y * dd + _right.y * x + _up.y * y;
          p[k + e * 3 + 2] = c.z + _fwd.z * dd + _right.z * x + _up.z * y;
        }
      }
      this.linePos.needsUpdate = true;
      this.lineMat.opacity = this.speedK * (jet ? 0.5 : 0.35);
    }
    // ---- aimant
    const magnet = sim && sim.alive && sim.powerups.active('magnet') && this.level > 0;
    this.magnetT += dt;
    for (let i = 0; i < this.magnetRings.length; i++) {
      const m = this.magnetRings[i];
      m.visible = magnet;
      if (!magnet) continue;
      const ph = (this.magnetT * 0.9 + i / this.magnetRings.length) % 1;
      const s = 1.2 + ph * 5.5;
      m.scale.set(s, 1, s);
      m.position.set(playerPos.x, playerPos.y + 0.9 + Math.sin(ph * Math.PI) * 0.25, playerPos.z);
      m.material.opacity = Math.sin(ph * Math.PI) * 0.55;
    }
    // ---- onde de choc
    if (this.shock.visible) {
      this.shockT += dt / 0.45;
      if (this.shockT >= 1) this.shock.visible = false;
      else {
        const s = 0.6 + this.shockT * 3.2 * (this.shockStrength || 1);
        this.shock.scale.set(s, 1, s);
        this.shock.material.opacity = (1 - this.shockT) * 0.7;
      }
    }
    // ---- halo du hoverboard
    const board = sim && sim.alive && sim.powerups.active('hoverboard') && !jet;
    this.halo.visible = board;
    if (board) {
      if (boardColor) this.halo.material.color.set(boardColor);
      const pulse = 0.85 + Math.sin(this.magnetT * 10) * 0.15;
      this.halo.position.set(playerPos.x, Math.max(0.02, playerPos.y - 0.02 + 0.03), playerPos.z);
      this.halo.scale.set(1.9 * pulse, 1, 2.6 * pulse);
      this.halo.material.opacity = 0.55;
    }
  }

  hide() {
    this.speedK = 0;
    this.speedLines.visible = false;
    for (const m of this.magnetRings) m.visible = false;
    this.shock.visible = false;
    this.halo.visible = false;
  }

  dispose() {
    this.scene.remove(this.group);
    this.speedLines.geometry.dispose();
    this.lineMat.dispose();
    this.shock.geometry.dispose();
    for (const m of [...this.magnetRings, this.shock, this.halo]) m.material.dispose();
  }
}
