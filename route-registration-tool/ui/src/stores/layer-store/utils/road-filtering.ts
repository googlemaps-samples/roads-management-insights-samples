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

import { RoadPriority } from "../../../constants/road-priorities"

/**
 * Filter roads that are inside or intersect with a polygon
 * @param featureCollection GeoJSON FeatureCollection containing road LineString features
 * @param polygon GeoJSON Polygon to filter by
 * @returns Array of road IDs that are inside or intersect the polygon
 */
export function filterRoadsByPolygon(
  featureCollection: GeoJSON.FeatureCollection,
  polygon: GeoJSON.Polygon,
): string[] {
  if (!featureCollection || !featureCollection.features || !polygon) {
    return []
  }

  const roadIds: string[] = []

  for (const feature of featureCollection.features) {
    if (feature.geometry.type !== "LineString") {
      continue
    }

    const roadId = feature.properties?.road_id?.toString()
    if (!roadId) continue

    // Check if any point of the LineString is inside the polygon
    // or if the LineString intersects the polygon
    const lineString = turf.lineString(feature.geometry.coordinates)
    const polygonFeature = turf.polygon(polygon.coordinates)

    // Check intersection
    const intersects = (turf as any).booleanIntersects(
      lineString,
      polygonFeature,
    )
    if (intersects) {
      roadIds.push(roadId)
      continue
    }

    // Also check if any coordinate point is inside the polygon
    const hasPointInside = feature.geometry.coordinates.some((coord) => {
      const point = turf.point(coord)
      return (turf as any).booleanPointInPolygon(point, polygonFeature)
    })

    if (hasPointInside) {
      roadIds.push(roadId)
    }
  }

  return roadIds
}

/**
 * Filter road IDs by priority
 * @param roadIds Array of road IDs to filter
 * @param featureCollection GeoJSON FeatureCollection containing road features
 * @param priorities Array of RoadPriority values to include
 * @returns Filtered array of road IDs
 */
export function filterRoadsByPriority(
  roadIds: string[],
  featureCollection: GeoJSON.FeatureCollection,
  priorities: RoadPriority[],
): string[] {
  if (!priorities || priorities.length === 0) {
    return roadIds
  }

  if (!featureCollection || !featureCollection.features) {
    return []
  }

  // Create a map of road_id to priority for quick lookup
  const roadPriorityMap = new Map<string, string>()
  for (const feature of featureCollection.features) {
    if (feature.geometry.type !== "LineString") continue
    const roadId = feature.properties?.road_id?.toString()
    const priority = feature.properties?.priority
    if (roadId && priority) {
      roadPriorityMap.set(roadId, priority)
    }
  }

  // Filter road IDs by priority
  return roadIds.filter((roadId) => {
    const priority = roadPriorityMap.get(roadId)
    return priority && priorities.includes(priority as RoadPriority)
  })
}
