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

import {
  ImportedRoadFeature,
  ImportedRoadsCollection,
} from "../types/imported-road"

/**
 * Compare two coordinates with 7 decimal place precision
 * Returns true if coordinates match within tolerance
 */
function coordinatesMatch(
  coord1: [number, number],
  coord2: [number, number],
  precision: number = 7,
): boolean {
  const factor = Math.pow(10, precision)
  return (
    Math.round(coord1[0] * factor) === Math.round(coord2[0] * factor) &&
    Math.round(coord1[1] * factor) === Math.round(coord2[1] * factor)
  )
}

/**
 * Find roads that can be added to routeInMaking
 * Uses start_point/end_point from properties (not calculated)
 */
export function findValidRoadsToAdd(
  routeInMaking: ImportedRoadFeature,
  importedRoads: ImportedRoadsCollection,
): {
  roadsThatCanBeAddedToFront: ImportedRoadFeature[]
  roadsThatCanBeAddedToBack: ImportedRoadFeature[]
} {
  const routeStart = routeInMaking.properties.start_point
  const routeEnd = routeInMaking.properties.end_point

  const frontCandidates: ImportedRoadFeature[] = []
  const backCandidates: ImportedRoadFeature[] = []

  for (const road of importedRoads.features) {
    // Skip if already in routeInMaking
    if (routeInMaking.properties.road_id === road.properties.road_id) {
      continue
    }

    const roadStart = road.properties.start_point
    const roadEnd = road.properties.end_point

    // Check if can be added to front (road's end matches route's start)
    if (coordinatesMatch(roadEnd, routeStart)) {
      frontCandidates.push(road)
    }

    // Check if can be added to back (road's start matches route's end)
    if (coordinatesMatch(roadStart, routeEnd)) {
      backCandidates.push(road)
    }
  }

  return {
    roadsThatCanBeAddedToFront: frontCandidates,
    roadsThatCanBeAddedToBack: backCandidates,
  }
}

/**
 * Check if a specific road can be added to routeInMaking
 */
export function canAddRoadToRoute(
  roadId: string,
  routeInMaking: ImportedRoadFeature,
  importedRoads: ImportedRoadsCollection,
): { canAdd: boolean; position: "front" | "back" | null } {
  const road = importedRoads.features.find(
    (r) => r.properties.road_id === roadId,
  )

  if (!road) {
    return { canAdd: false, position: null }
  }

  const routeStart = routeInMaking.properties.start_point
  const routeEnd = routeInMaking.properties.end_point
  const roadStart = road.properties.start_point
  const roadEnd = road.properties.end_point

  // Check if can be added to front (road's end matches route's start)
  if (coordinatesMatch(roadEnd, routeStart)) {
    return { canAdd: true, position: "front" }
  }

  // Check if can be added to back (road's start matches route's end)
  if (coordinatesMatch(roadStart, routeEnd)) {
    return { canAdd: true, position: "back" }
  }

  return { canAdd: false, position: null }
}

/**
 * Merge a road into routeInMaking
 * Returns new ImportedRoadFeature with combined geometry and updated properties
 * Properly handles coordinate matching and ensures correct ordering without gaps
 */
export function mergeRoadToRoute(
  routeInMaking: ImportedRoadFeature,
  roadToAdd: ImportedRoadFeature,
  position: "front" | "back",
): ImportedRoadFeature {
  const routeCoords = routeInMaking.geometry.coordinates
  const roadCoords = roadToAdd.geometry.coordinates

  // Get connection points from properties (more accurate than calculating from geometry)
  const routeStart = routeInMaking.properties.start_point
  const routeEnd = routeInMaking.properties.end_point
  const roadStart = roadToAdd.properties.start_point
  const roadEnd = roadToAdd.properties.end_point

  let mergedCoords: number[][]
  let newStartPoint: [number, number]
  let newEndPoint: [number, number]

  if (position === "front") {
    // Adding to front: need to connect road's end to route's start
    // Check which end of the road actually matches the route's start
    const roadEndMatchesRouteStart = coordinatesMatch(roadEnd, routeStart)
    const roadStartMatchesRouteStart = coordinatesMatch(roadStart, routeStart)

    if (roadEndMatchesRouteStart) {
      // Road's end matches route's start - prepend road in normal order
      // [roadStart ... roadEnd] + [routeStart ... routeEnd]
      mergedCoords = [
        ...roadCoords,
        ...routeCoords.slice(1), // Skip routeStart to avoid duplication with roadEnd
      ]
      newStartPoint = roadStart
    } else if (roadStartMatchesRouteStart) {
      // Road's start matches route's start - reverse road and prepend
      // [roadEnd ... roadStart] + [routeStart ... routeEnd]
      mergedCoords = [
        ...roadCoords.slice().reverse(),
        ...routeCoords.slice(1), // Skip routeStart to avoid duplication with roadStart
      ]
      newStartPoint = roadEnd
    } else {
      // Fallback: validation should prevent this, but use normal order as default
      mergedCoords = [...roadCoords, ...routeCoords.slice(1)]
      newStartPoint = roadStart
    }
    newEndPoint = routeEnd
  } else {
    // Adding to back: need to connect route's end to road's start
    // Check which end of the road actually matches the route's end
    const roadStartMatchesRouteEnd = coordinatesMatch(roadStart, routeEnd)
    const roadEndMatchesRouteEnd = coordinatesMatch(roadEnd, routeEnd)

    if (roadStartMatchesRouteEnd) {
      // Road's start matches route's end - append road in normal order
      // [routeStart ... routeEnd] + [roadStart ... roadEnd]
      mergedCoords = [
        ...routeCoords,
        ...roadCoords.slice(1), // Skip roadStart to avoid duplication with routeEnd
      ]
      newEndPoint = roadEnd
    } else if (roadEndMatchesRouteEnd) {
      // Road's end matches route's end - reverse road and append
      // [routeStart ... routeEnd] + [roadEnd ... roadStart]
      const reversedRoadCoords = roadCoords.slice().reverse()
      mergedCoords = [
        ...routeCoords,
        ...reversedRoadCoords.slice(1), // Skip first coordinate (roadEnd) to avoid duplication with routeEnd
      ]
      newEndPoint = roadStart
    } else {
      // Fallback: validation should prevent this, but use normal order as default
      mergedCoords = [...routeCoords, ...roadCoords.slice(1)]
      newEndPoint = roadEnd
    }
    newStartPoint = routeStart
  }

  // Create merged feature
  const mergedFeature: ImportedRoadFeature = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: mergedCoords,
    },
    properties: {
      ...routeInMaking.properties,
      road_id: `${routeInMaking.properties.road_id}-${roadToAdd.properties.road_id}`, // Combined ID
      start_point: newStartPoint,
      end_point: newEndPoint,
      length: routeInMaking.properties.length + roadToAdd.properties.length,
      isInRouteInMaking: true,
    },
  }

  return mergedFeature
}

/**
 * Create a route feature from an ordered array of road IDs
 */
export function createRouteFeatureFromRoads(
  roadIds: string[],
  importedRoads: ImportedRoadsCollection,
): ImportedRoadFeature | null {
  if (roadIds.length === 0) {
    return null
  }

  console.log("createRouteFeatureFromRoads called", roadIds)

  // Get all road features in order
  const roadFeatures = roadIds
    .map((id) =>
      importedRoads.features.find((r) => r.properties.road_id === id),
    )
    .filter((r): r is ImportedRoadFeature => r !== undefined)

  if (roadFeatures.length === 0) {
    return null
  }

  // If only one road, return it as-is
  if (roadFeatures.length === 1) {
    return roadFeatures[0]
  }

  // Merge all roads sequentially
  let mergedRoute = roadFeatures[0]

  for (let i = 1; i < roadFeatures.length; i++) {
    const nextRoad = roadFeatures[i]
    // Determine position based on endpoint matching
    const currentEnd = mergedRoute.properties.end_point
    const nextStart = nextRoad.properties.start_point
    const nextEnd = nextRoad.properties.end_point

    let position: "front" | "back"
    if (coordinatesMatch(currentEnd, nextStart)) {
      position = "back"
    } else if (coordinatesMatch(currentEnd, nextEnd)) {
      // Road needs to be reversed
      position = "back"
      // Reverse the road's coordinates and endpoints
      const reversedRoad: ImportedRoadFeature = {
        ...nextRoad,
        geometry: {
          ...nextRoad.geometry,
          coordinates: [...nextRoad.geometry.coordinates].reverse(),
        },
        properties: {
          ...nextRoad.properties,
          start_point: nextRoad.properties.end_point,
          end_point: nextRoad.properties.start_point,
        },
      }
      mergedRoute = mergeRoadToRoute(mergedRoute, reversedRoad, position)
    } else {
      // Cannot merge - return null or throw error
      console.error("Cannot merge roads - endpoints don't match", {
        currentEnd,
        nextStart,
        nextEnd,
      })
      return null
    }

    mergedRoute = mergeRoadToRoute(mergedRoute, nextRoad, position)
  }

  return mergedRoute
}

/**
 * Extract start/end points from geometry (fallback only)
 * Should only be used if start_point/end_point not in properties
 */
export function getRouteEndpoints(
  feature: GeoJSON.Feature<GeoJSON.LineString>,
): { start_point: [number, number]; end_point: [number, number] } {
  console.log("fallback for getting route endpoints called", feature)
  const coords = feature.geometry.coordinates
  if (coords.length < 2) {
    throw new Error("LineString must have at least 2 coordinates")
  }
  return {
    start_point: coords[0] as [number, number],
    end_point: coords[coords.length - 1] as [number, number],
  }
}

/**
 * Extract waypoints from LineString geometry with a maximum of 25 waypoints
 * Waypoints are intermediate points (excluding origin and destination)
 * If there are more than 25 intermediate points, samples them evenly
 * @param geometry LineString geometry with coordinates in [lng, lat] format
 * @returns Array of waypoints in { lat: number; lng: number } format
 */
export function extractWaypointsFromLineString(
  geometry: GeoJSON.LineString,
): Array<{ lat: number; lng: number }> {
  const MAX_WAYPOINTS = 25
  const coords = geometry.coordinates

  // Need at least 3 points to have waypoints (origin, waypoint, destination)
  if (coords.length < 3) {
    return []
  }

  // Extract intermediate points (exclude first and last)
  const intermediatePoints = coords.slice(1, -1)

  // If we have 25 or fewer intermediate points, return all of them
  if (intermediatePoints.length <= MAX_WAYPOINTS) {
    return intermediatePoints.map((coord) => ({
      lat: coord[1],
      lng: coord[0],
    }))
  }

  // If we have more than 25 points, sample evenly
  // Calculate step size to get approximately MAX_WAYPOINTS points
  const step = Math.ceil(intermediatePoints.length / MAX_WAYPOINTS)
  const sampledPoints: number[][] = []

  // Sample points evenly
  for (let i = 0; i < intermediatePoints.length; i += step) {
    sampledPoints.push(intermediatePoints[i])
    // Stop if we've reached the max
    if (sampledPoints.length >= MAX_WAYPOINTS) {
      break
    }
  }

  // Convert to { lat, lng } format
  return sampledPoints.map((coord) => ({
    lat: coord[1],
    lng: coord[0],
  }))
}
