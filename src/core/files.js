// Validation des fichiers importés (module pur, testé) : on ne fait jamais
// confiance à l'extension seule, on lit les octets d'en-tête et on borne la
// taille et la complexité. Aucun script n'est jamais exécuté.

export const LIMITS = {
  imageBytes: 8 * 1024 * 1024,
  imageMaxSide: 4096,
  modelBytes: 25 * 1024 * 1024,
  zipBytes: 40 * 1024 * 1024,
  zipEntries: 64,
  zipTotal: 60 * 1024 * 1024,
  maxNodes: 2000,
  maxMeshes: 300,
  maxVertices: 400000,
  maxTextures: 32,
};

export function sniff(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const at = (i) => b[i];
  if (b.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'png';
  if (b.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpeg';
  if (b.length >= 12 && at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return 'webp';
  if (b.length >= 12 && at(0) === 0x67 && at(1) === 0x6c && at(2) === 0x54 && at(3) === 0x46) return 'glb';
  if (b.length >= 4 && at(0) === 0x50 && at(1) === 0x4b && at(2) === 0x03 && at(3) === 0x04) return 'zip';
  // JSON (gltf) : premier caractère non blanc = '{'
  for (let i = 0; i < Math.min(b.length, 64); i++) {
    const c = b[i];
    if (c === 0xef || c === 0xbb || c === 0xbf || c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) continue;
    return c === 0x7b ? 'json' : 'unknown';
  }
  return 'unknown';
}

function dv(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

// Analyse un GLB : en-tête, chunk JSON, statistiques de complexité.
export function inspectGLB(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length > LIMITS.modelBytes) return { ok: false, error: `Fichier trop volumineux (${(b.length / 1048576).toFixed(1)} Mo, max ${LIMITS.modelBytes / 1048576} Mo).` };
  if (sniff(b) !== 'glb') return { ok: false, error: 'Ce fichier n\'est pas un GLB valide (signature « glTF » absente).' };
  const v = dv(b);
  const version = v.getUint32(4, true);
  const length = v.getUint32(8, true);
  if (version !== 2) return { ok: false, error: `Version glTF ${version} non prise en charge (2 attendue).` };
  if (length !== b.length) return { ok: false, error: 'Fichier GLB tronqué ou corrompu (longueur incohérente).' };
  if (b.length < 20) return { ok: false, error: 'GLB vide.' };
  const jsonLen = v.getUint32(12, true);
  const jsonType = v.getUint32(16, true);
  if (jsonType !== 0x4e4f534a || 20 + jsonLen > b.length) return { ok: false, error: 'Chunk JSON du GLB invalide.' };
  let json;
  try {
    json = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jsonLen)));
  } catch {
    return { ok: false, error: 'JSON interne du GLB illisible.' };
  }
  return checkGLTF(json, { embedded: true });
}

// Vérifie un document glTF (JSON) : complexité et références externes.
export function checkGLTF(json, { embedded = false, available = [] } = {}) {
  if (!json || typeof json !== 'object' || !json.asset || String(json.asset.version || '').split('.')[0] !== '2') {
    return { ok: false, error: 'Document glTF 2.0 invalide (champ asset.version).' };
  }
  const nodes = (json.nodes || []).length;
  const meshes = (json.meshes || []).length;
  const textures = (json.images || []).length;
  let vertices = 0;
  for (const m of json.meshes || []) {
    for (const p of m.primitives || []) {
      const acc = json.accessors?.[p.attributes?.POSITION];
      if (acc) vertices += acc.count || 0;
    }
  }
  if (nodes > LIMITS.maxNodes) return { ok: false, error: `Trop de nœuds (${nodes} > ${LIMITS.maxNodes}).` };
  if (meshes > LIMITS.maxMeshes) return { ok: false, error: `Trop de maillages (${meshes} > ${LIMITS.maxMeshes}).` };
  if (vertices > LIMITS.maxVertices) return { ok: false, error: `Modèle trop complexe (${vertices} sommets > ${LIMITS.maxVertices}).` };
  if (textures > LIMITS.maxTextures) return { ok: false, error: `Trop de textures (${textures}).` };
  if (!meshes) return { ok: false, error: 'Le modèle ne contient aucun maillage.' };
  const externals = [];
  for (const res of [...(json.buffers || []), ...(json.images || [])]) {
    if (!res.uri) continue;
    if (/^data:/.test(res.uri)) continue;
    if (/^[a-z]+:/i.test(res.uri) || res.uri.startsWith('/') || res.uri.includes('..')) {
      return { ok: false, error: `Référence externe refusée : ${String(res.uri).slice(0, 60)}` };
    }
    externals.push(decodeURIComponent(res.uri));
  }
  if (embedded && externals.length) return { ok: false, error: 'Ce GLB référence des fichiers externes non fournis.' };
  const missing = externals.filter((u) => !available.includes(u.split('/').pop()));
  if (!embedded && missing.length) return { ok: false, error: `Fichiers associés manquants : ${missing.join(', ')}` };
  const animations = (json.animations || []).map((a) => a.name || '');
  const skins = (json.skins || []).length;
  return { ok: true, stats: { nodes, meshes, vertices, textures, animations, skins }, externals };
}

export function sanitizeZipPath(name) {
  if (typeof name !== 'string' || name.length > 200) return null;
  if (name.includes('..') || name.startsWith('/') || name.includes('\\') || /^[a-z]:/i.test(name)) return null;
  if (name.endsWith('/')) return null; // dossier
  if (name.split('/').some((p) => p.startsWith('__MACOSX') || p.startsWith('.'))) return null;
  return name;
}

export const ZIP_ALLOWED = /\.(gltf|glb|bin|png|jpe?g|webp)$/i;
