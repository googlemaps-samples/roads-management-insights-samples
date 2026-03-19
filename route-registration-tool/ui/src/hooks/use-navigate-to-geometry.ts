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
import { useMap } from "@vis.gl/react-google-maps"
import { useCallback } from "react"

import { decodePolylineToGeoJSON } from "../utils/polyline-decoder"
import { calculateZoomWebMercator } from "../utils/web-mercator"

interface NavigateToGeometryOptions {
  padding?:
    | number
    | { top: number; right: number; bottom: number; left: number }
}

/**
 * Expand bounding box by a percentage to add margin
 */
function expandBBox(
  bbox: [number, number, number, number],
  percent: number = 0.1, // 10% expansion
): [number, number, number, number] {
  const [minLng, minLat, maxLng, maxLat] = bbox

  const lngDiff = maxLng - minLng
  const latDiff = maxLat - minLat

  return [
    minLng - lngDiff * percent, // minLng
    minLat - latDiff * percent, // minLat
    maxLng + lngDiff * percent, // maxLng
    maxLat + latDiff * percent, // maxLat
  ]
}

/**
 * Hook that provides a function to smoothly navigate the map viewport to a given geometry
 * @param mapId - The ID of the map instance (default: "main-map")
 * @returns A function to navigate to geometry
 */
export const useNavigateToGeometry = (mapId: string = "main-map") => {
  const map = useMap(mapId)

  const navigateToGeometry = useCallback(
    (
      geometry:
        | { encodedPolyline: string }
        | { linestring: GeoJSON.LineString }
        | string,
      // options currently unused (padding removed intentionally)
      options?: NavigateToGeometryOptions,
    ) => {
      void options
      if (!map) {
        console.warn("Map instance not available for navigation")
        return
      }

      // Validate geometry is not null or undefined
      if (!geometry) {
        console.warn("Geometry is null or undefined")
        return
      }

      let linestring: GeoJSON.LineString

      // Handle different input formats (existing logic)
      if (typeof geometry === "string") {
        linestring = decodePolylineToGeoJSON(geometry)
        console.log("🧭 Navigation: Decoded from string polyline", {
          firstCoord: linestring.coordinates[0],
        })
      } else if (
        geometry &&
        typeof geometry === "object" &&
        "encodedPolyline" in geometry
      ) {
        linestring = decodePolylineToGeoJSON(geometry.encodedPolyline)
        console.log("🧭 Navigation: Decoded from encodedPolyline", {
          firstCoord: linestring.coordinates[0],
          coordCount: linestring.coordinates.length,
        })
      } else if (
        geometry &&
        typeof geometry === "object" &&
        "linestring" in geometry
      ) {
        linestring = geometry.linestring
        console.log("🧭 Navigation: Using provided linestring", {
          firstCoord: linestring.coordinates[0],
        })
      } else {
        console.error("Invalid geometry format provided to navigateToGeometry")
        return
      }

      // Validate LineString
      if (
        !linestring ||
        linestring.type !== "LineString" ||
        !Array.isArray(linestring.coordinates) ||
        linestring.coordinates.length === 0
      ) {
        console.warn("Invalid or empty LineString geometry")
        return
      }

      // ✅ Use Turf.js to calculate bounding box
      // Turf typings expect a Feature/FeatureCollection, not a raw geometry.
      const bbox = turf.bbox(turf.lineString(linestring.coordinates)) as [
        number,
        number,
        number,
        number,
      ]

      // Expand bbox by percentage to add margin (ensures route isn't cut off)
      const expandedBBox = expandBBox(bbox, 0.15) // 15% expansion
      const [minLng, minLat, maxLng, maxLat] = expandedBBox

      // Calculate center point
      const centerLng = (minLng + maxLng) / 2
      const centerLat = (minLat + maxLat) / 2

      // Get map container dimensions
      const mapDiv = map.getDiv()
      const mapWidth = mapDiv?.offsetWidth || window.innerWidth
      const mapHeight = mapDiv?.offsetHeight || window.innerHeight

      // Calculate appropriate zoom level
      const zoom = calculateZoomWebMercator(expandedBBox, mapWidth, mapHeight)

      // Set the viewport
      map.setCenter({ lat: centerLat, lng: centerLng })
      map.setZoom(zoom)
    },
    [map],
  )

  return navigateToGeometry
}
