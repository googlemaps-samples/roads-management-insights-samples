import * as turf from "@turf/turf"
import { useMap } from "@vis.gl/react-google-maps"
import { useCallback } from "react"

import { decodePolylineToGeoJSON } from "../utils/polyline-decoder"

interface NavigateToGeometryOptions {
  padding?:
    | number
    | { top: number; right: number; bottom: number; left: number }
}

/**
 * Calculate accurate zoom using Web Mercator projection math.
 */
function calculateZoomWebMercator(
  bbox: [number, number, number, number],
  mapWidth: number,
  mapHeight: number,
  padding: number,
): number {
  const [minLng, minLat, maxLng, maxLat] = bbox

  const TILE_SIZE = 256
  const EARTH_RADIUS = 6378137
  const EARTH_CIRCUM = 2 * Math.PI * EARTH_RADIUS

  // Reduce viewport due to padding
  const viewportWidth = mapWidth - padding * 2
  const viewportHeight = mapHeight - padding * 2

  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return 12 // fallback
  }

  // Convert bbox width/height to meters using Web Mercator
  const latCenter = (minLat + maxLat) / 2

  // Approximation: meters per degree at this latitude
  const metersPerDegreeLat = (Math.PI * EARTH_RADIUS) / 180

  const metersPerDegreeLng =
    metersPerDegreeLat * Math.cos((latCenter * Math.PI) / 180)

  const widthMeters = (maxLng - minLng) * metersPerDegreeLng
  const heightMeters = (maxLat - minLat) * metersPerDegreeLat

  // Compute zoom required for each dimension
  const zoomX = Math.log2(
    (viewportWidth * EARTH_CIRCUM) / (widthMeters * TILE_SIZE),
  )

  const zoomY = Math.log2(
    (viewportHeight * EARTH_CIRCUM) / (heightMeters * TILE_SIZE),
  )

  let zoom = Math.min(zoomX, zoomY)

  // Clamp zoom
  const MAX_ZOOM = 18
  const MIN_ZOOM = 3

  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))

  return Math.floor(zoom)
}

/**
 * Calculate appropriate zoom level based on bounding box dimensions
 * Ensures the entire route is visible with padding
 */
function calculateZoomFromBBox(
  bbox: [number, number, number, number], // [minLng, minLat, maxLng, maxLat]
  mapWidth: number,
  mapHeight: number,
  padding: number,
): number {
  const [minLng, minLat, maxLng, maxLat] = bbox

  // Calculate bbox dimensions in degrees
  const lngDiff = maxLng - minLng
  const latDiff = maxLat - minLat

  // Account for padding (reduce available map area)
  const availableWidth = mapWidth - padding * 2
  const availableHeight = mapHeight - padding * 2

  // Calculate zoom based on the larger dimension (to ensure everything fits)
  const lngZoom = Math.log2((360 * availableWidth) / (lngDiff * 256))
  const latZoom = Math.log2((180 * availableHeight) / (latDiff * 256))

  // Use the smaller zoom (more zoomed out) to ensure both dimensions fit
  let zoom = Math.min(lngZoom, latZoom)

  // Apply maximum zoom limit to prevent excessive zoom
  const MAX_ZOOM = 18
  zoom = Math.min(zoom, MAX_ZOOM)

  // Apply minimum zoom limit to prevent zooming out too far
  const MIN_ZOOM = 12
  zoom = Math.max(zoom, MIN_ZOOM)

  return Math.floor(zoom)
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
      options?: NavigateToGeometryOptions,
    ) => {
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
      const bbox = turf.bbox(linestring) as [number, number, number, number]
      // bbox format: [minLng, minLat, maxLng, maxLat]

      console.log("🧭 Navigation: Calculated bbox from Turf", {
        bbox,
        minLng: bbox[0],
        minLat: bbox[1],
        maxLng: bbox[2],
        maxLat: bbox[3],
      })

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

      // Calculate padding
      const defaultPadding = 100
      const padding =
        options?.padding === undefined
          ? defaultPadding
          : typeof options.padding === "number"
            ? options.padding
            : options.padding

      // Calculate appropriate zoom level
      const zoom = calculateZoomWebMercator(
        expandedBBox,
        mapWidth,
        mapHeight,
        padding,
      )

      console.log("🧭 Navigation: Calculated viewport", {
        center: { lat: centerLat, lng: centerLng },
        zoom,
        bbox: expandedBBox,
        mapDimensions: { width: mapWidth, height: mapHeight },
      })

      // Set the viewport
      map.setCenter({ lat: centerLat, lng: centerLng })
      map.setZoom(zoom)
    },
    [map],
  )

  return navigateToGeometry
}
