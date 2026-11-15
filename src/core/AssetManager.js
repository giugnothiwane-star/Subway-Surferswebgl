// Chargement des ressources : personnage GLB (avec repli procédural),
// textures importées, modèles importés (GLB, GLTF + fichiers, ZIP).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCharacter, CLIP_NAMES } from '../models/Character.js';
import { LIMITS, ZIP_ALLOWED, checkGLTF, inspectGLB, sanitizeZipPath, sniff } from './files.js';

const BASE = import.meta.env?.BASE_URL ?? './';

export class AssetManager {
  constructor() {
    this.manager = new THREE.LoadingManager();
    this.loader = new GLTFLoader(this.manager);
    this.progress = 0;
    this.manager.onProgress = (_url, loaded, total) => { this.progress = total ? loaded / total : 1; };
    this.source = {};
  }

  url(path) {
    return `${BASE}${path}`;
  }

  // Personnage officiel : GLB exporté (squelette + 17 clips). Repli : génération.
  async loadCharacter() {
    try {
      const gltf = await this.loader.loadAsync(this.url('assets/models/characters/mnnrow_runner.glb'));
      const rig = rigFromGLTF(gltf, false);
      if (!rig.clips.length || !rig.root.getObjectByName('hips')) throw new Error('rig incomplet');
      this.source.character = 'glb';
      return rig;
    } catch (e) {
      console.warn('[MNNROW] GLB du personnage indisponible, génération procédurale :', e.message);
      this.source.character = 'procedural';
      return createCharacter();
    }
  }

  // Image (Blob/File) -> texture validée et redimensionnée (≤ 1024 px).
  async imageTexture(blob, { maxSide = 1024, repeat = false } = {}) {
    if (blob.size > LIMITS.imageBytes) throw new Error(`Image trop lourde (max ${LIMITS.imageBytes / 1048576} Mo).`);
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const kind = sniff(head);
    if (!['png', 'jpeg', 'webp'].includes(kind)) throw new Error('Format d\'image non reconnu (PNG, JPG ou WebP attendus).');
    let bmp;
    try {
      bmp = await createImageBitmap(blob);
    } catch {
      throw new Error('Image illisible ou corrompue.');
    }
    if (bmp.width > LIMITS.imageMaxSide || bmp.height > LIMITS.imageMaxSide) throw new Error(`Image trop grande (max ${LIMITS.imageMaxSide} px).`);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData.kind = kind;
    return t;
  }

  // Import d'un modèle : renvoie { record, rig, stats } ; record est stocké
  // tel quel dans IndexedDB (Blobs), jamais en base64 dans localStorage.
  async importModel(fileList) {
    const files = [...fileList];
    if (!files.length) throw new Error('Aucun fichier sélectionné.');
    let entries; // [{name, blob}]
    if (files.length === 1) {
      const head = sniff(new Uint8Array(await files[0].slice(0, 64).arrayBuffer()));
      if (head === 'zip') entries = await this.unzip(files[0]);
      else entries = [{ name: files[0].name, blob: files[0] }];
    } else entries = files.map((f) => ({ name: f.name, blob: f }));
    const record = { type: null, files: [], created: Date.now() };
    let main = null;
    for (const e of entries) {
      const head = sniff(new Uint8Array(await e.blob.slice(0, 64).arrayBuffer()));
      if (head === 'glb') main = main || { kind: 'glb', ...e };
      else if (head === 'json' && /\.gltf$/i.test(e.name)) main = main || { kind: 'gltf', ...e };
    }
    if (!main) throw new Error('Aucun fichier .glb ou .gltf valide trouvé (vérification du contenu, pas de l\'extension).');
    let stats;
    if (main.kind === 'glb') {
      const buf = new Uint8Array(await main.blob.arrayBuffer());
      const r = inspectGLB(buf);
      if (!r.ok) throw new Error(r.error);
      stats = r.stats;
      record.type = 'glb';
      record.files = [{ name: main.name, blob: new Blob([buf], { type: 'model/gltf-binary' }) }];
    } else {
      if (main.blob.size > LIMITS.modelBytes) throw new Error('Fichier glTF trop volumineux.');
      let json;
      try {
        json = JSON.parse(await main.blob.text());
      } catch {
        throw new Error('Fichier .gltf illisible (JSON invalide).');
      }
      const names = entries.map((e) => e.name.split('/').pop());
      const r = checkGLTF(json, { embedded: false, available: names });
      if (!r.ok) throw new Error(r.error);
      stats = r.stats;
      record.type = 'gltf';
      const needed = new Set(r.externals.map((u) => u.split('/').pop()));
      record.files = [{ name: main.name.split('/').pop(), blob: main.blob }];
      for (const e of entries) {
        const n = e.name.split('/').pop();
        if (!needed.has(n)) continue;
        const kind = sniff(new Uint8Array(await e.blob.slice(0, 16).arrayBuffer()));
        if (/\.(png|jpe?g|webp)$/i.test(n) && !['png', 'jpeg', 'webp'].includes(kind)) throw new Error(`Image associée invalide : ${n}`);
        record.files.push({ name: n, blob: e.blob });
      }
    }
    const rig = await this.rigFromRecord(record);
    return { record, rig, stats };
  }

  async unzip(file) {
    if (file.size > LIMITS.zipBytes) throw new Error(`Archive trop volumineuse (max ${LIMITS.zipBytes / 1048576} Mo).`);
    const { unzipSync } = await import('fflate');
    const data = new Uint8Array(await file.arrayBuffer());
    let total = 0;
    let count = 0;
    let out;
    try {
      out = unzipSync(data, {
        filter: (f) => {
          const name = sanitizeZipPath(f.name);
          if (!name || !ZIP_ALLOWED.test(name)) return false;
          count++;
          total += f.originalSize;
          if (count > LIMITS.zipEntries) throw new Error(`Trop de fichiers dans l'archive (max ${LIMITS.zipEntries}).`);
          if (total > LIMITS.zipTotal) throw new Error('Archive trop volumineuse une fois décompressée.');
          return true;
        },
      });
    } catch (e) {
      throw new Error(e.message.startsWith('Trop') || e.message.startsWith('Archive') ? e.message : 'Archive ZIP invalide ou corrompue.');
    }
    const entries = Object.entries(out).map(([name, bytes]) => ({ name, blob: new Blob([bytes]) }));
    if (!entries.length) throw new Error('L\'archive ne contient aucun fichier compatible (.glb, .gltf, .bin, images).');
    return entries;
  }

  async rigFromRecord(record) {
    const urls = new Map();
    for (const f of record.files) urls.set(f.name, URL.createObjectURL(f.blob));
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((u) => {
      const name = decodeURIComponent(u.split('/').pop().split('?')[0]);
      if (u.startsWith('blob:') || u.startsWith('data:')) return u;
      return urls.get(name) || 'data:,'; // aucune requête réseau vers un fichier non fourni
    });
    const loader = new GLTFLoader(manager);
    try {
      const gltf = await loader.loadAsync(urls.get(record.files[0].name));
      return rigFromGLTF(gltf, true);
    } finally {
      for (const u of urls.values()) URL.revokeObjectURL(u);
    }
  }
}

// Construit un rig compatible PlayerView depuis un glTF chargé.
export function rigFromGLTF(gltf, custom) {
  const root = gltf.scene;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = !o.isSkinnedMesh;
    }
  });
  let clips = gltf.animations || [];
  if (custom) {
    // normalisation : hauteur ~1.8 m, pieds au sol, centré
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const k = 1.8 / Math.max(size.y, 0.001);
    const wrapper = new THREE.Group();
    wrapper.name = 'CustomModel';
    root.scale.multiplyScalar(k);
    const c = box.getCenter(new THREE.Vector3());
    root.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    wrapper.add(root);
    // association des animations du modèle à nos états (par mots clés)
    const map = { idle: /idle|stand/i, run: /run|jog|sprint/i, sprint: /sprint|run/i, jump: /jump/i, fall: /fall|jump/i, roll: /roll|slide|crouch/i, death: /death|die|dead/i, menu: /dance|idle|wave/i, victory: /victory|win|cheer|wave/i, hoverboard: /idle|stand/i, land: /land|idle/i, runStart: /run/i, hit: /hit|stumble/i, jetpack: /fly|idle/i };
    const renamed = [];
    for (const [state, re] of Object.entries(map)) {
      const src = clips.find((cl) => re.test(cl.name));
      if (src) {
        const cl = src.clone();
        cl.name = state;
        renamed.push(cl);
      }
    }
    return { root: wrapper, clips: renamed, isCustom: true };
  }
  clips = clips.filter((c) => CLIP_NAMES.includes(c.name));
  for (const c of clips) if (['leanLeft', 'leanRight', 'collect'].includes(c.name)) c.userData = { additive: true };
  return { root, clips, isCustom: false };
}
