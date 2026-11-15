# Registre des bugs — MNNROW

Ce registre ne contient que des problèmes constatés : reproduits, mesurés, ou établis à la lecture du code (c'est alors indiqué).
Statuts possibles : **Corrigé**, **Connu** (non corrigé), **Limite** (contrainte acceptée).
Tests mentionnés : `npm test` (tests Node) et `node tools/e2e.mjs` (navigateur Chromium, sur la version compilée).

## Bugs corrigés

| ID | Gravité | Description | Reproduction | Cause | Fichier | Correction | Test | Résultat |
|---|---|---|---|---|---|---|---|---|
| B01 | Haute | Les images importées dans le Studio du prototype n'apparaissaient jamais en jeu | Importer une image de pièce dans la v0 | Confirmée : images lues mais jamais appliquées | `public/legacy/index.html` | Refonte : textures réellement appliquées | e2e Studio | Corrigé |
| B02 | Haute | 957 000 triangles traités pour les pièces même invisibles | Mesure de `renderer.info` | Confirmée : 700 instances toujours dessinées | `src/world/EntityRenderer.js` | `count` limité aux instances utilisées | Mesure | 1,08 M → 0,17 M triangles |
| B03 | Moyenne | `vite preview` ignorait le chemin `/Subway-Surferswebgl/` | Lancer le preview | Confirmée : base appliquée seulement au build | `vite.config.js` | Base appliquée aussi au preview | e2e 1 | Corrigé |
| B04 | Haute | Un swipe pouvait être ignoré | Swipe synthétique | Confirmée : exception de `setPointerCapture` avant l'enregistrement du doigt | `src/gameplay/Controls.js` | Doigt enregistré d'abord, capture protégée | e2e 20 | Corrigé |
| B05 | Moyenne | PC : Espace pouvait réactiver le bouton JOUER | Clic sur JOUER, puis Espace | Confirmée : le bouton gardait le focus | `src/ui/UI.js` | Focus retiré au démarrage | e2e 7 | Corrigé |
| B06 | Haute | Fuite GPU en glissant les sélecteurs de couleur | 40 couleurs : +80 textures | Confirmée : cache de textures sans limite | `src/models/textures.js`, `src/ui/UI.js` | Cache borné par famille, fréquence limitée | e2e « mémoire GPU » | +21 textures (borné) |
| B07 | Moyenne | Fuite de géométries à chaque changement de carte | 3 tours des 6 cartes : 240 → 360 géométries | Confirmée : `dispose()` incomplet | `src/world/EntityRenderer.js` | Libération complète | Mesure | 72 → 72 → 72 géométries |
| B08 | Moyenne | Danse de victoire au lieu de la chute | Rejouer moins de 2,5 s après une mission | Confirmée : `celebrate` non remis à zéro | `src/core/Game.js` | Remise à zéro au démarrage | e2e | Corrigé |
| B09 | Moyenne | Course qui démarrait au ralenti | Chute, Échap, Recommencer | Confirmée : `slowMo` conservé | `src/core/Game.js` | Remise à zéro | e2e | Corrigé |
| B10 | Moyenne | Mauvais écran après restauration du contexte WebGL | Perte de contexte dans le Studio | Confirmée | `src/ui/UI.js` | Retour à l'écran de l'état réel | e2e 21 | Corrigé |
| B11 | Moyenne | Boutons tactiles masqués sur les téléphones larges en paysage | 915×412 | Confirmée : media query basée sur la largeur | `src/styles/main.css` | Masqués seulement avec une souris | Revue | Corrigé |
| B12 | Moyenne | Deux swipes rapides pris pour un double tap (hoverboard) | — | Lecture du code | `src/gameplay/Controls.js` | Un geste long n'est jamais un tap | Revue | Corrigé |
| B13 | Moyenne | Pause pendant la chute : course perdue sans enregistrement | — | Lecture du code | `src/core/Game.js` | Pause ignorée pendant la chute | Revue | Corrigé |
| B14 | Basse | Progression des missions pour une course abandonnée | — | Lecture du code | `src/core/Game.js` | Suivi sur une copie | Revue | Corrigé |
| B15 | Haute | Image 3D étirée sur mobile | Taille de la zone changée sans événement `resize` | Confirmée en simulation (barre d'adresse Android) | `src/core/Game.js` | Taille vérifiée à chaque image + `ResizeObserver` | e2e « image jamais étirée » | Corrigé (simulation) |
| B16 | Moyenne | Réglages Studio perdus au changement de carte (teinte, lueur, livrée) | Régler la lueur puis changer de carte | Confirmée : nouveau rendu créé sans réglages | `src/core/Game.js` | `entityCustom()` centralisé | Capture | Corrigé |
| B17 | Moyenne | Aperçu d'un personnage ou d'une planche resté appliqué | Aperçu puis retour au menu | Confirmée | `src/ui/UI.js` | Sélection réappliquée en sortant | Revue | Corrigé |
| B18 | Moyenne | Un réglage de pièce reconstruisait tous les trains (saccade, pop) | Glisser la lueur ou la teinte des pièces | Confirmée : `applyCustom` reconstruisait toujours les trains | `src/world/EntityRenderer.js` | Reconstruction seulement si la livrée change | e2e Galaxie (trains intacts) | Corrigé |
| B19 | Basse | Pièce collectée restée derrière le joueur, énorme devant la caméra | Capture en course | Confirmée | `src/world/EntityRenderer.js` | La pièce suit le joueur pendant l'animation | Capture | Corrigé |
| B20 | Basse | Sol au-dessus du ballast | Capture | Confirmée | `src/world/Environment.js` | Sol abaissé | Capture | Corrigé |
| B21 | Basse | Listes internes du générateur qui grossissaient pendant la course | Course de 10 km (mesure Node) | Confirmée | `src/gameplay/TrackGenerator.js` | Vidées à chaque nettoyage | Node | Corrigé |
| B22 | Moyenne | Couleurs du personnage modifiées sur le mauvais matériau quand un skin est actif | Changer une couleur avec la Galaxie active | Lecture du code (nouveau système de skins) | `src/models/Character.js` | `applyLook` agit sur le matériau d'origine | e2e Galaxie | Corrigé |
| B23 | Basse | Texture de l'eau différente à chaque chargement (`Math.random`) | Lecture du code | Confirmée | `src/world/Environment.js` | Tirages déterministes | Capture | Corrigé |
| B24 | Basse | HUD : deux chronos en pastilles peu lisibles (demande joueur) | Retour joueur | Confirmée | `index.html`, `src/ui/UI.js`, `src/styles/main.css` | Un seul chrono MM:SS.cc, police Orbitron, case arrondie, rouge et figé à la chute ; chrono « sans pièce » retiré | e2e Chrono | Corrigé |
| B25 | Haute | On traversait les trains de face quand un bouclier, un hoverboard ou le mode Zen absorbait le choc (le wagon devenait « fantôme ») | Foncer sur un train avec un hoverboard | Confirmée (lecture du code + test Node) | `src/gameplay/Simulation.js` | Un train reste toujours solide : le choc absorbé fait rebondir sur le toit (montée lissée à l'écran) | 2 tests Node (fixe et mobile, bouclier/hoverboard/Zen) | Corrigé |
| B26 | Moyenne | Image étirée sur les bords : champ de vision trop large (≈100° horizontal en paysage, 64° vertical en portrait) | Téléphone en paysage, PC 16:9 | Confirmée (calcul + captures) | `src/core/CameraRig.js` | Champ horizontal borné à 72°, vertical à 54° ; caméra reculée (« dolly zoom ») et inclinaison calculée pour garder le personnage entier à l'écran | e2e Caméra + captures portrait/paysage/PC | Corrigé |
| B27 | Moyenne | Image pixelisée sur mobile : la résolution adaptative descendait jusqu'à 60 % dès les premières images (compilation des shaders) | Lecture du code | Confirmée | `src/core/Renderer.js` | Minimum relevé (85 % / 100 % / 125 %), premières mesures ignorées, ombres coupées avant la résolution, anticrénelage en MEDIUM | e2e | Corrigé |
| B28 | Moyenne | WebGL 1 accepté à la détection alors que Three.js 0.170 exige WebGL 2 (échec plus tard, écran noir possible) | Lecture du code | Confirmée | `src/core/Renderer.js`, `src/main.js` | Détection explicite de WebGL 2, message clair (WebGL 1 seul ou aucun) | 3 tests Node | Corrigé |
| B29 | Moyenne | Bonus ramassé grossi devant la caméra : l'aimant masquait le joueur | Captures avant | Confirmée | `src/world/EntityRenderer.js` | Le bonus rétrécit et est aspiré vers le joueur | Captures | Corrigé |
| B30 | Basse | Pièces brun foncé sur la carte néon avec les reflets du ciel nocturne | Captures (remaster) | Confirmée | `src/models/Props.js`, `src/skins/CoinFactory.js` | Reflets neutres dédiés aux objets à ramasser ; ciel de nuit neutralisé dans la carte de reflets | Captures | Corrigé |
| B31 | Basse | Captures automatiques faussées : la transition menu → course était encore en cours après une avance rapide | Captures avant | Confirmée (outil de test) | `tools/compare-shots.mjs` | Transition coupée avant la capture | Captures | Corrigé |

## Nouvelles fonctions vérifiées

| Vérification | Résultat |
|---|---|
| Galaxie sur personnage, cape, pièces (faces et tranche) et hoverboard | Bons matériaux en jeu, après changement de carte et après rechargement (e2e) |
| Trains sous la Galaxie globale | 12 matériaux de trains intacts (e2e) |
| Animations avec un skin | Le `SkinnedMesh` reste un `SkinnedMesh` ; animation de course jouée dans la scène de test |
| Images sur les pièces | Contenir, couvrir, zoom, rotation et décalage sur une image rectangulaire transparente ; dos lisible, non inversé (`dev/test-skins.html`) |
| Cape pendant les sauts et roulades | 14 échantillons : aucune valeur NaN, déplacement ≤ 0,92 m, toujours attachée au torse et visible |
| Qualité LOW du shader Galaxie | Compile et reste reconnaissable (capture) |
| Nouvelles textures (façades brique/pierre/panneaux/rondins/crépi, fenêtres encadrées, ballast en pierres, asphalte fissuré, sable ridé, neige, herbe, traverses en bois, toits) | Captures des 6 cartes en portrait et paysage, aucune erreur console ; relief (cartes de normales) désactivé en LOW |
| Chrono | Cadran à aiguille, afficheur LCD en filigrane, barre des secondes, chiffres à largeur fixe ; « STOP » rouge à la chute, identique sur l'écran de fin (e2e + captures) |

## Bugs et limites encore connus

| ID | Gravité | Description | Statut |
|---|---|---|---|
| K01 | — | Aucun test sur un vrai téléphone Android : FPS, chauffe et rendu du shader Galaxie sur GPU mobile restent à vérifier | Limite |
| K02 | Basse | Le skin Cristal imite le verre (transparence + reflets) sans vraie réfraction, pour préserver les performances | Limite |
| K03 | Basse | Personnage importé (GLB) : le mode « Vêtements » applique le skin à tout le modèle, car les noms de matériaux sont inconnus | Connu |
| K04 | Basse | La cape peut traverser légèrement les jambes pendant les grands mouvements (pas de collision tissu-corps) | Limite |
| K05 | Basse | Le pilote automatique des tests peut échouer en Speed Rush avec les Super Sneakers (temps en l'air) ; un joueur humain passe | Connu (outil de test) |
