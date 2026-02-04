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

import { useQuery } from "@tanstack/react-query"

import {
  type HourlyCongestionResultData,
  getRouteHourlyCongestion,
} from "../data/historical/graph/hourly-stats"
import { useAppStore } from "../store"
import { City } from "../types/city"
import { CustomTimeFilters, LastWeekMonthFilters } from "../types/filters"

// Interface for historical data records (matching the hourly-stats interface)
interface HistoricalRecord {
  selected_route_id: string
  record_time: string
  duration_in_seconds: number
  static_duration_in_seconds: number
}

// Use the imported type from hourly-stats
type CongestionData = HourlyCongestionResultData

interface ChartData {
  data: number[]
  labels: string[]
  title: string
}

interface UseGraphDataParams {
  selectedCity: City | null
  selectedRouteSegment: string | null
  timeFilters: LastWeekMonthFilters | CustomTimeFilters
  enabled?: boolean
}

// Generate chart data from hourly congestion data
const generateRouteCongestionData = (
  congestionData: CongestionData[],
  selectedRouteSegment: string,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
): ChartData => {
  // Filter data based on selected hour range
  let filteredData = congestionData
  if (timeFilters.hourRange && timeFilters.hourRange.length === 2) {
    const [startHour, endHour] = timeFilters.hourRange
    filteredData = congestionData.filter((data) => {
      if (startHour > endHour) {
        // Handle case where range crosses midnight (e.g., 22-6)
        // Exclude 12 AM (hour 0) when endHour is 0 to avoid showing data till 12 AM
        if (endHour === 0) {
          return data.hour >= startHour && data.hour < 24
        }
        return data.hour >= startHour || data.hour <= endHour
      } else {
        return data.hour >= startHour && data.hour <= endHour
      }
    })
  }

  // Generate labels for x-axis (hours)
  const labels = filteredData.map((data) => {
    const hour = data.hour
    const ampm = hour >= 12 ? "PM" : "AM"
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${displayHour} ${ampm}`
  })

  // Generate data for y-axis (congestion levels)
  const data = filteredData.map((data) => data.averageDelay)

  return {
    data,
    labels,
    title: `Hourly Congestion for Route ${selectedRouteSegment}`,
  }
}

export const useGraphData = ({
  selectedCity,
  selectedRouteSegment,
  timeFilters,
  enabled = true,
}: UseGraphDataParams) => {
  const { data: rawHistoricalData, status: rawHistoricalDataStatus } =
    useAppStore((state) => state.queries.rawHistoricalData)
  return useQuery({
    queryKey: [
      "routeHourlyCongestion",
      selectedCity?.id,
      timeFilters,
      selectedRouteSegment,
    ],
    queryFn: async (): Promise<ChartData | null> => {
      if (
        !selectedRouteSegment ||
        !selectedCity ||
        !rawHistoricalData ||
        rawHistoricalDataStatus !== "success"
      ) {
        return null
      }

      try {
        const congestionData = await getRouteHourlyCongestion({
          routeId: selectedRouteSegment,
          selectedCity: selectedCity,
          timeFilters,
          rawHistoricalData: rawHistoricalData as unknown as HistoricalRecord[],
        })
        return generateRouteCongestionData(
          congestionData,
          selectedRouteSegment,
          timeFilters,
        )
      } catch (error) {
        console.error("Error getting historical data:", error)
        throw error
      }
    },
    enabled:
      enabled &&
      !!selectedRouteSegment &&
      !!selectedCity &&
      !!rawHistoricalData,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}
