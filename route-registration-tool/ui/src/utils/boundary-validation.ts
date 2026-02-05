import booleanPointInPolygon from "@turf/boolean-point-in-polygon"
import booleanWithin from "@turf/boolean-within"
import { lineString, point } from "@turf/turf"

import { decodePolylineToGeoJSON } from "./polyline-decoder"

/**
 * Check if a point (lat, lng) is within the jurisdiction boundary
 * @param lat Latitude of the point
 * @param lng Longitude of the point
 * @param boundary GeoJSON Polygon, FeatureCollection, or Feature representing the jurisdiction boundary
 * @returns true if point is within boundary, false otherwise
 */
export function isPointInBoundary(
  lat: number,
  lng: number,
  boundary:
    | GeoJSON.Polygon
    | GeoJSON.FeatureCollection
    | GeoJSON.Feature<GeoJSON.Polygon>
    | null
    | undefined,
): boolean {
  // Return false if boundary is not available
  if (!boundary) {
    return false
  }

  // Validate coordinates
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    isNaN(lat) ||
    isNaN(lng)
  ) {
    return false
  }

  try {
    // Extract polygon from different GeoJSON formats
    let polygon: GeoJSON.Polygon | null = null

    if (boundary.type === "FeatureCollection") {
      const featureCollection = boundary as GeoJSON.FeatureCollection
      if (
        featureCollection.features &&
        featureCollection.features.length > 0 &&
        featureCollection.features[0].geometry?.type === "Polygon"
      ) {
        polygon = featureCollection.features[0].geometry as GeoJSON.Polygon
      } else {
        return false
      }
    } else if (boundary.type === "Feature") {
      const feature = boundary as GeoJSON.Feature<GeoJSON.Polygon>
      if (feature.geometry?.type === "Polygon") {
        polygon = feature.geometry
      } else {
        return false
      }
    } else if (boundary.type === "Polygon") {
      polygon = boundary as GeoJSON.Polygon
    } else {
      return false
    }

    if (!polygon || !polygon.coordinates || polygon.coordinates.length === 0) {
      return false
    }

    // Create a GeoJSON Point from the coordinates
    // Note: Turf.js expects [lng, lat] format
    const pointFeature = point([lng, lat])

    // Check if point is inside the polygon
    return booleanPointInPolygon(pointFeature, polygon)
  } catch (error) {
    console.error("Error checking point in boundary:", error)
    return false
  }
}

/**
 * Check if an entire route (encoded polyline) is within the jurisdiction boundary
 * @param encodedPolyline Encoded polyline string from Google Routes API
 * @param boundary GeoJSON Polygon, FeatureCollection, or Feature representing the jurisdiction boundary
 * @returns true if entire route is within boundary, false otherwise
 */
export function isRouteWithinBoundary(
  encodedPolyline: string,
  boundary:
    | GeoJSON.Polygon
    | GeoJSON.FeatureCollection
    | GeoJSON.Feature<GeoJSON.Polygon>
    | null
    | undefined,
): boolean {
  // Return false if boundary is not available
  if (!boundary) {
    return false
  }

  // Validate encoded polyline
  if (!encodedPolyline || typeof encodedPolyline !== "string") {
    return false
  }

  try {
    // Import the polyline decoder utility

    // Decode the polyline to GeoJSON LineString
    const decodedLineString = decodePolylineToGeoJSON(encodedPolyline)

    if (
      !decodedLineString ||
      decodedLineString.type !== "LineString" ||
      !decodedLineString.coordinates ||
      decodedLineString.coordinates.length === 0
    ) {
      return false
    }

    // Extract polygon from different GeoJSON formats
    let polygon: GeoJSON.Polygon | null = null

    if (boundary.type === "FeatureCollection") {
      const featureCollection = boundary as GeoJSON.FeatureCollection
      if (
        featureCollection.features &&
        featureCollection.features.length > 0 &&
        featureCollection.features[0].geometry?.type === "Polygon"
      ) {
        polygon = featureCollection.features[0].geometry as GeoJSON.Polygon
      } else {
        return false
      }
    } else if (boundary.type === "Feature") {
      const feature = boundary as GeoJSON.Feature<GeoJSON.Polygon>
      if (feature.geometry?.type === "Polygon") {
        polygon = feature.geometry
      } else {
        return false
      }
    } else if (boundary.type === "Polygon") {
      polygon = boundary as GeoJSON.Polygon
    } else {
      return false
    }

    if (!polygon || !polygon.coordinates || polygon.coordinates.length === 0) {
      return false
    }

    // Create a Turf.js LineString feature from the decoded coordinates
    const routeLineString = lineString(decodedLineString.coordinates)

    // Check if the entire route LineString is within the polygon using Turf.js
    return booleanWithin(routeLineString, polygon)
  } catch (error) {
    console.error("Error checking route within boundary:", error)
    return false
  }
}
