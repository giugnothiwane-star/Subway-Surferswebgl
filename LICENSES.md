# Licences et provenance des ressources

## Résumé

**Aucune ressource externe téléchargée (modèle, texture, son, police) n'est intégrée au jeu**, à l'exception des photos fournies par le propriétaire du projet (voir plus bas).
Aucun fichier n'a été téléchargé depuis Sketchfab, Poly Pizza, Kenney, Quaternius ou un autre dépôt.
Aucun asset d'un jeu commercial n'est utilisé ni extrait. Le registre des ressources externes ci-dessous est donc vide.

| Nom | Auteur | URL d'origine | Licence | Modifications | Emplacement | Attribution |
|---|---|---|---|---|---|---|
| *(aucune ressource externe)* | — | — | — | — | — | — |

## Photos fournies par le propriétaire du projet

Textures de pièces choisies dans **Studio → Pièces**. Le fond a été retiré automatiquement par l'outil
`rembg` (modèles IS-Net et BiRefNet, exécutés localement), puis l'image a été recadrée en 768 × 768 px WebP, l'animal agrandi pour remplir la face de la pièce.
Sur le chaton noir et blanc, le jouet dinosaure a été retiré à la main, par sa couleur et sa position.

| Fichier | Sujet | Origine | Droits |
|---|---|---|---|
| `public/assets/textures/coins/calopsitte-grise.webp` | Calopsitte grise | Photo fournie par le propriétaire du dépôt | Libre d'utilisation selon le propriétaire du dépôt (licence non vérifiée par l'équipe) |
| `…/calopsitte-blanche.webp` | Calopsitte blanche | idem | Libre d'utilisation selon le propriétaire (idem) |
| `…/calopsitte-perle.webp` | Calopsitte perle | idem | Libre d'utilisation selon le propriétaire (idem) |
| `…/calopsitte-lutino.webp` | Calopsitte lutino | idem | Libre d'utilisation selon le propriétaire (idem) |
| `…/calopsitte-cannelle.webp` | Calopsitte cannelle | idem | Libre d'utilisation selon le propriétaire (idem) |
| `…/husky.webp` | Husky du propriétaire (« Mon husky ») | Photo personnelle fournie par le propriétaire | Propriétaire du dépôt |
| `…/chaton-tuxedo.webp` | Chaton noir et blanc | idem | Propriétaire du dépôt |
| `…/chaton-calin.webp` | Chaton | idem | Propriétaire du dépôt |
| `…/chihuahua.webp` | Chihuahua | idem | Propriétaire du dépôt |

## Ressources originales de ce dépôt

| Ressource | Comment elle est produite | Emplacement |
|---|---|---|
| Personnage, trains, pièces, bonus, hoverboards, obstacles, décors | Construits en JavaScript à partir de primitives Three.js, de profils balayés, d'extrusions et de géométries fusionnées | `src/models/` |
| Fichiers GLB du jeu | Exportés depuis ces modèles par `GLTFExporter` (`npm run export:models`) | `public/assets/models/` |
| Fichiers GLB Blender | Générés par les scripts `bpy` du dossier `blender/`, exécutés avec le module pip `bpy` (Blender 5.0.1) | `blender/exports/` |
| Textures (livrées de trains, fenêtres, sols, affiches, enseignes, hoverboards, eau) | Dessinées à l'exécution sur `<canvas>` | `src/models/textures.js` |
| Affiches et enseignes | Noms de marques **fictifs** (ZAP COLA, PIXEL NOODLES, ROBO RAMEN…) | `src/models/textures.js`, `src/data/maps.js` |
| Musique, ambiances et effets sonores | Synthétisés en temps réel avec la Web Audio API (aucun fichier audio) | `src/audio/AudioSystem.js` |
| Vignettes des cartes | Captures d'écran du jeu lui-même (Playwright) | `public/assets/maps/` |
| Icônes de l'interface | CSS pur | `src/styles/main.css` |

Ces ressources sont des créations procédurales simples (« style cartoon low poly »).
Elles ne remplacent pas le travail d'un artiste 3D professionnel.

## Dépendances logicielles (npm, versions figées)

| Paquet | Version | Licence | Usage |
|---|---|---|---|
| three | 0.170.0 | MIT | Rendu 3D, GLTFLoader, GLTFExporter, OrbitControls, RoomEnvironment, BufferGeometryUtils |
| fflate | 0.8.2 | MIT | Décompression des archives ZIP importées dans le studio (chargé à la demande) |
| vite | 5.4.11 | MIT | Outil de compilation (développement uniquement) |

Outils de test et de production utilisés hors du jeu : Playwright/Chromium (tests et captures), module pip
`bpy` (scripts Blender). Ils ne sont pas distribués avec le jeu.

## Fichiers importés par les joueurs

Les fichiers importés dans le Studio restent dans le navigateur de l'appareil (IndexedDB).
Ils ne sont jamais envoyés en ligne. Chacun doit n'importer que des ressources qu'il a le droit d'utiliser.
