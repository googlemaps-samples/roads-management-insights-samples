// API transformation utilities
import { Region, RegionApiResponse } from "../types/region"
import { Viewport } from "../types/user"

export function transformRegionFromApi(apiRegion: RegionApiResponse): Region {
  try {
    const geoJson = JSON.parse(
      apiRegion.geojson || '{"type":"FeatureCollection","features":[]}',
    )

    // Extract polygon from GeoJSON FeatureCollection if it exists
    let boundaryPolygon: GeoJSON.Polygon
    if (geoJson.type === "FeatureCollection" && geoJson.features?.length > 0) {
      boundaryPolygon = geoJson.features[0].geometry as GeoJSON.Polygon
    } else if (geoJson.type === "Polygon") {
      boundaryPolygon = geoJson as GeoJSON.Polygon
    } else {
      // Fallback to empty polygon
      boundaryPolygon = {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
          ],
        ],
      }
    }

    // Parse viewstate if present
    let viewstate: Viewport | undefined
    if (apiRegion.viewstate) {
      try {
        viewstate =
          typeof apiRegion.viewstate === "string"
            ? JSON.parse(apiRegion.viewstate)
            : apiRegion.viewstate
      } catch (e) {
        console.warn("Failed to parse viewstate:", e)
      }
    }

    // Use new GCP columns directly instead of parsing big_query_config
    return {
      id: apiRegion.id.toString(),
      name: apiRegion.region_name,
      routeCount: 0, // Default value - can be updated later
      boundaryGeoJson: boundaryPolygon,
      googleBigQueryConfig: {
        projectId: apiRegion.google_cloud_project_id || "",
        datasetId: "", // Not available in new schema
        tableId: "", // Not available in new schema
        credentials: undefined, // Not available in new schema
      },
      viewstate,
      createdAt: apiRegion.created_at,
      updatedAt: apiRegion.updated_at,
    }
  } catch (error) {
    console.error("Error transforming region from API:", error, apiRegion)
    // Return a fallback region with safe defaults
    return {
      id: apiRegion.id.toString(),
      name: apiRegion.region_name || "Unknown Region",
      routeCount: 0,
      boundaryGeoJson: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
          ],
        ],
      },
      googleBigQueryConfig: {
        projectId: "",
        datasetId: "",
        tableId: "",
      },
      createdAt: apiRegion.created_at,
      updatedAt: apiRegion.updated_at,
    }
  }
}

// API base URL
export const API_BASE_URL = import.meta.env.PROD ? "" : "http://localhost:8000"

// Google Maps API key - uses env variable in dev, server-injected key in production
export const getGoogleMapsApiKey = (): string => {
  // In development mode, use Vite environment variable
  if (import.meta.env.DEV && import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  }
  // In production, check window variable (injected server-side)
  if (typeof window !== "undefined" && window.GOOGLE_API_KEY) {
    return window.GOOGLE_API_KEY
  }
  // Fallback to empty string if not available
  return ""
}
