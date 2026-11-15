# Rapport de tests — MNNROW Ultimate 3D 2.0

Environnement : conteneur Linux, Node 22, Chromium headless (Playwright).
**Rendu WebGL logiciel (SwiftShader), aucun GPU, aucun téléphone réel.**
Date : 14–15 novembre 2026.

## 1. Tests de logique (`npm test`) — 23/23 réussis

Tous ces tests s'exécutent sous Node, sans navigateur.

| # | Test |
|---|---|
| 1 | Barrière basse : collision sans saut, franchie avec un saut au bon moment |
| 2 | Barrière haute : la roulade passe dessous, le saut ne suffit pas |
| 3 | Train de face = fin de partie ; rampe → toit à 3,0 m sans dommage → retombée au sol |
| 4 | Train mobile : collision exactement au point de rencontre prévu |
| 5 | Flanc de train : trébuchement + retour de voie ; deux trébuchements = fin |
| 6 | Bouclier puis hoverboard absorbent chacun un choc, dans cet ordre |
| 7 | Une pièce n'est jamais comptée deux fois |
| 8 | Aimant : 10 pièces sur deux autres voies, toutes comptées une fois |
| 9 | Jetpack : altitude > 4,5 m, survol des obstacles, atterrissage protégé |
| 10 | Super Sneakers : saut ≥ 1,8 × plus haut |
| 11 | Déplacement latéral progressif ; même résultat à 30 FPS et à 144 FPS |
| 12 | Mode Zen : un choc ne termine pas la partie |
| 13 | Sauvegarde corrompue ou malveillante réparée champ par champ |
| 14 | Sauvegarde : aller-retour JSON sans perte |
| 15 | Migration des données du prototype (`mnnrow_best`, `mnnrow_custom`) |
| 16 | Détection PNG / JPEG / WebP / GLB / ZIP / JSON par signature |
| 17 | GLB réel accepté ; GLB tronqué ou faux refusé |
| 18 | glTF : URL externes, chemins `../` et fichiers manquants refusés ; complexité bornée |
| 19 | Chemins d'archive ZIP assainis (`../`, absolus, `__MACOSX`) |
| 20 | Missions : progression réelle, récompense unique, montée de niveau |
| 21 | **Équité** : le pilote automatique suit le chemin garanti sur 4 km pour 25 graines sans mourir |
| 22 | Génération déterministe : même graine = même piste |
| 23 | **Équité avec tous les bonus** (jetpack compris) : 8 graines × 3 km |

Vérification complémentaire faite pendant le développement, hors suite automatique : 30 graines × 5 km avec tous les bonus, 0 échec.
Un joueur qui ne fait rien meurt entre 130 et 175 m : les obstacles sont bien réels.

## 2. Tests navigateur (`node tools/e2e.mjs`) — 25/25 réussis au dernier passage

Les tests tournent sur la **version compilée** (`npm run build`), servie par `vite preview` sous
`/Subway-Surferswebgl/`, le même chemin que GitHub Pages. Le navigateur émule un mobile de 412×915
(Android, tactile). Le rapport détaillé est généré dans `test-results/e2e-report.json` avec les captures.

| Exigence | Résultat mesuré |
|---|---|
| 1. Chargement du site | HTTP 200 sous `/Subway-Surferswebgl/` |
| 2. Initialisation Three.js | WebGL 2, ~53 draw calls dans le menu |
| 3. Chargement des modèles | Personnage chargé depuis `mnnrow_runner.glb` ; 5 GLB vérifiés (HTTP 200, signature `glTF`) |
| 4. Menu | 8 boutons visibles |
| 5. Démarrage | Bouton JOUER → état `playing`, le joueur avance |
| 6. Gauche / droite | Voies −1 puis +1 atteintes (x = ±2,5 m) |
| 7. Saut | Hauteur mesurée > 0,8 m (échantillonnage lent) |
| 8. Roulade | Hauteur de collision 0,85 m, animation `roll` |
| 9 / 12. Collision et fin de partie | Partie sans action → barrière basse → écran de fin avec la cause |
| 10. Pièces | ~230 pièces sur 900 m (pilote automatique) |
| 11. Bonus | 1 bonus ramassé en course ; les 5 bonus s'activent et s'affichent dans le HUD ; hoverboard via la touche E, stock décrémenté |
| 13. Redémarrage | Rejouer, Pause, Quitter |
| 14. Changement de carte | Neon Tokyo chargée (brouillard #251038) |
| 15. Changement de version | Winter Update impose Snow Mountain ; « MNNROW Online » non sélectionnable |
| 16 / 17. Sauvegarde et rechargement | Version, carte, qualité et option caméra conservées après rechargement |
| 18. Import GLB | GLB valide chargé ; faux fichier `.glb` refusé avec un message clair |
| — Studio | Image PNG appliquée ; faux PNG refusé ; réinitialisation |
| 19. Redimensionnement | Passage en paysage : rapport d'aspect 2,22 recalculé |
| 20. Tactile | Swipes en Pointer Events : changement de voie et saut |
| 21. Perte du contexte WebGL | `WEBGL_lose_context` → pause + écran dédié → restauration → rendu repris |
| — Page masquée | Pause automatique (`visibilitychange`) |
| — Saisie de texte | Les flèches ne déclenchent pas d'action dans un champ |
| 22 / 23. Erreurs / ressources | 0 erreur JS, 0 requête en échec |
| 24. Performances | ~10–20 FPS en rendu **logiciel**, profil LOW, ~56 draw calls, ~163k triangles. **Non représentatif d'un téléphone avec GPU.** |

### Problèmes trouvés par ces tests et corrigés

- **Bug réel** : `setPointerCapture` pouvait lever une exception avant l'enregistrement du doigt, et le swipe était alors ignoré.
- **Bug réel (PC)** : après un clic sur JOUER, le bouton gardait le focus ; Espace risquait de le réactiver. Le focus est désormais retiré au démarrage.
- **Configuration** : `vite preview` ignorait le chemin de base. Le build n'était pas touché, seul le test l'était.
- **Optimisation** : 700 instances de pièces toujours traitées (957 000 triangles). Le nombre d'instances suit maintenant l'usage réel, et la scène est passée d'environ 1,08 M à environ 0,17 M triangles.
- **Visuel** :
  - sol au-dessus du ballast ;
  - pièce collectée restant derrière le joueur ;
  - dunes et montagnes trop proches de la voie ;
  - portails de tunnel uniformes.
- **Tests fragiles** (délais fixes trop courts en rendu logiciel) : remplacés par des attentes de conditions.

### Revue complète du code (15 novembre 2026) et correctifs

Un relecteur indépendant a passé tout le code en revue. Les bugs trouvés sont tous corrigés.

| Bug | Statut avant correctif | Correctif | Vérification |
|---|---|---|---|
| Glisser un sélecteur de couleur du Studio créait 2 textures GPU par événement, avec un risque de perte du contexte sur mobile | reproduit (+80 textures pour 40 couleurs) | Fréquence limitée à une mise à jour toutes les 150–200 ms, cache borné par famille, matériaux libérés | e2e : +21 textures pour 40 couleurs |
| Fuite de géométries et de matériaux à chaque changement de carte | reproduit (240 → 274 → 360 géométries) | Libération complète du rendu des entités (pools, pièces, halos, phares) | 72 → 72 → 72 géométries sur 3 tours des 6 cartes |
| Danse de victoire à la place de la chute après un « Rejouer » rapide | reproduit | Remise à zéro au démarrage | e2e |
| Nouvelle course qui démarrait au ralenti | reproduit | Remise à zéro au démarrage | e2e |
| Perte de contexte pendant le Studio ou la fin de partie : mauvais écran au retour | reproduit | Retour à l'écran correspondant à l'état réel du jeu | revue |
| Boutons tactiles masqués sur les téléphones larges en paysage | reproduit (915×412) | Masqués seulement avec une souris | revue |
| Panneaux coupés de 64 px en paysage | reproduit (740×360) | Règle CSS paysage complétée | revue |
| Deux swipes rapides pouvaient être pris pour un double tap (hoverboard) | déduit du code | Un geste long n'est jamais un tap | revue |
| Pause pendant la chute : course perdue sans enregistrement | déduit du code | Pause ignorée pendant la chute | revue |
| Progression des missions comptée pour une course abandonnée | déduit du code | Suivi sur une copie, enregistré seulement en fin de partie | revue |
| Bouton retour pendant le chargement ou une erreur | déduit du code | Seuls les écrans connus sont gérés | revue |
| Listes internes du générateur qui grossissaient pendant une longue course | déduit du code | Vidées à chaque nettoyage | tests Node |

Ces correctifs s'ajoutent aux améliorations de la même session :
- caméra (transition, vitesse, inclinaison, fin de partie) ;
- phares des trains mobiles ;
- plein écran, écran maintenu allumé, vibrations, bouton retour Android ;
- installation sur l'écran d'accueil ;
- mise en page des petits téléphones et du paysage.

Résultat : **25/25 tests Node** et **28/28 vérifications navigateur**.

### Moteur de skins (Galaxie)

Le registre complet des bugs se trouve dans [`BUGS.md`](BUGS.md).

- **Tests Node** (`tests/skins.test.js`) :
  - Galaxie complète : le `SkinnedMesh` est conservé et la restauration est exacte ;
  - mode Vêtements ;
  - bouton Galaxie sans les trains ;
  - validation de la sauvegarde.
- **Test navigateur** : équipement complet en Galaxie, trains intacts (12 matériaux), conservé après changement de carte et rechargement.
- **Scènes de contrôle avec captures** : les 10 objets du chapitre 23, les 12 skins, les images de pièces (rectangulaire, transparente, contenir, couvrir, zoom, rotation, dos lisible) et la qualité LOW.
- **Cape en course** : 14 échantillons pendant sauts et roulades, sans valeur NaN, toujours attachée.

### Chrono et textures (15 novembre 2026)

- Un seul chrono (MM:SS.cc), police Orbitron, case arrondie à bord dégradé ; rouge et figé à la chute, repris en grand sur l'écran de fin.
- Textures du décor refaites en 512 px avec relief : façades, fenêtres, ballast, sols, traverses en bois, toits.
- Trains toujours solides (rebond sur le toit si le choc est absorbé), champ de vision borné, résolution minimale relevée.
- Résultat : **37/37 tests Node** et **34/34 vérifications navigateur**.

### Remaster graphique et chaîne de tests (15 novembre 2026)

Exécutions réelles dans cet environnement (Chromium 1243 + SwiftShader, Node 22) :

- **40/40 tests Node** (dont 3 nouveaux : détection WebGL 2) ;
- **34/34 vérifications navigateur** via `npm run test:e2e` (4 min 18 s) ;
- `npm run check:dist` : toutes les ressources présentes sous `/Subway-Surferswebgl/`.

Changements vérifiés par captures avant/après (`docs/screenshots/remaster/`) :

- trains : intérieur éclairé visible, portes détaillées, girouette lumineuse, pantographes, équipements sous
  caisse, rétroviseurs ; fret avec échelles, attelages, coins ISO, conteneurs patinés ;
- reflets calculés à partir du ciel de chaque carte ; pièces et bonus gardent des reflets neutres (l'or
  restait brun sur la carte néon lors d'un premier essai, corrigé) ;
- luminosité moyenne mesurée par capture : 88 à 97 % de l'ancienne version (plus de contraste, moins de
  blanc délavé), la plage de la côte à 80 % (ambiance coucher de soleil) ;
- tunnels : lumière du soleil atténuée progressivement, rampes LED, câbles ;
- personnage : maille, jean, cuir, cheveux (textures + relief) ; effets de vitesse, d'aimant,
  d'atterrissage, de hoverboard et flammes du jetpack.

Coût de rendu mesuré (même graine, même scène, ancienne vs nouvelle version) :

| Profil / carte | Draw calls | Triangles | Textures |
|---|---|---|---|
| LOW / Metro | 125 → 134 | 188k → 195k | 36 → 49 |
| LOW / Néon | 119 → 132 | 177k → 185k | 60 → 74 |
| HIGH / Metro | 147 → 156 | 265k → 275k | 68 → 86 |
| HIGH / Néon | 150 → 159 | 259k → 268k | 76 → 94 |

Les FPS de cet environnement (rendu logiciel, 1 à 3 images/s) ne permettent **aucune** conclusion sur un
téléphone : la vérification à 60 FPS reste à faire sur un appareil réel.

### Personnage refait, site privé, CI fiabilisée (15 novembre 2026)

- **Personnage** (même squelette et mêmes noms de matériaux : skins, cape, couleurs, imports intacts) :
  - proportions moins « poupée » (tête réduite de 18 %), visage avec paupières, sourcils arqués,
    pommettes, ailes du nez, lèvres, oreilles avec rebord ;
  - mains avec quatre doigts et un pouce ; baskets détaillées (semelle intermédiaire, bout renforcé,
    contrefort, languette, lacets, tirant) ; poches du jean ;
  - GLB `mnnrow_runner.glb` régénéré et chargé par le jeu (source « glb » vérifiée).
- **Animations** :
  - course et sprint en 8 poses avec phase de suspension, rotation du bassin, contre-rotation du buste,
    bras opposés, tête stabilisée ;
  - attente avec report du poids ; danse du menu sur 4 temps ; posture de hoverboard avec genoux qui
    pompent.
- **Site privé** : vérifié avec un serveur qui imite GitHub Pages ; l'adresse publique affiche « Page
  privée » et le jeu fonctionne sous le chemin secret, sans fichier manquant.
- **CI** : le premier passage sur GitHub a échoué (30/34) : un import d'image plus lent sur la machine de
  GitHub dépassait 10 s, et les tests suivants héritaient du studio resté ouvert. Délais portés à 30 s,
  retour au menu garanti entre les tests, galerie remise à zéro, champ de vision mesuré sur sa valeur cible.
  Le site n'a pas été publié pendant ce temps (c'est le comportement voulu).

### Mode propriétaire et image partagée (15 novembre 2026)

- **47/47 tests Node** (7 nouveaux) :
  - empreinte du code, verrouillage progressif, jeton chiffré ;
  - chiffrement de l'image, clé tirée du lien privé ;
  - publication, réception et retrait avec un faux GitHub ;
  - le code en clair n'apparaît pas dans le source.
- **35/35 vérifications navigateur**, dont une nouvelle :
  - mauvais code refusé ;
  - publication chiffrée (fichier commençant par `MNS1`, sans octet d'image en clair) ;
  - un second onglet reçoit l'image **sans rechargement** (0 navigation), puis le retrait.
- GitHub est **simulé** dans ces tests : la vraie publication n'a pas pu être essayée ici (pas de jeton,
  et le réseau de cet environnement bloque github.io / l'API d'écriture).

### Modes Entraînement / Floor is Lava / Invincible (15 novembre 2026)

- **51/51 tests Node**, dont 5 nouveaux :
  - la lave brûle après la période de grâce + 1,1 s au sol ;
  - des sauts répétés protègent ;
  - avec l'option Invincible, on rebondit hors de la lave ;
  - en Invincible, aucun obstacle ne termine la partie ;
  - le pilote automatique survit 600 m sur la lave ;
  - les sauvegardes sont validées.
- **36/36 vérifications navigateur**. La nouvelle vérifie :
  - le choix du mode dans les Paramètres ;
  - en lave : jauge, sol rougeoyant, brûlure au sol ;
  - l'option Invincible ;
  - la vitesse d'entraînement (11 m/s) ;
  - la reprise en main du pilote automatique.

## 3. Ce qui n'a PAS pu être testé ici

- **Téléphone Android réel** : performances, chaleur, gestes, Samsung Internet. Aucun appareil disponible.
- **Déploiement GitHub Pages réel** : le workflow est fourni, mais il ne s'exécutera qu'après fusion dans `main` et le réglage de la source Pages.
- **Rendu sonore** : le système audio a été exécuté sans erreur dans Chromium et ses niveaux mesurés (crêtes < 1,0), mais **personne ne l'a écouté**.
- iOS / Safari, Firefox.
- Lecture d'une archive ZIP d'import : code présent, sans test automatisé dédié.
- Mode AUTO sur un vrai GPU : la logique d'adaptation existe, mais seul un environnement logiciel lent l'a déclenchée.

## 4. Procédure de vérification manuelle (téléphone)

1. Ouvre l'URL GitHub Pages dans Chrome Android.
2. Le menu s'affiche avec le personnage qui danse. Touche **JOUER**.
3. Glisse à gauche, à droite, en haut (saut), en bas (roulade). Fais un double tap pour le hoverboard.
4. Vérifie le son après le premier toucher, la pause (❚❚), puis passe sur une autre application : le jeu doit se mettre en pause.
5. Dans **Paramètres**, affiche les FPS et compare LOW / MEDIUM / HIGH. En AUTO, observe la résolution s'ajuster.
6. **Cartes** : essaie les 6 cartes. **Versions** : charge Winter Update, puis Ultimate.
7. **Studio** : change les couleurs, importe une image, puis **Enregistrer**. Recharge la page : les réglages restent.
8. Tourne le téléphone en paysage pendant une partie : l'affichage s'adapte.

## 5. Reste à faire (liste honnête)

- **Direction artistique** : modèles et textures sont procéduraux (primitives, profils, canvas). Ils sont cohérents et détaillés pour du code, mais ce n'est **pas** le niveau d'un artiste 3D professionnel : pas de sculpture, pas de textures peintes, pas de normal maps.
- **Animation** :
  - liaison rigide os-pièces avec des rotules : pas de peau déformable avec poids lissés ;
  - pas de capture de mouvement ;
  - le calage des pieds est fait image clé par image clé, pas en IK continue.
- **Trains** : pas de rotation des roues (les roues sont fusionnées avec le reste du train pour limiter les
  draw calls) ; LOD à 2 niveaux seulement ; légère vibration des trains en mouvement.
- **Personnage** : géométrie refaite mais toujours construite par code (primitives arrondies liées
  rigidement aux os, pas de peau déformable ni de sculpture) ; doigts sans os (pas d'animation des
  doigts). Course, sprint, attente, menu et hoverboard refaits ; les autres animations (saut, roulade,
  chute, victoire…) sont celles d'avant.
- **Cartes** : identité visuelle conservée (ciel, éclairage, décor propres à chaque carte) ; pas de nouveaux
  types de décor dans cette passe en dehors des tunnels.
- **Ressources en ligne** : aucun asset CC0 externe intégré. C'est un choix volontaire, pour ne prendre aucun risque de licence.
- **Textures** : pas de compression GPU (KTX2/Basis). Étudiée puis écartée : toutes les textures sont
  générées sur canvas au chargement, il n'y a donc pas de fichiers image à compresser ; l'ajouter
  imposerait un transcodeur WASM de plus de 200 ko pour un gain nul.
- **Audio** : musique procédurale à valider à l'écoute ; pas de mixage par piste dans les réglages.
- **Studio** :
  - les modèles importés n'utilisent pas notre squelette : animations propres au fichier ou bascule procédurale ;
  - pas d'édition des cartes elles-mêmes, seulement l'éclairage et le choix de carte.
- **Édition « MNNROW Online »** : en développement, non jouable (pas de serveur ni de classement).
- **Réglage Pages** : à faire une fois (voir README), puis tests sur appareil réel.
