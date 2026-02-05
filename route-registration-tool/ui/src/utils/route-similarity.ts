import { haversineDistance } from "./route-snapping"

/**
 * Calculate the similarity percentage between an uploaded route and its optimized version
 * Returns a value between 0 and 100, where 100 means identical routes
 */
export function calculateRouteSimilarity(
  uploadedRouteData: GeoJSON.Feature | GeoJSON.FeatureCollection,
  optimizedRouteGeometry: GeoJSON.LineString,
): number {
  try {
    // Extract LineString from uploaded route
    let uploadedCoordinates: [number, number][] = []

    if (uploadedRouteData.type === "FeatureCollection") {
      // Find the first LineString feature
      const lineStringFeature = uploadedRouteData.features.find(
        (f: GeoJSON.Feature) =>
          f.geometry.type === "LineString" ||
          f.geometry.type === "MultiLineString",
      )

      if (lineStringFeature) {
        if (lineStringFeature.geometry.type === "LineString") {
          uploadedCoordinates = lineStringFeature.geometry.coordinates as [
            number,
            number,
          ][]
        } else if (lineStringFeature.geometry.type === "MultiLineString") {
          // Use the first LineString from MultiLineString
          const firstLine = lineStringFeature.geometry.coordinates[0]
          if (firstLine && firstLine.length > 0) {
            uploadedCoordinates = firstLine as [number, number][]
          }
        }
      }
    } else if (uploadedRouteData.type === "Feature") {
      if (uploadedRouteData.geometry.type === "LineString") {
        uploadedCoordinates = uploadedRouteData.geometry.coordinates as [
          number,
          number,
        ][]
      } else if (uploadedRouteData.geometry.type === "MultiLineString") {
        // Use the first LineString from MultiLineString
        const firstLine = uploadedRouteData.geometry.coordinates[0]
        if (firstLine && firstLine.length > 0) {
          uploadedCoordinates = firstLine as [number, number][]
        }
      }
    }

    if (uploadedCoordinates.length < 2) {
      return 0
    }

    const optimizedCoordinates = optimizedRouteGeometry.coordinates as [
      number,
      number,
    ][]

    if (optimizedCoordinates.length < 2) {
      return 0
    }

    // Calculate total length of both routes
    const uploadedLength = calculateRouteLength(uploadedCoordinates)
    const optimizedLength = calculateRouteLength(optimizedCoordinates)

    // Calculate length similarity (penalize if routes have very different lengths)
    const lengthRatio =
      uploadedLength > 0
        ? Math.min(
            optimizedLength / uploadedLength,
            uploadedLength / optimizedLength,
          )
        : 0
    const lengthSimilarity = lengthRatio * 100

    // Sample points along the optimized route and check distance to uploaded route
    // Use a reasonable number of sample points
    const numSamples = Math.min(
      50,
      Math.max(10, Math.floor(optimizedCoordinates.length / 2)),
    )

    let matchingPoints = 0
    const thresholdDistanceMeters = 50 // 50 meters threshold

    // Sample points along the optimized route
    for (let i = 0; i <= numSamples; i++) {
      const sampleIndex = Math.floor(
        (i / numSamples) * (optimizedCoordinates.length - 1),
      )
      const optimizedPoint = optimizedCoordinates[sampleIndex]
      const optimizedPointCoords = {
        lat: optimizedPoint[1],
        lng: optimizedPoint[0],
      }

      // Find the closest point on the uploaded route
      let minDistance = Infinity
      for (let j = 0; j < uploadedCoordinates.length - 1; j++) {
        const segStart = uploadedCoordinates[j]
        const segEnd = uploadedCoordinates[j + 1]

        // Find closest point on this segment
        const closestOnSegment = findClosestPointOnLineSegment(
          optimizedPointCoords,
          { lat: segStart[1], lng: segStart[0] },
          { lat: segEnd[1], lng: segEnd[0] },
        )

        const distance = haversineDistance(
          optimizedPointCoords,
          closestOnSegment,
        )

        if (distance < minDistance) {
          minDistance = distance
        }
      }

      // If within threshold, consider it a match
      if (minDistance <= thresholdDistanceMeters) {
        matchingPoints++
      }
    }

    // Calculate spatial overlap percentage
    const spatialOverlap = (matchingPoints / (numSamples + 1)) * 100

    // Also check coverage from uploaded route perspective
    // Sample points along uploaded route and check if they're close to optimized route
    const uploadedNumSamples = Math.min(
      50,
      Math.max(10, Math.floor(uploadedCoordinates.length / 2)),
    )
    let uploadedMatchingPoints = 0

    for (let i = 0; i <= uploadedNumSamples; i++) {
      const sampleIndex = Math.floor(
        (i / uploadedNumSamples) * (uploadedCoordinates.length - 1),
      )
      const uploadedPoint = uploadedCoordinates[sampleIndex]
      const uploadedPointCoords = {
        lat: uploadedPoint[1],
        lng: uploadedPoint[0],
      }

      // Find the closest point on the optimized route
      let minDistance = Infinity
      for (let j = 0; j < optimizedCoordinates.length - 1; j++) {
        const segStart = optimizedCoordinates[j]
        const segEnd = optimizedCoordinates[j + 1]

        const closestOnSegment = findClosestPointOnLineSegment(
          uploadedPointCoords,
          { lat: segStart[1], lng: segStart[0] },
          { lat: segEnd[1], lng: segEnd[0] },
        )

        const distance = haversineDistance(
          uploadedPointCoords,
          closestOnSegment,
        )

        if (distance < minDistance) {
          minDistance = distance
        }
      }

      if (minDistance <= thresholdDistanceMeters) {
        uploadedMatchingPoints++
      }
    }

    const uploadedCoverage =
      (uploadedMatchingPoints / (uploadedNumSamples + 1)) * 100

    // Combine spatial overlap, coverage, and length similarity
    // Weight: 40% spatial overlap, 40% coverage, 20% length similarity
    // All values are already in 0-100 range, so the weighted sum will also be 0-100
    const combinedSimilarity =
      spatialOverlap * 0.4 + uploadedCoverage * 0.4 + lengthSimilarity * 0.2

    // Ensure the result is in the correct range (0-100)
    const clampedSimilarity = Math.max(0, Math.min(100, combinedSimilarity))

    return Math.round(clampedSimilarity)
  } catch (error) {
    console.error("Error calculating route similarity:", error)
    return 0
  }
}

/**
 * Calculate the total length of a route in meters
 */
function calculateRouteLength(coordinates: [number, number][]): number {
  if (coordinates.length < 2) {
    return 0
  }

  let totalLength = 0
  for (let i = 0; i < coordinates.length - 1; i++) {
    const point1 = {
      lat: coordinates[i][1],
      lng: coordinates[i][0],
    }
    const point2 = {
      lat: coordinates[i + 1][1],
      lng: coordinates[i + 1][0],
    }
    totalLength += haversineDistance(point1, point2)
  }

  return totalLength
}

/**
 * Find the closest point on a line segment to a target point
 */
function findClosestPointOnLineSegment(
  targetPoint: { lat: number; lng: number },
  segmentStart: { lat: number; lng: number },
  segmentEnd: { lat: number; lng: number },
): { lat: number; lng: number } {
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
