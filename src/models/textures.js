// Textures générées sur canvas (originales, aucune ressource externe).
// Toutes sont mises en cache par clé pour être partagées entre matériaux.
import * as THREE from 'three';

const cache = new Map();
let anisotropy = 4;
export function setMaxAnisotropy(a) {
  anisotropy = Math.max(1, Math.min(8, a || 1));
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Familles dont les clés dépendent de couleurs choisies par le joueur : on borne
// leur nombre (les plus anciennes sont libérées du GPU ; Three.js les ré-envoie
// automatiquement si elles servent encore).
const DYNAMIC = { trainSide: 10, trainRoof: 10, trainFront: 10, board: 8, container: 12 };

export function makeTexture(key, w, h, draw, { srgb = true, repeat = false, mipmaps = true } = {}) {
  if (cache.has(key)) {
    const t = cache.get(key);
    cache.delete(key); // remet en fin de liste (récemment utilisée)
    cache.set(key, t);
    return t;
  }
  const family = key.split(':')[0];
  if (DYNAMIC[family]) {
    const same = [...cache.keys()].filter((k) => k.startsWith(family + ':'));
    for (let i = 0; i <= same.length - DYNAMIC[family]; i++) {
      cache.get(same[i]).dispose();
      cache.delete(same[i]);
    }
  }
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  t.generateMipmaps = mipmaps;
  t.name = key;
  cache.set(key, t);
  return t;
}

export function disposeTextureCache(filter = () => true) {
  for (const [k, t] of cache) if (filter(k)) { t.dispose(); cache.delete(k); }
}

// RNG local pour les textures (déterministe par clé).
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function noise(ctx, w, h, amount, alpha, seed = 7, size = 2) {
  const r = rng(seed);
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(r() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    ctx.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
}

const css = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);

// ---- Trains ------------------------------------------------------------------
// Texture de flanc : u = longueur du wagon (gauche = avant), v = hauteur (bas -> haut).
export function trainSideTexture(style, livery) {
  const key = `trainSide:${style}:${livery.body}:${livery.stripe}:${livery.accent}:${livery.window || ''}:${livery.custom || ''}`;
  return makeTexture(key, 1024, 256, (ctx, w, h) => {
    const body = css(livery.body);
    const stripe = css(livery.stripe);
    const accent = css(livery.accent);
    // dégradé vertical léger pour le volume
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shade(body, 0.12));
    g.addColorStop(0.55, body);
    g.addColorStop(1, shade(body, -0.25));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Repère retourné : y = hauteur depuis le bas du flanc (texte redressé via flipText)
    ctx.translate(0, h);
    ctx.scale(1, -1);
    // panneaux (joints de tôle)
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += w / 7) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    if (style === 'freight') {
      // capot de locomotive : grilles + bande diagonale
      ctx.fillStyle = stripe;
      ctx.fillRect(0, h * 0.62, w, h * 0.1);
      ctx.fillStyle = accent;
      for (let x = 0; x < w; x += 46) {
        ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 24, h); ctx.lineTo(x + 54, h * 0.82); ctx.lineTo(x + 30, h * 0.82); ctx.fill();
      }
      ctx.fillStyle = 'rgba(20,20,25,0.85)';
      for (let x = w * 0.3; x < w * 0.9; x += 60) {
        roundRect(ctx, x, h * 0.2, 44, h * 0.3, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        for (let yy = h * 0.22; yy < h * 0.5; yy += 6) { ctx.beginPath(); ctx.moveTo(x + 4, yy); ctx.lineTo(x + 40, yy); ctx.stroke(); }
      }
      // cabine (fenêtre côté avant)
      ctx.fillStyle = '#1b2733';
      roundRect(ctx, 16, h * 0.5, 120, h * 0.3, 10); ctx.fill();
      glassReflection(ctx, 16, h * 0.5, 120, h * 0.3);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 30px sans-serif';
      flipText(ctx, livery.number || 'MX 4021', w * 0.36, h * 0.66);
      noise(ctx, w, h, 1800, 0.12, hashStr(key));
      return;
    }
    // bandes colorées
    ctx.fillStyle = stripe;
    ctx.fillRect(0, h * 0.14, w, h * 0.1);
    ctx.fillStyle = accent;
    ctx.fillRect(0, h * 0.26, w, h * 0.035);
    if (style === 'modern') {
      ctx.fillStyle = accent;
      ctx.fillRect(0, h * 0.86, w, h * 0.04);
    }
    // portes + fenêtres : intérieur éclairé visible (sièges, barres), vitre teintée, reflets
    const L = trainWindowLayout(style, w, h);
    for (const d of L.doors) {
      ctx.fillStyle = shade(body, -0.08);
      roundRect(ctx, d.x, h * 0.08, d.w, h * 0.78, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
      roundRect(ctx, d.x, h * 0.08, d.w, h * 0.78, 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d.x + d.w / 2, h * 0.08); ctx.lineTo(d.x + d.w / 2, h * 0.86); ctx.stroke();
      // joints caoutchouc + poignées
      ctx.strokeStyle = 'rgba(20,20,24,0.8)'; ctx.lineWidth = 2;
      roundRect(ctx, d.x + 3, h * 0.08 + 3, d.w - 6, h * 0.78 - 6, 5); ctx.stroke();
      ctx.fillStyle = 'rgba(230,235,240,0.85)';
      ctx.fillRect(d.x + d.w / 2 - 9, h * 0.38, 4, 16); ctx.fillRect(d.x + d.w / 2 + 5, h * 0.38, 4, 16);
      // bouton d'ouverture
      ctx.fillStyle = '#3ee07a';
      ctx.beginPath(); ctx.arc(d.x + d.w + 9, h * 0.45, 4, 0, Math.PI * 2); ctx.fill();
    }
    for (const wr of L.windows) drawTrainWindow(ctx, wr, css(livery.window || '#1a2a3a'), style);
    // logo original
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'italic 900 22px sans-serif';
    flipText(ctx, livery.logo || 'MNNROW', w * 0.6, h * 0.155);
    ctx.font = 'bold 18px monospace';
    flipText(ctx, livery.number || '0712', w * 0.05, h * 0.3);
    if (livery.graffiti) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); graffiti(ctx, w, h, hashStr(key)); ctx.restore(); }
    noise(ctx, w, h, 1200, 0.08, hashStr(key));
  });
}

function flipText(ctx, text, x, y) {
  ctx.save();
  ctx.scale(1, -1);
  ctx.fillText(text, x, -y);
  ctx.restore();
}

// Emplacement des fenêtres et portes d'un flanc (repère retourné : y depuis le
// bas). Partagé entre la texture couleur et la carte d'émission (éclairage
// intérieur), qui doivent coïncider exactement.
export function trainWindowLayout(style, w, h) {
  if (style === 'freight') return { doors: [], windows: [{ x: 16, y: h * 0.5, w: 120, h: h * 0.3, r: 10, cab: true }] };
  const doors = style === 'modern' ? [0.3, 0.72] : [0.22, 0.5, 0.78];
  const out = { doors: [], windows: [] };
  for (const d of doors) {
    const dx = d * w - 38;
    out.doors.push({ x: dx, w: 76 });
    out.windows.push({ x: dx + 7, y: h * 0.42, w: 25, h: h * 0.36, r: 4, door: true });
    out.windows.push({ x: dx + 44, y: h * 0.42, w: 25, h: h * 0.36, r: 4, door: true });
  }
  const winY = h * 0.42;
  const winH = style === 'modern' ? h * 0.36 : h * 0.33;
  const segs = [];
  let prev = style === 'modern' ? 0.02 : 0.04;
  for (const d of doors) { segs.push([prev, d - 0.055]); prev = d + 0.055; }
  segs.push([prev, 0.98]);
  for (const [a, b] of segs) {
    if (style === 'modern') out.windows.push({ x: a * w + 6, y: winY, w: (b - a) * w - 12, h: winH, r: 18 });
    else {
      const count = Math.max(1, Math.round(((b - a) * w) / 90));
      const ww = ((b - a) * w) / count;
      for (let i = 0; i < count; i++) out.windows.push({ x: a * w + i * ww + 6, y: winY, w: ww - 12, h: winH, r: 9, pax: (i + Math.floor(a * 10)) % 3 === 0 });
    }
  }
  return out;
}

// Intérieur vu à travers une vitre : plafond lumineux, dossiers de sièges,
// barres de maintien, passagers, puis vitre teintée et reflet du ciel.
function drawTrainWindow(ctx, wr, tint, style) {
  const { x, y, w, h, r } = wr;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#3a3a40');
  g.addColorStop(0.55, '#a59d8c');
  g.addColorStop(0.92, '#efe6cf');
  g.addColorStop(1, '#fff8e6');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  if (!wr.cab) {
    // dossiers de sièges
    ctx.fillStyle = style === 'modern' ? '#2f4566' : '#7a2f3a';
    for (let sx = x + 4; sx < x + w - 6; sx += 22) { roundRect(ctx, sx, y, 16, h * 0.4, 4); ctx.fill(); }
    // barres de maintien
    ctx.fillStyle = 'rgba(215,220,228,0.9)';
    for (let px = x + 14; px < x + w; px += 44) ctx.fillRect(px, y, 3, h);
    ctx.fillRect(x, y + h * 0.82, w, 2.5);
    if (wr.pax) {
      ctx.fillStyle = 'rgba(40,32,30,0.55)';
      ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.58, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x + w / 2 - 11, y, 22, h * 0.48);
    }
  } else {
    ctx.fillStyle = '#2a2f36';
    ctx.fillRect(x, y, w, h * 0.3); // pupitre
  }
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.restore();
  glassReflection(ctx, x, y, w, h);
  ctx.strokeStyle = 'rgba(15,15,18,0.85)';
  ctx.lineWidth = 3;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

// Carte d'émission du flanc : éclairage intérieur visible à travers les vitres.
export function trainSideEmissive(style) {
  return makeTexture(`trainSideE:${style}`, 512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(0, h);
    ctx.scale(0.5, -0.5);
    const L = trainWindowLayout(style, 1024, 256);
    for (const wr of L.windows) {
      const g = ctx.createLinearGradient(0, wr.y, 0, wr.y + wr.h);
      g.addColorStop(0, wr.cab ? '#1a1a1a' : '#4a4232');
      g.addColorStop(0.7, wr.cab ? '#3a3a3a' : '#c9b98f');
      g.addColorStop(1, wr.cab ? '#555' : '#fff1cc');
      ctx.fillStyle = g;
      roundRect(ctx, wr.x, wr.y, wr.w, wr.h, wr.r);
      ctx.fill();
      if (!wr.cab) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        for (let sx = wr.x + 4; sx < wr.x + wr.w - 6; sx += 22) ctx.fillRect(sx, wr.y, 16, wr.h * 0.4);
      }
    }
  }, { srgb: true });
}

function glassReflection(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function graffiti(ctx, w, h, seed) {
  const r = rng(seed);
  const cols = ['#ff4fa3', '#ffd23f', '#3ee0ff', '#8cff5a', '#ffffff'];
  ctx.save();
  ctx.globalAlpha = 0.85;
  const x = w * (0.08 + r() * 0.5);
  ctx.translate(x, h * 0.85);
  ctx.rotate(-0.05);
  ctx.font = '900 44px sans-serif';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#111';
  const words = ['RUN!', 'ZOOM', 'MNN', 'GO GO', 'WAVE', 'FLY'];
  const word = words[Math.floor(r() * words.length)];
  ctx.strokeText(word, 0, 0);
  ctx.fillStyle = cols[Math.floor(r() * cols.length)];
  ctx.fillText(word, 0, 0);
  ctx.restore();
}

export function trainRoofTexture(style, body, nose = 0) {
  const key = `trainRoof:${style}:${body}:${nose}`;
  return makeTexture(key, 512, 128, (ctx, w, h) => {
    ctx.fillStyle = shade(css(body), -0.05);
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0.25)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < w; x += 16) { ctx.beginPath(); ctx.moveTo(x, h * 0.3); ctx.lineTo(x, h * 0.7); ctx.stroke(); }
    if (nose > 0) {
      // pare-brise panoramique peint sur la partie avant (u ∈ [0, nose])
      const nw = nose * w;
      const gg = ctx.createLinearGradient(0, 0, nw, 0);
      gg.addColorStop(0, '#0b1622');
      gg.addColorStop(1, '#22374a');
      ctx.fillStyle = gg;
      roundRect(ctx, 2, h * 0.08, nw - 8, h * 0.84, 22);
      ctx.fill();
      glassReflection(ctx, 2, h * 0.08, nw - 8, h * 0.84);
    }
    noise(ctx, w, h, 600, 0.1, 3);
  });
}

export function trainFrontTexture(style, livery) {
  const key = `trainFront:${style}:${livery.body}:${livery.stripe}`;
  return makeTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = css(livery.body);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = css(livery.stripe);
    ctx.fillRect(0, h * 0.76, w, h * 0.08);
    // pare-brise
    ctx.fillStyle = '#0f1b26';
    roundRect(ctx, w * 0.1, h * 0.08, w * 0.8, h * 0.42, 18);
    ctx.fill();
    glassReflection(ctx, w * 0.1, h * 0.08, w * 0.8, h * 0.42);
    // girouette lumineuse
    ctx.fillStyle = '#111';
    roundRect(ctx, w * 0.22, h * 0.54, w * 0.56, h * 0.1, 4); ctx.fill();
    ctx.fillStyle = '#ffb53b';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(livery.destination || 'CENTRAL', w / 2, h * 0.62);
    noise(ctx, w, h, 300, 0.1, 9);
  });
}

// Carte d'émission de la face avant : girouette lumineuse + cabine éclairée.
export function trainFrontEmissive(style, livery) {
  const dest = livery.destination || 'CENTRAL';
  return makeTexture(`trainFrontE:${style}:${dest}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, h * 0.08, 0, h * 0.5);
    g.addColorStop(0, '#2b2618');
    g.addColorStop(1, '#0d0c08');
    ctx.fillStyle = g;
    roundRect(ctx, w * 0.1, h * 0.08, w * 0.8, h * 0.42, 18);
    ctx.fill();
    ctx.fillStyle = '#ffb53b';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff9a1a';
    ctx.shadowBlur = 8;
    ctx.fillText(dest, w / 2, h * 0.62);
  });
}

export function containerTexture(color, label = 'MNNROW LOGISTICS') {
  const key = `container:${color}:${label}`;
  return makeTexture(key, 512, 256, (ctx, w, h) => {
    const base = css(color);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 12) {
      const g = ctx.createLinearGradient(x, 0, x + 12, 0);
      g.addColorStop(0, shade(base, -0.2));
      g.addColorStop(0.5, shade(base, 0.12));
      g.addColorStop(1, shade(base, -0.2));
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 12, h);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(label, 24, 52);
    ctx.font = 'bold 18px monospace';
    ctx.fillText('MNRU 402' + (label.length % 10) + '17 4', 24, 80);
    // coulures verticales (pluie, rouille) et marquages de manutention
    const r = rng(hashStr(key));
    for (let i = 0; i < 26; i++) {
      const x = r() * w;
      const len = 30 + r() * 120;
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, `rgba(70,40,25,${0.12 + r() * 0.18})`);
      g.addColorStop(1, 'rgba(70,40,25,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 2 + r() * 4, len);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('MAX GROSS 30 480 KG', w - 210, h - 30);
    ctx.fillText('TARE  3 750 KG', w - 210, h - 12);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(w - 64, 20, 40, 40);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('!', w - 50, 50);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(90,50,30,${0.05 + r() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(r() * w, h - r() * 40, 10 + r() * 30, 3 + r() * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    noise(ctx, w, h, 1500, 0.1, 11);
  });
}

// ---- Bâtiments ----------------------------------------------------------------
// Une tuile = un étage de 4 m : mur (brique, pierre, panneaux, rondins, crépi),
// fenêtres avec encadrement, croisillons, appui, reflets ou rideaux allumés.
const WALL_KIND = { metroA: 'brick', metroB: 'stone', metroC: 'panel', neonA: 'panel', neonB: 'panel', neonC: 'panel', chalet: 'logs', cabin: 'logs', adobe: 'stucco' };
const WIN = 512;

// Plan partagé entre la texture couleur et la carte d'émission (mêmes fenêtres
// allumées, mêmes rideaux) : tirages déterministes par style.
function windowPlan(style) {
  const r = rng(hashStr(`windows:${style.name}`) + 1);
  const r2 = rng(hashStr(`windowsDeco:${style.name}`));
  const cols = style.cols || 2;
  const cw = WIN / cols;
  const out = [];
  for (let i = 0; i < cols; i++) {
    const lit = r() < (style.lit ?? 0.3);
    out.push({
      x: i * cw + cw * 0.16, y: WIN * 0.18, w: cw * 0.68, h: WIN * 0.62, lit,
      curtain: r2() < 0.55, curtainW: 0.18 + r2() * 0.16, glow: 0.75 + r2() * 0.25, blind: r2() < 0.3 ? 0.15 + r2() * 0.35 : 0,
    });
  }
  return out;
}

// Dessine une forme et ses copies de l'autre côté des bords (texture raccord).
function wrapEach(w, h, x, y, rad, fn) {
  const xs = [0];
  const ys = [0];
  if (x < rad) xs.push(w); else if (x > w - rad) xs.push(-w);
  if (y < rad) ys.push(h); else if (y > h - rad) ys.push(-h);
  for (const dx of xs) for (const dy of ys) fn(x + dx, y + dy);
}

function drawWall(ctx, w, h, kind, wall, seed) {
  const r = rng(seed);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, h);
  if (kind === 'brick') {
    const bh = 16;
    const bw = 44;
    ctx.fillStyle = shade(wall, -0.32); // joints
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row * bh < h; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        ctx.fillStyle = shade(wall, (r() - 0.5) * 0.22);
        ctx.fillRect(x + off + 1.5, row * bh + 1.5, bw - 3, bh - 3);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + off + 1.5, row * bh + 1.5, bw - 3, 2);
      }
    }
  } else if (kind === 'stone') {
    for (let row = 0; row * 32 < h; row++) {
      let x = -r() * 60;
      while (x < w) {
        const sw = 50 + r() * 50;
        ctx.fillStyle = shade(wall, (r() - 0.5) * 0.16);
        ctx.fillRect(x + 2, row * 32 + 2, sw - 4, 28);
        x += sw;
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 2);
  } else if (kind === 'panel') {
    const pw = w / 4;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = shade(wall, (r() - 0.5) * 0.12);
      ctx.fillRect(i * pw + 2, 0, pw - 4, h);
      const g = ctx.createLinearGradient(i * pw, 0, i * pw + pw, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = g;
      ctx.fillRect(i * pw + 2, 0, pw - 4, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i <= 4; i++) ctx.fillRect(i * pw - 2, 0, 4, h);
    ctx.fillRect(0, h * 0.5 - 2, w, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 4; i++) for (const y of [10, h * 0.5 + 10, h - 12]) { ctx.beginPath(); ctx.arc(i * pw + 10, y, 2.2, 0, Math.PI * 2); ctx.arc(i * pw + pw - 10, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
  } else if (kind === 'logs') {
    const lh = 32;
    for (let y = 0; y < h; y += lh) {
      const g = ctx.createLinearGradient(0, y, 0, y + lh);
      g.addColorStop(0, shade(wall, 0.18));
      g.addColorStop(0.45, wall);
      g.addColorStop(1, shade(wall, -0.45));
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, lh);
      ctx.strokeStyle = 'rgba(40,20,5,0.25)';
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) {
        const yy = y + 6 + r() * (lh - 12);
        ctx.beginPath();
        ctx.moveTo(0, yy);
        for (let x = 0; x <= w; x += 32) ctx.lineTo(x, yy + Math.sin(x * 0.02 + k) * 1.5);
        ctx.stroke();
      }
    }
  } else {
    // crépi : taches douces + grain fin
    for (let i = 0; i < 70; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 20 + r() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() < 0.5 ? '255,255,255' : '0,0,0';
      g.addColorStop(0, `rgba(${c},${0.05 + r() * 0.05})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      wrapEach(w, h, x, y, rad, (px, py) => { ctx.save(); ctx.translate(px - x, py - y); ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); ctx.restore(); });
    }
  }
  noise(ctx, w, h, 4200, 0.1, seed + 3, 2);
}

export function windowTexture(style) {
  const key = `windows:${style.name}`;
  return makeTexture(key, WIN, WIN, (ctx, w, h) => {
    const wall = css(style.wall);
    const kind = style.wallKind || WALL_KIND[style.name] || 'stucco';
    drawWall(ctx, w, h, kind, wall, hashStr(key));
    const dark = new THREE.Color(wall).getHSL({}).l < 0.3;
    const frame = dark ? shade(wall, 0.3) : '#f2efe6';
    const glass = css(style.glass || '#5a7894');
    const litC = css(style.litColor || '#ffe7a8');
    // corniche d'étage
    ctx.fillStyle = shade(wall, -0.22);
    ctx.fillRect(0, h * 0.925, w, h * 0.075);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, h * 0.925, w, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, h - 4, w, 4);
    for (const p of windowPlan(style)) {
      const { x, y, w: ww, h: hh } = p;
      // linteau + ombre de l'embrasure
      ctx.fillStyle = shade(wall, kind === 'brick' ? -0.12 : 0.1);
      ctx.fillRect(x - 12, y - 18, ww + 24, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 9, y - 6, ww + 18, hh + 12);
      // vitre
      const g = ctx.createLinearGradient(x, y, x, y + hh);
      if (p.lit) {
        g.addColorStop(0, shade(litC, 0.25));
        g.addColorStop(0.6, litC);
        g.addColorStop(1, shade(litC, -0.3));
      } else {
        g.addColorStop(0, shade(glass, 0.38));
        g.addColorStop(0.45, glass);
        g.addColorStop(1, shade(glass, -0.45));
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, y, ww, hh);
      if (p.lit) {
        // lampe intérieure + rideaux
        const lg = ctx.createRadialGradient(x + ww / 2, y + hh * 0.3, 2, x + ww / 2, y + hh * 0.3, ww * 0.6);
        lg.addColorStop(0, 'rgba(255,255,255,0.55)');
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(x, y, ww, hh);
        if (p.curtain) {
          const cwid = ww * p.curtainW;
          for (const cx of [x, x + ww - cwid]) {
            const cg = ctx.createLinearGradient(cx, 0, cx + cwid, 0);
            for (let k = 0; k <= 4; k++) cg.addColorStop(k / 4, k % 2 ? shade(litC, -0.45) : shade(litC, -0.25));
            ctx.fillStyle = cg;
            ctx.fillRect(cx, y, cwid, hh);
          }
        }
      } else {
        // reflets du ciel en biais
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, ww, hh);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(x + ww * 0.15, y + hh);
        ctx.lineTo(x + ww * 0.45, y + hh);
        ctx.lineTo(x + ww * 0.95, y);
        ctx.lineTo(x + ww * 0.65, y);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(x + ww * 0.55, y + hh);
        ctx.lineTo(x + ww * 0.62, y + hh);
        ctx.lineTo(x + ww * 1.12, y);
        ctx.lineTo(x + ww * 1.05, y);
        ctx.fill();
        ctx.restore();
      }
      if (p.blind) {
        ctx.fillStyle = shade(frame, -0.1);
        ctx.fillRect(x, y, ww, hh * p.blind);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let yy = y + 5; yy < y + hh * p.blind; yy += 6) ctx.fillRect(x, yy, ww, 1);
      }
      // encadrement et croisillons
      ctx.strokeStyle = frame;
      ctx.lineWidth = 7;
      ctx.strokeRect(x, y, ww, hh);
      ctx.fillStyle = frame;
      ctx.fillRect(x + ww / 2 - 3, y, 6, hh);
      ctx.fillRect(x, y + hh * 0.36 - 3, ww, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 3.5, y + 3.5, ww - 7, 3);
      // appui de fenêtre
      ctx.fillStyle = shade(frame, -0.05);
      ctx.fillRect(x - 14, y + hh + 4, ww + 28, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x - 14, y + hh + 4, ww + 28, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x - 12, y + hh + 14, ww + 24, 6);
      if (style.balcony) {
        const bi = Math.round((x - (WIN / (style.cols || 2)) * 0.16) / (WIN / (style.cols || 2)));
        if (bi % 2 === 0) {
          const by = y + hh + 16;
          ctx.fillStyle = shade(wall, -0.45);
          ctx.fillRect(x - 18, by + 22, ww + 36, 9);
          ctx.fillStyle = shade(wall, -0.55);
          ctx.fillRect(x - 18, by - 6, ww + 36, 4);
          for (let bx = x - 16; bx <= x + ww + 16; bx += 10) ctx.fillRect(bx, by - 4, 2.5, 26);
        }
      }
    }
  }, { repeat: true });
}

// Carte d'émission correspondante (fenêtres allumées uniquement).
export function windowEmissiveTexture(style) {
  const key = `windowsE:${style.name}`;
  return makeTexture(key, WIN / 2, WIN / 2, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.scale(w / WIN, h / WIN);
    const litC = css(style.litColor || '#ffe7a8');
    for (const p of windowPlan(style)) {
      if (!p.lit) continue;
      ctx.globalAlpha = p.glow;
      ctx.fillStyle = litC;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      if (p.curtain) { const cw = p.w * p.curtainW; ctx.fillRect(p.x, p.y, cw, p.h); ctx.fillRect(p.x + p.w - cw, p.y, cw, p.h); }
      if (p.blind) ctx.fillRect(p.x, p.y, p.w, p.h * p.blind);
      ctx.fillStyle = '#000';
      ctx.fillRect(p.x + p.w / 2 - 3, p.y, 6, p.h);
      ctx.fillRect(p.x, p.y + p.h * 0.36 - 3, p.w, 6);
    }
  }, { repeat: true });
}

export function roofTexture(color) {
  return makeTexture(`roof:${color}`, 256, 256, (ctx, w, h) => {
    const c = css(color);
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, w, h);
    const r = rng(hashStr(`roof:${color}`));
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = shade(c, (r() - 0.5) * 0.4);
      ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // lés d'étanchéité
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 3, h);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let x = 3; x < w; x += 64) ctx.fillRect(x, 0, 2, h);
    // aérateur
    ctx.fillStyle = shade(c, -0.35);
    ctx.beginPath(); ctx.arc(w * 0.7, h * 0.3, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(c, 0.25);
    ctx.beginPath(); ctx.arc(w * 0.7 - 2, h * 0.3 - 2, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
  }, { repeat: true });
}

// ---- Relief ---------------------------------------------------------------------
// Carte de normales tirée de la luminance d'une texture couleur ; indices
// bouclés pour rester raccord quand la texture se répète.
export function normalTexture(src, strength = 2, size = 256) {
  return makeTexture(`normal:${src.name}:${strength}`, size, size, (ctx, w, h) => {
    ctx.drawImage(src.image, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const p = img.data;
    const H = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) H[i] = (p[i * 4] * 0.3 + p[i * 4 + 1] * 0.59 + p[i * 4 + 2] * 0.11) / 255;
    const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
        const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
        const nx = -dx * strength;
        const ny = dy * strength;
        const l = Math.hypot(nx, ny, 1);
        const i = (y * w + x) * 4;
        p[i] = (nx / l * 0.5 + 0.5) * 255;
        p[i + 1] = (ny / l * 0.5 + 0.5) * 255;
        p[i + 2] = (1 / l * 0.5 + 0.5) * 255;
        p[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { srgb: false, repeat: true });
}

// Bois des traverses : fibres, nœuds, fentes (gris neutre, teinté par la couleur du matériau).
export function woodTexture() {
  return makeTexture('wood', 512, 64, (ctx, w, h) => {
    const r = rng(77);
    ctx.fillStyle = '#c9c2ba';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const y0 = r() * h;
      const v = 150 + Math.floor(r() * 90);
      ctx.strokeStyle = `rgba(${v - 40},${v - 50},${v - 60},${0.25 + r() * 0.35})`;
      ctx.lineWidth = 0.6 + r() * 1.8;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y0 + Math.sin(x * 0.012 + i) * 2.5 + Math.sin(x * 0.05 + i * 3) * 0.8);
      ctx.stroke();
    }
    for (let k = 0; k < 3; k++) {
      const x = 60 + r() * (w - 120);
      const y = 12 + r() * (h - 24);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, 'rgba(60,40,25,0.8)');
      g.addColorStop(0.5, 'rgba(90,70,50,0.45)');
      g.addColorStop(1, 'rgba(90,70,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(30,20,10,0.6)';
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) {
      const y = 8 + r() * (h - 16);
      const x = r() * w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30 + r() * 60, y + (r() - 0.5) * 4); ctx.stroke();
    }
    // bords usés plus sombres
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0.25)');
    g.addColorStop(0.15, 'rgba(0,0,0,0)');
    g.addColorStop(0.85, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 1800, 0.12, 78, 1.5);
  });
}

// ---- Sol ----------------------------------------------------------------------
export function groundTexture(type, color, color2) {
  const key = `ground:${type}:${color}:${color2}`;
  return makeTexture(key, 512, 512, (ctx, w, h) => {
    const c = css(color);
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, w, h);
    const r = rng(hashStr(key));
    if (type === 'ballast') {
      // interstices sombres, puis pierres anguleuses éclairées en haut à gauche
      ctx.fillStyle = shade(c, -0.5);
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2300; i++) {
        const x = r() * w;
        const y = r() * h;
        const rx = 3.5 + r() * 6.5;
        const ry = 2.6 + r() * 4.8;
        const rot = r() * Math.PI;
        const base = shade(c, (r() - 0.62) * 0.5);
        const sides = 5 + Math.floor(r() * 3);
        const jit = Array.from({ length: sides }, () => 0.75 + r() * 0.35);
        wrapEach(w, h, x, y, 12, (px, py) => {
          const poly = (ox, oy, s) => {
            ctx.beginPath();
            for (let k = 0; k < sides; k++) {
              const a = rot + (k / sides) * Math.PI * 2;
              ctx.lineTo(px + ox + Math.cos(a) * rx * jit[k] * s, py + oy + Math.sin(a) * ry * jit[k] * s);
            }
            ctx.closePath();
          };
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          poly(1.6, 2, 1.05);
          ctx.fill();
          ctx.fillStyle = base;
          poly(0, 0, 1);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.13)';
          poly(-rx * 0.18, -ry * 0.22, 0.55);
          ctx.fill();
        });
      }
    } else if (type === 'asphalt') {
      for (let i = 0; i < 40; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 30 + r() * 80;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        const tone = r() < 0.5 ? '0,0,0' : '255,255,255';
        g.addColorStop(0, `rgba(${tone},${0.04 + r() * 0.06})`);
        g.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 14000; i++) {
        const v = r();
        ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.15 + r() * 0.25})` : `rgba(230,230,225,${0.08 + r() * 0.22})`;
        ctx.fillRect(r() * w, r() * h, 1 + r() * 1.8, 1 + r() * 1.8);
      }
      // fissures
      ctx.strokeStyle = 'rgba(15,15,18,0.55)';
      for (let k = 0; k < 6; k++) {
        let x = r() * w;
        let y = r() * h;
        ctx.lineWidth = 0.8 + r() * 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 14; s++) { x += (r() - 0.5) * 22; y += (r() - 0.5) * 22; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      // marquage usé (pointillés)
      ctx.fillStyle = css(color2 || '#e8e2c8');
      ctx.globalAlpha = 0.85;
      ctx.fillRect(w * 0.48, 0, w * 0.04, h * 0.45);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = c;
        ctx.fillRect(w * 0.48 + r() * w * 0.04, r() * h * 0.45, 1 + r() * 2, 1 + r() * 2);
      }
    } else if (type === 'sand') {
      for (let i = 0; i < 30; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 40 + r() * 90;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(${r() < 0.5 ? '255,250,235' : '150,100,50'},${0.06 + r() * 0.06})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // rides de vent : crête claire + creux sombre
      for (let y = 0; y < h; y += 26) {
        const ph = r() * 6;
        for (const [dy, col] of [[0, 'rgba(255,248,230,0.32)'], [4, 'rgba(120,75,35,0.2)']]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + dy + Math.sin((x / w) * Math.PI * 4 + ph) * 7);
          ctx.stroke();
        }
      }
      for (let i = 0; i < 16000; i++) {
        ctx.fillStyle = r() < 0.5 ? `rgba(110,70,30,${r() * 0.25})` : `rgba(255,255,245,${r() * 0.3})`;
        ctx.fillRect(r() * w, r() * h, 1.2, 1.2);
      }
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = shade(c, 0.35 + r() * 0.3);
        ctx.beginPath(); ctx.ellipse(r() * w, r() * h, 2 + r() * 2.5, 1.5 + r() * 1.5, r() * 3, 0, Math.PI * 2); ctx.fill();
      }
    } else if (type === 'snow') {
      for (let i = 0; i < 90; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 18 + r() * 60;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(150,180,225,${0.06 + r() * 0.12})`);
        g.addColorStop(1, 'rgba(150,180,225,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // congères : arcs ombrés
      for (let i = 0; i < 40; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 14 + r() * 30;
        ctx.strokeStyle = 'rgba(140,170,215,0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, rad, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y - 2, rad, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      }
      noise(ctx, w, h, 6000, 0.08, 12, 2);
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.6 + r() * 0.4})`;
        ctx.fillRect(r() * w, r() * h, 1.3, 1.3);
      }
    } else if (type === 'grass') {
      for (let i = 0; i < 26; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 30 + r() * 70;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, r() < 0.3 ? 'rgba(110,85,45,0.22)' : 'rgba(30,60,20,0.18)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      const tones = [css(color2 || '#5c9a3c'), shade(c, -0.25), shade(c, 0.12), shade(css(color2 || '#5c9a3c'), 0.25)];
      ctx.lineCap = 'round';
      for (let i = 0; i < 9000; i++) {
        const x = r() * w;
        const y = r() * h;
        const len = 4 + r() * 7;
        const a = -Math.PI / 2 + (r() - 0.5) * 0.9;
        ctx.strokeStyle = tones[Math.floor(r() * tones.length)];
        ctx.lineWidth = 1 + r() * 0.8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
      }
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = r() < 0.6 ? 'rgba(255,255,240,0.9)' : 'rgba(255,220,80,0.9)';
        ctx.beginPath(); ctx.arc(r() * w, r() * h, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    } else if (type === 'tiles') {
      const T = 64;
      for (let y = 0; y < h; y += T) {
        for (let x = 0; x < w; x += T) {
          ctx.fillStyle = shade(c, (r() - 0.5) * 0.18);
          ctx.fillRect(x, y, T, T);
          const g = ctx.createLinearGradient(x, y, x + T, y + T);
          g.addColorStop(0, 'rgba(255,255,255,0.1)');
          g.addColorStop(0.5, 'rgba(255,255,255,0)');
          g.addColorStop(1, 'rgba(0,0,0,0.18)');
          ctx.fillStyle = g;
          ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
        }
      }
      ctx.strokeStyle = css(color2 || 'rgba(0,0,0,0.25)');
      ctx.lineWidth = 3;
      ctx.shadowColor = css(color2 || 'rgba(0,0,0,0)');
      ctx.shadowBlur = 6;
      for (let x = 0; x <= w; x += T) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += T) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.shadowBlur = 0;
      noise(ctx, w, h, 4000, 0.1, 21, 2);
    } else if (type === 'planks') {
      for (let y = 0; y < h; y += 32) {
        ctx.fillStyle = shade(c, (r() - 0.5) * 0.25);
        ctx.fillRect(0, y, w, 30);
        ctx.strokeStyle = 'rgba(40,20,5,0.2)';
        ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const yy = y + 4 + r() * 22;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 32) ctx.lineTo(x, yy + Math.sin(x * 0.02 + k) * 1.5);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, y + 30, w, 2);
      }
      noise(ctx, w, h, 3000, 0.12, 31, 2);
    } else {
      noise(ctx, w, h, 8000, 0.15, 2, 2);
    }
  }, { repeat: true });
}

export function stripeTexture(c1, c2, n = 6) {
  return makeTexture(`stripe:${c1}:${c2}:${n}`, 256, 64, (ctx, w, h) => {
    ctx.fillStyle = css(c1);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = css(c2);
    const sw = w / n;
    for (let i = -1; i < n + 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * sw, h);
      ctx.lineTo(i * sw + sw / 2, h);
      ctx.lineTo(i * sw + sw, 0);
      ctx.lineTo(i * sw + sw / 2, 0);
      ctx.fill();
    }
    noise(ctx, w, h, 300, 0.15, 3, 2);
  });
}

// Affiches et enseignes originales (aucune marque réelle).
const POSTERS = [
  ['ZAP COLA', 'Le pétillant électrique', '#ff3b5c', '#ffe14d'],
  ['MNNROW', 'Run the track', '#b8f477', '#13161b'],
  ['PIXEL NOODLES', 'Ouvert 24/7', '#ffb02e', '#2b1a4a'],
  ['SKY JUICE', '100% nuages', '#3ec5ff', '#ffffff'],
  ['ROBO RAMEN', 'Bip bip délicieux', '#ff6bd6', '#1a1033'],
  ['TURBO GUM', 'Mâche plus vite', '#7a5cff', '#fff4b0'],
  ['SURF FM 98.4', 'La radio du rail', '#ff8a3d', '#173a5a'],
  ['CACTUS COOL', 'Glaces du désert', '#43c47a', '#fff1d6'],
];
export function posterTexture(i) {
  const [title, sub, c1, c2] = POSTERS[i % POSTERS.length];
  return makeTexture(`poster:${i % POSTERS.length}`, 256, 384, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, c1);
    g.addColorStop(1, shade(c1, -0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.42, w * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h * 0.3); ctx.lineTo(w * 0.62, h * 0.3); ctx.lineTo(w * 0.5, h * 0.44); ctx.lineTo(w * 0.6, h * 0.44); ctx.lineTo(w * 0.4, h * 0.58); ctx.lineTo(w * 0.47, h * 0.45); ctx.lineTo(w * 0.38, h * 0.45);
    ctx.fill();
    ctx.fillStyle = c2;
    ctx.textAlign = 'center';
    ctx.font = '900 34px sans-serif';
    ctx.fillText(title, w / 2, h * 0.8, w * 0.9);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(sub, w / 2, h * 0.88, w * 0.9);
    ctx.strokeStyle = c2;
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  });
}

export function neonSignTexture(text, color) {
  return makeTexture(`neon:${text}:${color}`, 512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#07060c';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 64px sans-serif';
    ctx.shadowColor = css(color);
    ctx.shadowBlur = 24;
    ctx.fillStyle = css(color);
    ctx.fillText(text, w / 2, h / 2, w * 0.92);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '900 60px sans-serif';
    ctx.fillText(text, w / 2, h / 2, w * 0.9);
  });
}

// Face de hoverboard (vue du dessus), couleur personnalisable.
export function boardTexture(style, color, color2) {
  const key = `board:${style}:${color}:${color2}`;
  return makeTexture(key, 512, 128, (ctx, w, h) => {
    const c = css(color);
    const c2 = css(color2);
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, w, h);
    if (style === 'classic') {
      ctx.fillStyle = c2;
      ctx.fillRect(0, h * 0.4, w, h * 0.2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, h * 0.36, w, h * 0.04);
      ctx.fillRect(0, h * 0.6, w, h * 0.04);
    } else if (style === 'neon') {
      ctx.fillStyle = '#0b0b14';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = c;
      ctx.lineWidth = 6;
      ctx.shadowColor = c;
      ctx.shadowBlur = 16;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.1 + i * 70, h * 0.15);
        ctx.lineTo(w * 0.18 + i * 70, h * 0.5);
        ctx.lineTo(w * 0.1 + i * 70, h * 0.85);
        ctx.stroke();
      }
    } else if (style === 'futuristic') {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, shade(c, 0.3));
      g.addColorStop(0.5, c);
      g.addColorStop(1, shade(c, -0.3));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = c2;
      ctx.beginPath(); ctx.moveTo(w * 0.15, h * 0.5); ctx.lineTo(w * 0.55, h * 0.2); ctx.lineTo(w * 0.85, h * 0.5); ctx.lineTo(w * 0.55, h * 0.8); ctx.fill();
    } else if (style === 'urban') {
      ctx.fillStyle = '#1d1d22';
      ctx.fillRect(0, 0, w, h);
      noise(ctx, w, h, 4000, 0.35, 99, 2); // grip
      ctx.font = '900 70px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 8;
      ctx.strokeStyle = c2;
      ctx.strokeText('MNN', w / 2, h * 0.75);
      ctx.fillStyle = c;
      ctx.fillText('MNN', w / 2, h * 0.75);
    } else if (style === 'energy') {
      const g = ctx.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, c);
      g.addColorStop(1, shade(c, -0.6));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = c2;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h / 2 + Math.sin(x / 18) * h * 0.25);
      ctx.stroke();
    }
    if (style !== 'urban') noise(ctx, w, h, 600, 0.1, 4, 2);
  });
}

export function coinSymbolTexture() {
  return makeTexture('coinFace', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  });
}

export function shade(hex, amt) {
  const c = new THREE.Color(hex);
  if (amt >= 0) c.lerp(new THREE.Color(1, 1, 1), amt);
  else c.lerp(new THREE.Color(0, 0, 0), -amt);
  return '#' + c.getHexString();
}

// ---- Tissus du personnage (gris clair, teintés par la couleur choisie) -----------
// Maille de pull : rangées de « V » ; jean : sergé diagonal + fils irréguliers ;
// cuir de chaussure : grain fin. Valeurs proches du blanc pour ne pas assombrir
// la couleur du joueur, le relief vient de la carte de normales dérivée.
export function fabricTexture(kind) {
  return makeTexture(`fabric:${kind}`, 256, 256, (ctx, w, h) => {
    const r = rng(hashStr(kind));
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, w, h);
    if (kind === 'knit') {
      const sw = 16;
      const sh = 12;
      for (let y = 0; y < h; y += sh) {
        for (let x = 0; x < w; x += sw) {
          const v = 205 + Math.floor(r() * 30);
          ctx.strokeStyle = `rgb(${v},${v},${v})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x + 2, y + 1); ctx.lineTo(x + sw / 2, y + sh - 1); ctx.lineTo(x + sw - 2, y + 1);
          ctx.stroke();
        }
      }
      // côtes du bas de manche / ourlets
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 2, h);
    } else if (kind === 'denim') {
      ctx.strokeStyle = 'rgba(0,0,0,0.13)';
      ctx.lineWidth = 2;
      for (let i = -h; i < w; i += 5) { ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke(); }
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(255,255,255,${r() * 0.35})`;
        ctx.fillRect(r() * w, r() * h, 1 + r() * 6, 1);
      }
      // usure claire au centre (délavé)
      const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
      g.addColorStop(0, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (kind === 'leather') {
      for (let i = 0; i < 2600; i++) {
        const v = 200 + Math.floor(r() * 50);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath(); ctx.arc(r() * w, r() * h, 0.8 + r() * 1.6, 0, Math.PI * 2); ctx.fill();
      }
    } else if (kind === 'hair') {
      for (let i = 0; i < 700; i++) {
        const x = r() * w;
        const v = 170 + Math.floor(r() * 85);
        ctx.strokeStyle = `rgb(${v},${v},${v})`;
        ctx.lineWidth = 1 + r() * 1.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + (r() - 0.5) * 20, h / 2, x + (r() - 0.5) * 10, h); ctx.stroke();
      }
    }
  }, { repeat: true });
}

// Floor is Lava : roche sombre parcourue de fissures incandescentes (carte d'émission).
export function lavaTexture() {
  return makeTexture('lava', 512, 512, (ctx, w, h) => {
    const r = rng(9091);
    ctx.fillStyle = '#120402';
    ctx.fillRect(0, 0, w, h);
    // flaques de magma diffuses
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, rad = 30 + r() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,90,10,0.55)');
      g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g;
      wrapEach(w, h, x, y, rad, (px, py) => { ctx.save(); ctx.translate(px - x, py - y); ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); ctx.restore(); });
    }
    // fissures : traits brillants avec halo
    ctx.lineCap = 'round';
    for (let k = 0; k < 34; k++) {
      let x = r() * w, y = r() * h;
      const pts = [[x, y]];
      for (let s = 0; s < 9; s++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; pts.push([x, y]); }
      for (const [width, col] of [[9, 'rgba(255,60,0,0.35)'], [4, 'rgba(255,140,20,0.9)'], [1.6, 'rgba(255,240,170,1)']]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = width;
        for (const dx of [0, -w, w]) for (const dy of [0, -h, h]) {
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)));
          ctx.stroke();
        }
      }
    }
  }, { repeat: true });
}
