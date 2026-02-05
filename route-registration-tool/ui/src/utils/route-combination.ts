// ui/src/utils/route-combination.ts
import { googleRoutesApi } from "../data/api/google-routes-api"
import { PanelRoute } from "../stores/layer-store/types"
import { decodePolylineToGeoJSON } from "./polyline-decoder"
import { generateMultiSelectRouteName } from "./route-naming"

interface RoadData {
  id: string
  linestringGeoJson: GeoJSON.LineString
  distanceKm?: number
  priority?: string
}

/**
 * Combine multiple roads into a single route using Google Routes API
 * @param roads Array of road data with linestringGeoJson
 * @param projectId Project ID (not used in API call but kept for consistency)
 * @returns Promise resolving to PanelRoute
 */
export async function combineRoadsToRoute(
  roads: RoadData[],
  projectId: string,
): Promise<PanelRoute> {
  if (roads.length === 0) {
    throw new Error("Cannot combine empty roads array")
  }

  if (roads.length === 1) {
    // Single road - return as-is
    const road = roads[0]
    return {
      id: `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: generateMultiSelectRouteName(1),
      roadIds: [road.id],
      geometry: road.linestringGeoJson,
      priority: road.priority,
      distance: road.distanceKm || 0,
    }
  }

  // Extract origin from first road's first coordinate
  const firstRoad = roads[0]
  const firstRoadCoords = firstRoad.linestringGeoJson.coordinates
  if (!firstRoadCoords || firstRoadCoords.length === 0) {
    throw new Error("First road has no coordinates")
  }
  const origin: { lat: number; lng: number } = {
    lat: firstRoadCoords[0][1], // [lng, lat] format
    lng: firstRoadCoords[0][0],
  }

  // Extract destination from last road's last coordinate
  const lastRoad = roads[roads.length - 1]
  const lastRoadCoords = lastRoad.linestringGeoJson.coordinates
  if (!lastRoadCoords || lastRoadCoords.length === 0) {
    throw new Error("Last road has no coordinates")
  }
  const destination: { lat: number; lng: number } = {
    lat: lastRoadCoords[lastRoadCoords.length - 1][1], // [lng, lat] format
    lng: lastRoadCoords[lastRoadCoords.length - 1][0],
  }

  // Extract waypoints from connection points between roads
  // Limit to 25 waypoints (Google Routes API limit)
  const waypoints: Array<{ lat: number; lng: number }> = []
  for (let i = 0; i < roads.length - 1; i++) {
    if (waypoints.length >= 25) {
      // Reached limit - skip remaining waypoints
      break
    }
    const currentRoad = roads[i]
    const currentCoords = currentRoad.linestringGeoJson.coordinates
    if (currentCoords && currentCoords.length > 0) {
      const connectionPoint = currentCoords[currentCoords.length - 1]
      waypoints.push({
        lat: connectionPoint[1], // [lng, lat] format
        lng: connectionPoint[0],
      })
    }
  }

  // Call Google Routes API to generate optimized route
  const apiResponse = await googleRoutesApi.generateRoute(
    origin,
    destination,
    waypoints,
  )

  if (!apiResponse.success || !apiResponse.data) {
    throw new Error(
      apiResponse.message || "Failed to generate route from Google Routes API",
    )
  }

  // Decode polyline to get LineString geometry
  const decodedGeometry = decodePolylineToGeoJSON(
    apiResponse.data.encodedPolyline,
  )

  if (!decodedGeometry || decodedGeometry.type !== "LineString") {
    throw new Error("Failed to decode route polyline")
  }

  // Calculate total distance from all roads (fallback to API distance if not available)
  const totalDistance =
    roads.reduce((sum, road) => sum + (road.distanceKm || 0), 0) ||
    apiResponse.data.distance

  // Get priority from first road (or most common priority)
  const priority = roads[0]?.priority

  // Create PanelRoute
  const route: PanelRoute = {
    id: `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: generateMultiSelectRouteName(roads.length),
    roadIds: roads.map((r) => r.id),
    geometry: decodedGeometry,
    priority,
    distance: totalDistance,
  }

  return route
}
