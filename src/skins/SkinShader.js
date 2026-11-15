// MNNROW Universal Texture Engine — bibliothèque de skins.
// Chaque skin est un MeshStandardMaterial « augmenté » via onBeforeCompile :
// il conserve l'éclairage PBR, les ombres, le skinning (personnage riggé) et
// l'instancing (pièces). Les motifs procéduraux sont calculés en coordonnées
// locales du maillage (pose de référence) : pas de coutures UV et le motif
// suit le personnage pendant les animations.
import * as THREE from 'three';

export const SKINS = [
  { id: 'normal', name: 'Normal' },
  { id: 'galaxy', name: 'Galaxie' },
  { id: 'neon', name: 'Néon' },
  { id: 'gold', name: 'Or' },
  { id: 'silver', name: 'Argent' },
  { id: 'crystal', name: 'Cristal' },
  { id: 'fire', name: 'Feu' },
  { id: 'ice', name: 'Glace' },
  { id: 'rainbow', name: 'Arc-en-ciel' },
  { id: 'shadow', name: 'Ombre' },
  { id: 'energy', name: 'Énergie' },
  { id: 'texture', name: 'Texture perso' },
];
export const SKIN_IDS = SKINS.map((s) => s.id);

const MODES = { galaxy: 1, fire: 2, ice: 3, rainbow: 4, energy: 5, shadow: 6, neon: 7, crystal: 8, texture: 9 };

export const DEFAULT_GALAXY = {
  colorA: '#2a0b5e', // fond spatial (violet profond)
  colorB: '#ff3bd4', // nébuleuses (rose / magenta)
  colorC: '#2fd5ff', // volutes lumineuses (cyan)
  starColor: '#ffffff',
  starDensity: 0.55,
  starBrightness: 1.2,
  nebulaIntensity: 1.0,
  animationSpeed: 1.0,
  glowIntensity: 0.6,
  contrast: 1.15,
  noiseScale: 1.0,
  rotation: 0,
  sparkle: 0.8,
  animated: true,
};

// Uniformes partagés par TOUS les matériaux de skin : un réglage du studio
// modifie instantanément l'aperçu ET le jeu.
export const SKIN_UNIFORMS = {
  uSkinTime: { value: 0 },
  uGalA: { value: new THREE.Color(DEFAULT_GALAXY.colorA) },
  uGalB: { value: new THREE.Color(DEFAULT_GALAXY.colorB) },
  uGalC: { value: new THREE.Color(DEFAULT_GALAXY.colorC) },
  uStarColor: { value: new THREE.Color(DEFAULT_GALAXY.starColor) },
  uStarDensity: { value: DEFAULT_GALAXY.starDensity },
  uStarBright: { value: DEFAULT_GALAXY.starBrightness },
  uNebula: { value: DEFAULT_GALAXY.nebulaIntensity },
  uGlow: { value: DEFAULT_GALAXY.glowIntensity },
  uContrast: { value: DEFAULT_GALAXY.contrast },
  uScale: { value: DEFAULT_GALAXY.noiseScale },
  uRot: { value: 0 },
  uSparkle: { value: DEFAULT_GALAXY.sparkle },
};

let skinTime = 0;
let galaxySpeed = 1;
let animated = true;
let reduceEffects = false;

export function setGalaxyParams(p = {}) {
  const g = { ...DEFAULT_GALAXY, ...p };
  const U = SKIN_UNIFORMS;
  U.uGalA.value.set(g.colorA);
  U.uGalB.value.set(g.colorB);
  U.uGalC.value.set(g.colorC);
  U.uStarColor.value.set(g.starColor);
  U.uStarDensity.value = g.starDensity;
  U.uStarBright.value = g.starBrightness;
  U.uNebula.value = g.nebulaIntensity;
  U.uGlow.value = g.glowIntensity;
  U.uContrast.value = g.contrast;
  U.uScale.value = g.noiseScale;
  U.uRot.value = (g.rotation * Math.PI) / 180;
  U.uSparkle.value = g.sparkle;
  galaxySpeed = g.animationSpeed;
  animated = g.animated;
}

// Désactive les animations visuelles des skins (option d'accessibilité).
export function setSkinMotion(on) {
  reduceEffects = !on;
}

export function updateSkins(dt) {
  if (animated && !reduceEffects) skinTime += dt * galaxySpeed;
  SKIN_UNIFORMS.uSkinTime.value = skinTime;
}

// Qualité du shader selon le profil graphique : LOW garde un rendu
// reconnaissable avec moins d'octaves de bruit et une seule couche d'étoiles.
let quality = 'medium';
export function setSkinQuality(q) {
  if (q === quality) return;
  quality = q;
  for (const m of cache.values()) m.needsUpdate = true;
}

const GLSL_COMMON = /* glsl */ `
varying vec3 vSkinPos;
uniform float uSkinTime;
uniform vec3 uGalA; uniform vec3 uGalB; uniform vec3 uGalC; uniform vec3 uStarColor;
uniform float uStarDensity; uniform float uStarBright; uniform float uNebula; uniform float uGlow;
uniform float uContrast; uniform float uScale; uniform float uRot; uniform float uSparkle;
uniform vec3 uSkinTint;
#if SKIN_MODE == 9
  uniform sampler2D uSkinMap; uniform float uMapScale;
#endif
float skHash(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float skNoise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(skHash(i), skHash(i + vec3(1,0,0)), f.x), mix(skHash(i + vec3(0,1,0)), skHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(skHash(i + vec3(0,0,1)), skHash(i + vec3(1,0,1)), f.x), mix(skHash(i + vec3(0,1,1)), skHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float skFbm(vec3 p){
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < SKIN_OCT; i++) { s += a * skNoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s / (1.0 - pow(0.5, float(SKIN_OCT)));
}
// étoiles : une étoile au plus par cellule, position et éclat aléatoires
float skStars(vec3 p, float density){
  vec3 id = floor(p); vec3 f = fract(p) - 0.5;
  float h = skHash(id);
  if (h < 1.0 - density) return 0.0;
  vec3 o = vec3(skHash(id + 1.7), skHash(id + 4.3), skHash(id + 7.9)) - 0.5;
  float d = length(f - o * 0.6);
  float tw = 1.0 - uSparkle * 0.5 + uSparkle * 0.5 * sin(uSkinTime * 3.0 + h * 61.0);
  return smoothstep(0.16, 0.0, d) * tw * (0.5 + h);
}
vec3 skHue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
`;

// Calcule couleur diffuse + émission du skin (définit skCol, skEmi, skAlpha).
const GLSL_COLOR = /* glsl */ `
  vec3 skCol = vec3(1.0); vec3 skEmi = vec3(0.0); float skAlpha = 1.0;
  {
    float c = cos(uRot), s = sin(uRot);
    vec3 p = vSkinPos * uScale;
    p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
    float t = uSkinTime;
  #if SKIN_MODE == 1
    // GALAXIE : fond spatial, nébuleuses en domaine déformé, volutes, étoiles
    vec3 q = p * 1.6;
    float n1 = skFbm(q + vec3(t * 0.05, 0.0, -t * 0.04));
    float n2 = skFbm(q * 1.9 + n1 * 1.6 - vec3(0.0, t * 0.06, 0.0));
    vec3 deep = uGalA * 0.18;
    vec3 col = mix(deep, uGalA, smoothstep(0.25, 0.75, n1));
    col = mix(col, uGalB * 0.85, smoothstep(0.52, 0.95, n2) * uNebula * 0.9);
    float wisp = pow(max(0.0, n2 * n1 * 2.2 - 0.7), 1.5) * 1.6;
    col += uGalC * wisp * uNebula;
    col = pow(max(col, 0.0), vec3(uContrast));
    float st = skStars(p * (10.0 + uStarDensity * 6.0), uStarDensity * 0.55);
    #if SKIN_STAR2
      st += 0.6 * skStars(p * 27.0 + 3.1, uStarDensity * 0.45);
    #endif
    st *= uStarBright;
    skCol = col + uStarColor * st;
    skEmi = col * uGlow * 0.45 + uStarColor * st * 1.4;
  #elif SKIN_MODE == 2
    // FEU : flammes stylisées qui montent
    float n = skFbm(vec3(p.x * 2.2, p.y * 1.4 - t * 1.2, p.z * 2.2));
    float f = smoothstep(0.25, 0.85, n + 0.15 * sin(p.y * 6.0 - t * 4.0));
    vec3 col = mix(vec3(0.35, 0.02, 0.0), vec3(1.0, 0.35, 0.02), f);
    col = mix(col, vec3(1.0, 0.86, 0.3), smoothstep(0.7, 1.0, f));
    skCol = col; skEmi = col * (0.6 + 0.5 * f);
  #elif SKIN_MODE == 3
    // GLACE : bleu pâle givré + éclats
    float n = skFbm(p * 3.0);
    vec3 col = mix(vec3(0.55, 0.78, 0.95), vec3(0.92, 0.98, 1.0), smoothstep(0.35, 0.8, n));
    float st = skStars(p * 24.0, 0.25) * (0.6 + 0.4 * sin(t * 2.0));
    skCol = col + st; skEmi = vec3(0.08, 0.14, 0.2) + vec3(st) * 0.8;
  #elif SKIN_MODE == 4
    // ARC-EN-CIEL : teintes qui défilent
    float n = skFbm(p * 1.5);
    vec3 col = skHue(fract(p.y * 0.35 + n * 0.35 + t * 0.08));
    skCol = mix(col, vec3(1.0), 0.08); skEmi = col * 0.35;
  #elif SKIN_MODE == 5
    // ÉNERGIE : arcs électriques pulsés
    float n = skFbm(p * 2.5 + vec3(0.0, t * 0.8, 0.0));
    float band = pow(abs(sin(p.y * 9.0 + n * 6.0 - t * 3.0)), 18.0);
    vec3 base = vec3(0.02, 0.08, 0.16);
    vec3 elec = mix(vec3(0.1, 0.9, 1.0), vec3(0.75, 1.0, 1.0), band);
    skCol = base + elec * band; skEmi = elec * (band * 1.6 + 0.12 + 0.08 * sin(t * 5.0));
  #elif SKIN_MODE == 6
    // OMBRE : noir fumé, reflets violets
    float n = skFbm(p * 2.0 + vec3(0.0, t * 0.15, 0.0));
    skCol = vec3(0.025, 0.02, 0.04) + vec3(0.08, 0.02, 0.14) * smoothstep(0.55, 0.95, n);
    skEmi = vec3(0.06, 0.0, 0.12) * smoothstep(0.6, 1.0, n);
  #elif SKIN_MODE == 7
    // NÉON : corps sombre, lignes lumineuses
    vec3 g = abs(fract(p * 3.0) - 0.5);
    float line = smoothstep(0.47, 0.5, max(g.x, max(g.y, g.z)));
    skCol = vec3(0.04, 0.03, 0.08) + uSkinTint * line;
    skEmi = uSkinTint * (line * 2.2 + 0.08);
  #elif SKIN_MODE == 8
    // CRISTAL : facettes claires (version optimisée, sans réfraction réelle)
    float n = skNoise(floor(p * 5.0));
    skCol = mix(vec3(0.7, 0.85, 1.0), vec3(0.95, 0.85, 1.0), n);
    skEmi = vec3(0.05, 0.08, 0.12) + skCol * 0.15 * n;
    skAlpha = 0.72;
  #elif SKIN_MODE == 9
    // TEXTURE PERSONNALISÉE : projection triplanaire (aucun étirement)
    vec3 bw = abs(normalize(vSkinNormal)); bw = pow(bw, vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    vec3 tp = vSkinPos * uMapScale;
    vec3 tx = texture2D(uSkinMap, tp.zy + 0.5).rgb;
    vec3 ty = texture2D(uSkinMap, tp.xz + 0.5).rgb;
    vec3 tz = texture2D(uSkinMap, tp.xy + 0.5).rgb;
    skCol = tx * bw.x + ty * bw.y + tz * bw.z;
  #endif
  }
`;

const cache = new Map();

// Paramètres PBR propres à chaque skin (différences visuelles réelles).
const PBR = {
  galaxy: { metalness: 0.25, roughness: 0.32 },
  neon: { metalness: 0.2, roughness: 0.35 },
  gold: { color: 0xffc23a, metalness: 1, roughness: 0.18, emissive: 0x2a1800, emissiveIntensity: 0.4 },
  silver: { color: 0xe6ebf2, metalness: 1, roughness: 0.16 },
  crystal: { metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.85 },
  fire: { metalness: 0, roughness: 0.6 },
  ice: { metalness: 0.15, roughness: 0.12 },
  rainbow: { metalness: 0.35, roughness: 0.3 },
  shadow: { metalness: 0.4, roughness: 0.5 },
  energy: { metalness: 0.3, roughness: 0.25 },
  texture: { metalness: 0.05, roughness: 0.6 },
};

// Crée (ou réutilise) le matériau d'un skin.
// opts : { key, side, tint, map (texture perso), mapScale, rest }
// rest = true : le motif suit l'attribut « skinRest » (tissu déformé : la cape)
export function skinMaterial(skin, opts = {}) {
  const key = `${skin}|${opts.key || ''}|${opts.rest ? 'r' : ''}|${opts.side || 0}|${opts.tint || ''}|${opts.map ? opts.map.uuid : ''}|${opts.mapScale || 1}`;
  if (cache.has(key)) return cache.get(key);
  const p = PBR[skin] || {};
  const m = new THREE.MeshStandardMaterial({
    color: p.color ?? 0xffffff,
    metalness: p.metalness ?? 0.2,
    roughness: p.roughness ?? 0.4,
    emissive: p.emissive ?? 0x000000,
    emissiveIntensity: p.emissiveIntensity ?? 1,
    transparent: !!p.transparent,
    opacity: p.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  m.name = `Skin_${skin}`;
  m.userData.skin = skin;
  const mode = MODES[skin];
  if (mode) {
    const tint = new THREE.Color(opts.tint || '#ff3bd4');
    m.emissive.set(0xffffff); // l'émission est entièrement pilotée par le shader
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, SKIN_UNIFORMS);
      shader.uniforms.uSkinTint = { value: tint };
      if (mode === 9) {
        shader.uniforms.uSkinMap = { value: opts.map };
        shader.uniforms.uMapScale = { value: opts.mapScale || 1 };
      }
      const oct = quality === 'low' ? 2 : quality === 'high' ? 5 : 4;
      const defs = `#define SKIN_MODE ${mode}\n#define SKIN_OCT ${oct}\n#define SKIN_STAR2 ${quality === 'low' ? 0 : 1}\n`;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vSkinPos;\nvarying vec3 vSkinNormal;${opts.rest ? '\nattribute vec3 skinRest;' : ''}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvSkinPos = ${opts.rest ? 'skinRest' : 'position'};\nvSkinNormal = normal;`);
      shader.fragmentShader = defs + shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vSkinNormal;\n${GLSL_COMMON}`)
        .replace('#include <map_fragment>', `${GLSL_COLOR}\n  diffuseColor.rgb *= skCol;\n  diffuseColor.a *= skAlpha;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance = skEmi;
          #if SKIN_MODE == 8
            float skFres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
            totalEmissiveRadiance += vec3(0.6, 0.85, 1.0) * skFres * 0.8;
          #elif SKIN_MODE == 1 || SKIN_MODE == 7 || SKIN_MODE == 6
            float skFres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
            totalEmissiveRadiance += (SKIN_MODE == 7 ? uSkinTint : (SKIN_MODE == 6 ? vec3(0.35, 0.1, 0.6) : uGalC)) * skFres * 0.5;
          #endif`);
    };
    m.customProgramCacheKey = () => `skin${mode}${quality}${opts.rest ? 'r' : ''}${mode === 9 ? opts.map?.uuid : ''}`;
  }
  cache.set(key, m);
  return m;
}

export function disposeSkinMaterials() {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

export function skinName(id) {
  return SKINS.find((s) => s.id === id)?.name || id;
}
