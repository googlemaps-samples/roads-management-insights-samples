// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as turf from "@turf/turf"

export function findClosestPointIndex(
  coordinates: number[][],
  targetPoint: { lat: number; lng: number },
): number {
  let closestIndex = 0
  let minDistance = Number.MAX_VALUE

  coordinates.forEach((coord, index) => {
    const from = turf.point([coord[0], coord[1]])
    const to = turf.point([targetPoint.lng, targetPoint.lat])
    const distance = turf.distance(from, to, "kilometers")
    if (distance < minDistance) {
      minDistance = distance
      closestIndex = index
    }
  })

  return closestIndex
}

export function findExactCutPointOnRoute(
  coordinates: number[][],
  targetPoint: { lat: number; lng: number },
): { index: number; coordinate: number[] } {
  const line = turf.lineString(coordinates.map((coord) => [coord[0], coord[1]]))
  const point = turf.point([targetPoint.lng, targetPoint.lat])
  const nearest = (turf as any).nearestPointOnLine(line, point, {
    units: "kilometers" as const,
  })

  const exactCoord = nearest.geometry.coordinates as [number, number]

  let closestSegmentIndex = 0
  let minDistance = Number.MAX_VALUE

  for (let i = 0; i < coordinates.length - 1; i++) {
    const segmentStart = coordinates[i]
    const segmentEnd = coordinates[i + 1]
    const segmentLine = turf.lineString([
      [segmentStart[0], segmentStart[1]],
      [segmentEnd[0], segmentEnd[1]],
    ])
    const segmentNearest = (turf as any).nearestPointOnLine(
      segmentLine,
      point,
      {
        units: "kilometers" as const,
      },
    )

    const targetPt = turf.point([targetPoint.lng, targetPoint.lat])
    const distance = turf.distance(targetPt, segmentNearest, "kilometers")

    if (distance < minDistance) {
      minDistance = distance
      closestSegmentIndex = i + 1
    }
  }

  return {
    index: closestSegmentIndex,
    coordinate: exactCoord,
  }
}

/**
 * Calculate cumulative distances along the route
 * Returns array where each element is the distance from start to that coordinate
 */
function calculateCumulativeDistances(coordinates: number[][]): number[] {
  const cumulativeDistances: number[] = [0]

  for (let i = 0; i < coordinates.length - 1; i++) {
    const segmentStart = coordinates[i]
    const segmentEnd = coordinates[i + 1]
    const segmentLength = turf.distance(
      turf.point([segmentStart[0], segmentStart[1]]),
      turf.point([segmentEnd[0], segmentEnd[1]]),
      "kilometers" as const,
    )
    cumulativeDistances.push(cumulativeDistances[i] + segmentLength)
  }

  return cumulativeDistances
}

/**
 * Find the coordinate index at a specific distance along the route
 * Uses cumulative distance to ensure we find the correct position along the path
 */
function findIndexAtDistance(
  cumulativeDistances: number[],
  targetDistance: number,
): number {
  // Find the segment where targetDistance falls
  for (let i = 0; i < cumulativeDistances.length - 1; i++) {
    if (
      targetDistance >= cumulativeDistances[i] &&
      targetDistance <= cumulativeDistances[i + 1]
    ) {
      // Return the index of the segment end (i+1)
      // This ensures we're always moving forward along the route
      return i + 1
    }
  }

  // If targetDistance is beyond the route, return last index
  return cumulativeDistances.length - 1
}

export function calculateDistanceBasedCuts(
  coordinates: number[][],
  distanceKm: number,
): Array<{ index: number; coordinate: number[]; distanceAlongRoute: number }> {
  const line = turf.lineString(coordinates.map((coord) => [coord[0], coord[1]]))

  // Calculate cumulative distances for accurate index finding and consistent length
  const cumulativeDistances = calculateCumulativeDistances(coordinates)
  // Use cumulative distance sum as authoritative total length for consistency
  const totalLength = cumulativeDistances[cumulativeDistances.length - 1]

  const cutPoints: Array<{
    index: number
    coordinate: number[]
    distanceAlongRoute: number
  }> = []
  let currentDistance = distanceKm

  while (currentDistance < totalLength) {
    // Get the exact point at this distance along the route
    const point = (turf as any).along(line, currentDistance, {
      units: "kilometers" as const,
    })
    const coord = point.geometry.coordinates as [number, number]

    // Find the index using cumulative distance (ensures correct position along path)
    const segmentIndex = findIndexAtDistance(
      cumulativeDistances,
      currentDistance,
    )

    // For small distances, multiple cut points might fall within the same coordinate segment
    // Since segments are built using distanceAlongRoute (not indices), we don't need to enforce
    // strict index monotonicity. The index is just for reference - the actual segment boundaries
    // are determined by distanceAlongRoute values.
    // Clamp to valid range
    const clampedIndex = Math.min(segmentIndex, coordinates.length - 1)

    cutPoints.push({
      index: clampedIndex,
      coordinate: coord,
      distanceAlongRoute: currentDistance,
    })

    currentDistance += distanceKm
  }

  return cutPoints
}

/**
 * Calculate route length from coordinates array
 * Uses cumulative distance calculation for accuracy
 * @param coordinates Array of [lng, lat] coordinates
 * @returns Total route length in kilometers
 */
export function calculateRouteLengthFromCoordinates(
  coordinates: number[][],
): number {
  if (coordinates.length < 2) return 0

  // Use cumulative distance calculation for consistency
  let totalDistance = 0
  for (let i = 0; i < coordinates.length - 1; i++) {
    const segmentLength = turf.distance(
      turf.point([coordinates[i][0], coordinates[i][1]]),
      turf.point([coordinates[i + 1][0], coordinates[i + 1][1]]),
      "kilometers" as const,
    )
    totalDistance += segmentLength
  }

  return totalDistance
}

export function calculateSegmentDistance(coordinates: number[][]): number {
  return calculateRouteLengthFromCoordinates(coordinates)
}

/**
 * Build segment coordinates between two distances along the route
 * This ensures segments follow the actual route path, not just coordinate indices
 */
export function buildSegmentBetweenDistances(
  coordinates: number[][],
  startDistance: number,
  endDistance: number,
  startCutCoord?: number[],
  endCutCoord?: number[],
): number[][] {
  const cumulativeDistances = calculateCumulativeDistances(coordinates)
  const segmentCoords: number[][] = []
  const totalRouteLength = cumulativeDistances[cumulativeDistances.length - 1]
  const isFinalSegment = endDistance >= totalRouteLength

  let startIdx = 0
  let endIdx = coordinates.length - 1

  // Find start index - the coordinate index that comes before or at the start cut
  // We want to include coordinates from the segment that contains the start cut
  if (startDistance > 0) {
    for (let i = 0; i < cumulativeDistances.length - 1; i++) {
      // If startDistance falls between this coordinate and the next, include from this index
      if (
        cumulativeDistances[i] <= startDistance &&
        cumulativeDistances[i + 1] >= startDistance
      ) {
        startIdx = i
        break
      }
      // If startDistance is exactly at this coordinate, include from this index
      if (cumulativeDistances[i] >= startDistance) {
        startIdx = i
        break
      }
    }
  } else {
    startIdx = 0
  }

  // Find end index - the coordinate index that comes after or at the end cut
  if (isFinalSegment) {
    endIdx = coordinates.length - 1
  } else {
    for (let i = 0; i < cumulativeDistances.length - 1; i++) {
      // If endDistance falls between this coordinate and the next, include up to the next index
      if (
        cumulativeDistances[i] <= endDistance &&
        cumulativeDistances[i + 1] >= endDistance
      ) {
        endIdx = i + 1
        break
      }
      // If endDistance is exactly at this coordinate, include up to this index
      if (cumulativeDistances[i] >= endDistance) {
        endIdx = i
        break
      }
    }
  }

  // Ensure valid indices and that endIdx >= startIdx
  startIdx = Math.max(0, Math.min(startIdx, coordinates.length - 1))
  endIdx = Math.max(startIdx, Math.min(endIdx, coordinates.length - 1))

  // Special case: when both cut points fall within the same coordinate segment
  // Check if both cuts fall between the same two coordinates
  const bothCutPointsInSameSegment =
    startCutCoord &&
    endCutCoord &&
    (startIdx === endIdx ||
      (endIdx === startIdx + 1 &&
        cumulativeDistances[startIdx] < startDistance &&
        cumulativeDistances[endIdx] > endDistance))

  if (bothCutPointsInSameSegment && startCutCoord && endCutCoord) {
    // Only use the cut coordinates - don't include any route coordinates
    segmentCoords.push(startCutCoord)
    if (
      startCutCoord[0] !== endCutCoord[0] ||
      startCutCoord[1] !== endCutCoord[1]
    ) {
      segmentCoords.push(endCutCoord)
    }
  } else {
    // Add start cut coordinate if provided (exact point at startDistance)
    if (startCutCoord) {
      segmentCoords.push(startCutCoord)
    } else if (startDistance === 0 && coordinates.length > 0) {
      // If no startCutCoord and startDistance is 0, use first coordinate
      const firstCoord = coordinates[0]
      if (
        !endCutCoord ||
        Math.abs(firstCoord[0] - endCutCoord[0]) >= 1e-10 ||
        Math.abs(firstCoord[1] - endCutCoord[1]) >= 1e-10
      ) {
        segmentCoords.push(firstCoord)
      }
      // Adjust startIdx to skip first coordinate since we already added it
      startIdx = Math.max(1, startIdx)
    }

    // Include coordinates between startIdx and endIdx, but only those that fall within the distance range
    // This ensures we don't include coordinates before the start cut or after the end cut
    let skippedCount = 0
    for (let i = startIdx; i <= endIdx; i++) {
      const coord = coordinates[i]
      const coordDistance = cumulativeDistances[i]

      // Only include coordinates that are within or at the boundaries of our distance range
      // This ensures we follow the route exactly without including coordinates outside the segment
      if (coordDistance < startDistance || coordDistance > endDistance) {
        skippedCount++
        continue
      }

      // Skip if coordinate is exactly the same as a cut point (to avoid duplicates)
      const isStartCut =
        startCutCoord &&
        Math.abs(coord[0] - startCutCoord[0]) < 1e-10 &&
        Math.abs(coord[1] - startCutCoord[1]) < 1e-10
      const isEndCut =
        endCutCoord &&
        Math.abs(coord[0] - endCutCoord[0]) < 1e-10 &&
        Math.abs(coord[1] - endCutCoord[1]) < 1e-10

      if (isStartCut || isEndCut) {
        skippedCount++
        continue
      }
      segmentCoords.push(coord)
    }

    // Add end cut coordinate if provided (exact point at endDistance)
    if (endCutCoord) {
      const lastCoord = segmentCoords[segmentCoords.length - 1]
      if (
        !lastCoord ||
        lastCoord[0] !== endCutCoord[0] ||
        lastCoord[1] !== endCutCoord[1]
      ) {
        segmentCoords.push(endCutCoord)
      }
    } else if (isFinalSegment && coordinates.length > 0) {
      // If this is the final segment, ensure we include the very last coordinate
      const finalRouteCoord = coordinates[coordinates.length - 1]
      const lastCoord = segmentCoords[segmentCoords.length - 1]
      if (
        !lastCoord ||
        lastCoord[0] !== finalRouteCoord[0] ||
        lastCoord[1] !== finalRouteCoord[1]
      ) {
        segmentCoords.push(finalRouteCoord)
      }
    }
  }

  // Remove duplicates (consecutive identical coordinates)
  const cleanedCoords: number[][] = []
  for (let i = 0; i < segmentCoords.length; i++) {
    if (
      i === 0 ||
      segmentCoords[i][0] !== segmentCoords[i - 1][0] ||
      segmentCoords[i][1] !== segmentCoords[i - 1][1]
    ) {
      cleanedCoords.push(segmentCoords[i])
    }
  }

  const finalCoords = cleanedCoords.length >= 2 ? cleanedCoords : segmentCoords

  return finalCoords
}

export function snapCutPointToRoute(
  coordinates: number[][],
  targetPoint: { lat: number; lng: number },
): { lat: number; lng: number } {
  const line = turf.lineString(coordinates.map((coord) => [coord[0], coord[1]]))
  const point = turf.point([targetPoint.lng, targetPoint.lat])
  const nearest = (turf as any).nearestPointOnLine(line, point, {
    units: "kilometers" as const,
  })

  const [lng, lat] = nearest.geometry.coordinates as [number, number]
  return { lat, lng }
}
