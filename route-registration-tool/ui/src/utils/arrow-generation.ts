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
 * Client-side arrow generation utilities for road direction indicators
 */
import { ARROW_SIZE_CONFIG } from "../stores/layer-store/constants"

/**
 * Arrow style configuration
 */
export interface ArrowStyle {
  color: [number, number, number, number]
  width: number
  mode: "tile-layer" | "regular-layer"
  minZoom?: number // For tile layers with zoom restrictions
}

/**
 * Helper to clamp a value between min and max
 */
function clamp(min: number, value: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Calculate bearing from point p1 to p2 in degrees
 * @param p1 [lon, lat] starting point
 * @param p2 [lon, lat] ending point
 * @returns bearing in degrees (0-360)
 */
export function calculateBearing(
  p1: [number, number],
  p2: [number, number],
): number {
  const [lon1, lat1] = p1
  const [lon2, lat2] = p2

  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const lat1Rad = (lat1 * Math.PI) / 180
  const lat2Rad = (lat2 * Math.PI) / 180

  const x = Math.sin(dLon) * Math.cos(lat2Rad)
  const y =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon)

  const bearing = Math.atan2(x, y)
  return ((bearing * 180) / Math.PI + 360) % 360
}

/**
 * Calculate LineString length in meters using Haversine formula
 * @param coordinates Array of [lng, lat] coordinates
 * @returns Total length in meters
 */
export function calculateLineStringLength(coordinates: number[][]): number {
  if (coordinates.length < 2) return 0

  let totalLength = 0
  const R = 6371000 // Earth's radius in meters

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1] = coordinates[i]
    const [lon2, lat2] = coordinates[i + 1]

    // Haversine formula
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const lat1Rad = (lat1 * Math.PI) / 180
    const lat2Rad = (lat2 * Math.PI) / 180

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    totalLength += R * c
  }

  return totalLength
}

/**
 * Calculate arrow size based on feature length only (for tile layers)
 * Uses logarithmic scaling for better distribution
 * @param lengthMeters Feature length in meters
 * @returns Arrow length in meters
 */
function calculateArrowSizeByLength(lengthMeters: number): number {
  // Logarithmic scaling: longer features get proportionally larger arrows
  // but not linearly (would be too extreme)
  const baseSize = Math.log10(lengthMeters + 10) * 4

  return clamp(
    ARROW_SIZE_CONFIG.TILE_LAYER_MIN_SIZE,
    baseSize,
    ARROW_SIZE_CONFIG.TILE_LAYER_MAX_SIZE,
  )
}

/**
 * Calculate arrow size based on length (for regular layers)
 * Uses same formula as tile layers for consistency
 * Currently unused - all layers use calculateArrowSizeByLength for consistency
 * @param lengthMeters Feature length in meters
 * @param _zoomLevel Current map zoom level (not used, kept for compatibility)
 * @returns Arrow length in meters
 */
// @ts-ignore - Kept for potential future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function calculateArrowSizeByLengthAndZoom(
  lengthMeters: number,
  _zoomLevel: number,
): number {
  // Use same length-based formula as tile layers for consistent appearance
  // Logarithmic scaling: longer features get proportionally larger arrows
  const baseSize = Math.log10(lengthMeters + 10) * 4

  return clamp(
    ARROW_SIZE_CONFIG.REGULAR_MIN_SIZE,
    baseSize,
    ARROW_SIZE_CONFIG.REGULAR_MAX_SIZE,
  )
}

/**
 * Calculate destination point given start point, distance, and bearing
 * @param lat Starting latitude
 * @param lon Starting longitude
 * @param distanceMeters Distance in meters
 * @param bearingDeg Bearing in degrees
 * @returns [lon, lat] destination point
 */
export function calculateDestinationPoint(
  lat: number,
  lon: number,
  distanceMeters: number,
  bearingDeg: number,
): [number, number] {
  const R = 6378137.0 // Earth radius in meters
  const δ = distanceMeters / R
  const θ = (bearingDeg * Math.PI) / 180
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lon * Math.PI) / 180

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    )

  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI]
}

/**
 * Create arrowhead geometry for a road segment
 * Creates two arrow arms at the endpoint pointing backward toward the previous point
 * @param p2 Second-to-last point [lon, lat]
 * @param p3 Last point (endpoint) [lon, lat]
 * @param arrowLengthMeters Length of arrow arms in meters
 * @returns Array of two LineString coordinates: [[p3, left], [p3, right]]
 */
export function createArrowhead(
  p2: [number, number],
  p3: [number, number],
  arrowLengthMeters: number = 5,
): [[number, number], [number, number]][] {
  const [lon3, lat3] = p3

  // Get bearing from p2 to p3
  const forwardBearing = calculateBearing(p2, p3)

  // Reverse it (point back toward p2)
  const backwardBearing = (forwardBearing + 180) % 360

  // Create two arms at ±30° from the backward direction
  const leftBearing = (backwardBearing - 30 + 360) % 360
  const rightBearing = (backwardBearing + 30) % 360

  const left = calculateDestinationPoint(
    lat3,
    lon3,
    arrowLengthMeters,
    leftBearing,
  )
  const right = calculateDestinationPoint(
    lat3,
    lon3,
    arrowLengthMeters,
    rightBearing,
  )

  // Return as LineString coordinates: [[p3, left], [p3, right]]
  return [
    [p3, left],
    [p3, right],
  ]
}

/**
 * Generate arrow features for a road LineString (legacy function for compatibility)
 * @param roadFeature GeoJSON Feature with LineString geometry
 * @param _zoomLevel Current zoom level (not used, kept for compatibility)
 * @returns Array of arrow GeoJSON features
 */
export function generateArrowFeatures(
  roadFeature: GeoJSON.Feature<GeoJSON.LineString>,
  _zoomLevel: number,
): GeoJSON.Feature<GeoJSON.LineString>[] {
  const coords = roadFeature.geometry.coordinates

  if (coords.length < 2) {
    return []
  }

  const p2 = coords[coords.length - 2] as [number, number]
  const p3 = coords[coords.length - 1] as [number, number]

  // Calculate length from properties or geometry
  const lengthMeters =
    (roadFeature.properties?.length ?? 0) * 1000 || // km to meters
    (roadFeature.properties?.distance ?? 0) * 1000 || // meters
    calculateLineStringLength(coords)

  // Use tile-layer mode for saved routes
  const arrowLengthMeters = calculateArrowSizeByLength(lengthMeters)

  const arrowSegments = createArrowhead(p2, p3, arrowLengthMeters)

  return arrowSegments.map((seg) => ({
    type: "Feature" as const,
    geometry: {
      type: "LineString" as const,
      coordinates: seg,
    },
    properties: {
      type: "direction_arrow",
      parent_id: roadFeature.properties?.id,
      stroke: roadFeature.properties?.stroke || "#6B7280",
      "stroke-opacity":
        roadFeature.properties?.["stroke-opacity"] !== undefined
          ? roadFeature.properties["stroke-opacity"]
          : 0.9,
      "stroke-width": 2,
      is_enabled: roadFeature.properties?.is_enabled,
    },
  }))
}

/**
 * Unified arrow generation function for any LineString with custom styling
 * @param coordinates Array of [lng, lat] coordinates
 * @param zoomLevel Current map zoom level
 * @param style Arrow style configuration (color, width, mode, minZoom)
 * @param lengthMeters Optional pre-calculated length in meters (for performance)
 * @param additionalProps Additional properties to add to arrow features
 * @param showTileLayerArrows Optional external flag for tile layers (overrides zoom check)
 * @returns Array of arrow GeoJSON features
 */
export function generateArrowsForLineString(
  coordinates: number[][],
  zoomLevel: number,
  style: ArrowStyle,
  lengthMeters?: number,
  additionalProps?: Record<string, any>,
  showTileLayerArrows?: boolean,
): GeoJSON.Feature<GeoJSON.LineString>[] {
  if (coordinates.length < 2) {
    return []
  }

  // Check minimum zoom for tile layers using external flag
  if (style.mode === "tile-layer") {
    // Use external flag if provided, otherwise fallback to zoom check
    if (showTileLayerArrows !== undefined) {
      if (!showTileLayerArrows) {
        return []
      }
    } else if (style.minZoom !== undefined && zoomLevel < style.minZoom) {
      return []
    }
  }

  // Get or calculate length
  const actualLength = lengthMeters ?? calculateLineStringLength(coordinates)

  // Skip if length is too small or invalid
  if (actualLength <= 0) {
    return []
  }

  // Calculate arrow size based on mode
  // const arrowLengthMeters =
  //   style.mode === "tile-layer"
  //     ? calculateArrowSizeByLength(actualLength)
  //     : calculateArrowSizeByLengthAndZoom(actualLength, zoomLevel)

  const arrowLengthMeters = calculateArrowSizeByLength(actualLength)

  // In generateArrowsForLineString, before calling createArrowhead:
  let p2 = coordinates[coordinates.length - 2] as [number, number]
  const p3 = coordinates[coordinates.length - 1] as [number, number]

  // Check if p2 and p3 are too close (less than 1 meter apart)
  const distance = calculateLineStringLength([p2, p3])
  if (distance < 1) {
    // Use a point further back to get accurate direction
    // Find the last point that's at least 10 meters from p3
    let p2Index = coordinates.length - 2
    while (p2Index > 0) {
      const testP2 = coordinates[p2Index] as [number, number]
      const testDistance = calculateLineStringLength([testP2, p3])
      if (testDistance >= 10) {
        p2 = testP2
        break
      }
      p2Index--
    }
    // If we can't find a point far enough, use first point
    if (p2Index === 0) {
      p2 = coordinates[0] as [number, number]
    }
  }

  const arrowSegments = createArrowhead(p2, p3, arrowLengthMeters)

  return arrowSegments.map((seg) => ({
    type: "Feature" as const,
    geometry: {
      type: "LineString" as const,
      coordinates: seg,
    },
    properties: {
      type: "direction_arrow",
      color: style.color,
      width: style.width,
      ...additionalProps,
    },
  }))
}
