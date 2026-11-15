// Mode propriétaire : débloqué par un code saisi dans les Paramètres.
//
// Sécurité (honnête) : le site est statique, tout son code est public. Le code
// propriétaire n'est donc PAS stocké en clair : seule une empreinte PBKDF2
// (400 000 itérations, sel aléatoire) figure ici, et les essais sont limités
// (attente croissante après 5 échecs). Mais le vrai verrou est ailleurs :
// publier une image pour tout le monde exige un jeton GitHub personnel que
// seul le propriétaire possède. Ce jeton n'est jamais dans le dépôt : il est
// conservé sur l'appareil du propriétaire, chiffré (AES-GCM) avec une clé
// dérivée de son code. Sans ce jeton, connaître ou deviner le code ne permet
// de rien publier.

const CODE_SALT = 'ad95e0f72fcfa6898b7143f58df0afbe';
const CODE_HASH = 'abf4ccf5a9bd591b34de8aff292aed07550a1a09a04f11a87daf851178d90c33';
const ITER = 400000;
const LS_TOKEN = 'mnnrow_owner_token';
const LS_LOCK = 'mnnrow_owner_lock';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function subtle() {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Chiffrement indisponible (page non sécurisée ?).');
  return s;
}

async function pbkdf2Bits(code, saltBytes, iterations = ITER) {
  const key = await subtle().importKey('raw', enc.encode(String(code)), 'PBKDF2', false, ['deriveBits']);
  return subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256);
}

// Comparaison à temps constant (évite de révéler la position de la 1re différence).
function sameHex(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function verifyOwnerCode(code, { salt = CODE_SALT, hash = CODE_HASH, iterations = ITER } = {}) {
  if (!/^\d{4,12}$/.test(String(code))) return false;
  return sameHex(hex(await pbkdf2Bits(code, unhex(salt), iterations)), hash);
}

// Délai imposé après des échecs : 5 essais libres, puis 30 s, 60 s, 120 s… (max 1 h).
export function lockoutDelay(failures) {
  if (failures < 5) return 0;
  return Math.min(3600, 30 * 2 ** (failures - 5)) * 1000;
}

async function tokenKey(code, saltBytes) {
  const bits = await pbkdf2Bits(code, saltBytes);
  return subtle().importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealToken(token, code) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, await tokenKey(code, salt), enc.encode(token));
  return JSON.stringify({ v: 1, s: b64(salt), i: b64(iv), c: b64(new Uint8Array(ct)) });
}

export async function openToken(sealed, code) {
  const o = JSON.parse(sealed);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(o.i) }, await tokenKey(code, unb64(o.s)), unb64(o.c));
  return new TextDecoder().decode(pt);
}

export class Owner {
  constructor(storage = globalThis.localStorage) {
    this.ls = storage;
    this.code = null; // en mémoire seulement, jamais enregistré
    this.unlocked = false;
    this.listeners = [];
  }

  // Le code n'est gardé qu'en mémoire : recharger la page reverrouille.
  get(k) { try { return this.ls?.getItem(k) ?? null; } catch { return null; } }
  set(k, v) { try { if (v === null) this.ls?.removeItem(k); else this.ls?.setItem(k, v); } catch { /* stockage bloqué */ } }

  lockState() {
    try { return { failures: 0, until: 0, ...JSON.parse(this.get(LS_LOCK) || '{}') }; } catch { return { failures: 0, until: 0 }; }
  }

  // Secondes d'attente restantes avant un nouvel essai (0 = autorisé).
  waitSeconds(now = Date.now()) {
    return Math.max(0, Math.ceil((this.lockState().until - now) / 1000));
  }

  async unlock(code) {
    const wait = this.waitSeconds();
    if (wait > 0) return { ok: false, wait };
    const ok = await verifyOwnerCode(code);
    const st = this.lockState();
    if (!ok) {
      st.failures += 1;
      st.until = Date.now() + lockoutDelay(st.failures);
      this.set(LS_LOCK, JSON.stringify(st));
      return { ok: false, wait: this.waitSeconds(), failures: st.failures };
    }
    this.set(LS_LOCK, null);
    this.code = String(code);
    this.unlocked = true;
    this.emit();
    return { ok: true };
  }

  lock() {
    this.code = null;
    this.unlocked = false;
    this.emit();
  }

  hasToken() {
    return !!this.get(LS_TOKEN);
  }

  async saveToken(token) {
    if (!this.unlocked) throw new Error('Mode propriétaire verrouillé.');
    const t = String(token || '').trim();
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) throw new Error('Jeton GitHub invalide (il commence par github_pat_ ou ghp_).');
    this.set(LS_TOKEN, await sealToken(t, this.code));
    this.emit();
  }

  forgetToken() {
    this.set(LS_TOKEN, null);
    this.emit();
  }

  async token() {
    if (!this.unlocked) throw new Error('Mode propriétaire verrouillé.');
    const sealed = this.get(LS_TOKEN);
    if (!sealed) throw new Error('Aucun jeton GitHub enregistré (Paramètres → Propriétaire).');
    return openToken(sealed, this.code);
  }

  onChange(fn) { this.listeners.push(fn); }
  emit() { for (const f of this.listeners) f(this); }
}
