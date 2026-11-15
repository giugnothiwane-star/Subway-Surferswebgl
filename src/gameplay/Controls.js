// Commandes PC (clavier) et mobile (swipes en Pointer Events, double tap,
// boutons tactiles). Les gestes ne font pas défiler la page et les touches
// sont ignorées pendant la saisie dans un champ.
export class Controls {
  constructor(target, onAction, opts = {}) {
    this.target = target;
    this.onAction = onAction;
    this.enabled = false;
    this.sensitivity = opts.sensitivity ?? 1;
    this.pointers = new Map();
    this.lastTap = 0;
    this._key = (e) => this.onKey(e);
    this._down = (e) => this.onDown(e);
    this._move = (e) => this.onMove(e);
    this._up = (e) => this.onUp(e);
    window.addEventListener('keydown', this._key);
    target.addEventListener('pointerdown', this._down);
    target.addEventListener('pointermove', this._move);
    target.addEventListener('pointerup', this._up);
    target.addEventListener('pointercancel', this._up);
    target.style.touchAction = 'none';
  }

  static isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  onKey(e) {
    if (Controls.isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    let action = null;
    if (k === 'arrowleft' || k === 'a' || k === 'q') action = 'left';
    else if (k === 'arrowright' || k === 'd') action = 'right';
    else if (k === 'arrowup' || k === 'w' || k === 'z' || k === ' ') action = 'jump';
    else if (k === 'arrowdown' || k === 's') action = 'roll';
    else if (k === 'e' || k === 'b' || k === 'shift') action = 'board';
    else if (k === 'escape' || k === 'p') action = 'pause';
    if (!action) return;
    if (this.enabled || action === 'pause') e.preventDefault();
    if (e.repeat) return; // pas de double action en maintenant la touche
    if (this.enabled || action === 'pause') this.onAction(action, 'keyboard');
  }

  threshold() {
    const base = Math.min(window.innerWidth, window.innerHeight) * 0.06;
    return Math.max(18, Math.min(60, base)) / this.sensitivity;
  }

  onDown(e) {
    if (!this.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), fired: false });
    try {
      this.target.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture indisponible : le geste reste suivi sans capture */
    }
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p || p.fired || !this.enabled) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const th = this.threshold();
    if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
    // le geste est reconnu dès que le seuil est franchi (réactivité)
    p.fired = true;
    if (Math.abs(dx) > Math.abs(dy)) this.onAction(dx > 0 ? 'right' : 'left', 'swipe');
    else this.onAction(dy < 0 ? 'jump' : 'roll', 'swipe');
  }

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p || p.fired || !this.enabled) return;
    const now = performance.now();
    if (now - p.t < 250) {
      if (now - this.lastTap < 320) {
        this.onAction('board', 'doubletap');
        this.lastTap = 0;
      } else this.lastTap = now;
    }
  }

  bindButtons(root) {
    root.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.enabled || b.dataset.act === 'pause') this.onAction(b.dataset.act, 'button');
      });
    });
  }

  dispose() {
    window.removeEventListener('keydown', this._key);
    this.target.removeEventListener('pointerdown', this._down);
    this.target.removeEventListener('pointermove', this._move);
    this.target.removeEventListener('pointerup', this._up);
    this.target.removeEventListener('pointercancel', this._up);
  }
}
