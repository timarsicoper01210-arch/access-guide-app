# Access Guide — App d'assistance pour personnes malvoyantes/handicapées

**Date:** 2026-08-17
**Statut:** Approuvé par l'utilisateur (design), en attente de plan d'implémentation

## Problème

Se déplacer et comprendre son environnement sans bien voir est difficile.
L'app transforme le téléphone (déjà en poche) en assistant vocal à trois
fonctions : navigation piétonne guidée, détection d'obstacles en temps
réel, et description de l'environnement (texte/objets/visages) sur demande.

## Plateforme et stack

- **React Native + Expo** (SDK managé) — un seul codebase iOS + Android.
- Test rapide via **Expo Go** (QR code) pendant le dev ; build natif
  (EAS Build) plus tard pour publication sur les stores.
- Langue de l'interface et de la voix : **français**.

### Librairies clés
| Besoin | Librairie |
|---|---|
| Caméra + frames temps réel | `react-native-vision-camera` |
| Détection d'objets / OCR / visages on-device | `@react-native-ml-kit` (text-recognition, object-detection, face-detection) |
| Synthèse vocale (TTS) | `expo-speech` |
| Vibrations (retour haptique) | `expo-haptics` |
| GPS + géolocalisation | `expo-location` |
| Itinéraire piéton | API de routing (OpenRouteService, clé gratuite) |
| Navigation entre écrans | `expo-router` |

## Architecture — 3 modes autonomes

Écran d'accueil : 3 boutons plein écran, gros contraste, labels
compatibles VoiceOver/TalkBack (`accessibilityLabel`, `accessibilityRole`).
Chaque mode est un écran indépendant, pas de state partagé entre eux.

### 1. Naviguer (`app/navigate.tsx`)
- Demande destination (saisie vocale ou texte).
- `expo-location` (mode `watchPositionAsync`, haute précision) + appel à
  l'API de routing pour obtenir un itinéraire piéton en étapes.
- À chaque changement d'étape : `expo-speech` annonce l'instruction
  ("tournez à gauche dans 20 mètres"), `expo-haptics` vibre courte
  impulsion 5 secondes avant un virage.
- Recalcule l'itinéraire si écart > 15 m par rapport au tracé.

### 2. Obstacles (`app/obstacles.tsx`)
- Flux caméra continu via `react-native-vision-camera` + frame
  processor ML Kit (object detection, ~5 fps pour économiser la
  batterie).
- Distance = **estimation heuristique** basée sur la taille de la
  boîte englobante de l'objet détecté à l'écran (pas de LiDAR) —
  annoncé clairement à l'utilisateur au premier lancement comme une
  aide complémentaire, pas une canne blanche.
- Objet qui se rapproche → fréquence des bips + intensité vibration
  augmentent ; `expo-speech` annonce type d'objet + direction
  ("poteau, devant, proche") au moment où il franchit un seuil de
  proximité, pas en continu (éviter la surcharge auditive).

### 3. Décrire (`app/describe.tsx`)
- Un bouton unique, appui = capture photo.
- Pipeline séquentiel sur la photo : OCR (texte) → labels d'objets →
  détection de visages (nombre + position, pas d'identification).
- Compose une phrase descriptive unique, lue par `expo-speech`.
  Exemple : *"Texte détecté : 'Sortie de secours'. Objets : chaise,
  table. 2 visages détectés."*

## Gestion des erreurs / cas limites

- **Permissions refusées** (caméra/GPS/micro) : écran dédié qui
  explique vocalement quelle permission manque et pourquoi, avec
  bouton pour rouvrir les réglages système.
- **Pas de GPS/réseau en mode Naviguer** : bascule automatique vers
  message vocal "signal perdu, réessai en cours" + les modes
  Obstacles/Décrire restent utilisables (100% on-device, pas besoin
  de réseau).
- **Batterie faible** (<15%) pendant mode Obstacles (le plus
  gourmand) : notification vocale unique suggérant de fermer le mode.
- **Aucun objet/texte détecté** en mode Décrire : annonce claire
  "Rien de reconnaissable détecté" plutôt que rester silencieux.

## Tests

- Développement itératif via Expo Go sur téléphone réel (caméra/GPS/
  haptics ne fonctionnent pas correctement en simulateur).
- Tests unitaires (Jest) sur la logique pure : composition des
  phrases de description, calcul de seuil de proximité, décision de
  recalcul d'itinéraire — tout ce qui ne dépend pas du matériel.
- Pas de tests automatisés sur les couches caméra/GPS natives
  (nécessitent un device réel) — checklist de vérification manuelle
  par mode avant chaque livraison.

## Hors scope (v1)

- Publication sur les stores (comptes développeur payants requis,
  décision séparée).
- Multilingue.
- Détection de profondeur via LiDAR (réservé aux iPhone Pro).
- Reconnaissance faciale nominative (identification de personnes).
