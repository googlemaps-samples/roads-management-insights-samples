// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
