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

import { City } from "../../../types/city"
import { CustomTimeFilters, LastWeekMonthFilters } from "../../../types/filters"
import { isDemoMode } from "../../../utils"
import { getHistoricalRouteIds } from "../fetcher"
import { createTimezoneAwareFilters, filterRecord } from "../filter"
import { getHourFromISOString, getHourFromTimeString } from "../helper"

// Interface for historical data records (matching the existing Record interface)
interface HistoricalRecord {
  selected_route_id: string
  record_time: string
  duration_in_seconds: number
  static_duration_in_seconds: number
}

// Interface for hourly congestion data
export interface HourlyCongestionData {
  hour: number
  congestionLevel: number // Can exceed 100% for severe congestion
  avgDelayRatio: number
  avgCurrentDuration: number
  avgStaticDuration: number
  recordCount: number
  allRouteIdsSet: Set<string>
  selectedDay: string
  selectedTimePeriod: string
  selectedHourRange: [number, number]
  startDate: Date
  endDate: Date
  selectedCity: string
}

export interface HourlyCongestionResultData {
  congestionLevel: number
  avgDelayRatio: number
  avgCurrentDuration: number
  avgStaticDuration: number
  recordCount: number
  hour: number
  averageDelay: number
}

/**
 * Get hourly-based congestion data for a specific route
 * @param routeId - The route ID to analyze
 * @param selectedLocation - The location (Paris/Tokyo)
 * @param selectedDay - Optional day filter (Sun, Mon, Tue, etc.)
 * @param selectedTimePeriod - Optional time period filter (last-week, last-month, custom)
 * @param selectedHourRange - Optional hour range filter [startHour, endHour]
 * @param startDate - Optional custom start date
 * @param endDate - Optional custom end date
 * @returns Promise<HourlyCongestionData[]> - Array of hourly data for 24 hours
 */
export const getRouteHourlyCongestion = async ({
  routeId,
  selectedCity,
  timeFilters,
  rawHistoricalData,
}: {
  routeId: string
  selectedCity: City
  timeFilters: LastWeekMonthFilters | CustomTimeFilters
  rawHistoricalData: HistoricalRecord[]
}): Promise<HourlyCongestionResultData[]> => {
  try {
    const demoMode = isDemoMode()
    // Get historical data for the location
    const data = rawHistoricalData
    const allRouteIdsSet = getHistoricalRouteIds(selectedCity.id)

    if (!data || data.length === 0) {
      console.warn(
        `No historical data found for location: ${selectedCity.name}`,
      )
      return []
    }

    // Filter records for the specific route
    const routeData = data.filter(
      (record: HistoricalRecord) => record.selected_route_id === routeId,
    )

    if (routeData.length === 0) {
      console.warn(`No data found for route: ${routeId}`)
      return []
    }

    // Initialize hourly data structure
    const hourlyData = new Map<
      number,
      {
        totalDelayRatio: number
        totalCurrentDuration: number
        totalStaticDuration: number
        count: number
        averageDelay: number
      }
    >()

    // Initialize all 24 hours
    for (let hour = 0; hour < 24; hour++) {
      hourlyData.set(hour, {
        totalDelayRatio: 0,
        totalCurrentDuration: 0,
        totalStaticDuration: 0,
        count: 0,
        averageDelay: 0,
      })
    }

    // Pre-calculate timezone-aware filters for optimal performance
    const timezoneFilters = createTimezoneAwareFilters(
      timeFilters,
      selectedCity,
    )

    // Process filtered data and aggregate by hour
    routeData
      .filter((record) =>
        filterRecord(record, allRouteIdsSet, timeFilters, timezoneFilters),
      )
      .forEach((record: HistoricalRecord) => {
        // Extract hour based on data format (demo vs non-demo mode)
        let hour: number
        try {
          hour = demoMode
            ? getHourFromISOString(record.record_time)
            : getHourFromTimeString(record.record_time)
        } catch (error) {
          console.warn(
            `Failed to parse date for record: ${record.record_time}`,
            error,
          )
          return
        }
        const duration =
          typeof record.duration_in_seconds === "string"
            ? parseFloat(record.duration_in_seconds)
            : record.duration_in_seconds
        const staticDuration =
          typeof record.static_duration_in_seconds === "string"
            ? parseFloat(record.static_duration_in_seconds)
            : record.static_duration_in_seconds

        if (isNaN(duration) || isNaN(staticDuration) || staticDuration <= 0)
          return

        const delayRatio = Math.max(1, duration / staticDuration)
        const hourData = hourlyData.get(hour)!

        hourData.totalDelayRatio += delayRatio
        hourData.totalCurrentDuration += duration
        hourData.totalStaticDuration += staticDuration
        hourData.count += 1
      })

    // Convert to array format and calculate averages
    const result: HourlyCongestionResultData[] = []

    for (let hour = 0; hour < 24; hour++) {
      const data = hourlyData.get(hour)!

      if (data.count > 0) {
        const avgDelayRatio = data.totalDelayRatio / data.count
        const avgCurrentDuration = data.totalCurrentDuration / data.count
        const avgStaticDuration = data.totalStaticDuration / data.count
        const congestionLevel = Math.max(0, (avgDelayRatio - 1) * 100)
        const averageDelay = avgCurrentDuration - avgStaticDuration

        result.push({
          hour,
          congestionLevel,
          avgDelayRatio,
          avgCurrentDuration,
          avgStaticDuration,
          recordCount: data.count,
          averageDelay: averageDelay,
        })
      } else {
        // Include hours with no data (zero values)
        result.push({
          hour,
          congestionLevel: 0,
          avgDelayRatio: 1,
          avgCurrentDuration: 0,
          avgStaticDuration: 0,
          recordCount: 0,
          averageDelay: 0,
        })
      }
    }

    return result
  } catch (error) {
    console.error(
      `Error getting hourly congestion for route ${routeId}:`,
      error,
    )
    return []
  }
}
