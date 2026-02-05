import { googleRoutesApi } from "../data/api/google-routes-api"
import { isPointInBoundary } from "./boundary-validation"
import { decodePolylineToGeoJSON } from "./polyline-decoder"

interface Waypoint {
  id: string
  position: { lat: number; lng: number }
  order: number
}

interface RouteMarkers {
  routeId: string
  startMarker: { lat: number; lng: number }
  endMarker: { lat: number; lng: number }
  waypoints: Waypoint[]
}

interface RegenerateRouteOptions {
  routeId: string
  markers: RouteMarkers
  removeSnappedRoadsForRoute: (routeId: string) => void
  addSnappedRoads: (routeId: string, roads: GeoJSON.Feature[]) => void
  boundary?:
    | GeoJSON.Polygon
    | GeoJSON.FeatureCollection
    | GeoJSON.Feature<GeoJSON.Polygon>
    | null
    | undefined
}

/**
 * Extract all coordinates from a feature (LineString or MultiLineString)
 */
function extractAllCoordinates(feature: GeoJSON.Feature): [number, number][] {
  const coordinates: [number, number][] = []
  const geometry = feature.geometry

  if (geometry.type === "LineString") {
    // LineString coordinates are Position[] which is number[][]
    geometry.coordinates.forEach((coord) => {
      if (Array.isArray(coord) && coord.length >= 2) {
        coordinates.push([coord[0] as number, coord[1] as number])
      }
    })
  } else if (geometry.type === "MultiLineString") {
    // MultiLineString coordinates are Position[][]
    geometry.coordinates.forEach((line) => {
      if (Array.isArray(line)) {
        line.forEach((coord) => {
          if (Array.isArray(coord) && coord.length >= 2) {
            coordinates.push([coord[0] as number, coord[1] as number])
          }
        })
      }
    })
  }

  return coordinates
}

/**
 * Check if all coordinates in a feature are within the boundary
 */
function isRouteWithinBoundary(
  feature: GeoJSON.Feature,
  boundary:
    | GeoJSON.Polygon
    | GeoJSON.FeatureCollection
    | GeoJSON.Feature<GeoJSON.Polygon>
    | null
    | undefined,
): boolean {
  if (!boundary) {
    // If no boundary is set, allow all routes
    return true
  }

  const coordinates = extractAllCoordinates(feature)
  if (coordinates.length === 0) {
    return false
  }

  // Check if all coordinates are within the boundary
  return coordinates.every(([lng, lat]) => {
    return isPointInBoundary(lat, lng, boundary)
  })
}

export const regenerateRouteWithWaypoints = async (
  options: RegenerateRouteOptions,
): Promise<void> => {
  const { routeId, markers, removeSnappedRoadsForRoute, addSnappedRoads } =
    options

  try {
    // Build waypoints array if they exist
    const waypoints =
      markers.waypoints.length > 0
        ? markers.waypoints
            .sort((a, b) => a.order - b.order)
            .map((wp) => ({
              lat: wp.position.lat,
              lng: wp.position.lng,
            }))
        : []

    // Call Google Routes API using consolidated API
    const apiResponse = await googleRoutesApi.generateRoute(
      markers.startMarker,
      markers.endMarker,
      waypoints,
    )

    if (!apiResponse.success || !apiResponse.data) {
      throw new Error(apiResponse.message || "Failed to generate route")
    }

    const { encodedPolyline, distance, duration } = apiResponse.data
    const decodedGeometry = decodePolylineToGeoJSON(encodedPolyline)

    const routeFeature: GeoJSON.Feature = {
      type: "Feature",
      geometry: decodedGeometry,
      properties: {
        id: `${routeId}-optimized`,
        name: "Optimized Route",
        source: "google_routes_api",
        distance: distance.toFixed(2),
        duration: duration.toFixed(0),
        traffic_aware: true,
        encodedPolyline: encodedPolyline,
      },
    }

    // Validate route is within boundary if boundary is provided
    if (options.boundary !== undefined) {
      if (!isRouteWithinBoundary(routeFeature, options.boundary)) {
        throw new Error("Route is outside the jurisdiction boundary")
      }
    }

    removeSnappedRoadsForRoute(routeId)
    addSnappedRoads(routeId, [routeFeature])
  } catch (error) {
    console.error("❌ Failed to regenerate route:", error)
    throw error
  }
}
