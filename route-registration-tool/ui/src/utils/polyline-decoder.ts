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

import { decode } from "@googlemaps/polyline-codec"
import * as turf from "@turf/turf"

/**
 * Calculate route length from GeoJSON LineString geometry
 * @param geometry GeoJSON LineString geometry
 * @returns Total route length in kilometers, or null if calculation fails
 */
export function calculateRouteLengthFromGeometry(
  geometry: GeoJSON.LineString,
): number | null {
  if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
    return null
  }

  try {
    const coordinates = geometry.coordinates as [number, number][]
    if (coordinates.length < 2) {
      return null
    }

    // Calculate cumulative distances for accurate length calculation
    let totalLength = 0
    for (let i = 0; i < coordinates.length - 1; i++) {
      const segmentLength = turf.distance(
        turf.point([coordinates[i][0], coordinates[i][1]]),
        turf.point([coordinates[i + 1][0], coordinates[i + 1][1]]),
        "kilometers" as const,
      )
      totalLength += segmentLength
    }

    return totalLength
  } catch (error) {
    console.error("Error calculating route length from geometry:", error)
    return null
  }
}

/**
 * Calculate route length from encoded polyline or coordinate array
 * @param encodedPolyline Encoded polyline string or JSON string of coordinate array (e.g., "[[lng,lat],[lng,lat]]")
 * @returns Total route length in kilometers, or null if calculation fails
 */
export function calculateRouteLengthFromPolyline(
  encodedPolyline: string,
): number | null {
  if (!encodedPolyline) {
    return null
  }

  try {
    let routeCoords: [number, number][]

    // Try to parse as JSON array of coordinates first
    try {
      const parsed = JSON.parse(encodedPolyline)
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        Array.isArray(parsed[0]) &&
        parsed[0].length === 2
      ) {
        // It's a JSON array of coordinates
        // Detect coordinate format by checking value ranges
        // Longitude: -180 to 180, Latitude: -90 to 90
        const firstCoord = parsed[0] as [number, number]
        const firstValue = firstCoord[0]
        const secondValue = firstCoord[1]

        // Check if it's [lat, lng] format (first value is latitude, second is longitude)
        const isLatLngFormat =
          Math.abs(firstValue) <= 90 && Math.abs(secondValue) <= 180

        // Check if it's [lng, lat] format (first value is longitude, second is latitude)
        const isLngLatFormat =
          Math.abs(firstValue) <= 180 && Math.abs(secondValue) <= 90

        if (isLatLngFormat && !isLngLatFormat) {
          // It's [lat, lng] format, convert to [lng, lat] (GeoJSON format)
          routeCoords = parsed.map(
            (coord: [number, number]) =>
              [coord[1], coord[0]] as [number, number],
          )
        } else {
          // Assume [lng, lat] format (GeoJSON format) or use as-is if ambiguous
          routeCoords = parsed as [number, number][]
        }
      } else {
        // Not a valid coordinate array, treat as encoded polyline
        const routeCoordinates = decodePolylineToGeoJSON(encodedPolyline)
        if (
          !routeCoordinates.coordinates ||
          routeCoordinates.coordinates.length < 2
        ) {
          return null
        }
        routeCoords = routeCoordinates.coordinates as [number, number][]
      }
    } catch {
      // JSON parsing failed, treat as encoded polyline
      const routeCoordinates = decodePolylineToGeoJSON(encodedPolyline)
      if (
        !routeCoordinates.coordinates ||
        routeCoordinates.coordinates.length < 2
      ) {
        return null
      }
      routeCoords = routeCoordinates.coordinates as [number, number][]
    }

    if (routeCoords.length < 2) {
      return null
    }

    // Calculate cumulative distances for accurate length calculation
    let totalLength = 0
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const segmentLength = turf.distance(
        turf.point([routeCoords[i][0], routeCoords[i][1]]),
        turf.point([routeCoords[i + 1][0], routeCoords[i + 1][1]]),
        "kilometers" as const,
      )
      totalLength += segmentLength
    }

    return totalLength
  } catch (error) {
    console.error("Error calculating route length from polyline:", error)
    return null
  }
}

/**
 * Decode an encoded polyline string or coordinate array to GeoJSON LineString
 */
export function decodePolylineToGeoJSON(
  encodedPolyline: string,
): GeoJSON.LineString {
  if (!encodedPolyline) {
    return {
      type: "LineString",
      coordinates: [],
    }
  }

  try {
    // Try to parse as JSON array of coordinates first
    try {
      const parsed = JSON.parse(encodedPolyline)
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        Array.isArray(parsed[0]) &&
        parsed[0].length === 2
      ) {
        // It's a JSON array of coordinates
        // Detect coordinate format by checking value ranges
        // Longitude: -180 to 180, Latitude: -90 to 90
        const firstCoord = parsed[0] as [number, number]
        const firstValue = firstCoord[0]
        const secondValue = firstCoord[1]

        // Check if it's [lat, lng] format (first value is latitude, second is longitude)
        const isLatLngFormat =
          Math.abs(firstValue) <= 90 && Math.abs(secondValue) <= 180

        // Check if it's [lng, lat] format (first value is longitude, second is latitude)
        const isLngLatFormat =
          Math.abs(firstValue) <= 180 && Math.abs(secondValue) <= 90

        if (isLatLngFormat && !isLngLatFormat) {
          // It's [lat, lng] format, convert to [lng, lat] (GeoJSON format)
          const geoJsonCoords = parsed.map(
            (coord: [number, number]) =>
              [coord[1], coord[0]] as [number, number],
          )
          return {
            type: "LineString",
            coordinates: geoJsonCoords,
          }
        } else {
          // Assume [lng, lat] format (GeoJSON format) or use as-is if ambiguous
          return {
            type: "LineString",
            coordinates: parsed as [number, number][],
          }
        }
      }
    } catch {
      // JSON parsing failed, treat as encoded polyline
    }

    // Decode polyline - @googlemaps/polyline-codec returns [lat, lng] format
    const decodedCoords = decode(encodedPolyline)

    if (decodedCoords.length === 0) {
      console.warn("🧭 Polyline decoder: No coordinates decoded")
      return {
        type: "LineString",
        coordinates: [],
      }
    }

    // Convert to GeoJSON format [lng, lat]
    // @googlemaps/polyline-codec decode returns [lat, lng] tuples
    const geoJsonCoords = decodedCoords.map((coord) => {
      const [lat, lng] = coord

      // Validate coordinate ranges
      // Latitude: -90 to 90, Longitude: -180 to 180
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        console.warn("🧭 Polyline decoder: Invalid coordinate ranges", {
          lat,
          lng,
          coord,
        })
      }

      // Return in GeoJSON format [lng, lat]
      return [lng, lat]
    })

    // if (geoJsonCoords.length > 0) {
    //   // console.log("🧭 Polyline decoder: First GeoJSON coord", {
    //   //   raw: geoJsonCoords[0],
    //   //   format: "[lng, lat]",
    //   //   lng: geoJsonCoords[0][0],
    //   //   lat: geoJsonCoords[0][1],
    //   // })
    // }

    return {
      type: "LineString",
      coordinates: geoJsonCoords,
    }
  } catch (error) {
    console.error("Error decoding polyline:", error)
    return {
      type: "LineString",
      coordinates: [],
    }
  }
}

/**
 * Decode an encoded polyline string to array of coordinates for DeckGL
 */
export function decodePolylineToCoordinates(
  encodedPolyline: string,
): Array<[number, number]> {
  if (!encodedPolyline) {
    return []
  }

  try {
    // Decode polyline to array of [lat, lng] coordinates
    const decodedCoords = decode(encodedPolyline)

    // Convert to [lng, lat] format for DeckGL
    return decodedCoords.map(([lat, lng]) => [lng, lat])
  } catch (error) {
    console.error("Error decoding polyline:", error)
    return []
  }
}
