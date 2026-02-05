import { Coordinates } from "../types/common"

/**
 * Calculate the distance between two points using Haversine formula
 */
export function haversineDistance(
  point1: Coordinates,
  point2: Coordinates,
): number {
  const R = 6371000 // Earth's radius in meters
  const dLat = toRadians(point2.lat - point1.lat)
  const dLng = toRadians(point2.lng - point1.lng)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(point1.lat)) *
      Math.cos(toRadians(point2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

/**
 * Check if a point is on or near a route (within tolerance)
 * Returns true if the point is within the tolerance distance of any route segment
 */
export function isPointOnRoute(
  point: Coordinates,
  routeCoordinates: Coordinates[],
  tolerance: number = 10, // meters, default 10m for "on route" validation
): boolean {
  if (routeCoordinates.length < 2) {
    return false
  }

  // Check distance to each segment
  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const segmentStart = routeCoordinates[i]
    const segmentEnd = routeCoordinates[i + 1]

    // Find the closest point on this line segment
    const closestOnSegment = findClosestPointOnLineSegment(
      point,
      segmentStart,
      segmentEnd,
    )

    const distance = haversineDistance(point, closestOnSegment)

    // If within tolerance, point is on the route
    if (distance <= tolerance) {
      return true
    }
  }

  return false
}

/**
 * Find the closest point on a route linestring to a given coordinate
 */
export function findClosestPointOnRoute(
  targetPoint: Coordinates,
  routeCoordinates: Coordinates[],
  snapPrecision: number = 10, // meters
): { snappedPoint: Coordinates; distance: number; isSnapped: boolean } {
  if (routeCoordinates.length < 2) {
    return {
      snappedPoint: targetPoint,
      distance: 0,
      isSnapped: false,
    }
  }

  let closestPoint = routeCoordinates[0]
  let minDistance = haversineDistance(targetPoint, routeCoordinates[0])
  let closestSegmentIndex = 0

  // Check each segment of the route
  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const segmentStart = routeCoordinates[i]
    const segmentEnd = routeCoordinates[i + 1]

    // Find the closest point on this line segment
    const closestOnSegment = findClosestPointOnLineSegment(
      targetPoint,
      segmentStart,
      segmentEnd,
    )

    const distance = haversineDistance(targetPoint, closestOnSegment)

    if (distance < minDistance) {
      minDistance = distance
      closestPoint = closestOnSegment
      closestSegmentIndex = i
    }
  }

  // Only snap if within precision threshold
  const isSnapped = minDistance <= snapPrecision

  return {
    snappedPoint: isSnapped ? closestPoint : targetPoint,
    distance: minDistance,
    isSnapped,
  }
}

/**
 * Find the closest point on a line segment to a target point
 */
function findClosestPointOnLineSegment(
  targetPoint: Coordinates,
  segmentStart: Coordinates,
  segmentEnd: Coordinates,
): Coordinates {
  const A = targetPoint.lng - segmentStart.lng
  const B = targetPoint.lat - segmentStart.lat
  const C = segmentEnd.lng - segmentStart.lng
  const D = segmentEnd.lat - segmentStart.lat

  const dot = A * C + B * D
  const lenSq = C * C + D * D

  if (lenSq === 0) {
    return segmentStart
  }

  const param = dot / lenSq

  let closestLng: number
  let closestLat: number

  if (param < 0) {
    closestLng = segmentStart.lng
    closestLat = segmentStart.lat
  } else if (param > 1) {
    closestLng = segmentEnd.lng
    closestLat = segmentEnd.lat
  } else {
    closestLng = segmentStart.lng + param * C
    closestLat = segmentStart.lat + param * D
  }

  return { lat: closestLat, lng: closestLng }
}

/**
 * Snap a cut point to the route if snap-to-route is enabled
 */
export function snapCutPointToRoute(
  cutPoint: Coordinates,
  routePolyline: string,
  snapToRoute: boolean,
  snapPrecision: number,
): { snappedPoint: Coordinates; isSnapped: boolean; distance: number } {
  if (!snapToRoute || !routePolyline) {
    return {
      snappedPoint: cutPoint,
      isSnapped: false,
      distance: 0,
    }
  }

  try {
    // Decode the polyline to get coordinates
    const routeCoordinates = decodePolyline(routePolyline)

    const result = findClosestPointOnRoute(
      cutPoint,
      routeCoordinates,
      snapPrecision,
    )

    return {
      snappedPoint: result.snappedPoint,
      isSnapped: result.isSnapped,
      distance: result.distance,
    }
  } catch (error) {
    console.error("Error snapping cut point to route:", error)
    return {
      snappedPoint: cutPoint,
      isSnapped: false,
      distance: 0,
    }
  }
}

/**
 * Simple polyline decoder (you might want to use a proper library like @mapbox/polyline)
 */
function decodePolyline(encoded: string): Coordinates[] {
  const coordinates: Coordinates[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let b: number

    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    lat += dlat

    shift = 0
    result = 0

    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1
    lng += dlng

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }

  return coordinates
}

/**
 * Extract coordinates from GeoJSON Feature or FeatureCollection
 * Returns coordinates in {lat, lng} format suitable for route snapping
 */
export function extractCoordinatesFromGeoJSON(
  geoJson: GeoJSON.Feature | GeoJSON.FeatureCollection,
): Coordinates[] {
  let coordinates: [number, number][] | [number, number, number][] = []

  if (geoJson.type === "FeatureCollection") {
    const feature = geoJson.features[0]
    if (feature?.geometry.type === "LineString") {
      coordinates = feature.geometry.coordinates as
        | [number, number][]
        | [number, number, number][]
    }
  } else if (geoJson.geometry.type === "LineString") {
    coordinates = geoJson.geometry.coordinates as
      | [number, number][]
      | [number, number, number][]
  }

  // Convert from [lng, lat] to {lat, lng} format
  return coordinates.map((coord) => ({
    lat: coord[1],
    lng: coord[0],
  }))
}

/**
 * Extract coordinates from encodedPolyline field
 * Handles both Google-encoded polyline strings and JSON array strings (for imported routes)
 * Returns coordinates in {lat, lng} format suitable for route snapping
 */
export function extractCoordinatesFromEncodedPolyline(
  encodedPolyline: string,
): Coordinates[] | null {
  if (!encodedPolyline) {
    return null
  }

  // Check if it's a JSON array string (starts with [[)
  // This is the format used for imported routes
  if (encodedPolyline.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(encodedPolyline)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Convert from [lng, lat] to {lat, lng} format
        return parsed.map((coord: number[]) => ({
          lat: coord[1],
          lng: coord[0],
        }))
      }
    } catch (error) {
      console.error("Error parsing JSON array from encodedPolyline:", error)
      return null
    }
  }

  // If not a JSON array, assume it's a Google-encoded polyline
  // Return null to indicate it needs to be decoded using decodePolyline
  return null
}

/**
 * Calculate the distance along a route from start to a given point
 */
export function calculateDistanceFromStart(
  point: Coordinates,
  routeCoordinates: Coordinates[],
): number {
  let totalDistance = 0

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const segmentStart = routeCoordinates[i]
    const segmentEnd = routeCoordinates[i + 1]

    // Check if the point is on this segment
    const closestOnSegment = findClosestPointOnLineSegment(
      point,
      segmentStart,
      segmentEnd,
    )
    const distanceToClosest = haversineDistance(point, closestOnSegment)

    // If point is close to this segment, calculate distance from start
    if (distanceToClosest < 10) {
      // 10 meter threshold
      for (let j = 0; j <= i; j++) {
        if (j < i) {
          totalDistance += haversineDistance(
            routeCoordinates[j],
            routeCoordinates[j + 1],
          )
        } else {
          totalDistance += haversineDistance(segmentStart, closestOnSegment)
        }
      }
      break
    }
  }

  return totalDistance
}
