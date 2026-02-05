export interface Polygon {
  id: number
  project_id: number
  boundary_geojson: string // GeoJSON string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface PolygonGeoJSON {
  id: number
  project_id: number
  boundary_geojson: any // Parsed GeoJSON object
  created_at: string
  updated_at: string
  deleted_at?: string
}
