const normalizeLineString = (
  linestring?: GeoJSON.Feature | GeoJSON.LineString | GeoJSON.Polygon | string,
): GeoJSON.LineString | null => {
  if (!linestring) return null

  if (typeof linestring === "string") {
    try {
      const parsed = JSON.parse(linestring)
      return normalizeLineString(parsed)
    } catch (error) {
      console.warn("Failed to parse linestring JSON:", error)
      return null
    }
  }

  if (
    typeof linestring === "object" &&
    "geometry" in linestring &&
    linestring.geometry &&
    (linestring.geometry.type === "LineString" ||
      linestring.geometry.type === "Polygon")
  ) {
    return normalizeLineString(
      linestring.geometry as GeoJSON.LineString | GeoJSON.Polygon,
    )
  }

  if (
    typeof linestring === "object" &&
    (linestring as GeoJSON.LineString).type === "LineString" &&
    Array.isArray((linestring as GeoJSON.LineString).coordinates)
  ) {
    return {
      type: "LineString",
      coordinates: (linestring as GeoJSON.LineString).coordinates,
    }
  }

  return null
}

export const getRoadLineString = <T extends { linestringGeoJson?: any }>(
  road: T,
) => normalizeLineString(road.linestringGeoJson)
