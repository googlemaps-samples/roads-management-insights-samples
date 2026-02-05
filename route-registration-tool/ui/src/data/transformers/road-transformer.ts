import { Road } from "../../stores/project-workspace-store"

export const transformRoad = (dbRoad: any): Road => {
  try {
    return {
      id: dbRoad?.id?.toString(),
      routeId: dbRoad.route_id.toString(),
      name: dbRoad.name,
      linestringGeoJson:
        typeof dbRoad.linestring_geojson === "string"
          ? JSON.parse(dbRoad.linestring_geojson)
          : dbRoad.linestring_geojson,
      segmentOrder: dbRoad.segment_order,
      distanceKm: dbRoad.distance_km,
      createdAt: dbRoad.created_at,
    }
  } catch (error) {
    console.error("Error transforming road:", error, dbRoad)
    return {
      id: dbRoad?.id?.toString() || "unknown",
      routeId: dbRoad.route_id?.toString() || "unknown",
      name: dbRoad.name || "Unknown Road",
      linestringGeoJson: { type: "LineString", coordinates: [] },
      segmentOrder: dbRoad.segment_order || 0,
      distanceKm: dbRoad.distance_km || 0,
      createdAt: dbRoad.created_at || new Date().toISOString(),
    }
  }
}
