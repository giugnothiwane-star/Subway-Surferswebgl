// Environnement d'une carte : ciel, lumières, brouillard, sol, voie ferrée
// infinie, décor instancié par tronçons recyclés, zones (tunnels, ponts,
// gares), eau et effets d'ambiance. Tout est reconstruit au changement de carte.
import * as THREE from 'three';
import { RNG, hashSeed } from '../gameplay/rng.js';
import { LANE_WIDTH } from '../gameplay/constants.js';
import * as P from '../models/Props.js';
import { PartBuilder, RoundedBoxGeometry } from '../models/geo.js';
import { groundTexture, makeTexture, normalTexture, roofTexture, windowEmissiveTexture, windowTexture } from '../models/textures.js';
import { AmbientParticles } from './Particles.js';

const CHUNK = 40;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// UV en coordonnées monde (sols infinis sans couture).
function worldUV(material, tile) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vec4 wUv = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        wUv = instanceMatrix * wUv;
      #endif
      wUv = modelMatrix * wUv;
      #ifdef USE_MAP
        vMapUv = wUv.xz / ${tile.toFixed(2)};
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = wUv.xz / ${tile.toFixed(2)};
      #endif`);
  };
  material.customProgramCacheKey = () => `worldUV${tile}`;
  return material;
}

// UV mises à l'échelle de chaque instance (fenêtres régulières quelle que soit la taille).
function instanceScaledUV(material, tile) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 iS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec2 sc = vec2(abs(normal.x) > 0.5 ? iS.z : iS.x, iS.y) / ${tile.toFixed(2)};
        #ifdef USE_MAP
          vMapUv = uv * sc;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = uv * sc;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = uv * sc;
        #endif
      #endif`);
  };
  material.customProgramCacheKey = () => `instUV${tile}`;
  return material;
}

function skyMaterial(sky) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(sky.top) },
      uHorizon: { value: new THREE.Color(sky.horizon) },
      uBottom: { value: new THREE.Color(sky.bottom) },
      uSunDir: { value: new THREE.Vector3(...sky.sunDir).normalize() },
      uSunColor: { value: new THREE.Color(sky.sunColor) },
      uSunSize: { value: sky.sunSize },
      uStars: { value: sky.stars || 0 },
      uClouds: { value: sky.clouds || 0 },
      uTime: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunDir; uniform vec3 uSunColor;
      uniform float uSunSize; uniform float uStars; uniform float uClouds; uniform float uTime; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h,0.0,1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-h,0.0,1.0), 0.4));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (smoothstep(1.0 - uSunSize * 0.12, 1.0 - uSunSize * 0.08, sd) * 1.5 + pow(sd, 18.0) * 0.35 + pow(sd, 4.0) * 0.12);
        if (uStars > 0.0 && h > 0.0) {
          vec2 g = floor(d.xz / (h + 0.35) * 160.0);
          float st = step(0.997, hash(g)) * (0.6 + 0.4 * sin(uTime * 2.0 + hash(g + 3.0) * 30.0));
          col += vec3(st) * uStars * smoothstep(0.05, 0.35, h);
        }
        if (uClouds > 0.0 && h > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, 0.0);
          float n = noise(uv) * 0.6 + noise(uv * 2.3) * 0.3 + noise(uv * 5.1) * 0.1;
          float c = smoothstep(0.52, 0.78, n) * uClouds * smoothstep(0.02, 0.25, h);
          col = mix(col, mix(vec3(1.0), uHorizon, 0.25), c * 0.75);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

class DecorPool {
  constructor(key, geometry, materials, perSlot, slots, { castShadow = false } = {}) {
    this.key = key;
    this.perSlot = perSlot;
    this.mesh = new THREE.InstancedMesh(geometry, materials.length === 1 ? materials[0] : materials, Math.max(1, perSlot * slots));
    this.mesh.name = `Decor_${key}`;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.mesh.count; i++) this.mesh.setMatrixAt(i, ZERO);
    this.cursor = new Int32Array(slots);
    this.hasColor = false;
  }
  begin(slot) {
    this.cursor[slot] = 0;
  }
  place(slot, pos, rotY, scale, color) {
    if (this.cursor[slot] >= this.perSlot) return false;
    const idx = slot * this.perSlot + this.cursor[slot]++;
    _e.set(0, rotY, 0);
    _q.setFromEuler(_e);
    _s.set(...(Array.isArray(scale) ? scale : [scale, scale, scale]));
    _m.compose(_p.set(...pos), _q, _s);
    this.mesh.setMatrixAt(idx, _m);
    if (color !== undefined) {
      this.mesh.setColorAt(idx, _c.set(color));
      this.hasColor = true;
    }
    return true;
  }
  end(slot) {
    for (let i = this.cursor[slot]; i < this.perSlot; i++) this.mesh.setMatrixAt(slot * this.perSlot + i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.hasColor && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Environment {
  constructor(scene, renderer, map, profile) {
    this.scene = scene;
    this.renderer = renderer;
    this.map = map;
    this.profile = profile;
    this.group = new THREE.Group();
    this.group.name = `Env_${map.id}`;
    scene.add(this.group);
    this.disposables = [];
    this.time = 0;
    this.zones = [];
    this.slots = Math.ceil((profile.drawDistance + 60) / CHUNK) + 1;
    this.slotChunk = new Int32Array(this.slots).fill(-9999);
    this.buildSky();
    this.buildLights();
    this.buildTrack();
    this.buildGround();
    this.buildDecorPools();
    this.buildZonePools();
    const pCount = Math.round(1400 * profile.particles);
    this.ambient = map.ambience.particles !== 'none' ? new AmbientParticles(map.ambience.particles, pCount) : null;
    if (this.ambient) this.group.add(this.ambient.object);
    scene.fog = new THREE.Fog(map.fog.color, map.fog.near, Math.min(map.fog.far, profile.drawDistance));
    scene.background = new THREE.Color(map.fog.color);
    scene.environment = renderer.environment();
    scene.environmentIntensity = map.id === 'neon' ? 0.6 : 0.9;
    renderer.renderer.toneMappingExposure = map.lights.exposure;
  }

  track(o) {
    this.disposables.push(o);
    return o;
  }

  // ---- ciel & lumières -------------------------------------------------------
  buildSky() {
    this.skyMat = this.track(skyMaterial(this.map.sky));
    this.sky = new THREE.Mesh(this.track(new THREE.SphereGeometry(500, 32, 16)), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.group.add(this.sky);
  }

  buildLights() {
    const L = this.map.lights;
    this.hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemi);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(L.sun, L.sunIntensity);
    this.sunDir = new THREE.Vector3(...L.sunDir).normalize();
    this.sun.castShadow = this.profile.shadows;
    const sc = this.sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 30; sc.bottom = -16; sc.near = 1; sc.far = 90;
    this.sun.shadow.mapSize.set(this.profile.shadowSize || 512, this.profile.shadowSize || 512);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.group.add(this.sun, this.sun.target);
  }

  setProfile(profile) {
    this.profile = profile;
    this.sun.castShadow = profile.shadows;
    if (profile.shadowSize && this.sun.shadow.mapSize.x !== profile.shadowSize) {
      this.sun.shadow.mapSize.set(profile.shadowSize, profile.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (this.scene.fog) this.scene.fog.far = Math.min(this.map.fog.far, profile.drawDistance);
  }

  // Studio : réglages d'éclairage personnalisés.
  setLighting({ exposure = 1, sun = 1, hemi = 1 } = {}) {
    const L = this.map.lights;
    this.renderer.renderer.toneMappingExposure = L.exposure * exposure;
    this.sun.intensity = L.sunIntensity * sun;
    this.hemi.intensity = L.hemi * hemi;
  }

  // Relief (carte de normales) dérivé de la texture couleur ; ignoré en LOW pour
  // épargner les petits GPU.
  relief(map, strength, scale) {
    if (this.profile?.name === 'LOW') return {};
    return { normalMap: normalTexture(map, strength), normalScale: new THREE.Vector2(scale, scale) };
  }

  // ---- voie ferrée ---------------------------------------------------------------
  buildTrack() {
    const m = this.map;
    const bedMap = groundTexture(m.bed.type, m.bed.color);
    const bedMat = this.track(worldUV(new THREE.MeshStandardMaterial({ map: bedMap, roughness: 0.95, ...this.relief(bedMap, 3, 1.1) }), 3));
    this.bed = new THREE.Mesh(this.track(new THREE.BoxGeometry(8.6, 0.3, 700)), bedMat);
    this.bed.position.y = -0.29;
    this.bed.receiveShadow = true;
    this.group.add(this.bed);
    // rails (uniformes le long de z : il suffit de suivre le joueur)
    const railMat = this.track(new THREE.MeshStandardMaterial({ color: m.rail, metalness: 0.9, roughness: 0.25 }));
    const pb = new PartBuilder();
    const railGeo = new THREE.BoxGeometry(0.09, 0.14, 700);
    for (const lane of [-1, 0, 1]) {
      for (const o of [-0.72, 0.72]) {
        pb.add(railGeo, railMat, { position: [lane * LANE_WIDTH + o, -0.04, 0] });
        pb.add(new THREE.BoxGeometry(0.2, 0.03, 700), railMat, { position: [lane * LANE_WIDTH + o, -0.1, 0] });
      }
    }
    this.rails = pb.build('Rails', { castShadow: false, receiveShadow: true });
    this.rails.traverse((o) => o.isMesh && this.track(o.geometry));
    this.group.add(this.rails);
    // traverses instanciées, recalées par multiples de l'espacement
    this.sleeperSpacing = 1.1;
    const span = Math.ceil((this.profile.drawDistance + 30) / this.sleeperSpacing);
    const sg = P.sleeperGeo(m.sleeper);
    this.sleepers = new THREE.InstancedMesh(sg.geometry, sg.materials[0], span * 3);
    this.track(sg.geometry);
    this.sleepers.frustumCulled = false;
    this.sleepers.receiveShadow = true;
    let k = 0;
    for (let i = -20; i < span - 20; i++) {
      for (const lane of [-1, 0, 1]) {
        _m.makeTranslation(lane * LANE_WIDTH, -0.09, -i * this.sleeperSpacing);
        this.sleepers.setMatrixAt(k++, _m);
      }
    }
    this.sleepers.count = k;
    this.group.add(this.sleepers);
  }

  // ---- sol ---------------------------------------------------------------------
  buildGround() {
    const m = this.map;
    const gMap = groundTexture(m.ground.type, m.ground.color, m.ground.color2);
    const gMat = this.track(worldUV(new THREE.MeshStandardMaterial({
      map: gMap,
      ...this.relief(gMap, 2, 0.7),
      roughness: m.groundGloss ? 0.35 : 0.95,
      metalness: m.groundGloss ? 0.3 : 0,
    }), 6));
    const geo = this.track(new THREE.PlaneGeometry(1, 1));
    geo.rotateX(-Math.PI / 2);
    this.groundPool = new THREE.InstancedMesh(geo, gMat, this.slots);
    this.groundPool.frustumCulled = false;
    this.groundPool.receiveShadow = true;
    this.groundPool.name = 'Ground';
    for (let i = 0; i < this.slots; i++) this.groundPool.setMatrixAt(i, ZERO);
    this.group.add(this.groundPool);
    // eau (océan latéral, rivières sous les ponts)
    const waterTex = makeTexture(`water:${m.water}`, 256, 256, (ctx, w, h) => {
      let seed = 1234567;
      const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      ctx.fillStyle = m.water;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${0.04 + rand() * 0.12})`;
        ctx.lineWidth = 1 + rand() * 2;
        const x = rand() * w;
        const y = rand() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 10, y - 4, x + 22, y);
        ctx.stroke();
      }
    }, { repeat: true });
    waterTex.repeat.set(60, 60);
    this.waterTex = waterTex;
    this.water = new THREE.Mesh(this.track(new THREE.PlaneGeometry(1400, 1400)), this.track(new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.12, metalness: 0.35, color: 0xffffff })));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = m.ocean ? -0.55 : -6;
    this.water.receiveShadow = false;
    this.group.add(this.water);
    if (m.ocean) {
      const foam = new THREE.Mesh(this.track(new THREE.PlaneGeometry(3, 1400)), this.track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })));
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(m.groundExtent[0] - 0.8, -0.5, 0);
      this.foam = foam;
      this.group.add(foam);
    }
  }

  // ---- décor instancié -----------------------------------------------------------
  buildDecorPools() {
    const m = this.map;
    const density = this.profile.density;
    this.pools = new Map();
    const need = new Map(); // key -> instances par tronçon
    const add = (k, n) => need.set(k, (need.get(k) || 0) + n);
    this.buildingMats = new Map();
    for (const d of m.decor) {
      const sides = d.side ? 1 : 2;
      if (d.type === 'building') {
        for (const st of m.buildings) add(`building:${st.name}`, Math.ceil(CHUNK / ((d.w?.[0] || 8) + 1)) * sides);
      } else if (d.type === 'rooftop') {
        add('rooftop', 6);
      } else if (d.type === 'neon') {
        m.neonSigns.forEach((_, i) => add(`neon:${i}`, Math.ceil((d.count[1] * sides) / 2) + 1));
      } else if (d.type === 'billboard') {
        for (let i = 0; i < 3; i++) add(`billboard:${i}`, 2);
      } else if (d.every) {
        add(d.type, Math.ceil(CHUNK / d.every) * sides);
      } else {
        add(d.type, Math.ceil(d.count[1] * sides));
      }
    }
    for (const [key, n] of need) {
      const [type, sub] = key.split(':');
      const built = this.decorGeometry(type, sub);
      if (!built) continue;
      this.track(built.geometry);
      const pool = new DecorPool(key, built.geometry, built.materials, n, this.slots, { castShadow: false });
      if (type === 'building' || type === 'rooftop') pool.mesh.receiveShadow = false;
      this.pools.set(key, pool);
      this.group.add(pool.mesh);
    }
    this.density = density;
  }

  decorGeometry(type, sub) {
    const m = this.map;
    switch (type) {
      case 'building': {
        const style = m.buildings.find((b) => b.name === sub);
        const wMap = windowTexture(style);
        const side = instanceScaledUV(new THREE.MeshStandardMaterial({
          map: wMap,
          ...this.relief(wMap, 1.6, 0.6),
          roughness: 0.75,
          ...(m.emissiveWindows || style.litColor ? { emissive: 0xffffff, emissiveMap: windowEmissiveTexture(style), emissiveIntensity: m.emissiveWindows ? 1.25 : 0.5 } : {}),
        }), 4);
        const rMap = roofTexture(m.roof);
        const roof = new THREE.MeshStandardMaterial({ map: rMap, roughness: 0.9, ...this.relief(rMap, 2, 0.6) });
        this.track(side);
        this.track(roof);
        return { geometry: P.buildingGeo(), materials: [side, side, roof, roof, side, side] };
      }
      case 'lamp': {
        const d = m.decor.find((x) => x.type === 'lamp');
        return P.lampPostGeo(m.id === 'neon' ? 0x22202e : 0x3b4252, d?.lampColor || 0xfff1c1);
      }
      case 'fence': return P.fenceGeo();
      case 'rooftop': return P.rooftopGeo(m.id === 'neon' ? 0x3a3f58 : 0x9aa3ad);
      case 'billboard': return P.billboardGeo(Number(sub) + (hashSeed(m.id) % 5));
      case 'tree': return P.treeGeo(m.id === 'forest' ? 0x3f8f3a : 0x4d9a3c);
      case 'fir': return P.firGeo(false, 0x2f6b3e);
      case 'firSnow': return P.firGeo(true, 0x2e5e45);
      case 'palm': return P.palmGeo();
      case 'umbrella': return P.umbrellaGeo();
      case 'hut': return P.hutGeo();
      case 'rock': {
        const d = m.decor.find((x) => x.type === 'rock');
        return P.rockGeo(d?.color || 0x8c7a66, hashSeed(m.id) % 7);
      }
      case 'cactus': return P.cactusGeo();
      case 'dune': return P.duneGeo(m.ground.color);
      case 'mountain': {
        const d = m.decor.find((x) => x.type === 'mountain');
        return P.mountainGeo(d?.color || 0x6d7c91, d?.snow !== false);
      }
      case 'crystal': return P.crystalGeo();
      case 'powerPole': return P.powerPoleGeo();
      case 'neon': {
        const [text, color] = m.neonSigns[Number(sub)];
        const g = P.neonSignGeo(text, color);
        this.neonMats = this.neonMats || [];
        for (const mt of g.materials) if (mt.emissiveMap) this.neonMats.push({ m: mt, base: mt.emissiveIntensity, seed: Math.random() * 10 });
        return g;
      }
      default: return null;
    }
  }

  zoneCover(s0, s1, type) {
    for (const z of this.zones) {
      if (z.type !== type) continue;
      const ov = Math.min(s1, z.s1) - Math.max(s0, z.s0);
      if (ov > (s1 - s0) * 0.5) return z;
    }
    return null;
  }
  zoneTouch(s0, s1, type) {
    for (const z of this.zones) if (z.type === type && z.s0 < s1 + 6 && z.s1 > s0 - 6) return z;
    return null;
  }

  fillChunk(slot, c) {
    const m = this.map;
    const rng = new RNG(hashSeed(`${m.id}:${c}`));
    const s0 = c * CHUNK;
    const s1 = s0 + CHUNK;
    const bridge = this.zoneCover(s0, s1, 'bridge');
    const tunnel = this.zoneTouch(s0, s1, 'tunnel');
    const station = this.zoneTouch(s0, s1, 'station');
    for (const pool of this.pools.values()) pool.begin(slot);
    // sol
    const [gx0, gx1] = m.groundExtent;
    if (bridge) this.groundPool.setMatrixAt(slot, ZERO);
    else {
      _m.compose(_p.set((gx0 + gx1) / 2, -0.2, -(s0 + CHUNK / 2)), _q.identity(), _s.set(gx1 - gx0, 1, CHUNK + 0.05));
      this.groundPool.setMatrixAt(slot, _m);
    }
    const density = this.density;
    for (const d of m.decor) {
      const near = (d.x?.[0] ?? 0) < 13;
      if (bridge && (d.x?.[1] ?? 0) < 60) continue;
      if (tunnel && near) continue;
      if (station && (d.x?.[0] ?? 0) < 9) continue;
      const sides = d.side ? [d.side === 'left' ? -1 : 1] : [-1, 1];
      if (d.prob !== undefined && !rng.chance(d.prob)) continue;
      for (const sign of sides) {
        if (d.type === 'rooftop') continue;
        if (d.type === 'building') {
          let s = s0 + rng.range(0, 3);
          while (s < s1 - 3) {
            const w = rng.range(d.w[0], d.w[1]);
            const depth = rng.range(d.d[0], d.d[1]);
            const h = rng.range(d.h[0], d.h[1]);
            const x = rng.range(d.x[0], d.x[1]);
            const style = rng.pick(m.buildings);
            if (rng.chance(density)) {
              const tint = new THREE.Color(1, 1, 1).offsetHSL(0, 0, rng.range(-0.08, 0.06));
              const pool = this.pools.get(`building:${style.name}`);
              if (pool?.place(slot, [sign * (x + depth / 2), 0, -(s + w / 2)], 0, [depth, h, w], tint)) {
                const rt = m.decor.find((q) => q.type === 'rooftop');
                if (rt && rng.chance(rt.onBuildings) && h < 60) this.pools.get('rooftop')?.place(slot, [sign * (x + depth / 2) - 1, h, -(s + w / 2)], rng.range(0, 6), rng.range(1, 1.6));
              }
            }
            s += w + rng.range(0.6, 4);
          }
          continue;
        }
        if (d.type === 'neon') {
          const n = rng.int(d.count[0], d.count[1]);
          for (let i = 0; i < n; i++) {
            const idx = rng.int(0, m.neonSigns.length - 1);
            const y = rng.range(d.y[0], d.y[1]);
            this.pools.get(`neon:${idx}`)?.place(slot, [sign * rng.range(d.x[0], d.x[1]), y, -rng.range(s0 + 3, s1 - 3)], sign > 0 ? -Math.PI / 2 : Math.PI / 2, rng.range(0.9, 1.3));
          }
          continue;
        }
        if (d.type === 'billboard') {
          const n = rng.int(d.count[0], d.count[1]);
          for (let i = 0; i < n; i++) this.pools.get(`billboard:${rng.int(0, 2)}`)?.place(slot, [sign * rng.range(d.x[0], d.x[1]), 0, -rng.range(s0 + 4, s1 - 4)], sign > 0 ? -Math.PI / 2 : Math.PI / 2, 1);
          continue;
        }
        const pool = this.pools.get(d.type);
        if (!pool) continue;
        if (d.every) {
          for (let s = s0 + (sign > 0 ? 0 : d.every / 2); s < s1; s += d.every) {
            const rot = d.type === 'lamp' || d.type === 'powerPole' ? (sign > 0 ? Math.PI : 0) : 0;
            pool.place(slot, [sign * rng.range(d.x[0], d.x[1]), 0, -s], rot, 1);
          }
          continue;
        }
        const n = Math.round(rng.int(d.count[0], d.count[1]) * (d.type === 'mountain' || d.type === 'dune' ? 1 : density));
        for (let i = 0; i < n; i++) {
          const sc = d.scale ? rng.range(d.scale[0], d.scale[1]) : 1;
          let scale = sc;
          let y = 0;
          if (d.type === 'mountain' || d.type === 'dune') scale = [sc, rng.range(d.h[0], d.h[1]), sc * rng.range(0.8, 1.2)];
          if (d.type === 'rock') y = -0.2 * sc;
          pool.place(slot, [sign * rng.range(d.x[0], d.x[1]), y, -rng.range(s0, s1)], rng.range(0, Math.PI * 2), scale);
        }
      }
    }
    for (const pool of this.pools.values()) pool.end(slot);
    this.groundPool.instanceMatrix.needsUpdate = true;
  }

  // ---- zones -----------------------------------------------------------------------
  buildZonePools() {
    const z = this.map.zones;
    const t = P.tunnelGeo(z.tunnel.color, z.tunnel.ring);
    this.track(t.geometry);
    this.tunnelPool = new THREE.InstancedMesh(t.geometry, t.materials, 60);
    // façade de portail : mur avec ouverture en arche
    const wall = new THREE.Shape();
    wall.moveTo(-26, -1); wall.lineTo(26, -1); wall.lineTo(26, 16); wall.lineTo(-26, 16); wall.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-5.6, -1); hole.lineTo(-5.6, 2.4); hole.absarc(0, 2.4, 5.6, Math.PI, 0, true); hole.lineTo(5.6, -1); hole.closePath();
    wall.holes.push(hole);
    const portalGeo = this.track(new THREE.ExtrudeGeometry(wall, { depth: 2, bevelEnabled: false }));
    portalGeo.translate(0, 0, -1);
    const portalMat = this.track(new THREE.MeshStandardMaterial({ color: z.tunnel.portal ?? new THREE.Color(z.tunnel.color).offsetHSL(0, 0, 0.05), roughness: 0.95, flatShading: true }));
    this.portalPool = new THREE.InstancedMesh(portalGeo, portalMat, 12);
    const b = P.bridgeGeo(z.bridge.color);
    this.track(b.geometry);
    this.bridgePool = new THREE.InstancedMesh(b.geometry, b.materials, 40);
    const st = P.stationGeo(z.station.roof, z.station.floor);
    this.track(st.geometry);
    this.stationPool = new THREE.InstancedMesh(st.geometry, st.materials, 24);
    for (const pool of [this.tunnelPool, this.portalPool, this.bridgePool, this.stationPool]) {
      pool.frustumCulled = false;
      pool.count = 0;
      pool.receiveShadow = true;
      this.group.add(pool);
    }
  }

  updateZones(s) {
    const far = s + this.profile.drawDistance + 20;
    const near = s - 30;
    let t = 0, p = 0, b = 0, st = 0;
    for (const z of this.zones) {
      if (z.s1 < near || z.s0 > far) continue;
      if (z.type === 'tunnel') {
        for (let k = z.s0; k < z.s1 && t < 60; k += 10) {
          if (k + 10 < near || k > far) continue;
          _m.makeTranslation(0, 0, -k);
          this.tunnelPool.setMatrixAt(t++, _m);
        }
        if (p < 11) {
          _m.makeTranslation(0, 0, -z.s0);
          this.portalPool.setMatrixAt(p++, _m);
          _m.makeTranslation(0, 0, -(z.s0 + 10 * Math.ceil((z.s1 - z.s0) / 10)));
          this.portalPool.setMatrixAt(p++, _m);
        }
      } else if (z.type === 'bridge') {
        const c0 = Math.floor(z.s0 / CHUNK);
        const c1 = Math.ceil(z.s1 / CHUNK);
        // le pont couvre les tronçons dont le sol est masqué
        for (let c = c0; c < c1; c++) {
          if (!this.zoneCover(c * CHUNK, (c + 1) * CHUNK, 'bridge')) continue;
          for (let k = c * CHUNK; k < (c + 1) * CHUNK && b < 40; k += 10) {
            _m.makeTranslation(0, 0, -k);
            this.bridgePool.setMatrixAt(b++, _m);
          }
        }
      } else if (z.type === 'station') {
        for (let k = z.s0; k < z.s1 && st < 22; k += 20) {
          _m.compose(_p.set(4.1, -0.5, -k), _q.identity(), _s.set(1, 1, 1));
          this.stationPool.setMatrixAt(st++, _m);
          _e.set(0, Math.PI, 0);
          _m.compose(_p.set(-4.1, -0.5, -(k + 20)), _q.setFromEuler(_e), _s.set(1, 1, 1));
          this.stationPool.setMatrixAt(st++, _m);
        }
      }
    }
    this.tunnelPool.count = t;
    this.portalPool.count = p;
    this.bridgePool.count = b;
    this.stationPool.count = st;
    for (const pool of [this.tunnelPool, this.portalPool, this.bridgePool, this.stationPool]) pool.instanceMatrix.needsUpdate = true;
  }

  // ---- mise à jour -----------------------------------------------------------------
  update(dt, s, camera, zones, playerPos, speed = 0) {
    this.time += dt;
    this.zones = zones;
    const z = -s;
    this.bed.position.z = z - 200;
    this.rails.position.z = z - 200;
    this.sleepers.position.z = -Math.floor(s / this.sleeperSpacing) * this.sleeperSpacing;
    this.water.position.x = camera.position.x;
    this.water.position.z = camera.position.z - 300;
    this.waterTex.offset.set(this.time * 0.01, -s / 1400 * 60 % 1 + this.time * 0.02);
    if (this.foam) {
      this.foam.position.z = z - 300;
      this.foam.material.opacity = 0.4 + Math.sin(this.time * 1.5) * 0.15;
    }
    this.sky.position.copy(camera.position);
    this.skyMat.uniforms.uTime.value = this.time;
    // lumière directionnelle qui suit le joueur (ombres nettes autour de lui)
    this.sun.target.position.set(playerPos.x * 0.5, 0, z - 8);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 40);
    // recyclage des tronçons
    const first = Math.floor((s - 50) / CHUNK);
    for (let c = first; c < first + this.slots; c++) {
      const slot = ((c % this.slots) + this.slots) % this.slots;
      if (this.slotChunk[slot] !== c) {
        this.slotChunk[slot] = c;
        this.fillChunk(slot, c);
      }
    }
    this.updateZones(s);
    if (this.ambient) this.ambient.update(dt, camera.position, speed);
    if (this.neonMats && this.map.ambience.neonFlicker) {
      for (const n of this.neonMats) {
        const f = Math.sin(this.time * 7 + n.seed) > 0.97 || Math.sin(this.time * 13.3 + n.seed * 3) > 0.985 ? 0.25 : 1;
        n.m.emissiveIntensity = n.base * f * (0.9 + 0.1 * Math.sin(this.time * 3 + n.seed));
      }
    }
  }

  // Force la régénération (ex. après changement de densité).
  invalidate() {
    this.slotChunk.fill(-9999);
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.ambient) this.ambient.dispose();
    for (const o of this.disposables) o.dispose?.();
    for (const pool of this.pools.values()) pool.mesh.dispose();
    this.groundPool.dispose();
    this.sleepers.dispose();
    for (const p of [this.tunnelPool, this.portalPool, this.bridgePool, this.stationPool]) p.dispose();
    this.scene.fog = null;
  }
}

export { CHUNK, RoundedBoxGeometry };
