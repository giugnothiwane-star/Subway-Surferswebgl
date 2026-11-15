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

export function makeTexture(key, w, h, draw, { srgb = true, repeat = false, mipmaps = true } = {}) {
  if (cache.has(key)) return cache.get(key);
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
    // portes (2 par flanc)
    const doors = style === 'modern' ? [0.3, 0.72] : [0.22, 0.5, 0.78];
    for (const d of doors) {
      const dx = d * w - 38;
      ctx.fillStyle = shade(body, -0.08);
      roundRect(ctx, dx, h * 0.08, 76, h * 0.78, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3;
      roundRect(ctx, dx, h * 0.08, 76, h * 0.78, 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx + 38, h * 0.08); ctx.lineTo(dx + 38, h * 0.86); ctx.stroke();
      ctx.fillStyle = css(livery.window || '#1a2a3a');
      roundRect(ctx, dx + 7, h * 0.42, 25, h * 0.36, 4); ctx.fill();
      roundRect(ctx, dx + 44, h * 0.42, 25, h * 0.36, 4); ctx.fill();
      glassReflection(ctx, dx + 7, h * 0.42, 62, h * 0.36);
    }
    // fenêtres
    const winY = h * 0.42;
    const winH = style === 'modern' ? h * 0.36 : h * 0.33;
    ctx.fillStyle = css(livery.window || '#1a2a3a');
    const segs = [];
    let prev = style === 'modern' ? 0.02 : 0.04;
    for (const d of doors) { segs.push([prev, d - 0.055]); prev = d + 0.055; }
    segs.push([prev, 0.98]);
    for (const [a, b] of segs) {
      if (style === 'modern') {
        roundRect(ctx, a * w + 6, winY, (b - a) * w - 12, winH, 18); ctx.fill();
        glassReflection(ctx, a * w + 6, winY, (b - a) * w - 12, winH);
      } else {
        const count = Math.max(1, Math.round(((b - a) * w) / 90));
        const ww = ((b - a) * w) / count;
        for (let i = 0; i < count; i++) {
          ctx.fillStyle = css(livery.window || '#1a2a3a');
          roundRect(ctx, a * w + i * ww + 6, winY, ww - 12, winH, 9); ctx.fill();
          glassReflection(ctx, a * w + i * ww + 6, winY, ww - 12, winH);
          // silhouettes de passagers (discrètes)
          if ((i + Math.floor(a * 10)) % 3 === 0) {
            ctx.fillStyle = 'rgba(255,220,180,0.13)';
            ctx.beginPath(); ctx.arc(a * w + i * ww + ww / 2, winY + winH * 0.45, 9, 0, Math.PI * 2); ctx.fill();
            ctx.fillRect(a * w + i * ww + ww / 2 - 12, winY + winH * 0.6, 24, winH * 0.4);
          }
        }
      }
    }
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
    // rouille / usure
    const r = rng(hashStr(key));
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
// Grille de fenêtres répétable (1 tuile = 4 m × 4 m). `lit` : proportion de fenêtres allumées.
export function windowTexture(style) {
  const key = `windows:${style.name}`;
  return makeTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = css(style.wall);
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 900, 0.12, hashStr(key), 3);
    // bandeau d'étage
    ctx.fillStyle = shade(css(style.wall), -0.15);
    ctx.fillRect(0, h * 0.92, w, h * 0.08);
    const r = rng(hashStr(key) + 1);
    const cols = style.cols || 2;
    const cw = w / cols;
    for (let i = 0; i < cols; i++) {
      const x = i * cw + cw * 0.16;
      const y = h * 0.18;
      const ww = cw * 0.68;
      const hh = h * 0.62;
      ctx.fillStyle = shade(css(style.wall), -0.3);
      ctx.fillRect(x - 4, y - 4, ww + 8, hh + 10);
      const lit = r() < (style.lit ?? 0.3);
      const g = ctx.createLinearGradient(x, y, x + ww, y + hh);
      if (lit) {
        g.addColorStop(0, css(style.litColor || '#ffe7a8'));
        g.addColorStop(1, shade(css(style.litColor || '#ffe7a8'), -0.25));
      } else {
        g.addColorStop(0, css(style.glass || '#5a7894'));
        g.addColorStop(1, shade(css(style.glass || '#5a7894'), -0.35));
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, y, ww, hh);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x, y, ww, 3);
      ctx.fillRect(x + ww / 2 - 1, y, 2, hh);
      if (style.balcony && i % 2 === 0) {
        ctx.fillStyle = shade(css(style.wall), -0.4);
        ctx.fillRect(x - 6, y + hh, ww + 12, 8);
      }
    }
  }, { repeat: true });
}

// Carte d'émission correspondante (fenêtres allumées uniquement).
export function windowEmissiveTexture(style) {
  const key = `windowsE:${style.name}`;
  return makeTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const r = rng(hashStr(`windows:${style.name}`) + 1);
    const cols = style.cols || 2;
    const cw = w / cols;
    for (let i = 0; i < cols; i++) {
      const lit = r() < (style.lit ?? 0.3);
      if (!lit) continue;
      ctx.fillStyle = css(style.litColor || '#ffe7a8');
      ctx.fillRect(i * cw + cw * 0.16, h * 0.18, cw * 0.68, h * 0.62);
    }
  }, { repeat: true });
}

export function roofTexture(color) {
  return makeTexture(`roof:${color}`, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = css(color);
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 900, 0.2, 5, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.strokeRect(4, 4, w - 8, h - 8);
  }, { repeat: true });
}

// ---- Sol ----------------------------------------------------------------------
export function groundTexture(type, color, color2) {
  const key = `ground:${type}:${color}:${color2}`;
  return makeTexture(key, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = css(color);
    ctx.fillRect(0, 0, w, h);
    const r = rng(hashStr(key));
    if (type === 'ballast') {
      for (let i = 0; i < 2600; i++) {
        const v = 70 + Math.floor(r() * 110);
        ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        ctx.beginPath();
        ctx.ellipse(r() * w, r() * h, 1.5 + r() * 3.5, 1 + r() * 2.5, r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'asphalt') {
      noise(ctx, w, h, 5000, 0.25, 4, 2);
      ctx.fillStyle = css(color2 || '#e8e2c8');
      ctx.fillRect(w * 0.48, 0, w * 0.04, h * 0.45);
    } else if (type === 'sand') {
      noise(ctx, w, h, 6000, 0.18, 8, 2);
      ctx.strokeStyle = 'rgba(120,80,40,0.12)';
      ctx.lineWidth = 3;
      for (let y = 0; y < h; y += 22) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 4) * 6);
        ctx.stroke();
      }
    } else if (type === 'snow') {
      noise(ctx, w, h, 4000, 0.1, 12, 3);
      for (let i = 0; i < 300; i++) {
        ctx.fillStyle = `rgba(160,190,230,${r() * 0.18})`;
        ctx.beginPath();
        ctx.arc(r() * w, r() * h, 2 + r() * 8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'grass') {
      for (let i = 0; i < 4000; i++) {
        ctx.fillStyle = r() < 0.5 ? css(color2 || '#5c9a3c') : shade(css(color), (r() - 0.5) * 0.3);
        ctx.fillRect(r() * w, r() * h, 1.5, 3 + r() * 4);
      }
    } else if (type === 'tiles') {
      ctx.strokeStyle = css(color2 || 'rgba(0,0,0,0.25)');
      ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      noise(ctx, w, h, 1500, 0.12, 21, 2);
    } else if (type === 'planks') {
      for (let y = 0; y < h; y += 32) {
        ctx.fillStyle = shade(css(color), (r() - 0.5) * 0.25);
        ctx.fillRect(0, y, w, 30);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, y + 30, w, 2);
      }
      noise(ctx, w, h, 1500, 0.12, 31, 2);
    } else {
      noise(ctx, w, h, 3000, 0.15, 2, 2);
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
