// Éditions de MNNROW, personnages, hoverboards et missions.
// Ce sont des éditions du jeu MNNROW lui-même : aucune ancienne version
// officielle d'un autre jeu n'est proposée.
import { POWERUP_TYPES } from '../gameplay/constants.js';

const BUILD_DATE = '2026-11-14';

export const VERSIONS = [
  {
    id: 'classic', name: 'MNNROW Classic', version: '1.0', status: 'disponible', date: BUILD_DATE,
    dateNote: 'Règles du prototype initial du dépôt (même jour)',
    map: 'forest', lockMap: true,
    description: 'Le rythme du prototype d\'origine : départ rapide, pas de trains mobiles ni de rampes, seulement l\'aimant.',
    speed: { v0: 20, vMax: 32, rampDistance: 2600 }, density: 0.9,
    powerups: ['magnet'],
    features: { movingTrains: false, plateaus: false, tunnels: false, bridges: false, stations: false },
    look: { shirt: '#b8f477' }, board: { color: '#65d9ff' },
    highlights: ['3 voies', 'Saut / glissade', 'Aimant', 'Carte forêt héritée'],
  },
  {
    id: 'metro', name: 'MNNROW Metro Update', version: '1.1', status: 'disponible', date: BUILD_DATE,
    map: 'metro', lockMap: true,
    description: 'Arrivée de Metro City, des trains mobiles, des rampes et des toits de trains.',
    powerups: ['magnet', 'multiplier'],
    features: { movingTrains: true, plateaus: true, tunnels: true, bridges: true, stations: true },
    highlights: ['Metro City', 'Trains mobiles', 'Rampes', 'Multiplicateur'],
  },
  {
    id: 'neon', name: 'MNNROW Neon Update', version: '1.2', status: 'disponible', date: BUILD_DATE,
    map: 'neon', lockMap: true,
    description: 'Neon Tokyo de nuit, le jetpack et le bouclier font leur apparition.',
    powerups: ['magnet', 'multiplier', 'jetpack', 'shield'],
    highlights: ['Neon Tokyo', 'Jetpack', 'Bouclier', 'Pluie et néons'],
  },
  {
    id: 'beach', name: 'MNNROW Beach Update', version: '1.3', status: 'disponible', date: BUILD_DATE,
    map: 'beach', lockMap: true,
    description: 'Sunset Beach et les Super Sneakers pour sauter sur les trains.',
    powerups: ['magnet', 'multiplier', 'jetpack', 'shield', 'sneakers'],
    highlights: ['Sunset Beach', 'Super Sneakers', 'Océan'],
  },
  {
    id: 'winter', name: 'MNNROW Winter Update', version: '1.4', status: 'disponible', date: BUILD_DATE,
    map: 'snow', lockMap: true,
    description: 'Snow Mountain : neige, sapins, ponts au-dessus des gorges.',
    powerups: POWERUP_TYPES,
    look: { accessories: ['scarf'] },
    highlights: ['Snow Mountain', 'Écharpe offerte', 'Tous les bonus'],
  },
  {
    id: 'desert', name: 'MNNROW Desert Express', version: '1.5', status: 'disponible', date: BUILD_DATE,
    map: 'desert', lockMap: true,
    description: 'Le désert, ses convois de marchandises et ses gares isolées.',
    powerups: POWERUP_TYPES,
    speed: { v0: 15, vMax: 31, rampDistance: 3000 },
    highlights: ['Desert Express', 'Convois de fret', 'Poussière'],
  },
  {
    id: 'ultimate', name: 'MNNROW Ultimate', version: '2.0', status: 'disponible', date: BUILD_DATE,
    map: null, lockMap: false,
    description: 'L\'édition complète : toutes les cartes au choix, tous les bonus, studio et missions.',
    powerups: POWERUP_TYPES,
    highlights: ['6 cartes', '5 bonus + hoverboard', 'Studio', 'Missions'],
  },
  {
    id: 'online', name: 'MNNROW Online', version: '3.0', status: 'en développement', date: null,
    map: null, lockMap: false, disabled: true,
    description: 'Courses en ligne et classements partagés. En développement : non jouable dans cette version.',
    powerups: POWERUP_TYPES,
    highlights: ['Classements (prévu)', 'Défis quotidiens (prévu)'],
  },
];

export const MODES = [
  { id: 'standard', name: 'Standard', description: 'Rythme normal.', speedMult: 1, scoreMult: 1 },
  { id: 'speed', name: 'Speed Rush', description: 'Course 25 % plus rapide, score ×1,5.', speedMult: 1.25, scoreMult: 1.5 },
  { id: 'zen', name: 'Zen Run', description: 'Plus lent ; les chocs ne terminent pas la partie (pas de record).', speedMult: 0.82, scoreMult: 0.5, zen: true },
];

export const CHARACTERS = [
  { id: 'nova', name: 'Nova', price: 0, look: { hair: 'spiky', hairColor: '#2b1d16', skin: '#f2c19a', shirt: '#b8f477', accent: '#1e2430', pants: '#2c3e66', shoes: '#ff5a4e', sole: '#f4f4f4', accessory: '#3ec5ff', accessories: ['headphones'] } },
  { id: 'kiko', name: 'Kiko', price: 600, look: { hair: 'bun', hairColor: '#111018', skin: '#e9b58c', shirt: '#ff6bd6', accent: '#2a1a3a', pants: '#1f2233', shoes: '#ffffff', sole: '#ff6bd6', accessory: '#ffd23a', accessories: ['glasses'] } },
  { id: 'rex', name: 'Rex', price: 900, look: { hair: 'mohawk', hairColor: '#2b1d16', skin: '#8d5a3b', shirt: '#ff8a3d', accent: '#1d2329', pants: '#3a3f48', shoes: '#3ec5ff', sole: '#ffffff', accessory: '#ff3b5c', accessories: ['backpack'] } },
  { id: 'jules', name: 'Jules', price: 1300, look: { hair: 'short', hairColor: '#c98a3c', skin: '#f6d2b5', shirt: '#3ec5ff', accent: '#ffffff', pants: '#e9e2d0', shoes: '#2fe07a', sole: '#1d2329', accessory: '#ff5a4e', accessories: ['cap'] } },
  { id: 'sol', name: 'Sol', price: 1800, look: { hair: 'long', hairColor: '#5a2d82', skin: '#c58c64', shirt: '#ffd23a', accent: '#5a2d82', pants: '#14161f', shoes: '#ff3bd4', sole: '#ffffff', accessory: '#7a5cff', accessories: ['headphones', 'scarf'] } },
];

export const BOARDS = [
  { id: 'classic', name: 'Classique', price: 0, color: '#65d9ff', color2: '#ffffff' },
  { id: 'neon', name: 'Néon', price: 400, color: '#ff3bd4', color2: '#00e5ff' },
  { id: 'futuristic', name: 'Futuriste', price: 700, color: '#c8d0da', color2: '#3ec5ff' },
  { id: 'urban', name: 'Urbain', price: 900, color: '#ffd23a', color2: '#ff3b5c' },
  { id: 'energy', name: 'Énergie', price: 1200, color: '#5cff9d', color2: '#ffffff' },
];

// Missions : `scope` run = dans une seule partie, total = cumulé.
export const MISSION_POOL = [
  { id: 'coins_run_50', label: 'Ramasse 50 pièces en une partie', stat: 'coins', scope: 'run', target: 50, reward: 100 },
  { id: 'coins_run_150', label: 'Ramasse 150 pièces en une partie', stat: 'coins', scope: 'run', target: 150, reward: 250 },
  { id: 'coins_total_400', label: 'Collecte 400 pièces au total', stat: 'coins', scope: 'total', target: 400, reward: 300 },
  { id: 'dist_run_500', label: 'Parcours 500 m en une partie', stat: 'distance', scope: 'run', target: 500, reward: 120 },
  { id: 'dist_run_1000', label: 'Parcours 1 000 m en une partie', stat: 'distance', scope: 'run', target: 1000, reward: 250 },
  { id: 'dist_total_3000', label: 'Parcours 3 000 m au total', stat: 'distance', scope: 'total', target: 3000, reward: 300 },
  { id: 'jumps_run_10', label: 'Saute 10 fois en une partie', stat: 'jumps', scope: 'run', target: 10, reward: 100 },
  { id: 'jumps_total_20', label: 'Effectue 20 sauts', stat: 'jumps', scope: 'total', target: 20, reward: 120 },
  { id: 'rolls_run_8', label: 'Fais 8 roulades en une partie', stat: 'rolls', scope: 'run', target: 8, reward: 120 },
  { id: 'powerups_total_3', label: 'Utilise 3 bonus', stat: 'powerups', scope: 'total', target: 3, reward: 150 },
  { id: 'board_total_1', label: 'Utilise un hoverboard', stat: 'boards', scope: 'total', target: 1, reward: 100 },
  { id: 'tops_run_3', label: 'Cours sur 3 toits de trains en une partie', stat: 'trainTops', scope: 'run', target: 3, reward: 150 },
  { id: 'lanes_run_30', label: 'Change 30 fois de voie en une partie', stat: 'laneChanges', scope: 'run', target: 30, reward: 120 },
  { id: 'score_run_2000', label: 'Atteins 2 000 points en une partie', stat: 'score', scope: 'run', target: 2000, reward: 200 },
  { id: 'record', label: 'Bats ton record', stat: 'record', scope: 'run', target: 1, reward: 200 },
];

export const MISSION_SET_REWARD = { boards: 1, coins: 300 }; // + multiplicateur de base +1
