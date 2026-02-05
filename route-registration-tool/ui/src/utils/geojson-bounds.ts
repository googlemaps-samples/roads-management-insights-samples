/**
 * Utility to calculate bounding box for GeoJSON geometries
 */

/**
 * Calculate the bounding box for a GeoJSON FeatureCollection
 * Returns [minLng, minLat, maxLng, maxLat]
 */
export function calculateGeoJsonBounds(
  featureCollection: GeoJSON.FeatureCollection,
): [number, number, number, number] | null {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  let hasCoordinates = false

  const processCoordinate = (coord: number[]) => {
    const [lng, lat] = coord
    if (typeof lng === "number" && typeof lat === "number") {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
      hasCoordinates = true
    }
  }

  const processGeometry = (geometry: GeoJSON.Geometry) => {
    switch (geometry.type) {
      case "Point":
        processCoordinate(geometry.coordinates)
        break

      case "LineString":
        geometry.coordinates.forEach(processCoordinate)
        break

      case "Polygon":
        geometry.coordinates.forEach((ring) => {
          ring.forEach(processCoordinate)
        })
        break

      case "MultiPoint":
        geometry.coordinates.forEach(processCoordinate)
        break

      case "MultiLineString":
        geometry.coordinates.forEach((line) => {
          line.forEach(processCoordinate)
        })
        break

      case "MultiPolygon":
        geometry.coordinates.forEach((polygon) => {
          polygon.forEach((ring) => {
            ring.forEach(processCoordinate)
          })
        })
        break

      case "GeometryCollection":
        geometry.geometries.forEach(processGeometry)
        break
    }
  }

  featureCollection.features.forEach((feature) => {
    if (feature.geometry) {
      processGeometry(feature.geometry)
    }
  })

  if (!hasCoordinates) {
    return null
  }

  return [minLng, minLat, maxLng, maxLat]
}

