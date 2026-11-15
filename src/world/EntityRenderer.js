// Rendu des entités de la simulation : trains (pool + LOD), obstacles,
// rampes, bonus (pool) et pièces (InstancedMesh unique).
import * as THREE from 'three';
import { laneX } from '../gameplay/constants.js';
import { trainFront } from '../gameplay/obstacles.js';
import { TrainFactory } from '../models/Trains.js';
import { barrierHighModel, barrierLowModel, coinGeometry, coinGlowMaterial, powerupModel, rampModel, sharedMaterials } from '../models/Props.js';
import { makeTexture } from '../models/textures.js';

const COIN_CAP = 700;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

class ObjectPool {
  constructor(factory) {
    this.factory = factory;
    this.free = [];
    this.template = null;
  }
  acquire() {
    if (this.free.length) return this.free.pop();
    if (!this.template) this.template = this.factory();
    return this.template.clone();
  }
  release(o) {
    o.visible = false;
    o.parent?.remove(o);
    this.free.push(o);
  }
}

export class EntityRenderer {
  constructor(scene, map, profile, custom = {}) {
    this.scene = scene;
    this.map = map;
    this.profile = profile;
    this.group = new THREE.Group();
    this.group.name = 'Entities';
    scene.add(this.group);
    this.trains = new TrainFactory();
    this.custom = custom;
    this.visuals = new Map();
    this.flares = [];
    this.frame = 0;
    const theme = map.theme;
    this.pools = {
      barrier_low: new ObjectPool(() => barrierLowModel(theme)),
      barrier_high: new ObjectPool(() => barrierHighModel(theme)),
      ramp: new ObjectPool(() => rampModel()),
    };
    for (const t of ['magnet', 'jetpack', 'sneakers', 'shield', 'multiplier']) {
      this.pools[`powerup_${t}`] = new ObjectPool(() => this.powerupVisual(t));
    }
    // pièces
    const coin = coinGeometry();
    this.coinMaterial = coin.material;
    this.coins = new THREE.InstancedMesh(coin.geometry, coin.material, COIN_CAP);
    this.coins.name = 'Coins';
    this.coins.frustumCulled = false;
    this.coins.castShadow = profile.shadows;
    this.coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < COIN_CAP; i++) this.coins.setMatrixAt(i, ZERO);
    this.group.add(this.coins);
    this.coinFree = [];
    for (let i = COIN_CAP - 1; i >= 0; i--) this.coinFree.push(i);
    this.coins.count = 0;
    this.coinFaces = null;
    // halo coloré autour des pièces (même matrices que les pièces)
    this.coinGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), coinGlowMaterial(), COIN_CAP);
    this.coinGlow.instanceMatrix = this.coins.instanceMatrix;
    this.coinGlow.frustumCulled = false;
    this.coinGlow.renderOrder = 4;
    this.coinGlow.count = 0;
    this.coinGlow.visible = false;
    this.group.add(this.coinGlow);
    this.applyCustom(custom);
  }

  // Personnalisations du studio : teinte des pièces, image de pièce, livrée de train.
  applyCustom(custom = {}) {
    this.custom = custom;
    if (custom.coinTint) this.coinMaterial.color.set(custom.coinTint);
    else this.coinMaterial.color.set(0xffc23a);
    // lueur : halo + reflet lumineux de la couleur choisie
    const glow = custom.coinGlow;
    const on = !!(glow && glow.enabled);
    this.coinGlow.visible = on;
    if (on) {
      this.coinGlow.material.uniforms.uColor.value.set(glow.color);
      this.coinGlow.material.uniforms.uIntensity.value = glow.intensity;
      this.coinMaterial.emissive.set(glow.color);
      this.coinMaterial.emissiveIntensity = 0.05 + glow.intensity * 0.3;
    } else {
      this.coinMaterial.emissive.set(0x3a2200);
      this.coinMaterial.emissiveIntensity = 0.25;
    }
    if (this.coinFaces) {
      this.group.remove(this.coinFaces);
      this.coinFaces.geometry.dispose();
      this.coinFaces.material.dispose();
      this.coinFaces = null;
    }
    // pièce sans symbole gravé quand une image recouvre la face
    if (!this.coinGeos) this.coinGeos = { symbol: this.coins.geometry, plain: null };
    if (custom.coinTexture) {
      if (!this.coinGeos.plain) this.coinGeos.plain = coinGeometry({ symbol: false }).geometry;
      this.coins.geometry = this.coinGeos.plain;
    } else this.coins.geometry = this.coinGeos.symbol;
    // pièces un peu plus grandes avec une photo, pour bien la voir (visuel seulement)
    this.coinScale = custom.coinTexture ? 1.3 : 1;
    if (custom.coinTexture) {
      // la photo couvre toute la face (seul un fin liseré doré reste visible)
      const g = new THREE.CircleGeometry(0.375, 48);
      const back = new THREE.CircleGeometry(0.375, 48);
      back.rotateY(Math.PI);
      back.translate(0, 0, -0.062);
      g.translate(0, 0, 0.062);
      const merged = new THREE.BufferGeometry();
      // fusion manuelle simple (deux disques)
      const pos = [...g.attributes.position.array, ...back.attributes.position.array];
      const nor = [...g.attributes.normal.array, ...back.attributes.normal.array];
      const uv = [...g.attributes.uv.array, ...back.attributes.uv.array];
      const idx = [...g.index.array, ...back.index.array.map((i) => i + g.attributes.position.count)];
      merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      merged.setIndex(idx);
      g.dispose(); back.dispose();
      this.coinFaces = new THREE.InstancedMesh(merged, new THREE.MeshStandardMaterial({ map: custom.coinTexture, emissive: 0xffffff, emissiveMap: custom.coinTexture, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.05, alphaTest: 0.4, side: THREE.DoubleSide }), COIN_CAP);
      this.coinFaces.instanceMatrix = this.coins.instanceMatrix; // mêmes matrices que les pièces
      this.coinFaces.frustumCulled = false;
      this.group.add(this.coinFaces);
    }
    // les livrées personnalisées imposent de reconstruire les modèles de trains
    this.trains.dispose();
    this.trains = new TrainFactory();
    for (const [id, v] of this.visuals) if (v.kind === 'train') { v.obj.parent?.remove(v.obj); this.visuals.delete(id); }
  }

  makeFlare() {
    const tex = makeTexture('headFlare', 128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.2, 'rgba(255,240,200,0.85)');
      g.addColorStop(0.55, 'rgba(255,210,140,0.25)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { srgb: false });
    const g = new THREE.Group();
    g.name = 'headlightFlare';
    for (const sx of [-1, 1]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff1d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.position.set(sx * 0.72, 1.05, 0.35);
      sp.scale.setScalar(1.8);
      g.add(sp);
    }
    return g;
  }

  powerupVisual(type) {
    const g = new THREE.Group();
    const model = powerupModel(type);
    model.name = 'model';
    model.scale.setScalar(type === 'jetpack' ? 1.2 : 1.35);
    g.add(model);
    const ringTex = makeTexture('pickupRing', 128, 128, (ctx, w, h) => {
      const gr = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
    }, { srgb: false });
    const colors = { magnet: 0xff4d5e, jetpack: 0xffd23a, sneakers: 0x2fe07a, shield: 0x3aa8ff, multiplier: 0xb07aff };
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: ringTex, color: colors[type], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.85;
    ring.name = 'ring';
    g.add(ring);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: colors[type], transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(1.7);
    halo.name = 'halo';
    g.add(halo);
    g.traverse((o) => { if (o.isMesh && o.name !== 'ring') o.castShadow = true; });
    return g;
  }

  liveryFor(e) {
    const list = this.map.trains.liveries[e.variant] || this.map.trains.liveries.urban || Object.values(this.map.trains.liveries)[0];
    const idx = e.id % list.length;
    let livery = list[idx];
    if (this.custom.trainLivery && this.custom.trainLivery.enabled) {
      livery = { ...livery, body: this.custom.trainLivery.body, stripe: this.custom.trainLivery.stripe, accent: this.custom.trainLivery.accent, customTexture: this.custom.trainTexture || undefined };
      return { livery, index: `custom${idx}:${livery.body}:${livery.stripe}:${livery.accent}:${this.custom.trainTexture?.uuid || ''}` };
    }
    return { livery, index: `${this.map.id}${idx}` };
  }

  acquire(e) {
    if (e.kind === 'train') {
      const style = ['urban', 'modern', 'freight'].includes(e.variant) ? e.variant : 'urban';
      const { livery, index } = this.liveryFor({ ...e, variant: style });
      const obj = this.trains.acquire(style, livery, index, e.cars || 1);
      if (obj.isLOD) obj.levels[1].distance = this.profile.lod;
      // phares éblouissants sur les trains qui arrivent en face (lisibles de loin)
      let flare = null;
      if (e.moving) {
        flare = this.flares.pop() || this.makeFlare();
        flare.visible = true;
        obj.add(flare);
      }
      return { kind: 'train', obj, flare, release: () => {
        if (flare) { obj.remove(flare); this.flares.push(flare); }
        this.trains.release(obj);
      } };
    }
    let key = null;
    if (e.kind === 'barrier') key = `barrier_${e.type}`;
    else if (e.kind === 'ramp') key = 'ramp';
    else if (e.kind === 'powerup') key = `powerup_${e.type}`;
    if (!key) return null;
    const pool = this.pools[key];
    const obj = pool.acquire();
    obj.traverse((o) => { if (o.isMesh) o.castShadow = this.profile.shadows; });
    return { kind: e.kind, obj, release: () => pool.release(obj) };
  }

  update(dt, sim, time) {
    this.frame++;
    this.coinGlow.material.uniforms.uTime.value = time;
    const s = sim.s;
    const far = s + this.profile.drawDistance;
    const near = s - 18;
    let coinsDirty = false;
    const entities = sim.entities;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e.kind === 'coin') {
        coinsDirty = this.updateCoin(e, sim, time, near, far) || coinsDirty;
        continue;
      }
      let s0;
      let s1;
      if (e.kind === 'train') {
        s0 = trainFront(e, s);
        s1 = s0 + e.length;
      } else if (e.kind === 'ramp') {
        s0 = e.s;
        s1 = e.s + e.length;
      } else {
        s0 = s1 = e.s;
      }
      const inView = s1 > near && s0 < far && !(e.kind === 'powerup' && e.collected && sim.time - e.collectedAt > 0.4);
      let v = this.visuals.get(e.id);
      if (!inView) {
        if (v) { v.release(); this.visuals.delete(e.id); }
        continue;
      }
      if (!v) {
        v = this.acquire(e);
        if (!v) continue;
        this.visuals.set(e.id, v);
        v.obj.visible = true;
        this.group.add(v.obj);
      }
      v.stamp = this.frame;
      const o = v.obj;
      if (e.kind === 'train') {
        o.position.set(laneX(e.lane), 0, -s0);
        if (v.flare) {
          // pulsation + grossissement avec la distance pour rester visible
          const d = Math.max(0, s0 - s);
          const k = (1.4 + Math.min(2.2, d / 40)) * (0.85 + 0.15 * Math.sin(time * 9 + e.id));
          for (const sp of v.flare.children) sp.scale.setScalar(k);
        }
      }
      else if (e.kind === 'powerup') {
        const bob = Math.sin(time * 3 + e.id) * 0.12;
        o.position.set(laneX(e.lane), e.y + 0.1 + bob, -e.s);
        const model = o.getObjectByName('model');
        model.rotation.y = time * 2.2;
        const ring = o.getObjectByName('ring');
        ring.position.y = -e.y + 0.05 - bob - 0.1 + (e.y > 2 ? 3.0 : 0);
        ring.scale.setScalar(1 + Math.sin(time * 4) * 0.08);
        if (e.collected) {
          const k = Math.min(1, (sim.time - e.collectedAt) / 0.35);
          o.scale.setScalar(1 + k * 0.8);
          o.position.y += k * 1.5;
          o.visible = k < 1;
        } else o.scale.setScalar(1);
      } else o.position.set(laneX(e.lane), 0, -e.s);
      if (e.ghost && e.kind !== 'train') o.visible = Math.floor(time * 12) % 2 === 0;
    }
    // libère les visuels d'entités supprimées par la simulation
    for (const [id, v] of this.visuals) {
      if (v.stamp !== this.frame && v.kind !== 'coin') { v.release(); this.visuals.delete(id); }
    }
    // pièces : libération des index d'entités disparues
    if (this._coinIds) {
      for (const [id, rec] of this._coinIds) {
        if (rec.stamp !== this.frame) {
          this.coins.setMatrixAt(rec.index, ZERO);
          this.coinFree.push(rec.index);
          this._coinIds.delete(id);
          coinsDirty = true;
        }
      }
    }
    if (coinsDirty) {
      // ne traite que les instances réellement utilisées (index les plus bas)
      let max = -1;
      if (this._coinIds) for (const rec of this._coinIds.values()) if (rec.index > max) max = rec.index;
      this.coins.count = max + 1;
      if (this.coinFaces) this.coinFaces.count = max + 1;
      this.coinGlow.count = max + 1;
      this.coins.instanceMatrix.needsUpdate = true;
    }
  }

  updateCoin(e, sim, time, near, far) {
    this._coinIds = this._coinIds || new Map();
    let rec = this._coinIds.get(e.id);
    const s = e.as ?? e.s;
    const visible = s > near && s < far && !(e.collected && sim.time - e.collectedAt > 0.3);
    if (!visible) {
      if (rec) {
        this.coins.setMatrixAt(rec.index, ZERO);
        this.coinFree.push(rec.index);
        this._coinIds.delete(e.id);
        return true;
      }
      return false;
    }
    if (!rec) {
      if (!this.coinFree.length) return false;
      let bi = this.coinFree.length - 1;
      for (let k = this.coinFree.length - 1, n = 0; k >= 0 && n < 64; k--, n++) if (this.coinFree[k] < this.coinFree[bi]) bi = k;
      const index = this.coinFree[bi];
      this.coinFree[bi] = this.coinFree[this.coinFree.length - 1];
      this.coinFree.pop();
      rec = { index };
      this._coinIds.set(e.id, rec);
    }
    rec.stamp = this.frame;
    let x = e.ax ?? laneX(e.lane);
    let y = e.ay ?? e.y;
    let zs = s;
    let sc = this.coinScale || 1;
    let spin = time * 3.2 + (e.id % 7) * 0.4;
    if (e.collected) {
      // animation de collecte : la pièce file vers le haut en rétrécissant
      const k = Math.min(1, (sim.time - e.collectedAt) / 0.3);
      x += (sim.x - x) * k;
      zs += (sim.s + 0.4 - zs) * k; // la pièce accompagne le joueur
      y += (sim.y + 1.6 - y) * k;
      sc = (this.coinScale || 1) * (1 - k * 0.9);
      spin += k * 10;
    }
    _e.set(0, spin, 0);
    _m.compose(_p.set(x, y, -zs), _q.setFromEuler(_e), _s.set(sc, sc, sc));
    this.coins.setMatrixAt(rec.index, _m);
    return true;
  }

  setProfile(profile) {
    this.profile = profile;
    this.coins.castShadow = profile.shadows;
  }

  clear() {
    for (const v of this.visuals.values()) v.release();
    this.visuals.clear();
    if (this._coinIds) {
      for (const rec of this._coinIds.values()) {
        this.coins.setMatrixAt(rec.index, ZERO);
        this.coinFree.push(rec.index);
      }
      this._coinIds.clear();
    }
    this.coins.count = 0;
    this.coinGlow.count = 0;
    this.coinFree.sort((a, b) => b - a);
    this.coins.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
    this.trains.dispose();
    // libère tout ce qui appartient à ce rendu (les matériaux partagés et les
    // textures en cache sont conservés pour les cartes suivantes)
    const geos = new Set();
    const mats = new Set();
    const collect = (root) => root?.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      for (const m of [].concat(o.material || [])) if (!sharedMaterials.has(m)) mats.add(m);
    });
    collect(this.group);
    for (const pool of Object.values(this.pools)) { collect(pool.template); pool.free.forEach(collect); }
    for (const f of this.flares) collect(f);
    if (this.coinGeos?.plain) geos.add(this.coinGeos.plain);
    if (this.coinGeos?.symbol) geos.add(this.coinGeos.symbol);
    for (const g of geos) g.dispose();
    for (const m of mats) if (!m.map || !m.map.name?.includes(':')) m.dispose();
    this.coins.dispose();
    this.coinGlow.dispose();
    this.coinFaces?.dispose();
  }
}
