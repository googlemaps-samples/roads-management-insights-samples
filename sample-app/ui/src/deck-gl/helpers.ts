// Copyright 2025 Google LLC
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

import { WebMercatorViewport } from "@deck.gl/core"
import * as turf from "@turf/turf"

export const convertToGeoJSON = (inputData: any) => {
  if (inputData && inputData.type === "FeatureCollection") {
    return inputData
  }

  // If data is an array of segments, convert to GeoJSON
  if (Array.isArray(inputData)) {
    return {
      type: "FeatureCollection",
      features: inputData
        .map((segment) => {
          // Add safety checks for segment properties
          if (!segment || typeof segment !== "object") {
            console.warn("Invalid segment found:", segment)
            return null
          }

          return {
            type: "Feature",
            properties: {
              id: segment.id || "unknown",
              name: segment.routeId || segment.id || "unknown",
              color: segment.color || "#000000",
              delay: segment.delayTime || 0,
              delayRatio: segment.delayRatio || 0,
              duration: segment.duration || 0,
              staticDuration: segment.staticDuration || 0,
              averageSpeed: segment.averageSpeed || 0,
              length: segment.length || 0,
            },
            geometry: {
              type: "LineString",
              coordinates:
                segment.path?.map((point: any) => [point.lng, point.lat]) || [],
            },
          }
        })
        .filter(Boolean), // Remove any null entries
    }
  }
  // Return empty GeoJSON if data format is unknown
  return { type: "FeatureCollection", features: [] }
}

export const darkenHex = (hex: string, percent = 20) => {
  // Remove '#' if present
  hex = hex.replace(/^#/, "")

  // Convert 3-digit hex to 6-digit hex
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("")
  }

  // Convert to RGB
  const num = parseInt(hex, 16)
  let r = (num >> 16) & 255
  let g = (num >> 8) & 255
  let b = num & 255

  // Calculate darker shade
  r = Math.max(0, r - Math.round((r * percent) / 100))
  g = Math.max(0, g - Math.round((g * percent) / 100))
  b = Math.max(0, b - Math.round((b * percent) / 100))

  // Convert back to HEX and return
  return (
    "#" +
    ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
  )
}

/**
 * Converts a hex color string to an RGB array
 * @param hex - Hex color string (e.g., "#FF5500" or "FF5500")
 * @returns RGB array [r, g, b] with values from 0-255
 */
export function hexToRgb(hex: string): number[] {
  // Handle invalid input
  if (!hex || typeof hex !== "string") {
    console.warn("🏙️ hexToRgb: Invalid hex input:", hex)
    return [19, 214, 143] // Default green
  }

  // Remove the # if present
  const cleanHex = hex.startsWith("#") ? hex.slice(1) : hex

  // Validate hex format
  if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
    console.warn("🏙️ hexToRgb: Invalid hex format:", hex, "using default green")
    return [19, 214, 143] // Default green
  }

  // Convert to RGB
  const r = parseInt(cleanHex.substr(0, 2), 16)
  const g = parseInt(cleanHex.substr(2, 2), 16)
  const b = parseInt(cleanHex.substr(4, 2), 16)

  // Validate parsed values
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    console.warn(
      "🏙️ hexToRgb: Failed to parse hex:",
      hex,
      "using default green",
    )
    return [19, 214, 143] // Default green
  }

  return [r, g, b]
}

// Calculate bounding box using Turf.js (more accurate than manual calculation)
export const calculateBoundingBox = (coordinates: number[][]) => {
  if (!coordinates || coordinates.length === 0) {
    return null
  }

  try {
    // Create a LineString feature from coordinates
    const lineString = turf.lineString(coordinates)

    // Get bounding box using Turf.js
    const bbox = turf.bbox(lineString) // [minLng, minLat, maxLng, maxLat]

    return {
      minLng: bbox[0],
      minLat: bbox[1],
      maxLng: bbox[2],
      maxLat: bbox[3],
      width: bbox[2] - bbox[0],
      height: bbox[3] - bbox[1],
    }
  } catch (error) {
    console.warn(
      "Error calculating bounding box with Turf.js, falling back to manual calculation:",
      error,
    )
    return null
  }
}

export const calculateMultiPolygonBoundingBox = (polygons: any) => {
  if (!polygons || polygons.length === 0) {
    return null
  }

  try {
    // Create a FeatureCollection
    const featureCollection = {
      type: "FeatureCollection" as const,
      features: polygons,
    }

    // Calculate bounding box
    const bbox = turf.bbox(featureCollection) // [minLng, minLat, maxLng, maxLat]

    return {
      minLng: bbox[0],
      minLat: bbox[1],
      maxLng: bbox[2],
      maxLat: bbox[3],
      width: bbox[2] - bbox[0],
      height: bbox[3] - bbox[1],
    }
  } catch (error) {
    console.warn(
      "Error calculating bounding box for MultiPolygon with Turf.js:",
      error,
    )
    return null
  }
}

// Calculate optimal zoom using WebMercatorViewport (most accurate method)
export const calculateOptimalZoomWithViewport = (
  coordinates: number[],
  fallbackZoom: number = 14,
  padding: number = 40,
): number => {
  if (!coordinates || coordinates.length < 2) {
    return fallbackZoom
  }

  try {
    // Create viewport for optimal zoom calculation
    const viewport = new WebMercatorViewport({
      width: window.innerWidth,
      height: window.innerHeight,
    })

    // Fit bounds to get optimal zoom
    const { zoom } = viewport.fitBounds(
      [
        [coordinates[0], coordinates[1]], // SW corner
        [coordinates[2], coordinates[3]], // NE corner
      ],
      {
        padding,
      },
    )
    return zoom
  } catch (error) {
    console.warn(
      "Error calculating zoom with WebMercatorViewport, falling back to manual calculation:",
      error,
    )
    return fallbackZoom
  }
}

// Helper function to check if delay should be shown
export const shouldShowDelay = (delayTime: number) => {
  return delayTime && delayTime >= 0.5
}
