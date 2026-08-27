// Pure logic, ported from the native app's tested src/logic/*.ts modules.
// Same behavior, same thresholds — verified against the same test cases.

function composeDescription({ recognizedText, faceCount }) {
  const parts = [];
  const trimmedText = (recognizedText || '').trim();
  if (trimmedText.length > 0) {
    parts.push(`Texte détecté : "${trimmedText}".`);
  }
  if (faceCount === 1) {
    parts.push('1 visage détecté.');
  } else if (faceCount > 1) {
    parts.push(`${faceCount} visages détectés.`);
  }
  if (parts.length === 0) {
    return 'Rien de reconnaissable détecté.';
  }
  return parts.join(' ');
}

const NEAR_RATIO = 0.25;
const CLOSE_RATIO = 0.5;

function getProximityLevel(boxHeightRatio) {
  if (boxHeightRatio >= CLOSE_RATIO) return 'close';
  if (boxHeightRatio >= NEAR_RATIO) return 'near';
  return 'far';
}

const LEVEL_RANK = { far: 0, near: 1, close: 2 };

function shouldAnnounce(previous, current) {
  return LEVEL_RANK[current] > LEVEL_RANK[previous];
}

function getHapticIntensity(level) {
  if (level === 'close') return 'heavy';
  if (level === 'near') return 'medium';
  return 'light';
}

function shouldBeep(level, frameCounter) {
  if (level === 'far') return false;
  if (level === 'close') return true;
  return frameCounter % 2 === 0;
}

function describeDirection(horizontalCenter) {
  if (horizontalCenter < 0.33) return 'à gauche';
  if (horizontalCenter > 0.66) return 'à droite';
  return 'devant';
}

const EARTH_RADIUS_METERS = 6371000;
const DEVIATION_THRESHOLD_METERS = 15;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function distanceInMeters(a, b) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function shouldRecalculateRoute(current, nearestPointOnRoute) {
  return distanceInMeters(current, nearestPointOnRoute) > DEVIATION_THRESHOLD_METERS;
}

function findNearestPoint(current, routePoints) {
  if (routePoints.length === 0) {
    throw new Error('findNearestPoint requires a non-empty routePoints array');
  }
  let nearest = routePoints[0];
  let nearestDistance = distanceInMeters(current, nearest);
  for (const point of routePoints.slice(1)) {
    const distance = distanceInMeters(current, point);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function estimateSecondsToArrival(distanceMeters, speedMetersPerSecond) {
  if (speedMetersPerSecond <= 0) return Infinity;
  return distanceMeters / speedMetersPerSecond;
}

// COCO-SSD (used by the coco-ssd browser model) returns English class
// names directly, so this only needs the translation half of the native
// app's labelTranslations.ts (no labelmap.txt index parsing needed here).
const LABEL_TRANSLATIONS_FR = {
  person: 'personne',
  bicycle: 'vélo',
  car: 'voiture',
  motorcycle: 'moto',
  bus: 'bus',
  train: 'train',
  truck: 'camion',
  'traffic light': 'feu de circulation',
  'fire hydrant': 'borne à incendie',
  'stop sign': 'panneau stop',
  bench: 'banc',
  dog: 'chien',
  cat: 'chat',
  backpack: 'sac à dos',
  umbrella: 'parapluie',
  handbag: 'sac à main',
  suitcase: 'valise',
  chair: 'chaise',
  couch: 'canapé',
  'potted plant': 'plante',
  bed: 'lit',
  'dining table': 'table',
  toilet: 'toilettes',
  door: 'porte',
};

function translateLabel(englishLabel) {
  return LABEL_TRANSLATIONS_FR[englishLabel] ?? 'obstacle';
}
