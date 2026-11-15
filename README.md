# MNNROW Ultimate 3D

Jeu de course infinie en 3D sur trois voies, **original**, pour navigateur (Android, iPhone, PC).
Three.js / WebGL, modules ES, Vite, publiable sur GitHub Pages.

Inspiré des sensations des runners mobiles, sans aucune ressource d'un jeu commercial :
personnage, trains, décors, textures, musiques et sons sont **générés par le code de ce dépôt**
(voir [`LICENSES.md`](LICENSES.md)).

> Le prototype d'origine (un seul `index.html`) est conservé dans `public/legacy/` et reste
> accessible depuis **Paramètres → Prototype d'origine**.

---

## Jouer

| | Mobile | PC |
|---|---|---|
| Changer de voie | glisser ← / → | ← → ou A / D (Q / D en AZERTY) |
| Sauter | glisser ↑ | ↑, W (Z), Espace |
| Roulade (en l'air : chute rapide) | glisser ↓ | ↓ ou S |
| Hoverboard | double tap ou bouton | E |
| Pause | bouton ❚❚ | Échap ou P |

Des boutons tactiles facultatifs sont affichés en bas de l'écran (désactivables dans Paramètres).
Les touches sont ignorées pendant la saisie dans un champ texte, et maintenir une touche ne répète pas l'action.

---

## Ce qui est réellement implémenté

**Moteur**
- `src/core/Renderer.js` : détection WebGL avec message clair si indisponible, profils **LOW / MEDIUM / HIGH / AUTO**.
  - AUTO choisit un profil selon l'appareil puis mesure les FPS toutes les 2 s. Il baisse ou remonte la résolution, puis coupe les ombres et descend de profil si besoin.
  - Gère la perte et la restauration du contexte WebGL.
- Boucle `requestAnimationFrame`, simulation à **pas fixe (1/120 s)**, indépendante du nombre d'images par seconde.
- Pause automatique quand la page est masquée.
- Caméra à la troisième personne :
  - suivi lissé et cadrage adapté au portrait ;
  - ajustements pendant le saut et la roulade ;
  - champ de vision dynamique avec la vitesse et secousses atténuées ;
  - évitement des trains et des plafonds de tunnel ;
  - option « réduire les mouvements ».

**Gameplay** (`src/gameplay/`, logique pure testée sous Node)
- 3 voies, déplacement latéral interpolé, saut à trajectoire balistique, roulade qui réduit la hauteur de collision, chute rapide.
- Collisions par volumes, avec **test balayé** qui distingue :
  - choc frontal = fin de partie ;
  - choc de flanc = trébuchement et retour dans la voie, deux de suite = fin de partie ;
  - arrivée par le dessus = atterrissage sur le toit.
- Course sur les toits de trains via des rampes.
- Trains immobiles et **trains mobiles**, dont la position est une fonction exacte de la progression du joueur, ce qui rend la rencontre prévisible et équitable.
- **Générateur procédural déterministe (graine)** par blocs : pièces, barrières, trains, plateaux, trains mobiles, mixtes, plus des zones tunnel, pont et gare.
  - Il produit un « chemin garanti » qui prouve qu'une solution existe toujours.
  - Les espacements s'adaptent à la vitesse et la difficulté monte progressivement.
- Vitesse progressive (14 → 30 m/s) fonction de la distance.
- Pièces en lignes, en arcs de saut, sur les toits et dans le ciel pendant le jetpack, **jamais comptées deux fois**.
- Bonus :

  | Bonus | Durée |
  |---|---|
  | Aimant | 10 s |
  | Jetpack | 7,5 s, puis atterrissage protégé |
  | Score ×2 | 12 s |
  | Super Sneakers | 10 s |
  | Bouclier | 9 s |
  | Hoverboard | 30 s, tiré de l'inventaire |

  Chaque bonus a sa minuterie, son indicateur dans le HUD et son effet visuel. Les protections sont consommées dans un ordre défini : bouclier, puis hoverboard.
- 3 modes : Standard, Speed Rush, Zen (sans fin de partie).
- **Rejouer une graine** (Paramètres, ou « Rejouer la même piste » en fin de partie) et pilote automatique de démonstration.
- Missions :
  - 15 types dans le catalogue, 3 missions actives à la fois ;
  - récompenses en pièces ;
  - niveau qui augmente le multiplicateur de score et offre un hoverboard ;
  - statistiques sauvegardées.

**Modèles 3D** (`src/models/`, originaux, construits par code)
- **Personnage riggé** :
  - squelette de 20 os, maillage skinné ;
  - visage (yeux, iris, reflets, nez, bouche, sourcils, oreilles), cheveux, sweat à capuche, mains, chaussures détaillées ;
  - **5 coiffures** et **5 accessoires** ;
  - **17 clips** joués par `AnimationMixer` : idle, départ, course, sprint, saut, chute, réception, roulade, changement de voie gauche et droite (additifs), hoverboard, collecte de bonus (additif), choc, fin de partie, victoire, danse du menu, jetpack ;
  - fondus enchaînés entre clips ;
  - **calage automatique des pieds au sol** (cinématique directe) pour qu'ils ne traversent pas le sol et que le personnage ne flotte pas.
- **Trains** :
  - **métro urbain** : carrosserie profilée, fenêtres, portes, pare-brise, essuie-glaces, phares, feux, bogies et roues, toit ventilé, bandes, réflecteurs, livrée texturée ;
  - **rame moderne** : nez aérodynamique en loft, baies panoramiques, LED ;
  - **fret** : locomotive avec passerelles et ventilateurs, wagons porte-conteneurs et citernes ;
  - LOD (modèle simplifié au loin) et pool d'objets ;
  - livrées propres à chaque carte.
- Pièce épaisse avec tranche crantée et symbole original en relief, aimant en U, jetpack, sneaker ailée, bouclier, étoile ×2.
- **5 hoverboards** (classique, néon, futuriste, urbain, énergie), couleurs personnalisables.
- Barrières basse et haute, rampe, bâtiments avec fenêtres, lampadaires, palmiers, sapins enneigés, arbres, cactus, rochers, dunes, montagnes, affiches et enseignes originales, gares, tunnels, ponts.

**Cartes** (`src/data/maps.js`) : Metro City, Neon Tokyo, Sunset Beach, Snow Mountain, Desert Express et Emerald Forest, carte héritée du prototype.
- Chaque carte a sa palette, son ciel en shader (soleil, étoiles, nuages), son brouillard, ses lumières, ses sols texturés, ses décors, ses livrées de trains et son ambiance : pluie et néons clignotants, océan, neige, poussière, feuilles.
- Changer de carte reconstruit réellement la scène.

**Éditions** (`src/data/catalog.js`)
- Classic 1.0 (règles du prototype), Metro 1.1, Neon 1.2, Beach 1.3, Winter 1.4, Desert Express 1.5, **Ultimate 2.0**.
- Chaque édition charge sa carte, sa vitesse, ses bonus et ses fonctionnalités.
- « MNNROW Online » est **affichée comme en développement** et n'est pas jouable.

**Interface** :
- menu avec fond 3D animé et personnage qui danse ;
- écrans Cartes, Personnages (5, déblocables), Hoverboards (achat), Studio, Versions, Missions et Paramètres ;
- HUD (score, pièces, distance, multiplicateur, bonus avec barres de durée, bouton pause, bouton hoverboard) ;
- écrans de pause et de fin de partie ;
- zones de sécurité des smartphones respectées, mise en page portrait, paysage et ordinateur.

**Studio**
- Personnalisation :
  - personnage : coiffure, 8 couleurs, accessoires, motif de sweat en image ;
  - hoverboard : modèle, 2 couleurs, image du dessus ;
  - pièces : teinte, image de face ;
  - trains : livrée en 3 couleurs ou image de flanc ;
  - carte et éclairage : exposition, soleil, ambiance.
- Aperçu 3D avec rotation et zoom (OrbitControls).
- Import de modèle : `.glb`, `.gltf` avec fichiers associés, ou `.zip`, décompressé par `fflate` avec des limites strictes.
- Validation :
  - par signature des octets et non par extension ;
  - taille, nombre de nœuds, de sommets et de textures bornés ;
  - références externes refusées et aucun script exécuté.
- Enregistrement local : préférences validées dans `localStorage`, fichiers en Blob dans **IndexedDB** (jamais en base64 dans `localStorage`).
- Réinitialisation.

**Skins — MNNROW Universal Texture Engine** (`src/skins/`)
- 12 skins aux matières réellement différentes : Normal, **Galaxie**, Néon, Or, Argent, Cristal, Feu, Glace, Arc-en-ciel, Ombre, Énergie et Texture perso (image projetée sans étirement).
- Technique : shaders procéduraux injectés (`onBeforeCompile`) dans les matériaux PBR standard. Le squelette, les animations, l'instancing des pièces et les ombres restent intacts. Le motif est calculé en coordonnées locales : pas de coutures, et il suit le corps qui bouge.
- **Galaxie** : nébuleuses en bruit fractal déformé, volutes, deux couches d'étoiles scintillantes et reflets cosmiques. Tout est réglable : 4 couleurs, densité et éclat des étoiles, scintillement, nébuleuses, lueur, contraste, échelle, rotation, vitesse, mode statique. La qualité suit le profil LOW / MEDIUM / HIGH.
- **Par catégorie, indépendamment** :
  - personnage complet (yeux et bouche gardés) ou vêtements seuls ;
  - cape ;
  - pièces (faces et tranche) ;
  - hoverboard.
- Bouton **« Appliquer Galaxie à l'équipement »**. Les trains, rails, décors et cartes ne sont jamais touchés ; les trains ont leur propre personnalisation.
- **Cape 3D** attachée au torse, avec une physique ressort-amortisseur légère : elle se soulève en courant, réagit aux sauts, aux changements de voie et s'enroule pendant les roulades. Couleur, image ou skin au choix.
- **Pièces** : images sur les faces avant et arrière, toujours lisibles. Cadrage contenir ou couvrir, zoom, décalage, rotation ; couleur de tranche, métallicité, rugosité, brillance. Une seule texture GPU est partagée par toutes les pièces.
- Scènes de contrôle : `dev/test-galaxy.html` (les 10 objets du cahier des charges) et `dev/test-skins.html` (galerie des skins et tests d'images).

**Audio** (`src/audio/AudioSystem.js`)
- Musique et effets **synthétisés** en Web Audio : musique de menu et de course propre à chaque carte, ambiance de chaque carte, 21 effets.
- Volumes général, musique et effets, plus un bouton muet.
- Démarrage après la première interaction, comme l'exigent les navigateurs mobiles.

**Sauvegarde** : schéma validé champ par champ, avec copie de secours.
- Les données du prototype (`mnnrow_best`, `mnnrow_custom`) sont **migrées automatiquement**.
- Les anciennes images base64 sont déplacées vers IndexedDB.

---

## Structure

```
index.html            interface (écrans) + point d'entrée
vite.config.js        base GitHub Pages : /Subway-Surferswebgl/
src/
  main.js             démarrage (WebGL, sauvegarde, audio, moteur, UI, commandes)
  core/               Game, Renderer, CameraRig, AssetManager, Storage, save, files
  gameplay/           Simulation, TrackGenerator, obstacles, PowerupSystem, Missions, Bot, Controls, rng, constants
  world/              Environment (carte), EntityRenderer, PlayerView, Particles
  models/             Character, Trains, Props, Hoverboards, textures, geo
  audio/              AudioSystem (Web Audio)
  data/               maps.js, catalog.js (éditions, modes, personnages, boards, missions)
  ui/                 UI.js
  styles/main.css
public/assets/models/ GLB exportés (personnage chargé en jeu ; autres GLB pour Blender)
public/assets/maps/   vignettes des cartes (captures du jeu)
public/legacy/        prototype d'origine
blender/              scripts bpy + 26 GLB générés par Blender (voir blender/README.md)
dev/                  page de visualisation et page d'export GLB (outils)
tools/                export-models, screenshots, e2e, smoke (Playwright)
tests/                tests Node (collisions, équité du générateur, sauvegarde, fichiers, missions)
```

---

## Développer

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # tests de logique (node --test)
npm run build        # dist/ prêt pour GitHub Pages
npx vite preview     # sert dist/ sous /Subway-Surferswebgl/
npm run export:models   # régénère public/assets/models/*.glb (serveur dev requis, URL en argument)
node tools/e2e.mjs      # tests navigateur sur le build (preview requis)
```

Versions figées : `three@0.170.0`, `vite@5.4.11`, `fflate@0.8.2` (seules dépendances).

---

## Publier sur GitHub Pages depuis un téléphone Android

1. Fusionne cette branche dans `main` : sur github.com, onglet **Pull requests** → **New** →
   base `main` ← compare `claude/mnnrow-3d-racing-game-d55wdi` → **Create** puis **Merge**.
2. Une seule fois : **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.
   Si le menu Settings n'apparaît pas sur mobile, active « Version pour ordinateur » dans le navigateur.
3. Le workflow `.github/workflows/deploy.yml` lance les tests, compile et publie à chaque push sur `main`
   (onglet **Actions** pour suivre ; relance manuelle possible avec « Run workflow »).
4. Le jeu est servi à `https://giugnothiwane-star.github.io/Subway-Surferswebgl/`.

Si Pages reste réglé sur « Deploy from a branch », GitHub servira les **sources non compilées** : le jeu
ne démarrera pas. L'étape 2 est indispensable.

---

## Tests

Voir [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) pour les résultats détaillés et les limites (aucun test sur un
vrai téléphone n'a pu être fait dans cet environnement).

## État honnête du projet

Voir la section « Reste à faire » de [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md).
