import {
  distanceInMeters,
  shouldRecalculateRoute,
} from '../src/logic/routeDeviation';

describe('distanceInMeters', () => {
  it('returns 0 for identical coordinates', () => {
    const point = { latitude: 48.8566, longitude: 2.3522 };
    expect(distanceInMeters(point, point)).toBe(0);
  });

  it('approximates ~11 meters for a 0.0001-degree latitude offset', () => {
    const a = { latitude: 48.8566, longitude: 2.3522 };
    const b = { latitude: 48.8567, longitude: 2.3522 };
    expect(distanceInMeters(a, b)).toBeGreaterThan(10);
    expect(distanceInMeters(a, b)).toBeLessThan(12);
  });
});

describe('shouldRecalculateRoute', () => {
  it('does not recalculate when within 15 meters of the route', () => {
    const current = { latitude: 48.8566, longitude: 2.3522 };
    const nearestOnRoute = { latitude: 48.85661, longitude: 2.3522 }; // ~1.1m
    expect(shouldRecalculateRoute(current, nearestOnRoute)).toBe(false);
  });

  it('recalculates when more than 15 meters from the route', () => {
    const current = { latitude: 48.8566, longitude: 2.3522 };
    const nearestOnRoute = { latitude: 48.85675, longitude: 2.3522 }; // ~16.7m
    expect(shouldRecalculateRoute(current, nearestOnRoute)).toBe(true);
  });
});
