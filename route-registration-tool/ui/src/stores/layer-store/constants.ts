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

import { DataFilterExtension } from "@deck.gl/extensions"

import { ROAD_PRIORITIES, RoadPriority } from "../../constants/road-priorities"

export const ALL_ROAD_PRIORITIES = ROAD_PRIORITIES.map(
  (priority) => priority.value,
)
export const NO_PRIORITIES_SELECTED = "NO-PRIORITIES-SELECTED"

export const ROAD_PRIORITY_FALLBACK: RoadPriority = "ROAD_PRIORITY_UNSPECIFIED"
export const EMPTY_FILTER_SENTINEL = "__road_priority_hidden__"
export const ROAD_PRIORITY_FILTER_EXTENSION = new DataFilterExtension({
  categorySize: 1,
})

export const ROADS_NETWORK_COLOR = [96, 96, 96, 100] // Neutral gray #606060

export const ROUTE_STATUS_COLORS = {
  // Old status colors (keep for backward compatibility)
  failed: [220, 38, 38, 255] as [number, number, number, number], // Bright red #dc2626
  pending: [245, 158, 11, 255] as [number, number, number, number], // Amber #f59e0b
  synced: [15, 157, 88, 255] as [number, number, number, number], // Green #22c55e
  // New sync_status colors
  unsynced: [251, 146, 60, 255] as [number, number, number, number], // Orange #fb923c
  validating: [59, 130, 246, 255] as [number, number, number, number], // Blue #3b82f6
  invalid: [185, 28, 28, 255] as [number, number, number, number], // Dark red #b91c1c
}

export const SELECTED_ROUTE_COLOR = [0, 191, 255, 255] as [
  number,
  number,
  number,
  number,
] // Cyan #00bfff

export const INDIVIDUAL_PREVIEW_COLOR = [68, 13, 250, 255] as [
  number,
  number,
  number,
  number,
] // Purple #440dfa

export const SEGMENT_HOVER_COLOR = [168, 85, 247, 255] as [
  number,
  number,
  number,
  number,
] // Purple #a855f7

export const SEGMENT_BASE_COLOR = [0, 191, 255, 200] as [
  number,
  number,
  number,
  number,
] // Cyan with transparency (matches selected route)

export const ROAD_SELECTION_COLOR = [37, 99, 235, 255] as [
  number,
  number,
  number,
  number,
] // Blue #2563eb

export const POLYGON_ROUTE_COLOR = [0, 200, 255, 255] as [
  number,
  number,
  number,
  number,
] // Bright cyan #00c8ff - distinct from purple hover color

export const UPLOADED_ROUTE_COLOR = [255, 235, 59, 255] as [
  number,
  number,
  number,
  number,
] // Bright yellow #FFEB3B

export const JURISDICTION_BOUNDARY_COLOR = [71, 85, 105, 200] as [
  number,
  number,
  number,
  number,
] // Slate blue-gray #475569

export const BASE_ROUTE_WIDTH = 4
export const SELECTED_ROUTE_WIDTH = 7
export const SEGMENT_HOVER_WIDTH = 9
export const ROADS_NETWORK_WIDTH = 6
export const ROAD_SELECTION_WIDTH = 7
export const POLYGON_ROUTE_WIDTH = 4

export const PATH_BORDER_COLOR = [100, 100, 100, 255] as [
  number,
  number,
  number,
  number,
] // Dark grayish #646464

export const PATH_BORDER_COLOR_INDIVIDUAL_PREVIEW = [34, 0, 141, 255] as [
  number,
  number,
  number,
  number,
] // Dark purple #22008d

export const PATH_BORDER_WIDTH_MULTIPLIER = 2.2 // Increased for thicker boundaries
export const PATH_BORDER_MIN_PIXELS = 3 // Increased minimum for thicker boundaries

export const DIRECTION_ARROW_MIN_ZOOM = 0
export const DIRECTION_ARROW_WIDTH_PIXELS = 4

// Arrow size configuration
export const ARROW_SIZE_CONFIG = {
  // For tile layers (length-only sizing, zoom restriction)
  TILE_LAYER_MIN_ZOOM: 10,
  TILE_LAYER_MIN_SIZE: 3, // meters
  TILE_LAYER_MAX_SIZE: 25, // meters

  // For other layers (length-based sizing, same as tiles for consistency)
  REGULAR_MIN_SIZE: 3, // meters
  REGULAR_MAX_SIZE: 40, // meters
  // Note: Both use length-only formula for consistent arrow appearance
}

export const FEATURE_HOVER_MIN_ZOOM = 0

// High contrast colors for satellite view
export const ROUTE_STATUS_COLORS_SATELLITE = {
  // High contrast colors for satellite view
  failed: [255, 59, 48, 255] as [number, number, number, number], // Bright red #ff3b30
  pending: [255, 204, 0, 255] as [number, number, number, number], // Bright yellow #ffcc00
  synced: [52, 199, 89, 255] as [number, number, number, number], // Bright green #34c759
  unsynced: [255, 149, 0, 255] as [number, number, number, number], // Bright orange #ff9500
  validating: [0, 122, 255, 255] as [number, number, number, number], // Bright blue #007aff
  invalid: [255, 45, 85, 255] as [number, number, number, number], // Bright pink-red #ff2d55
}

export const SELECTED_ROUTE_COLOR_SATELLITE = [0, 199, 190, 255] as [
  number,
  number,
  number,
  number,
] // Bright cyan #00c7be

export const INDIVIDUAL_PREVIEW_COLOR_SATELLITE = [68, 13, 250, 255] as [
  number,
  number,
  number,
  number,
] // Purple #440dfa

export const SEGMENT_HOVER_COLOR_SATELLITE = [252, 123, 237, 255] as [
  number,
  number,
  number,
  number,
] // Bright pink #fc7bed

export const SEGMENT_BASE_COLOR_SATELLITE = [0, 199, 190, 255] as [
  number,
  number,
  number,
  number,
] // Bright cyan with transparency

export const ROAD_SELECTION_COLOR_SATELLITE = [0, 122, 255, 255] as [
  number,
  number,
  number,
  number,
] // Bright blue #007aff

export const POLYGON_ROUTE_COLOR_SATELLITE = [0, 230, 255, 255] as [
  number,
  number,
  number,
  number,
] // Bright cyan #00e6ff - distinct from pink hover color

export const UPLOADED_ROUTE_COLOR_SATELLITE = [255, 235, 59, 255] as [
  number,
  number,
  number,
  number,
] // Bright yellow #FFEB3B

export const JURISDICTION_BOUNDARY_COLOR_SATELLITE = [255, 255, 255, 255] as [
  number,
  number,
  number,
  number,
] // White for high contrast

export const PATH_BORDER_COLOR_SATELLITE = [255, 255, 255, 255] as [
  number,
  number,
  number,
  number,
] // White #ffffff

export const PATH_BORDER_COLOR_INDIVIDUAL_PREVIEW_SATELLITE = [
  34, 0, 141, 255,
] as [number, number, number, number] // Dark purple #22008d

export const ROADS_NETWORK_COLOR_SATELLITE = [255, 255, 255, 150] as [
  number,
  number,
  number,
  number,
] // White with transparency

// Imported roads colors
export const IMPORTED_ROADS_DEFAULT_COLOR = [96, 96, 96, 255] as [
  number,
  number,
  number,
  number,
] // Gray #606060

export const IMPORTED_ROADS_HOVERED_COLOR = [168, 85, 247, 255] as [
  number,
  number,
  number,
  number,
] // Purple #a855f7 (for imported roads hover state)

export const IMPORTED_ROADS_SELECTED_COLOR = [255, 152, 0, 255] as [
  number,
  number,
  number,
  number,
] // Orange #FF9800

export const IMPORTED_ROADS_VALID_COLOR = [255, 235, 59, 255] as [
  number,
  number,
  number,
  number,
] // Yellow #FFEB3B

export const IMPORTED_ROADS_LASSO_COLOR = [76, 175, 80, 255] as [
  number,
  number,
  number,
  number,
] // Green #4CAF50

export const IMPORTED_ROADS_GRAYSCALE_COLOR = [128, 128, 128, 200] as [
  number,
  number,
  number,
  number,
] // Grayscale with transparency

// Imported roads colors for satellite view (high contrast)
export const IMPORTED_ROADS_DEFAULT_COLOR_SATELLITE = [255, 255, 255, 255] as [
  number,
  number,
  number,
  number,
] // Light gray for better visibility on satellite

export const IMPORTED_ROADS_HOVERED_COLOR_SATELLITE = [252, 123, 237, 255] as [
  number,
  number,
  number,
  number,
] // Bright pink #ff2d55 (same as SEGMENT_HOVER_COLOR_SATELLITE)

export const IMPORTED_ROADS_SELECTED_COLOR_SATELLITE = [255, 149, 0, 255] as [
  number,
  number,
  number,
  number,
] // Bright orange #ff9500

export const IMPORTED_ROADS_VALID_COLOR_SATELLITE = [255, 204, 0, 255] as [
  number,
  number,
  number,
  number,
] // Bright yellow #ffcc00

export const IMPORTED_ROADS_LASSO_COLOR_SATELLITE = [52, 199, 89, 255] as [
  number,
  number,
  number,
  number,
] // Bright green #34c759

export const IMPORTED_ROADS_GRAYSCALE_COLOR_SATELLITE = [
  180, 180, 180, 200,
] as [number, number, number, number] // Light grayscale with transparency

// Maximum number of segments allowed for a single route
export const MAX_SEGMENTS_LIMIT = 10000
