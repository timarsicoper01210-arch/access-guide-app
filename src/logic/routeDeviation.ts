export interface Coordinate {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6371000;
const DEVIATION_THRESHOLD_METERS = 15;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceInMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function shouldRecalculateRoute(
  current: Coordinate,
  nearestPointOnRoute: Coordinate
): boolean {
  return distanceInMeters(current, nearestPointOnRoute) > DEVIATION_THRESHOLD_METERS;
}

export function findNearestPoint(current: Coordinate, routePoints: Coordinate[]): Coordinate {
  if (routePoints.length === 0) {
    throw new Error('findNearestPoint requires a non-empty routePoints array');
  }

  let nearest = routePoints[0]!;
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
