import { Viewport } from "./user"

// API Response types (raw from backend)
export interface RegionApiResponse {
  id: number
  region_name: string
  google_cloud_project_id?: string
  google_cloud_project_number?: string
  subscription_id?: string
  geojson: string // JSON stringified GeoJSON
  viewstate?: string // JSON stringified viewstate
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// Updated types to handle FeatureCollection structure
export interface Region {
  id: string
  name: string
  routeCount: number
  boundaryGeoJson:
    | GeoJSON.FeatureCollection
    | GeoJSON.Polygon
    | GeoJSON.MultiPolygon
  googleBigQueryConfig: BigQueryConfig
  viewstate?: Viewport
  createdAt: string
  updatedAt: string
}

export interface BigQueryConfig {
  projectId: string
  datasetId: string
  tableId: string
  credentials?: Record<string, unknown>
}

export interface CreateRegionRequest {
  name: string
  boundaryGeoJson: GeoJSON.Polygon
  googleBigQueryConfig: BigQueryConfig
}

export interface UpdateRegionRequest {
  name?: string
  boundaryGeoJson?: GeoJSON.Polygon
  googleBigQueryConfig?: BigQueryConfig
}
