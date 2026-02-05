// API response types
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Route Save API types
export interface RouteSaveRequest {
  uuid: string
  route_name: string
  coordinates: {
    origin: [number, number] // [lng, lat]
    destination: [number, number] // [lng, lat]
    waypoints: [number, number][] // [[lng, lat], ...]
  }
  encoded_polyline: string
  region_id: number
  polygon_id?: number
  existing_road_id?: number
  tag?: string | null
  length?: number // Length in kilometers
  route_type?: string // Route type (e.g., "drawn", "uploaded", "individual")
  original_route_geo_json?: GeoJSON.Feature | GeoJSON.FeatureCollection // Original uploaded route data
  match_percentage?: number // Match/similarity percentage (0-100) - how closely Google's route follows the uploaded route
}

export interface RouteSaveResponse {
  success: boolean
  data: {
    id: number
    uuid: string
    route_name: string
    created_at: string
    updated_at: string
  }
  message: string
}
