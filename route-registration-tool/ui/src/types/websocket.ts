/**
 * WebSocket route update message structure
 */
export interface WebSocketRouteUpdate {
  selected_route_id: string
  display_name: string
  retrieval_time: string
  route_geometry: {
    coordinates: number[][]
    type: "LineString"
  }
  static_duration_in_seconds: number
  current_duration_in_seconds: number
  speed_reading_intervals: "NORMAL" | "SLOW" | "TRAFFIC_JAM"
}

/**
 * WebSocket route status update message structure
 */
export interface WebSocketRouteStatusUpdate {
  route_id: string
  sync_status: "unsynced" | "validating" | "synced" | "invalid"
  routes_status: string | null
  validation_status: string | null
  updated_at: string
  is_enabled?: boolean // For segment status updates
  parent_route_id?: string | null // To identify if this is a segment
}

/**
 * WebSocket batch message wrapper
 */
export interface WebSocketMessage {
  batch?: WebSocketRouteUpdate[]
  type?: "route_status_update"
  data?: WebSocketRouteStatusUpdate
  status?: string // Connection status message
  warning?: string // Warning message (e.g., Pub/Sub failed)
  error?: string // Error message
}

/**
 * WebSocket initial connection message
 */
export interface WebSocketInitialMessage {
  project_id: string
  project_number: number
}

/**
 * WebSocket connection state
 */
export type WebSocketConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
