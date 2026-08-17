export type ProximityLevel = 'far' | 'near' | 'close';

const NEAR_RATIO = 0.25;
const CLOSE_RATIO = 0.5;

export function getProximityLevel(boxHeightRatio: number): ProximityLevel {
  if (boxHeightRatio >= CLOSE_RATIO) return 'close';
  if (boxHeightRatio >= NEAR_RATIO) return 'near';
  return 'far';
}

const LEVEL_RANK: Record<ProximityLevel, number> = { far: 0, near: 1, close: 2 };

export function shouldAnnounce(
  previous: ProximityLevel,
  current: ProximityLevel
): boolean {
  return LEVEL_RANK[current] > LEVEL_RANK[previous];
}

export type HapticIntensity = 'light' | 'medium' | 'heavy';

export function getHapticIntensity(level: ProximityLevel): HapticIntensity {
  if (level === 'close') return 'heavy';
  if (level === 'near') return 'medium';
  return 'light';
}
