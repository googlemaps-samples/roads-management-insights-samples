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

/**
 * Unified type for all road/route entities in the import flow
 * All roads (imported, selected, stretched, panel routes, highlighted, multi-selected, routeInMaking)
 * use this same GeoJSON Feature structure
 */
export interface ImportedRoadFeature
  extends GeoJSON.Feature<GeoJSON.LineString> {
  type: "Feature"
  geometry: GeoJSON.LineString
  properties: {
    road_id: string // Unique identifier
    name?: string // Road name
    length: number // Length in km
    priority?: string // Road priority (e.g., "ROAD_PRIORITY_MINOR_ARTERIAL")
    start_point: [number, number] // [lng, lat] - exact coordinates from API
    end_point: [number, number] // [lng, lat] - exact coordinates from API

    // Visual/metadata properties (determined by state)
    featureType?: "road" | "route" // Type of feature
    layerId?: string // Which layer this belongs to
    color?: [number, number, number, number] // RGBA color array

    // State tracking (optional, for internal use)
    isInRouteInMaking?: boolean // Part of current route being built
    isValidForFront?: boolean // Can be added to front of routeInMaking
    isValidForBack?: boolean // Can be added to back of routeInMaking
    isSelected?: boolean // In panelRoutes
    isHovered?: boolean // Currently hovered
    isStretched?: boolean // Created via stretch flow
    isMultiSelected?: boolean // Created via multi-select flow
  }
}

export interface ImportedRoadsCollection extends GeoJSON.FeatureCollection {
  type: "FeatureCollection"
  features: ImportedRoadFeature[]
}
