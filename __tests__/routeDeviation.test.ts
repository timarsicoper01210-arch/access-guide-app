import {
  distanceInMeters,
  shouldRecalculateRoute,
  findNearestPoint,
  estimateSecondsToArrival,
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

describe('findNearestPoint', () => {
  it('returns the single point when the list has only one entry', () => {
    const current = { latitude: 48.8566, longitude: 2.3522 };
    const only = { latitude: 48.86, longitude: 2.36 };
    expect(findNearestPoint(current, [only])).toEqual(only);
  });

  it('picks the closest of several candidate points', () => {
    const current = { latitude: 48.8566, longitude: 2.3522 };
    const near = { latitude: 48.85661, longitude: 2.3522 }; // ~1.1m
    const far = { latitude: 48.9, longitude: 2.4 };
    expect(findNearestPoint(current, [far, near])).toEqual(near);
  });

  it('throws on an empty route', () => {
    const current = { latitude: 48.8566, longitude: 2.3522 };
    expect(() => findNearestPoint(current, [])).toThrow();
  });
});

describe('estimateSecondsToArrival', () => {
  it('divides distance by speed', () => {
    expect(estimateSecondsToArrival(10, 2)).toBe(5);
  });

  it('returns Infinity when speed is zero or negative (stationary/invalid)', () => {
    expect(estimateSecondsToArrival(10, 0)).toBe(Infinity);
    expect(estimateSecondsToArrival(10, -1)).toBe(Infinity);
  });

  it('returns 0 when already at the destination', () => {
    expect(estimateSecondsToArrival(0, 1.4)).toBe(0);
  });
});
