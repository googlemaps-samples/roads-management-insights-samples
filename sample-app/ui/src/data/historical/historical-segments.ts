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

import { RouteSegment } from "../../types/route-segment"
import { getRouteColor } from "../common"

// Interface for historical data structure (using the actual HistoricalData type)
interface HistoricalDataWithStats {
  stats: {
    routeDelays: RouteSegment[]
  }
  routeColors: Map<string, { color: string; delayRatio: number }>
}

// Interface for processed historical segment
interface ProcessedHistoricalSegment {
  id: string
  routeId: string
  path: (google.maps.LatLng | { lat: number; lng: number })[]
  color: string
  delayTime: number
  delayRatio: number
  staticDuration: number
  duration: number
  delayPercentage: number
}

export const getHistoricalSegments = (
  realtimeRoadSegmentsData: RouteSegment[],
  historicalData: HistoricalDataWithStats,
): ProcessedHistoricalSegment[] => {
  // Early return if historical data is not ready or invalid
  if (
    !historicalData ||
    !historicalData.stats ||
    !historicalData.stats.routeDelays ||
    !historicalData.routeColors ||
    !realtimeRoadSegmentsData
  ) {
    return []
  }

  const result = realtimeRoadSegmentsData.map((segment: RouteSegment) => {
    const routeData = historicalData.routeColors.get(segment.id)
    const historicalRoute = historicalData.stats.routeDelays?.find(
      (route: RouteSegment) =>
        route.routeId === segment.id || route.id === segment.id,
    )

    const { id, routeId, path } = segment

    if (!historicalRoute) {
      // Return grey route for segments without historical data
      return {
        id,
        routeId,
        path,
        color: "#9E9E9E", // Grey color for no historical data
        delayTime: 0,
        delayRatio: 1,
        staticDuration: 0,
        duration: 0,
        delayPercentage: 0,
      } as ProcessedHistoricalSegment
    }

    const color: string = routeData ? routeData.color : getRouteColor(1)
    return {
      id,
      routeId,
      path,
      color,
      delayTime: historicalRoute.delayTime || 0,
      delayRatio: historicalRoute.delayRatio || 1,
      staticDuration: historicalRoute.staticDuration || 0,
      duration: historicalRoute.duration || 0,
      delayPercentage: historicalRoute.delayPercentage || 0,
    } as ProcessedHistoricalSegment
  })
  // Return all segments (no filtering needed now)
  return result
}
