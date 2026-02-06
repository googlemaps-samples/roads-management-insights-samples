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
