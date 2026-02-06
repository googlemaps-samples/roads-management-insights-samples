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

import { Road } from "../../stores/project-workspace-store"

export const transformRoad = (dbRoad: any): Road => {
  try {
    return {
      id: dbRoad?.id?.toString(),
      routeId: dbRoad.route_id.toString(),
      name: dbRoad.name,
      linestringGeoJson:
        typeof dbRoad.linestring_geojson === "string"
          ? JSON.parse(dbRoad.linestring_geojson)
          : dbRoad.linestring_geojson,
      segmentOrder: dbRoad.segment_order,
      distanceKm: dbRoad.distance_km,
      createdAt: dbRoad.created_at,
    }
  } catch (error) {
    console.error("Error transforming road:", error, dbRoad)
    return {
      id: dbRoad?.id?.toString() || "unknown",
      routeId: dbRoad.route_id?.toString() || "unknown",
      name: dbRoad.name || "Unknown Road",
      linestringGeoJson: { type: "LineString", coordinates: [] },
      segmentOrder: dbRoad.segment_order || 0,
      distanceKm: dbRoad.distance_km || 0,
      createdAt: dbRoad.created_at || new Date().toISOString(),
    }
  }
}
