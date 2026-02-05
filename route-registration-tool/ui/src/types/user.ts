// User preferences types
export type DistanceUnit = "km" | "miles"
export type RouteColorMode = "sync_status" | "traffic_status"

export interface UserPreferences {
  id: number
  distanceUnit: DistanceUnit
  googleCloudAccount: string | null
  show_tooltip: boolean
  show_instructions: boolean
  route_color_mode: RouteColorMode
  createdAt?: string
  updatedAt?: string
}

export interface UserPreferencesUpdate {
  distanceUnit?: DistanceUnit
  googleCloudAccount?: string | null
  show_tooltip?: boolean
  show_instructions?: boolean
  route_color_mode?: RouteColorMode
}

// Viewport type for map viewstate
export interface Viewport {
  center: {
    lat: number
    lng: number
  }
  zoom: number
}
