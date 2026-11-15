# MNNROW : génération d'assets 3D avec Blender (bpy)

Ce dossier contient des scripts Python pour Blender (`bpy`) qui **génèrent par
programme** les modèles 3D originaux de MNNROW (trains, pièce, aimant,
hoverboards, obstacles, bâtiments, décor) et les exportent en **GLB**
(glTF 2.0 binaire), prêts pour Three.js.

> **Honnêtement :** ce sont des modèles **procéduraux construits à partir de
> primitives** (boîtes, cylindres, révolutions, extrusions, lofts). Ils sont
> propres, légers et cohérents avec les dimensions du jeu, mais ce **n'est pas
> de l'art 3D professionnel sculpté ou modélisé à la main**. Il n'y a ni UV ni
> textures : l'apparence vient uniquement des matériaux (couleur, métal,
> rugosité, émission). Tous les designs (dont le symbole de la pièce) sont
> originaux.

---

## 1. Contenu

| Script | Fichiers produits |
|---|---|
| `mnnrow_common.py` | Module partagé (pas d'export) : reset de scène, matériaux Principled BSDF (couleur, metallic, roughness, émission), application des transformations, normales recalculées vers l'extérieur (`bmesh.ops.recalc_face_normals`), suppression des doublons (`remove_doubles`), shade smooth / auto-smooth, comptage de triangles, export GLB (`export_format='GLB'`, `export_apply=True`, `export_yup=True`). |
| `generate_train.py` | `train_urban.glb`, `train_modern.glb`, `train_freight_loco.glb`, `wagon_container.glb`, `wagon_tank.glb` |
| `generate_coin.py` | `coin.glb` |
| `generate_magnet.py` | `magnet.glb` |
| `generate_hoverboard.py` | `hoverboard_classic.glb`, `hoverboard_neon.glb`, `hoverboard_futuristic.glb`, `hoverboard_urban.glb`, `hoverboard_energy.glb` |
| `generate_obstacles.py` | `barrier_low.glb`, `barrier_high.glb`, `ramp.glb` |
| `generate_buildings.py` | `building_a.glb`, `building_b.glb`, `building_c.glb` |
| `generate_props.py` | `lamp.glb`, `rail_segment.glb`, `palm.glb`, `fir.glb`, `fir_snow.glb`, `cactus.glb`, `rock.glb`, `station.glb` |
| `generate_all.py` | Lance tous les scripts ci-dessus et écrit aussi `exports/report.json` (triangles, tailles) |
| `validate_glb.py` | Validateur **sans Blender** (Python pur) : en-tête GLB, chunk JSON, nombre de meshes, matériaux, nœuds, triangles, boîte englobante |

### Ce que contient chaque modèle

- **Métro urbain** (`train_urban`) : 2,3 × 3,0 × 14 m. Caisse métallique avec toit
  arrondi (bevel), fenêtres latérales (matériau verre séparé + joint
  caoutchouc), 3 portes doubles par côté (cadre en retrait + vitres), pare-brise
  encadré, 2 essuie-glaces stylisés, girouette lumineuse, phares (émissif blanc),
  feux arrière (émissif rouge), bande colorée + filet orange, 2 bogies de
  4 roues (avec boudins), 2 blocs de climatisation avec grilles de
  ventilateur, grilles d'aération, attelages.
- **Train moderne** (`train_modern`) : même gabarit, nez aérodynamique en loft
  (sections effilées), pare-brise enveloppant, bande de fenêtres panoramique,
  bandeau de phares LED (émissif) sur le nez, liseré lumineux cyan sur toute la
  longueur, feux arrière rouges, portes.
- **Locomotive fret** (`train_freight_loco`) : capot court + cabine vitrée +
  capot long avec persiennes, ventilateurs de radiateur, 2 cheminées
  d'échappement, mains courantes jaunes avec montants, réservoir, chasse-pierres,
  phares, feux de fossé et feux arrière.
- **Wagon porte-conteneur** (`wagon_container`) : wagon plat + conteneur type
  40 pieds (12,19 m) à parois **réellement ondulées**, montants d'angle,
  portes arrière avec barres de verrouillage, verrous tournants.
- **Wagon-citerne** (`wagon_tank`) : citerne en révolution à fonds bombés,
  cerclages, bande colorée, dôme, passerelle, échelles, berceaux.
- **Pièce** (`coin`) : Ø 0,8 m, épaisseur 0,12 m, bord en relief, anneau
  décoratif, symbole original en relief sur les deux faces : un « M de
  vitesse » (M en italique aux jambages coupés comme un éclair). Or :
  metallic 1, roughness 0,25. Origine au centre.
- **Aimant** (`magnet`) : U de 0,91 m de haut, corps rouge brillant, pointes
  argent/blanc, bague sombre de séparation.
- **Hoverboards** (1,6 × 0,5 m, épaisseur ~0,08 m, nez/queue arrondis,
  propulseurs dessous) :
  - `classic` : plateau orange, grip sombre, 2 bandes blanches, 2 propulseurs ;
  - `neon` : nez pointu, noir brillant, tranche **magenta émissive**, ligne cyan
    émissive, néon sous le plateau, 4 propulseurs ;
  - `futuristic` : coque blanche avec « hanches », aileron dorsal, lignes bleues
    émissives, 3 propulseurs ;
  - `urban` : forme plus carrée, grip noir, 3 traits de « graffiti » colorés,
    trucks métalliques et 4 propulseurs ;
  - `energy` : forme en lentille, tranche jaune-vert émissive, noyau et
    chevrons émissifs, anneau émetteur sous la planche.
- **Obstacles** : `barrier_low` (2,0 × 1,0 m, panneau rayé rouge/blanc en
  diagonale sur 2 pieds), `barrier_high` (2,2 × 2,6 m, barre rayée de 1,05 à
  1,6 m, **vide en dessous** pour passer en roulade, poutre haute + lampes
  ambre), `ramp` (6 m de long, monte de 0 à 3,0 m, 2,3 m de large, tasseaux
  antidérapants, bandes de danger).
- **Bâtiments** : `building_a` (maison-commerce en brique, 3 étages, ~10 m,
  vitrine + store), `building_b` (immeuble enduit, 6 étages, balcons, toit à
  18,6 m, château d'eau jusqu'à 21,9 m), `building_c` (tour béton/verre,
  30,0 m pile avec l'antenne et sa balise rouge). Tous : grilles de fenêtres
  avec **cadres extrudés** et **verre en retrait** (matériaux séparés, certaines
  vitres « allumées » émissives), corniche/acrotère, climatiseurs en toiture.
- **Décor** : lampadaire 4,5 m (lumière émissive), segment de voie 2 m
  (2 rails profil en I + 4 traverses + attaches + ballast de 2,5 m de large,
  raccordable bout à bout), palmier courbé, sapin, sapin enneigé, cactus
  côtelé à 2 bras, rocher low-poly, gare du désert (quai 12 m, auvent incliné,
  mur en adobe, bancs, enseigne lumineuse).

---

## 2. Conventions (important pour l'intégration)

- **Unités** : mètres. Blender est Z-up ; l'export utilise `export_yup=True`,
  donc les GLB sont **Y-up** (convention glTF/Three.js).
  Correspondance : X Blender → X glTF, Z Blender → Y glTF, Y Blender → −Z glTF.
- **Voie** : la longueur des véhicules et des pièces de voie suit l'axe Y de
  Blender (= Z glTF). Le joueur est supposé courir vers **−Z glTF**.
  - L'**avant/la cabine des trains** pointe vers **+Z glTF** (vers la caméra,
    trains venant en face). Retournez-les de 180° autour de Y pour des trains
    qui roulent dans le même sens que le joueur.
  - Le **nez des hoverboards** pointe vers **−Z glTF** (sens de la course).
  - La **rampe** monte de +Z glTF (bas, z = +3) vers −Z glTF (haut, z = −3) :
    le joueur l'aborde par le bas.
  - La face avant de la **pièce** regarde vers +Z glTF (vers la caméra).
- **Origines** : centre de la base (y = 0 en bas), sauf :
  - la **pièce** : origine au centre ;
  - les **trains** : y = 0 = **dessus du rail**. Les boudins des roues
    descendent de 2,9 cm sous le dessus du rail, entre les rails, comme sur un
    vrai train ;
  - `rail_segment` : y = 0 = dessus du rail (rails à x = ±0,7175 m,
    écartement standard), le ballast descend jusqu'à −0,45 m.
- **Gabarits mesurés** (boîtes englobantes lues dans les GLB) : tous les trains
  font exactement 14,00 m de long et 3,00 m de haut (+2,9 cm de boudins sous le
  rail). La largeur est de 2,30 m pour la caisse ; les détails latéraux
  (cadres de fenêtres, portes) dépassent d’au plus 3,7 cm de chaque côté
  (2,36 à 2,37 m hors tout pour le métro, le train moderne et la loco).
- **Hiérarchie** : chaque GLB a un nœud racine vide (ex. `Train_Urban`,
  `Coin`, `Hoverboard_Neon`) et des enfants nommés (`Train_Body`,
  `Train_Bogie_Front`, `Train_Roof_Equipment`, `Hoverboard_Deck`,
  `Hoverboard_Thrusters`…). Matériaux nommés `MAT_…` (ex. `MAT_Train_Metal`,
  `MAT_Train_Headlight`, `MAT_Coin_Gold`). Chaque objet = 1 mesh avec plusieurs
  matériaux, ce qui limite les draw calls.
- Les matériaux émissifs dont l'intensité dépasse 1 utilisent l'extension
  `KHR_materials_emissive_strength` (gérée par le `GLTFLoader` de Three.js
  récent).

---

## 3. Exécuter les scripts sur un PC avec Blender 4.x

Les scripts sont écrits pour **Blender 4.x / 5.x**. Ils évitent les
opérateurs dépendant de l'interface (tout est construit en `bmesh`), donc ils
tournent en mode sans interface (`-b`).

Depuis la racine du dépôt :

```bash
# tout générer (26 GLB + exports/report.json)
blender -b -P blender/generate_all.py -- --out blender/exports

# ou un seul script
blender -b -P blender/generate_train.py      -- --out blender/exports
blender -b -P blender/generate_coin.py       -- --out blender/exports
blender -b -P blender/generate_magnet.py     -- --out blender/exports
blender -b -P blender/generate_hoverboard.py -- --out blender/exports
blender -b -P blender/generate_obstacles.py  -- --out blender/exports
blender -b -P blender/generate_buildings.py  -- --out blender/exports
blender -b -P blender/generate_props.py      -- --out blender/exports

# vérifier les fichiers (Python 3 simple, sans Blender)
python3 blender/validate_glb.py blender/exports/*.glb
```

Sous Windows, si `blender` n'est pas dans le PATH :

```bat
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" -b -P blender\generate_all.py -- --out blender\exports
```

Sous macOS : `/Applications/Blender.app/Contents/MacOS/Blender -b -P ...`

Sans `--out`, les fichiers vont dans `blender/exports/`.

### Alternative sans installer Blender : le module pip `bpy`

Blender est publié sur PyPI sous forme de module Python `bpy` (environ 300 à
400 Mo à télécharger, ~900 Mo une fois installé). Le module exige la **version
exacte de Python** pour laquelle il est compilé (Python 3.11 pour bpy 4.x/5.0).

```bash
# avec uv (recommandé : gère la version de Python)
pip install uv
uv venv --python 3.11 ~/bpyenv
uv pip install --python ~/bpyenv/bin/python bpy
~/bpyenv/bin/python blender/generate_all.py --out blender/exports

# ou avec pip classique, si python3.11 est installé
python3.11 -m venv ~/bpyenv
~/bpyenv/bin/pip install bpy
~/bpyenv/bin/python blender/generate_all.py --out blender/exports
```

(Avec le module pip, pas besoin du `--` : `python script.py --out dossier`
fonctionne, mais `-- --out dossier` est aussi accepté.)

---

## 4. Tu développes sur un téléphone Android : que faire ?

Blender (et le module `bpy`) **ne tourne pas sur Android**. Pour régénérer les
modèles, il faut une machine Linux, Windows ou macOS. Options :

1. **Un PC** (le tien ou celui d'un ami) : installer Blender 4.x, cloner le
   dépôt, lancer la commande `generate_all.py` ci-dessus, puis committer les
   GLB produits.
2. **GitHub Actions** (gratuit pour un dépôt public, déclenchable depuis le
   téléphone dans l'onglet *Actions*) : un workflow Ubuntu installe le module
   `bpy` et génère les GLB, téléchargeables en « artifact ». Exemple de fichier
   à créer dans `.github/workflows/blender-assets.yml` (**non créé ni testé
   dans cette session**, à adapter) :

   ```yaml
   name: Generate Blender assets
   on: workflow_dispatch
   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-python@v5
           with:
             python-version: "3.11"
         - run: pip install bpy
         - run: python blender/generate_all.py --out blender/exports
         - run: python blender/validate_glb.py blender/exports/*.glb
         - uses: actions/upload-artifact@v4
           with:
             name: mnnrow-glb
             path: blender/exports/
   ```
   Si `import bpy` échoue sur le runner à cause d'une bibliothèque système
   manquante, ajouter avant l'installation une étape du type
   `sudo apt-get update && sudo apt-get install -y libxi6 libxkbcommon0 libsm6 libgl1`.
3. **Une machine dans le cloud** (GitHub Codespaces, Gitpod, une VM…) :
   mêmes commandes que la section pip `bpy`, depuis le navigateur du téléphone.

---

## 5. Remplacer les modèles du jeu

1. Copier les GLB voulus dans `public/assets/models/…`, par exemple :

   ```
   public/assets/models/trains/train_urban.glb
   public/assets/models/trains/train_modern.glb
   public/assets/models/trains/train_freight_loco.glb
   public/assets/models/trains/wagon_container.glb
   public/assets/models/trains/wagon_tank.glb
   public/assets/models/pickups/coin.glb
   public/assets/models/pickups/magnet.glb
   public/assets/models/hoverboards/hoverboard_<style>.glb
   public/assets/models/obstacles/barrier_low.glb  (barrier_high, ramp)
   public/assets/models/buildings/building_a.glb   (b, c)
   public/assets/models/props/lamp.glb             (rail_segment, palm, fir, fir_snow, cactus, rock, station)
   ```
   Adapter les chemins à ce qu'attend le code du jeu (manifeste d'assets,
   loader…) : ce dossier `blender/` ne modifie rien en dehors de lui-même.
2. Chargement type avec Three.js :

   ```js
   import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
   const loader = new GLTFLoader();
   loader.load('/assets/models/trains/train_urban.glb', (gltf) => {
     const train = gltf.scene;          // déjà en mètres, Y-up
     train.position.set(laneX, 0, z);   // y = 0 = dessus du rail
     scene.add(train);
   });
   ```
   Lanes : largeur 2,5 m, donc centres à x = −2,5 / 0 / +2,5.
3. Optionnel : compresser avec
   `npx @gltf-transform/cli optimize in.glb out.glb` (Draco/meshopt) si le
   poids compte (les fichiers actuels font de 8 à 197 Ko).

---

## 6. Ce qui a été réellement exécuté dans cette session

**Oui, les scripts ont été exécutés pour de vrai.** Blender n'étant pas
installé sur la machine de développement, ils ont été lancés avec le **module
pip `bpy` 5.0.1** (Blender 5.0.1, Python 3.11, Linux, environnement virtuel
créé avec `uv` hors du dépôt puis supprimé), par
`python blender/generate_all.py --out blender/exports`. Les 26 GLB ont été
écrits (1,8 Mo au total) en moins d'une seconde.

Tous les fichiers ont été validés avec `validate_glb.py` : magic `glTF`,
version 2, longueur déclarée = taille du fichier, chunk JSON lisible. Des rendus
de contrôle (Cycles) ont aussi été faits pour vérifier visuellement chaque
modèle.

Ils **n'ont pas** été testés avec un Blender 4.x installé classiquement
(`blender -b -P …`). Le code prévoit les différences d'API connues (nom des
entrées d'émission, auto-smooth avant/après 4.1, options de l'exporteur), mais
sans garantie.

| Fichier | Triangles | Taille | Matériaux | Dimensions glTF X × Y(haut) × Z (m) |
|---|---:|---:|---:|---|
| train_urban.glb | 4 252 | 180 384 o | 13 | 2,36 × 3,03 × 14,00 |
| train_modern.glb | 3 424 | 119 012 o | 11 | 2,37 × 3,03 × 14,00 |
| train_freight_loco.glb | 4 720 | 190 356 o | 12 | 2,36 × 3,03 × 14,00 |
| wagon_container.glb | 4 168 | 171 888 o | 7 | 2,30 × 3,03 × 14,00 |
| wagon_tank.glb | 3 812 | 134 104 o | 7 | 2,30 × 3,03 × 14,00 |
| coin.glb | 1 204 | 38 152 o | 2 | 0,80 × 0,80 × 0,12 |
| magnet.glb | 636 | 19 032 o | 3 | 0,73 × 0,91 × 0,19 |
| hoverboard_classic.glb | 1 212 | 36 996 o | 6 | 0,50 × 0,24 × 1,60 |
| hoverboard_neon.glb | 1 412 | 43 496 o | 5 | 0,50 × 0,27 × 1,60 |
| hoverboard_futuristic.glb | 1 324 | 40 360 o | 4 | 0,49 × 0,31 × 1,60 |
| hoverboard_urban.glb | 1 464 | 46 044 o | 8 | 0,50 × 0,27 × 1,60 |
| hoverboard_energy.glb | 1 452 | 42 692 o | 5 | 0,49 × 0,21 × 1,60 |
| barrier_low.glb | 292 | 18 084 o | 5 | 2,00 × 1,00 × 0,70 |
| barrier_high.glb | 404 | 22 148 o | 5 | 2,20 × 2,60 × 0,80 |
| ramp.glb | 472 | 28 044 o | 4 | 2,30 × 3,00 × 6,00 |
| building_a.glb | 1 136 | 60 912 o | 10 | 10,35 × 10,00 × 8,30 |
| building_b.glb | 3 992 | 196 500 o | 10 | 11,81 × 21,90 × 10,12 |
| building_c.glb | 4 124 | 196 168 o | 8 | 12,50 × 30,00 × 12,50 |
| lamp.glb | 336 | 13 644 o | 3 | 1,51 × 4,50 × 0,40 |
| rail_segment.glb | 340 | 20 984 o | 4 | 2,50 × 0,45 × 2,00 |
| palm.glb | 1 084 | 31 048 o | 4 | 5,38 × 6,33 × 5,38 |
| fir.glb | 172 | 7 848 o | 2 | 2,85 × 5,30 × 3,00 |
| fir_snow.glb | 440 | 15 960 o | 3 | 3,40 × 5,34 × 3,40 |
| cactus.glb | 948 | 23 608 o | 2 | 1,50 × 3,09 × 0,62 |
| rock.glb | 400 | 25 628 o | 1 | 2,16 × 0,75 × 1,52 |
| station.glb | 786 | 40 712 o | 8 | 3,73 × 4,35 × 12,60 |

Tous les trains restent sous le budget de 6 000 triangles. (La hauteur
« 3,03 » des trains = 3,00 m au-dessus du rail + 2,9 cm de boudins de roue
sous le rail.)

---

## 7. Limites connues

- Pas d'UV ni de textures : couleurs unies par matériau. Pour des textures,
  il faudrait déplier les UV dans Blender et peindre/baker.
- Pas d'animation exportée. Les roues sont regroupées dans les objets
  `*_Bogie_*` : pour les faire tourner, il faudrait séparer chaque essieu en
  objet distinct.
- Géométrie « low-poly propre » : pas de détails sculptés, pas de LOD
  automatiques.
- Le verre est opaque (bleu sombre très brillant), sans transparence, ce qui
  évite les problèmes de tri sur mobile.
