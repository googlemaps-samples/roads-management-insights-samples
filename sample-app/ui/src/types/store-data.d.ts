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

import type { FeatureCollection } from "geojson"

import type { UnifiedHistoricalData } from "../data/historical/data"
import type { RouteAlert } from "../data/realtime/identify-high-delay-routes"
import type { RouteSegment } from "./route-segment"

// Re-export RouteMetricsData from historical data
export type { RouteMetricsData } from "../data/historical/data"

// Realtime data structure
export interface RealtimeData {
  rawData: FeatureCollection
  roadSegments: RouteSegment[]
  alerts: RouteAlert[]
  lastUpdated: Date
}

// Historical data structure
export interface HistoricalData {
  data: UnifiedHistoricalData
  routeColors: Map<string, { color: string; delayRatio: number }>
  stats: {
    routeDelays: RouteSegment[]
    congestionLevel: number
    averageStats: {
      congestionLevel: number
      peakCongestionHourRange: string
      bestTimeRange: string
      averageDuration: number
      averageStaticDuration: number
    }
  }
}

// Average travel time data structure
export interface AverageTravelTimeData {
  routeHourlyAverages: Map<string, Map<number, number>>
  hourlyTotalAverages: Map<number, { totalDuration: number; count: number }>
}

// Map data structure
export interface MapData {
  features: FeatureCollection
  bounds?: google.maps.LatLngBounds
  center?: google.maps.LatLng
  zoom?: number
}

// Polygon stats data structure
export interface PolygonStatsData {
  [polygonId: string]: {
    name: string
    congestionLevel: number
    averageDuration: number
    routeCount: number
    lastUpdated: Date
  }
}

// Query state data types
export interface QueryData {
  allHistoricalData: HistoricalData | null
  realtimeData: RealtimeData | null
  filteredHistoricalData: HistoricalData | null
  urbanCongestionData: UnifiedHistoricalData | null
  rawHistoricalData: FeatureCollection | null
  averageTravelTime: AverageTravelTimeData | null
  routeMetrics: RouteMetricsData | null
}

// Fetched for information
export interface FetchedForInfo {
  cityId: string
  timePeriod?: string
  startDate?: string
  endDate?: string
  days?: string[]
}
