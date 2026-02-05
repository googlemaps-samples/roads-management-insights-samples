// Web Worker for distance-based segmentation calculations
import * as turf from "@turf/turf"

import { decodePolylineToGeoJSON } from "../utils/polyline-decoder"

/**
 * Calculate cumulative distances along the route
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
 */
function findIndexAtDistance(
  cumulativeDistances: number[],
  targetDistance: number,
): number {
  for (let i = 0; i < cumulativeDistances.length - 1; i++) {
    if (
      targetDistance >= cumulativeDistances[i] &&
      targetDistance <= cumulativeDistances[i + 1]
    ) {
      return i + 1
    }
  }
  return cumulativeDistances.length - 1
}

/**
 * Calculate distance-based cut points along the route
 */
function calculateDistanceBasedCuts(
  coordinates: number[][],
  distanceKm: number,
): Array<{ index: number; coordinate: number[]; distanceAlongRoute: number }> {
  const line = turf.lineString(coordinates.map((coord) => [coord[0], coord[1]]))

  const cumulativeDistances = calculateCumulativeDistances(coordinates)
  const totalLength = cumulativeDistances[cumulativeDistances.length - 1]

  const cutPoints: Array<{
    index: number
    coordinate: number[]
    distanceAlongRoute: number
  }> = []
  let currentDistance = distanceKm

  while (currentDistance < totalLength) {
    const point = (turf as any).along(line, currentDistance, {
      units: "kilometers" as const,
    })
    const coord = point.geometry.coordinates as [number, number]

    const segmentIndex = findIndexAtDistance(
      cumulativeDistances,
      currentDistance,
    )
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
 * Calculate distance between two coordinates
 */
function calculateSegmentDistance(coordinates: number[][]): number {
  if (coordinates.length < 2) return 0

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

/**
 * Build segment coordinates between two distances
 */
function buildSegmentBetweenDistances(
  routeCoords: number[][],
  startDistance: number,
  endDistance: number,
  startCutCoord?: number[],
  endCutCoord?: number[],
): number[][] {
  const cumulativeDistances = calculateCumulativeDistances(routeCoords)
  const segmentCoords: number[][] = []
  const totalRouteLength = cumulativeDistances[cumulativeDistances.length - 1]
  const isFinalSegment = endDistance >= totalRouteLength

  let startIdx = 0
  let endIdx = routeCoords.length - 1

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
    endIdx = routeCoords.length - 1
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
  startIdx = Math.max(0, Math.min(startIdx, routeCoords.length - 1))
  endIdx = Math.max(startIdx, Math.min(endIdx, routeCoords.length - 1))

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
    } else if (startDistance === 0 && routeCoords.length > 0) {
      // If no startCutCoord and startDistance is 0, use first coordinate
      const firstCoord = routeCoords[0]
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
      const coord = routeCoords[i]
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
    } else if (isFinalSegment && routeCoords.length > 0) {
      // If this is the final segment, ensure we include the very last coordinate
      const finalRouteCoord = routeCoords[routeCoords.length - 1]
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

interface CalculateSegmentsMessage {
  type: "CALCULATE_SEGMENTS"
  payload: {
    encodedPolyline: string
    distanceKm: number
    routeId: string
    requestId: string // Add requestId to track requests
  }
}

interface SegmentsChunkMessage {
  type: "SEGMENTS_CHUNK"
  payload: {
    segments: any[]
    isComplete: boolean
    totalCount: number
    requestId: string // Add requestId to track requests
  }
}

interface ErrorMessage {
  type: "ERROR"
  payload: {
    error: string
    requestId: string // Add requestId to track requests
  }
}

self.onmessage = (e: MessageEvent<CalculateSegmentsMessage>) => {
  if (e.data.type !== "CALCULATE_SEGMENTS") {
    return
  }

  // Extract requestId outside try block so it's available in catch
  const { encodedPolyline, distanceKm, routeId, requestId } = e.data.payload

  try {
    // Decode polyline
    const routeCoordinates = decodePolylineToGeoJSON(encodedPolyline)
    if (
      !routeCoordinates.coordinates ||
      routeCoordinates.coordinates.length === 0
    ) {
      throw new Error("Invalid route coordinates")
    }

    const routeCoords = routeCoordinates.coordinates

    // Calculate cumulative distances
    const cumulativeDistances = calculateCumulativeDistances(routeCoords)
    const totalLength = cumulativeDistances[cumulativeDistances.length - 1]

    // Calculate cut points
    const exactCutCoordinates = calculateDistanceBasedCuts(
      routeCoords,
      distanceKm,
    )

    if (exactCutCoordinates.length === 0) {
      // No cuts - single segment
      const segmentCoords = routeCoords
      // Use total length from cumulative distances for accuracy
      const segmentDistance = totalLength
      const segments = [
        {
          id: `temp-segment-0`,
          routeId,
          name: `Segment 1`,
          linestringGeoJson: {
            type: "LineString",
            coordinates: segmentCoords,
          },
          segmentOrder: 1,
          distanceKm: segmentDistance,
          createdAt: new Date().toISOString(),
        },
      ]

      self.postMessage({
        type: "SEGMENTS_CHUNK",
        payload: {
          segments,
          isComplete: true,
          totalCount: 1,
          requestId,
        },
      } as SegmentsChunkMessage)
      return
    }

    // Build segments from cut points
    const segments: any[] = []

    // First segment
    const firstCut = exactCutCoordinates[0]
    const firstSegmentStartDistance = 0
    const firstSegmentEndDistance = firstCut.distanceAlongRoute || 0

    const firstSegmentCoords = buildSegmentBetweenDistances(
      routeCoords,
      firstSegmentStartDistance,
      firstSegmentEndDistance,
      undefined,
      firstCut.coordinate,
    )

    if (firstSegmentCoords.length >= 2) {
      // Calculate distance from route distance (more accurate than from coordinates)
      const firstSegmentDistance =
        firstSegmentEndDistance - firstSegmentStartDistance
      // Also calculate from coordinates for comparison

      const segment = {
        id: `temp-segment-0`,
        routeId,
        name: `Segment 1`,
        linestringGeoJson: {
          type: "LineString",
          coordinates: firstSegmentCoords,
        },
        segmentOrder: 1,
        distanceKm: firstSegmentDistance,
        createdAt: new Date().toISOString(),
      }
      segments.push(segment)
    } else {
      console.error("[worker] First segment invalid - too few coordinates", {
        coordsCount: firstSegmentCoords.length,
        firstSegmentCoords,
      })
    }

    // Middle segments between cut points
    for (let i = 1; i < exactCutCoordinates.length; i++) {
      const prevCut = exactCutCoordinates[i - 1]
      const currentCut = exactCutCoordinates[i]
      const segmentStartDistance = prevCut.distanceAlongRoute || 0
      const segmentEndDistance = currentCut.distanceAlongRoute || totalLength

      const segmentCoords = buildSegmentBetweenDistances(
        routeCoords,
        segmentStartDistance,
        segmentEndDistance,
        prevCut.coordinate,
        currentCut.coordinate,
      )

      if (segmentCoords.length >= 2) {
        // Calculate distance from route distance (more accurate than from coordinates)
        const segmentDistance = segmentEndDistance - segmentStartDistance
        // Also calculate from coordinates for comparison

        segments.push({
          id: `temp-segment-${i}`,
          routeId,
          name: `Segment ${i + 1}`,
          linestringGeoJson: {
            type: "LineString",
            coordinates: segmentCoords,
          },
          segmentOrder: i + 1,
          distanceKm: segmentDistance,
          createdAt: new Date().toISOString(),
        })
      }
    }

    // Final segment
    const lastCut = exactCutCoordinates[exactCutCoordinates.length - 1]
    const finalSegmentStartDistance = lastCut.distanceAlongRoute || 0
    const finalSegmentEndDistance = totalLength

    const finalSegmentCoords = buildSegmentBetweenDistances(
      routeCoords,
      finalSegmentStartDistance,
      finalSegmentEndDistance,
      lastCut.coordinate,
      undefined,
    )

    // Ensure final coordinate is included
    if (finalSegmentCoords.length > 0 && routeCoords.length > 0) {
      const lastSegmentCoord = finalSegmentCoords[finalSegmentCoords.length - 1]
      const lastRouteCoord = routeCoords[routeCoords.length - 1]
      if (
        Math.abs(lastSegmentCoord[0] - lastRouteCoord[0]) > 1e-10 ||
        Math.abs(lastSegmentCoord[1] - lastRouteCoord[1]) > 1e-10
      ) {
        finalSegmentCoords.push(lastRouteCoord)
      }
    }

    if (finalSegmentCoords.length >= 2) {
      // Calculate distance from route distance (more accurate than from coordinates)
      const finalSegmentDistance =
        finalSegmentEndDistance - finalSegmentStartDistance
      // Also calculate from coordinates for comparison
      segments.push({
        id: `temp-segment-${segments.length}`,
        routeId,
        name: `Segment ${segments.length + 1}`,
        linestringGeoJson: {
          type: "LineString",
          coordinates: finalSegmentCoords,
        },
        segmentOrder: segments.length + 1,
        distanceKm: finalSegmentDistance,
        createdAt: new Date().toISOString(),
      })
    }

    // Send all segments (for now, send as single chunk)
    // TODO: Could optimize to send in chunks for very large segment counts
    self.postMessage({
      type: "SEGMENTS_CHUNK",
      payload: {
        segments,
        isComplete: true,
        totalCount: segments.length,
        requestId,
      },
    } as SegmentsChunkMessage)
  } catch (error) {
    self.postMessage({
      type: "ERROR",
      payload: {
        error: error instanceof Error ? error.message : "Unknown error",
        requestId,
      },
    } as ErrorMessage)
  }
}
