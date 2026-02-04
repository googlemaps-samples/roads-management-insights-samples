// Copyright 2025 Google LLC
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

export interface RouteSegment {
  id: string
  path: (google.maps.LatLng | { lat: number; lng: number })[]
  color?: string
  duration?: number
  staticDuration?: number
  name?: string
  type?: string
  congestionLevel?: string
  historicalRouteId?: string
  length: number
  // Additional properties for real-time data
  averageSpeed?: number
  routeId?: string
  avgStaticDuration?: number
  delayScore?: number
  delayTime?: number
  delayRatio?: number
  delayPercentage?: number
  [key: string]: unknown
}

export type RouteMetrics = {
  routeId: string
  duration: number
  delayRatio: number
  staticDuration: number
  delayTime: number
}
