// Orchestrateur : boucle de rendu, états (menu / course / pause / fin /
// studio), carte et édition actives, liaison simulation -> rendu -> audio -> UI.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Renderer } from './Renderer.js';
import { CameraRig } from './CameraRig.js';
import { Simulation } from '../gameplay/Simulation.js';
import { Bot } from '../gameplay/Bot.js';
import { DEFAULT_SPEED, POWERUP_TYPES } from '../gameplay/constants.js';
import { groundHeight } from '../gameplay/obstacles.js';
import { randomSeed } from '../gameplay/rng.js';
import { Environment } from '../world/Environment.js';
import { EntityRenderer } from '../world/EntityRenderer.js';
import { PlayerView } from '../world/PlayerView.js';
import { ParticleSystem } from '../world/Particles.js';
import { getMap } from '../data/maps.js';
import { BOARDS, CHARACTERS, MODES, VERSIONS } from '../data/catalog.js';
import { claim, commitRun, ensureMissions, snapshotBase, trackRun } from '../gameplay/Missions.js';
import { buildTrain } from '../models/Trains.js';
import { coinGeometry, coinGlowMaterial } from '../models/Props.js';

const _v = new THREE.Vector3();

export class Game {
  constructor({ canvas, storage, audio, assets, gpuInfo, ui }) {
    this.canvas = canvas;
    this.storage = storage;
    this.save = storage.data;
    this.audio = audio;
    this.assets = assets;
    this.ui = ui;
    this.state = 'boot';
    this.r = new Renderer(canvas, { quality: this.save.settings.quality, shadows: this.save.settings.shadows, gpuInfo });
    this.scene = new THREE.Scene();
    this.rig = new CameraRig();
    this.rig.reduced = this.save.settings.reducedMotion;
    this.particles = new ParticleSystem(700);
    this.particles.scale = this.r.profile.particles;
    this.scene.add(this.particles.points);
    this.custom = {};
    this.clock = { last: performance.now() };
    this.time = 0;
    this.slowMo = 0;
    this.r.on('lost', () => this.onContextLost());
    this.r.on('restored', () => this.onContextRestored());
    this.r.on('profile', (p) => {
      this.env?.setProfile(p);
      this.entities?.setProfile(p);
      this.particles.scale = p.particles;
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => this.onVisibility());
  }

  async init() {
    const rig = await this.assets.loadCharacter();
    this.player = new PlayerView(this.scene);
    this.player.setRig(rig);
    this.applyCharacter();
    this.applyBoard();
    this.loadMap(this.effectiveMapId());
    this.resize();
    this.state = 'menu';
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---- configuration -------------------------------------------------------------
  version() {
    return VERSIONS.find((v) => v.id === this.save.selected.version) || VERSIONS.find((v) => v.id === 'ultimate');
  }
  mode() {
    return MODES.find((m) => m.id === this.save.selected.mode) || MODES[0];
  }
  effectiveMapId() {
    const v = this.version();
    return v.lockMap && v.map ? v.map : this.save.selected.map;
  }

  loadMap(id) {
    const map = getMap(id);
    if (this.map?.id === map.id && this.env) return;
    this.env?.dispose();
    this.entities?.dispose();
    this.map = map;
    this.env = new Environment(this.scene, this.r, map, this.r.profile);
    this.entities = new EntityRenderer(this.scene, map, this.r.profile, this.entityCustom());
    this.env.setLighting(this.save.studio.lighting);
    this.menuSim = new Simulation({ seed: 'menu', powerups: [] });
    this.audio.setAmbience(map.id);
    if (this.state === 'menu' || this.state === 'boot') this.audio.startMusic('menu', map.music);
    this.ui?.onMapChanged?.(map);
  }

  look() {
    const ch = CHARACTERS.find((c) => c.id === this.save.selected.character) || CHARACTERS[0];
    const versionLook = this.version().look || {};
    return { ...ch.look, ...versionLook, ...this.save.look, shirtTexture: this.custom.shirtTexture };
  }

  applyCharacter() {
    this.player?.setLook(this.look());
  }

  applyBoard() {
    const b = BOARDS.find((x) => x.id === this.save.selected.board) || BOARDS[0];
    const vb = this.version().board || {};
    this.player?.setBoard(b.id, this.save.board.color || vb.color || b.color, this.save.board.color2 || b.color2, this.custom.boardTexture);
  }

  // Réglages du studio transmis au rendu des entités (pièces, trains).
  entityCustom() {
    const st = this.save.studio;
    return { coinTint: st.coinTint, coinGlow: st.coinGlow, coinTexture: this.custom.coinTexture, trainLivery: st.trainLivery, trainTexture: this.custom.trainTexture };
  }

  applyCustom(custom) {
    this.custom = { ...this.custom, ...custom };
    this.entities?.applyCustom(this.entityCustom());
    this.applyCharacter();
    this.applyBoard();
  }

  setVersion(id) {
    const v = VERSIONS.find((x) => x.id === id);
    if (!v || v.disabled) return false;
    this.save.selected.version = id;
    this.storage.save();
    this.loadMap(this.effectiveMapId());
    this.applyCharacter();
    this.applyBoard();
    return true;
  }

  setMap(id) {
    this.save.selected.map = id;
    this.storage.save();
    this.loadMap(this.effectiveMapId());
  }

  // ---- course ------------------------------------------------------------------------
  startRun(seed = null) {
    if (this.r.contextLost) return;
    const v = this.version();
    const mode = this.mode();
    this.loadMap(this.effectiveMapId());
    this.seed = seed || randomSeed();
    this.save.lastSeed = this.seed;
    ensureMissions(this.save.missions);
    this.missionBase = snapshotBase(this.save.missions);
    this.sim = new Simulation({
      seed: this.seed,
      speedProfile: v.speed || DEFAULT_SPEED,
      speedMult: mode.speedMult,
      scoreMult: mode.scoreMult,
      zen: !!mode.zen,
      powerups: v.powerups || POWERUP_TYPES,
      features: v.features,
      density: v.density || 1,
      trainVariants: this.map.trains.variants,
      baseMultiplier: this.save.missions.level,
      canUseBoard: () => this.save.hoverboards > 0,
    });
    this.entities.clear();
    this.particles.clear();
    this.player.reset();
    this.bot = this.autopilot ? new Bot(this.sim) : null;
    this.finishedMissions = [];
    this.deathTimer = 0;
    this.rig.groundY = 0;
    this.rig.viewShift(0);
    this.rig.beginTransition();
    this.state = 'playing';
    this.controls && (this.controls.enabled = true);
    this.audio.startMusic('run', this.map.music);
    this.audio.duck(false);
    this.ui.showHUD(this.sim);
    if (this.save.settings.autoFullscreen && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) this.ui.toggleFullscreen(true);
    this.keepAwake(true);
    this.storage.save();
  }

  input(action) {
    if (action === 'pause') {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    if (this.state !== 'playing' || !this.sim) return;
    this.sim.input(action);
  }

  pause(reason = 'user') {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.controls && (this.controls.enabled = false);
    this.audio.duck(true);
    this.ui.showPause(reason);
  }

  resume() {
    if (this.state !== 'paused' || this.r.contextLost) return;
    this.state = 'playing';
    this.controls && (this.controls.enabled = true);
    this.audio.duck(false);
    this.clock.last = performance.now();
    this.ui.showHUD(this.sim);
  }

  // Empêche l'écran de s'éteindre pendant une course (Wake Lock API si disponible).
  async keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !this.wakeLock && !document.hidden) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener?.('release', () => { this.wakeLock = null; });
      } else if (!on && this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch { this.wakeLock = null; }
  }

  quitToMenu() {
    this.keepAwake(false);
    this.state = 'menu';
    this.controls && (this.controls.enabled = false);
    this.sim = null;
    this.entities.clear();
    this.player.reset();
    this.audio.duck(false);
    this.audio.startMusic('menu', this.map.music);
    this.ui.showScreen('menu');
  }

  endRun() {
    const sim = this.sim;
    const sum = sim.summary();
    const zen = !!this.mode().zen;
    const newRecord = !zen && this.save.best > 0 && sum.score > this.save.best;
    const firstRecord = !zen && sum.score > this.save.best;
    const run = { ...sum, newRecord };
    commitRun(this.save.missions, run, this.missionBase);
    if (firstRecord) this.save.best = sum.score;
    this.save.bestDistance = Math.max(this.save.bestDistance, sum.distance);
    this.save.bank += sum.coins;
    const st = this.save.stats;
    st.runs++;
    st.coins += sum.coins;
    st.distance += sum.distance;
    for (const k of ['jumps', 'rolls', 'powerups', 'boards', 'trainTops', 'laneChanges']) st[k] += sum.stats[k] || 0;
    const reward = claim(this.save.missions, this.save);
    this.storage.save();
    this.state = 'gameover';
    this.keepAwake(false);
    this.controls && (this.controls.enabled = false);
    this.audio.play('gameover');
    this.audio.startMusic('menu', this.map.music);
    this.ui.showGameOver({ ...run, best: this.save.best, bank: this.save.bank, reward, missions: this.save.missions, finished: this.finishedMissions, zen });
    if (this.finishedMissions.length || reward.levelUp) this.celebrate = 2.5;
  }

  onSimEvent(e) {
    const a = this.audio;
    const sim = this.sim;
    const pp = this.player.group.position;
    this.player.onEvent(e);
    switch (e.type) {
      case 'coin':
        a.play('coin', { combo: e.combo });
        this.particles.emit(sim.x, sim.y + 1.2, -sim.s - 0.6, { count: 3, speed: 2, color: 0xffd23a, size: 0.25, life: 0.35, gravity: -2 });
        break;
      case 'jump': a.play('jump'); this.dust(pp); break;
      case 'superJump': a.play('superJump'); this.particles.emit(pp.x, pp.y + 0.1, pp.z, { count: 14, speed: 3, color: 0x2fe07a, size: 0.35, life: 0.5 }); break;
      case 'roll': a.play('roll'); break;
      case 'lane': a.play('lane'); break;
      case 'bump': this.rig.addShake(0.15); break;
      case 'land':
        a.play('land');
        if (e.hard) { this.dust(pp); this.rig.addShake(0.12); }
        break;
      case 'stumble': a.play('stumble'); this.ui.vibrate(40); this.rig.addShake(0.5); this.ui.toast('Attention !', 'warn'); break;
      case 'crash':
        a.play('crash');
        this.ui.vibrate([80, 40, 120]);
        this.rig.addShake(1);
        this.particles.emit(pp.x, pp.y + 1, pp.z, { count: 30, speed: 5, color: 0xffffff, size: 0.4, life: 0.7 });
        this.deathTimer = 1.3;
        this.slowMo = 0.6;
        break;
      case 'powerup': {
        const names = { magnet: 'Aimant', jetpack: 'Jetpack', multiplier: 'Score ×2', sneakers: 'Super Sneakers', shield: 'Bouclier' };
        a.play(e.power === 'magnet' ? 'magnet' : e.power === 'shield' ? 'shield' : 'powerup');
        this.ui.vibrate(25);
        this.ui.toast(names[e.power] || e.power, 'power');
        this.particles.emit(pp.x, pp.y + 1, pp.z, { count: 24, speed: 4, color: 0x9be7ff, size: 0.35, life: 0.6 });
        break;
      }
      case 'powerupEnd': a.play('powerdown'); break;
      case 'jetpackStart': a.play('jetpackStart'); break;
      case 'jetpackEnd': a.play('powerdown'); break;
      case 'hoverStart':
        this.save.hoverboards = Math.max(0, this.save.hoverboards - 1);
        a.play('hoverStart');
        this.ui.toast('Hoverboard !', 'power');
        break;
      case 'hoverBreak': a.play('hoverBreak'); this.ui.vibrate(60); this.rig.addShake(0.6); this.particles.emit(pp.x, pp.y + 0.3, pp.z, { count: 26, speed: 5, color: 0x65d9ff, size: 0.35, life: 0.6 }); break;
      case 'shieldBreak': a.play('shieldBreak'); this.ui.vibrate(60); this.rig.addShake(0.6); this.particles.emit(pp.x, pp.y + 1, pp.z, { count: 30, speed: 6, color: 0x59c8ff, size: 0.35, life: 0.6 }); break;
      case 'zenHit': a.play('stumble'); this.rig.addShake(0.4); break;
    }
  }

  dust(p) {
    const c = this.map.ground.type === 'snow' ? 0xffffff : 0xd8c8a8;
    this.particles.emit(p.x, p.y + 0.05, p.z, { count: 8, speed: 1.8, up: 0.4, color: c, size: 0.35, life: 0.4, gravity: -1 });
  }

  // ---- boucle ------------------------------------------------------------------------
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = Math.min(0.1, Math.max(0, (now - this.clock.last) / 1000));
    this.clock.last = now;
    if (this.r.contextLost) return;
    this.time += dt;
    this.r.measure(dt);
    try {
      this.frame(dt);
    } catch (err) {
      // aucune erreur silencieuse : on journalise et on affiche une notification
      console.error('[MNNROW] erreur de rendu', err);
      if (!this._errShown) { this._errShown = true; this.ui.toast('Erreur interne : ' + err.message, 'warn'); }
    }
  }

  frame(dt) {
    const st = this.state;
    if (st === 'playing' || (st === 'gameover' && this.sim) || st === 'paused') {
      const sim = this.sim;
      if (st === 'playing') {
        let simDt = dt;
        if (this.slowMo > 0) { this.slowMo -= dt; simDt *= 0.35; }
        if (this.bot) this.bot.update();
        if (sim.alive) {
          sim.advance(simDt);
          for (const e of sim.drainEvents()) this.onSimEvent(e);
          if ((this._mt = (this._mt || 0) + dt) > 0.5) {
            this._mt = 0;
            const done = trackRun(this.save.missions, { ...sim.summary(), newRecord: !this.mode().zen && this.save.best > 0 && sim.score > this.save.best }, this.missionBase);
            for (const d of done) {
              this.finishedMissions.push(d);
              this.audio.play('mission');
              this.ui.toast(`Mission réussie : ${d.label}`, 'mission');
            }
          }
          this.audio.setIntensity(Math.min(1, (sim.v - 14) / 16));
        } else {
          for (const e of sim.drainEvents()) this.onSimEvent(e);
          this.deathTimer -= dt;
          if (this.deathTimer <= 0) this.endRun();
        }
        this.ui.updateHUD(sim, this.save);
        this.emitTrails(sim);
      }
      const g = groundHeight(sim.entities, sim.x, sim.s, sim.s);
      if (st !== 'paused') {
        if (st === 'gameover' && this.celebrate > 0) {
          this.celebrate -= dt;
          this.player.play('victory', 0.4);
          this.player.mixer.update(dt);
        } else if (st !== 'gameover' || this.player.state !== 'victory') this.player.updateGame(dt, sim, g);
        else this.player.mixer.update(dt);
        this.entities.update(dt, sim, this.time);
        this.particles.update(dt);
      }
      this.env.update(st === 'paused' ? 0 : dt, sim.s, this.rig.camera, sim.generator.zones, this.player.group.position, sim.v);
      if (st !== 'paused') this.rig.updateGame(dt, sim, sim.generator.zones);
    } else {
      // menu / sous-menus / studio : personnage seul sur la voie
      const ms = this.menuSim;
      this.player.group.position.set(0, 0, 0);
      this.player.body.rotation.y = this.state === 'studio' ? 0 : 0.35;
      this.player.updateMenu(dt, this.menuAnim || 'menu');
      this.env.update(dt, 0, this.rig.camera, ms.generator.zones, this.player.group.position, 0);
      this.entities.clear();
      this.particles.update(dt);
      if (this.state === 'studio' && this.orbit) {
        this.orbit.update();
        if (this.studioSpin && this.studioObject) this.studioObject.rotation.y += dt * 0.6;
        if (this.studioGlow) this.studioGlow.uniforms.uTime.value = this.time;
      } else this.rig.updateMenu(dt, this.player.group.position);
    }
    this.r.render(this.scene, this.rig.camera);
    this.ui.updateFps?.(this.r);
  }

  emitTrails(sim) {
    const jet = sim.jet === 'rise' || sim.jet === 'fly';
    if (jet && Math.random() < 0.9) {
      this.player.worldOf('jet', _v);
      this.particles.emit(_v.x, _v.y - 0.35, _v.z + 0.3, { count: 2, speed: 1, up: -2, color: 0xffa53a, size: 0.45, life: 0.35, gravity: -8, spread: 0.6 });
    }
    if (sim.powerups.active('hoverboard') && !jet && Math.random() < 0.5) {
      const p = this.player.group.position;
      this.particles.emit(p.x, p.y + 0.05, p.z + 0.6, { count: 1, speed: 0.4, up: 0.2, color: this.player.board?.userData.materials.glow.color || 0x65d9ff, size: 0.3, life: 0.4, gravity: 0 });
    }
    if (sim.powerups.active('magnet') && Math.random() < 0.3) {
      const p = this.player.group.position;
      this.particles.emit(p.x + (Math.random() - 0.5) * 2, p.y + 1 + Math.random(), p.z - 1, { count: 1, speed: 0.5, color: 0xff6b7a, size: 0.2, life: 0.4, gravity: 0 });
    }
  }

  // ---- studio : aperçu 3D avec rotation / zoom -----------------------------------
  enterStudio(subject = 'character') {
    this.state = 'studio';
    this.menuAnim = 'idle';
    if (!this.orbit) {
      this.orbit = new OrbitControls(this.rig.camera, this.canvas);
      this.orbit.enableDamping = true;
      this.orbit.enablePan = false;
      this.orbit.minDistance = 1.5;
      this.orbit.maxDistance = 14;
      this.orbit.maxPolarAngle = Math.PI * 0.55;
    }
    this.orbit.enabled = true;
    const portrait = this.rig.aspect < 0.8;
    this.rig.viewShift(portrait ? 0.24 : 0, portrait ? 0 : 0.17);
    this.setStudioSubject(subject);
  }

  setStudioSubject(subject) {
    if (this.studioObject) {
      this.scene.remove(this.studioObject);
      this.studioObject.traverse((o) => { if (o.isMesh && o.userData.ownGeometry) o.geometry.dispose(); });
      this.studioObject = null;
    }
    this.studioSubject = subject;
    this.player.group.visible = subject === 'character' || subject === 'board';
    this.menuAnim = subject === 'board' ? 'hoverboard' : 'idle';
    let target = new THREE.Vector3(0, 1, 0);
    let dist = 4;
    if (subject === 'coin') {
      const c = coinGeometry({ symbol: !this.custom.coinTexture });
      const mesh = new THREE.Mesh(c.geometry, c.material);
      mesh.userData.ownGeometry = true;
      mesh.scale.setScalar(2.2);
      if (this.custom.coinTexture) {
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.375, 48), new THREE.MeshStandardMaterial({ map: this.custom.coinTexture, emissive: 0xffffff, emissiveMap: this.custom.coinTexture, emissiveIntensity: 0.35, alphaTest: 0.4, roughness: 0.5, metalness: 0.05 }));
        face.position.z = 0.063;
        face.userData.ownGeometry = true;
        mesh.add(face);
      }
      const g = this.save.studio.coinGlow;
      if (g.enabled) {
        const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), coinGlowMaterial(g.color, g.intensity));
        halo.userData.ownGeometry = true;
        halo.renderOrder = 4;
        halo.frustumCulled = false;
        mesh.add(halo);
        this.studioGlow = halo.material;
      } else this.studioGlow = null;
      mesh.position.set(0, 1.2, 0);
      this.studioObject = mesh;
      target.set(0, 1.2, 0);
      dist = 5;
    } else if (subject === 'train') {
      const l = this.save.studio.trainLivery;
      const base = (this.map.trains.liveries.urban || Object.values(this.map.trains.liveries)[0])[0];
      const livery = l.enabled ? { ...base, body: l.body, stripe: l.stripe, accent: l.accent, customTexture: this.custom.trainTexture || undefined } : base;
      const t = buildTrain('urban', livery, 1);
      t.traverse((o) => { if (o.isMesh) o.userData.ownGeometry = true; });
      t.position.set(3, 0, 6);
      this.studioObject = t;
      target.set(3, 1.6, -1);
      dist = 11;
    }
    if (this.studioObject) {
      this.scene.add(this.studioObject);
      this.player.group.visible = false;
    }
    this.orbit.target.copy(target);
    const dir = new THREE.Vector3(0.6, 0.35, 1).normalize();
    this.rig.camera.position.copy(target).addScaledVector(dir, dist);
    this.rig.camera.fov = 45;
    this.rig.camera.updateProjectionMatrix();
    this.studioSpin = subject === 'coin';
  }

  exitStudio() {
    if (this.orbit) this.orbit.enabled = false;
    if (this.studioObject) this.setStudioSubject('character');
    this.player.group.visible = true;
    this.state = 'menu';
    this.menuAnim = 'menu';
  }

  // ---- divers ----------------------------------------------------------------------
  resize() {
    const { w, h, aspect } = this.r.resize();
    this.rig.setAspect(aspect, h);
    this.particles.setPixelScale(h * this.r.dpr);
  }

  onVisibility() {
    if (document.hidden) {
      if (this.state === 'playing') this.pause('hidden');
      this.audio.suspend();
    } else {
      this.audio.resume();
      this.clock.last = performance.now();
      if (this.state === 'playing' || this.state === 'paused') this.keepAwake(true);
    }
  }

  onContextLost() {
    if (this.state === 'playing') this.pause('context');
    this.ui.contextLost(true);
  }

  onContextRestored() {
    // Three.js ré-envoie les ressources ; l'environnement est reconstruit par sécurité.
    const id = this.map.id;
    this.map = null;
    this.loadMap(id);
    this.resize();
    this.ui.contextLost(false);
  }

  setReducedMotion(on) {
    this.rig.reduced = on;
  }

  // Outil de test : avance la course avec le pilote automatique sans rendu.
  fastForward(meters) {
    if (!this.sim) return null;
    const bot = this.bot || new Bot(this.sim);
    const target = this.sim.s + meters;
    let n = 0;
    while (this.sim.alive && this.sim.s < target && n++ < 200000) {
      bot.update();
      this.sim.step(1 / 120);
    }
    for (const e of this.sim.drainEvents()) if (e.type === 'crash') this.onSimEvent(e);
    return { s: this.sim.s, alive: this.sim.alive };
  }

  debugInfo() {
    return {
      state: this.state,
      map: this.map?.id,
      version: this.save.selected.version,
      sim: this.sim ? { s: this.sim.s, x: this.sim.x, y: this.sim.y, lane: this.sim.lane, targetLane: this.sim.targetLane, alive: this.sim.alive, coins: this.sim.coins, score: Math.floor(this.sim.score), rolling: this.sim.rollTime > 0, onGround: this.sim.onGround, powerups: this.sim.powerups.list().map((p) => p.type) } : null,
      renderer: this.r.info(),
      character: this.assets.source.character,
      player: { state: this.player?.state },
    };
  }
}
