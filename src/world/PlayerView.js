// Représentation visuelle du joueur : personnage animé (AnimationMixer,
// fondus enchaînés + couches additives), hoverboard, jetpack, aimant en main,
// bulle de bouclier, baskets lumineuses, ombre portée simplifiée.
import * as THREE from 'three';
import { applyLook, createCharacter } from '../models/Character.js';
import { buildHoverboard } from '../models/Hoverboards.js';
import { jetpackModel, magnetModel, shieldBubbleMaterial } from '../models/Props.js';
import { fabricTexture, makeTexture, normalTexture } from '../models/textures.js';
import { Cape } from '../models/Cape.js';

const ONE_SHOT = new Set(['runStart', 'jump', 'land', 'roll', 'hit', 'death', 'leanLeft', 'leanRight', 'collect']);
const ADDITIVE = new Set(['leanLeft', 'leanRight', 'collect']);

export class PlayerView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Player';
    scene.add(this.group);
    this.body = new THREE.Group(); // pivot du personnage (face à -z)
    this.body.rotation.y = Math.PI;
    this.group.add(this.body);
    this.boardHolder = new THREE.Group();
    this.group.add(this.boardHolder);
    this.state = null;
    this.lock = 0;
    this.landTimer = 0;
    this.boardFade = 0;
    this.shieldFade = 0;
    this.time = 0;
    // ombre simplifiée
    const blobTex = makeTexture('blob', 64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { srgb: false });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 2;
    scene.add(this.blob);
    // bulle de bouclier
    this.shieldMat = shieldBubbleMaterial();
    this.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 3), this.shieldMat);
    this.shield.position.y = 0.95;
    this.shield.visible = false;
    this.group.add(this.shield);
    this.jetpack = jetpackModel();
    this.jetpack.visible = false;
    // flammes stylisées des tuyères (cône additif, cœur blanc -> orange)
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff3c0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const flameGeo = new THREE.ConeGeometry(0.075, 0.5, 12, 1, true);
    flameGeo.translate(0, -0.25, 0);
    flameGeo.rotateX(Math.PI);
    const coreGeo = new THREE.ConeGeometry(0.04, 0.28, 10, 1, true);
    coreGeo.translate(0, -0.14, 0);
    coreGeo.rotateX(Math.PI);
    this.flames = [];
    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(flameGeo, this.flameMat);
      f.add(new THREE.Mesh(coreGeo, this.flameCoreMat));
      f.position.set(sx * 0.13, -0.35, 0);
      f.rotation.x = Math.PI;
      this.jetpack.add(f);
      this.flames.push(f);
    }
    this.magnet = magnetModel();
    this.magnet.scale.setScalar(0.55);
    this.magnet.visible = false;
    // cape 3D (physique légère), attachée au torse dans setRig
    this.cape = new Cape();
    this.cape.mesh.visible = false;
    this.capeOn = false;
    this.prevX = 0;
    this.setRig(createCharacter());
  }

  // Installe un rig (personnage construit, GLB chargé ou modèle importé).
  setRig(rig) {
    if (this.rig) {
      this.mixer?.stopAllAction();
      this.body.remove(this.rig.root);
    }
    this.rig = rig;
    this.body.add(rig.root);
    rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.mixer = new THREE.AnimationMixer(rig.root);
    this.actions = {};
    for (const clip of rig.clips || []) {
      let c = clip;
      const additive = ADDITIVE.has(clip.name) || clip.userData?.additive;
      if (additive) c = THREE.AnimationUtils.makeClipAdditive(clip.clone());
      const a = this.mixer.clipAction(c, undefined, additive ? THREE.AdditiveAnimationBlendMode : THREE.NormalAnimationBlendMode);
      if (ONE_SHOT.has(clip.name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = clip.name !== 'leanLeft' && clip.name !== 'leanRight' && clip.name !== 'collect';
      }
      this.actions[clip.name] = a;
    }
    this.state = null;
    // accessoires attachés aux os
    const chest = rig.root.getObjectByName('chest');
    const hand = rig.root.getObjectByName('handR');
    this.jetpack.removeFromParent();
    this.magnet.removeFromParent();
    if (chest) {
      chest.add(this.jetpack);
      this.jetpack.position.set(0, 0.12, -0.24);
      this.jetpack.rotation.set(0.1, 0, 0);
    } else this.group.add(this.jetpack);
    if (hand) {
      hand.add(this.magnet);
      this.magnet.position.set(0, -0.12, 0.04);
      this.magnet.rotation.set(Math.PI, 0, 0);
      // taille réelle constante (~32 cm) quelle que soit l'échelle de l'os de la
      // main : sur le personnage livré, l'os est agrandi et l'aimant masquait le joueur
      rig.root.updateMatrixWorld(true);
      const ws = hand.getWorldScale(new THREE.Vector3()).x;
      this.magnet.scale.setScalar(0.42 / Math.max(0.05, ws));
    }
    // cape : sous la nuque, dans le dos (modèle importé : position estimée)
    this.cape.mesh.removeFromParent();
    if (chest) {
      chest.add(this.cape.mesh);
      this.cape.mesh.position.set(0, 0.2, -0.17);
    } else {
      rig.root.add(this.cape.mesh);
      this.cape.mesh.position.set(0, 1.42, -0.18);
    }
    this.customAnim = !rig.clips?.length;
    this.onRig?.();
    this.play('idle', 0);
  }

  setLook(look) {
    if (this.rig?.isCustom) return;
    this.materials = applyLook(this.rig.root, look);
    if (look.shirtTexture && this.materials.Shirt) {
      this.materials.Shirt.map = look.shirtTexture;
      this.materials.Shirt.color.set(0xffffff);
      this.materials.Shirt.needsUpdate = true;
    } else if (this.materials.Shirt && this.materials.Shirt.map !== this.fabric('knit')) {
      this.materials.Shirt.map = this.fabric('knit');
      this.materials.Shirt.needsUpdate = true;
    }
    this.enhanceMaterials();
  }

  setBoard(style, color, color2, customTexture = null) {
    if (this.board) {
      this.boardHolder.remove(this.board);
      this.board.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); for (const m of [].concat(o.material)) m.dispose(); } });
    }
    this.board = buildHoverboard(style, color, color2);
    this.board.rotation.y = Math.PI; // nez vers l'avant (-z)
    if (customTexture) {
      const top = this.board.userData.materials.top;
      top.map = customTexture;
      top.needsUpdate = true;
    }
    this.boardHolder.add(this.board);
    this.boardHolder.visible = false;
  }

  play(name, fade = 0.15) {
    const a = this.actions[name];
    if (!a || this.state === name) return;
    const prev = this.state ? this.actions[this.state] : null;
    a.reset();
    a.setEffectiveTimeScale(1);
    a.setEffectiveWeight(1);
    a.play();
    if (prev && fade > 0) a.crossFadeFrom(prev, fade, false);
    else if (prev) prev.stop();
    this.state = name;
  }

  overlay(name, weight = 1) {
    const a = this.actions[name];
    if (!a) return;
    a.reset();
    a.setEffectiveWeight(weight);
    a.play();
  }

  // Événements de la simulation -> animations.
  // Textures de tissu partagées (répétées pour un grain fin sur chaque pièce).
  fabric(kind) {
    const t = fabricTexture(kind);
    if (!t.userData.tiled) { t.repeat.set(kind === 'hair' ? 2 : 3, kind === 'hair' ? 1 : 3); t.userData.tiled = true; }
    return t;
  }

  // Matières crédibles : maille, jean, cuir, caoutchouc, peau satinée, cheveux.
  // Relief (cartes de normales) seulement hors qualité LOW.
  enhanceMaterials() {
    const M = this.materials || {};
    const relief = this.quality !== 'LOW';
    const set = (name, props, fabric, strength = 1.2, scale = 0.6) => {
      const m = M[name];
      if (!m) return;
      Object.assign(m, props);
      if (fabric && name !== 'Shirt') m.map = this.fabric(fabric);
      const nm = fabric && relief ? normalTexture(this.fabric(fabric), strength) : null;
      if (nm && !nm.userData.tiled) { nm.repeat.copy(this.fabric(fabric).repeat); nm.userData.tiled = true; }
      if (m.normalMap !== nm) { m.normalMap = nm; m.normalScale?.set(scale, scale); m.needsUpdate = true; }
    };
    set('Shirt', { roughness: 0.88, metalness: 0 }, 'knit', 1.6, 0.7);
    set('Pants', { roughness: 0.82, metalness: 0 }, 'denim', 1.4, 0.55);
    set('Shoes', { roughness: 0.42, metalness: 0.05 }, 'leather', 1, 0.35);
    set('Sole', { roughness: 0.92, metalness: 0 });
    set('Skin', { roughness: 0.62, metalness: 0 });
    set('Hair', { roughness: 0.4, metalness: 0.05 }, 'hair', 2, 0.5);
    set('Accessory', { roughness: 0.28, metalness: 0.2 });
    set('Accent', { roughness: 0.5, metalness: 0.1 });
  }

  setQuality(name) {
    if (this.quality === name) return;
    this.quality = name;
    this.enhanceMaterials();
  }

  onEvent(ev) {
    switch (ev.type) {
      case 'lane': this.overlay(ev.dir < 0 ? 'leanLeft' : 'leanRight'); break;
      case 'powerup': this.overlay('collect'); break;
      case 'roll': this.state = null; this.play('roll', 0.08); this.lock = 0.5; break;
      case 'jump': case 'superJump': this.lock = 0; this.play('jump', 0.08); break;
      case 'land': if (!ev.height || ev.hard) { this.landTimer = 0.22; } break;
      case 'stumble': this.state = null; this.play('hit', 0.06); this.lock = 0.45; this.stumbleT = 0; this.stumbleFrom = this.group.position.x; break;
      case 'vault': this.vaultT = 0; this.vaultFrom = this.group.position.y; this.lock = 0; this.play('jump', 0.06); break;
      case 'crash': this.play('death', 0.1); this.lock = 99; break;
      case 'hoverBreak': this.boardFade = 1; break;
      case 'shieldBreak': this.shieldFade = 1; break;
    }
  }

  // Choix de l'animation de base selon l'état de la simulation.
  chooseBase(sim, dt) {
    if (this.lock > 0) { this.lock -= dt; if (this.lock > 0) return; }
    if (!sim.alive) return this.play('death', 0.1);
    const jet = sim.jet === 'rise' || sim.jet === 'fly';
    if (jet) return this.play('jetpack', 0.3);
    if (sim.rollTime > 0) return this.play('roll', 0.08);
    if (!sim.onGround) return this.play(sim.vy > 0.5 ? 'jump' : 'fall', sim.vy > 0.5 ? 0.1 : 0.25);
    if (this.landTimer > 0) { this.landTimer -= dt; return this.play('land', 0.06); }
    if (sim.powerups.active('hoverboard')) return this.play('hoverboard', 0.2);
    if (sim.time < 0.45) return this.play('runStart', 0.1);
    return this.play(sim.v > 23 ? 'sprint' : 'run', 0.25);
  }

  setCape(on) {
    this.capeOn = on;
    this.cape.mesh.visible = on;
  }

  updateGame(dt, sim, ground) {
    this.time += dt;
    if (this.capeOn) {
      const lateral = dt > 0 ? (sim.x - this.prevX) / dt : 0;
      this.cape.update(dt, { speed: sim.alive ? sim.v : 0, vy: sim.vy, lateral, rolling: sim.rollTime > 0, airborne: !sim.onGround || sim.jet === 'fly' || sim.jet === 'rise' });
    }
    this.prevX = sim.x;
    const hover = sim.powerups.active('hoverboard');
    this.group.position.set(sim.x, sim.y, -sim.s);
    // trébuchement : le recul latéral est montré en douceur (plus de « téléportation »)
    if (this.stumbleT !== undefined && this.stumbleT < 0.18) {
      this.stumbleT += dt;
      const k = Math.min(1, this.stumbleT / 0.18);
      this.group.position.x = this.stumbleFrom + (sim.x - this.stumbleFrom) * (k * (2 - k));
    }
    // rebond sur un toit après un choc absorbé : montée lissée sur 0,22 s
    if (this.vaultT !== undefined && this.vaultT < 0.22) {
      this.vaultT += dt;
      const k = Math.min(1, this.vaultT / 0.22);
      const e = k * k * (3 - 2 * k);
      this.group.position.y = this.vaultFrom + (sim.y - this.vaultFrom) * e;
    }
    const dx = (sim.targetLane * 2.5 - sim.x);
    this.body.rotation.y = Math.PI - Math.max(-0.35, Math.min(0.35, dx * 0.12));
    this.chooseBase(sim, dt);
    const run = this.actions[this.state];
    if (run && (this.state === 'run' || this.state === 'sprint')) run.setEffectiveTimeScale(Math.max(0.85, Math.min(1.55, sim.v / 17)));
    // hoverboard
    const jetOn = sim.jet === 'rise' || sim.jet === 'fly';
    this.boardHolder.visible = (hover && !jetOn) || this.boardFade > 0;
    const lift = hover && !jetOn ? 0.2 : 0;
    this.body.position.y += (lift - this.body.position.y) * Math.min(1, dt * 12);
    if (this.board) {
      this.board.position.y = 0.05 + Math.sin(this.time * 6) * 0.03;
      this.board.rotation.z = Math.sin(this.time * 3) * 0.04 + dx * 0.05;
      const glow = this.board.userData.glowMaterial;
      if (glow) glow.emissiveIntensity = 2 + Math.sin(this.time * 10) * 0.6;
      // fin du hoverboard : clignote dans les 3 dernières secondes, puis s'efface
      const rem = sim.powerups.remaining('hoverboard');
      if (hover && rem < 3) this.board.visible = Math.floor(this.time * (rem < 1 ? 16 : 8)) % 2 === 0;
      else this.board.visible = true;
      if (this.boardFade > 0) {
        this.boardFade = Math.max(0, this.boardFade - dt * 2);
        this.board.scale.setScalar(1 + (1 - this.boardFade) * 0.6);
        this.board.position.y -= (1 - this.boardFade) * 0.6;
        this.board.rotation.x = (1 - this.boardFade) * 2.5;
      } else {
        this.board.scale.setScalar(1);
        this.board.rotation.x = 0;
      }
    }
    // jetpack, aimant, baskets, bouclier
    this.jetpack.visible = jetOn || (sim.jet === 'descend');
    if (this.jetpack.visible) {
      const thrust = jetOn ? 1 : 0.45;
      for (const [i, f] of this.flames.entries()) {
        const fl = thrust * (0.85 + Math.sin(this.time * 47 + i * 2.1) * 0.12 + Math.sin(this.time * 23 + i) * 0.08);
        f.scale.set(1, fl * 1.6, 1);
      }
    }
    this.magnet.visible = sim.powerups.active('magnet') && !jetOn;
    const sneak = sim.powerups.active('sneakers');
    if (this.materials?.Shoes) {
      this.materials.Shoes.emissive.set(sneak ? 0x2fe07a : 0x000000);
      this.materials.Shoes.emissiveIntensity = sneak ? 0.8 + Math.sin(this.time * 8) * 0.3 : 0;
    }
    const sh = sim.powerups.active('shield');
    if (sh) this.shieldFade = 0;
    this.shield.visible = sh || this.shieldFade > 0;
    if (this.shield.visible) {
      const rem = sim.powerups.remaining('shield');
      this.shieldMat.uniforms.uTime.value = this.time;
      let fade = sh ? (rem < 2 ? 0.5 + 0.5 * Math.sin(this.time * 20) : 1) : this.shieldFade;
      if (!sh) {
        this.shieldFade = Math.max(0, this.shieldFade - dt * 2.5);
        this.shield.scale.setScalar(1 + (1 - this.shieldFade) * 0.5);
      } else this.shield.scale.setScalar(1 + Math.sin(this.time * 4) * 0.03);
      this.shieldMat.uniforms.uFade.value = fade;
      this.shield.position.y = sim.rollTime > 0 ? 0.6 : 0.95;
    }
    // clignotement d'invulnérabilité
    this.body.visible = sim.invuln > 0 && sim.alive ? Math.floor(this.time * 14) % 2 === 0 : true;
    // ombre simplifiée
    this.blob.position.set(sim.x, ground + 0.03, -sim.s);
    const h = Math.max(0, sim.y - ground);
    this.blob.scale.setScalar(Math.max(0.35, 1 - h * 0.15));
    this.blob.material.opacity = Math.max(0.15, 1 - h * 0.2);
    if (this.customAnim) this.proceduralBob(sim);
    this.mixer.update(dt);
  }

  proceduralBob(sim) {
    const root = this.rig.root;
    root.position.y = sim.onGround ? Math.abs(Math.sin(this.time * 10)) * 0.08 : 0;
    root.rotation.x = sim.rollTime > 0 ? -(1 - sim.rollTime / 0.56) * Math.PI * 2 : 0;
  }

  // Menu / studio : personnage seul.
  updateMenu(dt, anim = 'menu') {
    this.time += dt;
    if (this.capeOn) this.cape.update(dt, { speed: anim === 'hoverboard' ? 8 : 0, menu: anim !== 'hoverboard' });
    this.boardHolder.visible = anim === 'hoverboard';
    if (this.board) this.board.position.y = 0.05 + Math.sin(this.time * 3) * 0.04;
    this.body.position.y = anim === 'hoverboard' ? 0.2 : 0;
    this.jetpack.visible = false;
    this.magnet.visible = false;
    this.shield.visible = false;
    this.body.visible = true;
    this.lock = 0;
    this.play(anim, 0.3);
    if (this.customAnim) {
      this.rig.root.rotation.x = 0;
      this.rig.root.position.y = Math.abs(Math.sin(this.time * 3)) * 0.05;
    }
    this.blob.position.set(this.group.position.x, this.group.position.y + 0.03, this.group.position.z);
    this.blob.scale.setScalar(1);
    this.mixer.update(dt);
  }

  reset() {
    this.mixer.stopAllAction();
    this.state = null;
    this.lock = 0;
    this.landTimer = 0;
    this.boardFade = 0;
    this.shieldFade = 0;
    this.vaultT = undefined;
    this.stumbleT = undefined;
    this.body.position.y = 0;
    this.body.visible = true;
  }

  // Positions monde utiles aux particules.
  worldOf(name, out) {
    const o = name === 'jet' ? this.jetpack : this.rig.root.getObjectByName(name);
    return o ? o.getWorldPosition(out) : out.copy(this.group.position);
  }
}
