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
import { City } from "../../types/city"
import { CustomTimeFilters, LastWeekMonthFilters } from "../../types/filters"
import { isDemoMode } from "../../utils"
import { getRouteColor } from "../common/route-color"
import { getAllRouteIdsFromRealtime, getHistoricalRouteIds } from "./fetcher"
import { createTimezoneAwareFilters, filterRecord } from "./filter"
import {
  getDateStringFromISOString,
  getHourFromISOString,
  getHourFromTimeString,
  getHoursToConsider,
} from "./helper"

// Interface for raw historical data records
export interface HistoricalRecord {
  selected_route_id: string
  duration_in_seconds: number | string
  static_duration_in_seconds: number | string
  record_time: string
}

// Helper function to calculate percentiles
const calculatePercentile = (values: number[], percentile: number): number => {
  if (values.length === 0) return 0
  const sortedValues = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1
  return sortedValues[Math.max(0, index)]
}

export interface UnifiedHistoricalData {
  enabledSegments: Set<string>
  stats: {
    congestionLevel: number
    averageStats: {
      congestionLevel: number
      peakCongestionHourRange: string
      bestTimeRange: string
      averageDuration: number
      averageStaticDuration: number
    }
    routeDelays: Array<{
      routeId: string
      delayTime: number
      delayRatio: number
      staticDuration: number
      averageDuration: number
      delayPercentage: number
      count: number
      peakCongestionHourRange: string
      peakCongestionLevel: number
    }>
  }
  routeColors: Map<string, { color: string; delayRatio: number }>
}

// Cached filtering function for better performance
const FilterData = (
  data: HistoricalRecord[],
  allRouteIdsSet: Set<string>,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
  selectedCity: City,
) => {
  // Pre-calculate timezone-aware filters for optimal performance
  const timezoneFilters = createTimezoneAwareFilters(timeFilters, selectedCity)

  return data.filter((record) =>
    filterRecord(record, allRouteIdsSet, timeFilters, timezoneFilters),
  )
}

// This Function is used to get the filtered historical data for the selected location, hour range, day, time period, start date, and end date
// Helper function to find the best consecutive time range with lowest delay ratio
const findBestConsecutiveTimeRange = (
  hoursToConsider: number[],
  hourlyData: Map<number, { totalDelayRatio: number; count: number }>,
  tolerance: number = 1.1,
): { bestTimeRange: string; lowestDelayRatio: number } => {
  if (hoursToConsider.length === 0) {
    return { bestTimeRange: "0-0", lowestDelayRatio: 1 }
  }

  if (hoursToConsider.length === 1) {
    const hour = hoursToConsider[0]
    const hourData = hourlyData.get(hour)
    const delayRatio =
      hourData && hourData.count > 0
        ? hourData.totalDelayRatio / hourData.count
        : 1
    return { bestTimeRange: `${hour}-${hour}`, lowestDelayRatio: delayRatio }
  }

  let bestStartHour = hoursToConsider[0]
  let bestEndHour = hoursToConsider[0]
  let bestRangeDelayRatio = 1000
  let currentStartHour = hoursToConsider[0]
  let currentEndHour = hoursToConsider[0]

  // Get initial delay ratio for first hour
  const firstHourData = hourlyData.get(hoursToConsider[0])
  let currentRangeDelayRatio =
    firstHourData && firstHourData.count > 0
      ? firstHourData.totalDelayRatio / firstHourData.count
      : 1

  for (let i = 1; i < hoursToConsider.length; i++) {
    const currentHour = hoursToConsider[i]
    const currentHourData = hourlyData.get(currentHour)
    const currentHourDelayRatio =
      currentHourData && currentHourData.count > 0
        ? currentHourData.totalDelayRatio / currentHourData.count
        : 1

    // If current hour has similar or better delay ratio, extend the range
    if (currentHourDelayRatio <= currentRangeDelayRatio * tolerance) {
      currentEndHour = currentHour
      // Recalculate average delay ratio for the extended range
      let totalDelayRatio = 0
      let totalCount = 0
      for (let h = currentStartHour; h <= currentEndHour; h++) {
        const hourData = hourlyData.get(h)
        if (hourData && hourData.count > 0) {
          totalDelayRatio += hourData.totalDelayRatio
          totalCount += hourData.count
        }
      }
      currentRangeDelayRatio = totalCount > 0 ? totalDelayRatio / totalCount : 1
    } else {
      // Current range is complete, check if it's better than the best
      if (currentRangeDelayRatio < bestRangeDelayRatio) {
        bestStartHour = currentStartHour
        bestEndHour = currentEndHour
        bestRangeDelayRatio = currentRangeDelayRatio
      }
      // Start a new range
      currentStartHour = currentHour
      currentEndHour = currentHour
      currentRangeDelayRatio = currentHourDelayRatio
    }
  }

  // Check the final range
  if (currentRangeDelayRatio < bestRangeDelayRatio) {
    bestStartHour = currentStartHour
    bestEndHour = currentEndHour
    bestRangeDelayRatio = currentRangeDelayRatio
  }

  return {
    bestTimeRange: `${bestStartHour}-${bestEndHour}`,
    lowestDelayRatio: bestRangeDelayRatio,
  }
}

export const getFilteredHistoricalData = async (
  selectedCity: City,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
  realtimeRoadSegments: GeoJSON.FeatureCollection,
  rawHistoricalData: HistoricalRecord[],
): Promise<UnifiedHistoricalData> => {
  const demoMode = isDemoMode()
  const data = rawHistoricalData

  const enabledSegments = getHistoricalRouteIds(selectedCity.id)
  const { routeIds: allRouteIds } = await getAllRouteIdsFromRealtime(
    selectedCity.id,
    realtimeRoadSegments,
  )

  // Pre-calculate filter conditions to avoid repeated calculations
  const allRouteIdsSet = new Set(allRouteIds) // Convert to Set for O(1) lookup
  const selectedHourRange = timeFilters.hourRange

  // Initialize all data structures
  const routeStats = new Map()
  const hourlyCongestion = new Map()
  const routeHourlyData = new Map()

  // Data structures for speed calculations (similar to generateHistoricalRouteStatsInternal)
  const hourlyDurationTotals = new Map<
    number,
    { totalCurrentDuration: number; totalStaticDuration: number }
  >()

  // Initialize all route stats
  allRouteIds.forEach((routeId) => {
    routeStats.set(routeId, {
      delayTime: 0,
      delayRatio: 1,
      totalDuration: 0,
      totalStaticDuration: 0,
      count: 0,
      totalDelayRatio: 0,
    })

    // Initialize route-specific hourly tracking
    const hourlyMap = new Map()
    for (let hour = 0; hour < 24; hour++) {
      hourlyMap.set(hour, { totalDelayRatio: 0, count: 0 })
    }
    routeHourlyData.set(routeId, hourlyMap)
  })

  // Initialize overall hourly data
  for (let hour = 0; hour < 24; hour++) {
    hourlyCongestion.set(hour, { totalDelayRatio: 0, count: 0 })
    hourlyDurationTotals.set(hour, {
      totalCurrentDuration: 0,
      totalStaticDuration: 0,
    })
  }

  const filteredData = FilterData(
    data,
    allRouteIdsSet,
    timeFilters,
    selectedCity,
  )

  filteredData.forEach((record) => {
    const duration =
      typeof record.duration_in_seconds !== "number"
        ? parseFloat(record.duration_in_seconds)
        : record.duration_in_seconds
    const staticDuration =
      typeof record.static_duration_in_seconds !== "number"
        ? parseFloat(record.static_duration_in_seconds)
        : record.static_duration_in_seconds

    if (
      !duration ||
      !staticDuration ||
      staticDuration <= 0 ||
      isNaN(duration) ||
      isNaN(staticDuration)
    )
      return

    // Use appropriate hour extraction based on data format
    const hour = demoMode
      ? getHourFromISOString(record.record_time)
      : getHourFromTimeString(record.record_time)
    const delayRatio = duration / staticDuration
    const individualDelayTime = duration - staticDuration
    const routeId = record.selected_route_id

    // Update route stats (this will be the overall average for the selected time period)
    const existingStats = routeStats.get(routeId)

    if (existingStats) {
      if (staticDuration > 0) {
        existingStats.totalDuration += duration
        existingStats.totalStaticDuration += staticDuration
        existingStats.totalDelayRatio += delayRatio
        existingStats.delayTime += individualDelayTime
        existingStats.count += 1
        existingStats.delayRatio =
          existingStats.totalDelayRatio / existingStats.count
      }
    }

    // Update overall hourly congestion
    const hourData = hourlyCongestion.get(hour)
    if (hourData && staticDuration > 0) {
      hourData.totalDelayRatio += delayRatio
      hourData.count += 1
    }

    // Update route-specific hourly data
    const routeHourly = routeHourlyData.get(routeId)
    if (routeHourly && staticDuration > 0) {
      const routeHourData = routeHourly.get(hour)
      if (routeHourData) {
        routeHourData.totalDelayRatio += delayRatio
        routeHourData.count += 1
      }
    }

    // Update hourly duration totals for speed calculations
    const hourDurationData = hourlyDurationTotals.get(hour)
    if (hourDurationData) {
      hourDurationData.totalCurrentDuration += duration
      hourDurationData.totalStaticDuration += staticDuration
    }
  })

  const routePeakHours = new Map()

  allRouteIds.forEach((routeId) => {
    const routeHourly = routeHourlyData.get(routeId)
    let hourlyAverageStats = {
      hourRange: "0-1",
      congestionLevel: 0,
      bestTimeRange: "",
    }

    // Use the same hoursToConsider logic as above
    const hoursToConsider = getHoursToConsider(selectedHourRange)

    // For single hour range, use the overall filtered data
    if (hoursToConsider.length === 1) {
      const currentRouteStats = routeStats.get(routeId)
      if (currentRouteStats && currentRouteStats.count > 0) {
        hourlyAverageStats = {
          hourRange: `${hoursToConsider[0]}-${hoursToConsider[0]}`,
          congestionLevel: Math.max(
            0,
            (currentRouteStats.delayRatio - 1) * 100,
          ),
          bestTimeRange: `${hoursToConsider[0]}-${hoursToConsider[0]}`,
        }
      }
    } else if (routeHourly) {
      // For multiple hours, find the peak hour range using hourly data
      const routeHourlyAverages = new Map<number, number>()
      routeHourly.forEach(
        (data: { totalDelayRatio: number; count: number }, hour: number) => {
          if (data.count > 0) {
            routeHourlyAverages.set(hour, data.totalDelayRatio / data.count)
          }
        },
      )

      if (routeHourlyAverages.size > 0) {
        // For multiple hours, find the peak hour range
        let maxHourRange = "0-1"
        let maxRouteCongestionLevel = 0
        let previousCongestionLevelDetail = {
          level: 0,
          startHour: 0,
          endHour: 1,
        }

        let bestHourRange = "0-1"
        let leastRangeRatio = 1000

        for (let i = 0; i <= hoursToConsider.length - 1; i++) {
          const currentHour = hoursToConsider[i]
          const currentCongestionLevel = Math.max(
            0,
            (routeHourlyAverages.get(currentHour) || 1 - 1) * 100,
          )

          const timeRange = () => {
            const nextHour = hoursToConsider[i + 1]
            if (
              previousCongestionLevelDetail.level &&
              previousCongestionLevelDetail.level === currentCongestionLevel
            ) {
              if (i + 1 <= hoursToConsider.length && nextHour) {
                return `${previousCongestionLevelDetail.startHour}-${nextHour}`
              } else {
                return `${previousCongestionLevelDetail.startHour}-${previousCongestionLevelDetail.endHour}`
              }
            }
            if (i + 1 <= hoursToConsider.length && nextHour) {
              return `${currentHour}-${nextHour}`
            }
            return `${hoursToConsider[i - 1]}-${currentHour}`
          }

          const startHour = Number(timeRange().split("-")[0])
          const endHour = Number(timeRange().split("-")[1])

          const currentAvgDelayRatioAtStartHour =
            routeHourlyAverages.get(startHour)
          const currentAvgDelayRatioAtEndHour = routeHourlyAverages.get(endHour)

          let avgTotalDelayRatio = 0
          if (
            currentAvgDelayRatioAtStartHour &&
            currentAvgDelayRatioAtEndHour
          ) {
            avgTotalDelayRatio =
              (currentAvgDelayRatioAtStartHour +
                currentAvgDelayRatioAtEndHour) /
              2
          } else {
            avgTotalDelayRatio =
              currentAvgDelayRatioAtStartHour ||
              currentAvgDelayRatioAtEndHour ||
              1
          }
          const avgCongestionLevel = (avgTotalDelayRatio - 1) * 100

          // Check for peak congestion
          if (avgCongestionLevel > maxRouteCongestionLevel) {
            maxRouteCongestionLevel = avgCongestionLevel
            maxHourRange = timeRange()
          }

          if (avgCongestionLevel < leastRangeRatio) {
            leastRangeRatio = avgCongestionLevel
            bestHourRange = timeRange()
          }
          previousCongestionLevelDetail = {
            level: currentCongestionLevel,
            startHour: Number(timeRange().split("-")[0]),
            endHour: Number(timeRange().split("-")[1]),
          }
        }

        hourlyAverageStats = {
          hourRange: maxHourRange,
          congestionLevel: maxRouteCongestionLevel,
          bestTimeRange: bestHourRange,
        }
      }
    }

    routePeakHours.set(routeId, hourlyAverageStats)
  })

  const routeDelays = Array.from(routeStats.entries())
    .map(([routeId, stats]) => {
      const peakHourData = routePeakHours.get(routeId) || {
        hourRange: "0-1",
        delayRatio: 1,
        congestionLevel: 0,
      }

      const result = {
        routeId,
        delayTime: stats.count > 0 ? stats.delayTime / stats.count : 0,
        delayRatio: stats.count > 0 ? stats.delayRatio : 1,
        staticDuration:
          stats.count > 0 ? stats.totalStaticDuration / stats.count : 0,
        averageDuration:
          stats.count > 0 ? stats.totalDuration / stats.count : 0,
        delayPercentage: stats.count > 0 ? (stats.delayRatio - 1) * 100 : 0,
        count: stats.count,
        peakCongestionHourRange: peakHourData.hourRange,
        peakCongestionLevel: peakHourData.congestionLevel,
        bestTimeRange: peakHourData.bestTimeRange,
      }

      return result
    })
    .sort((a, b) => b.delayTime - a.delayTime)

  const routeColors = new Map()
  routeStats.forEach((stats, routeId) => {
    routeColors.set(routeId, {
      color: getRouteColor(
        stats.totalStaticDuration === 0 ? 0 : stats.delayRatio,
        stats.totalDuration / stats.count -
          stats.totalStaticDuration / stats.count,
      ),
      delayRatio: stats.delayRatio,
    })
  })

  // Calculate congestion level based on hour ranges within selectedHourRange
  // Find the hour range with the highest average delay ratio across all routes
  let maxHourlyCongestionLevel = 0
  let maxHourRange = ""

  let bestTimeRange = ""
  let averageDuration = 0
  let averageStaticDuration = 0

  let totalDuration = 0
  let totalStaticDuration = 0
  let totalCount = 0

  // Determine the hours to consider based on selectedHourRange
  const hoursToConsider = getHoursToConsider(selectedHourRange)

  // Collect all travel times and calculate overall averages
  routeStats.forEach((stats) => {
    if (stats.count > 0) {
      totalDuration += stats.totalDuration
      totalStaticDuration += stats.totalStaticDuration
      totalCount += stats.count
    }
  })

  if (totalCount > 0) {
    averageDuration = totalDuration / totalCount
    averageStaticDuration = totalStaticDuration / totalCount
  }

  // For single hour range, use the overall filtered data
  if (hoursToConsider.length === 1) {
    // Calculate overall average delay ratio from all filtered data
    let totalDelayRatio = 0
    let totalCount = 0

    hourlyCongestion.forEach((data) => {
      if (data.count > 0) {
        totalDelayRatio += data.totalDelayRatio
        totalCount += data.count
      }
    })

    if (totalCount > 0) {
      const overallAvgDelayRatio = totalDelayRatio / totalCount
      maxHourlyCongestionLevel = Math.max(0, (overallAvgDelayRatio - 1) * 100)
      maxHourRange = `${hoursToConsider[0]}-${hoursToConsider[0]}`
    }
  } else {
    // Calculate congestion level for each hour range within the selected range
    for (let i = 0; i < hoursToConsider.length - 1; i++) {
      const currentHour = hoursToConsider[i]
      const nextHour = hoursToConsider[i + 1]

      // Get data for current hour
      const currentHourData = hourlyCongestion.get(currentHour)
      const nextHourData = hourlyCongestion.get(nextHour)

      if (
        currentHourData &&
        currentHourData.count > 0 &&
        nextHourData &&
        nextHourData.count > 0
      ) {
        // Calculate average delay ratio for this hour range
        const currentAvgDelayRatio =
          currentHourData.totalDelayRatio / currentHourData.count
        const nextAvgDelayRatio =
          nextHourData.totalDelayRatio / nextHourData.count
        const rangeAvgDelayRatio =
          (currentAvgDelayRatio + nextAvgDelayRatio) / 2

        const hourlyCongestionLevel = Math.max(
          0,
          (rangeAvgDelayRatio - 1) * 100,
        )

        if (hourlyCongestionLevel > maxHourlyCongestionLevel) {
          maxHourlyCongestionLevel = hourlyCongestionLevel
          maxHourRange = `${currentHour}-${nextHour}`
        }
      }
    }

    // Find the best consecutive time range with lowest delay ratio
    const bestRangeResult = findBestConsecutiveTimeRange(
      hoursToConsider,
      hourlyCongestion,
      1,
    )
    bestTimeRange = bestRangeResult.bestTimeRange
  }
  if (maxHourlyCongestionLevel < 1.1) {
    bestTimeRange = maxHourRange
  }

  const congestionLevel = Math.min(100, maxHourlyCongestionLevel)
  const result = {
    enabledSegments,
    stats: {
      congestionLevel,
      averageStats: {
        congestionLevel: maxHourlyCongestionLevel,
        peakCongestionHourRange: maxHourRange,
        bestTimeRange,
        averageDuration, // Overall average travel time across all routes and hours
        averageStaticDuration, // Overall free flow travel time across all routes and hours
      },
      routeDelays,
    },
    routeColors,
  }

  return result
}

// Helper function to get all occurrences of a specific day between two dates
const getDayOccurrences = (
  startDate: Date,
  endDate: Date,
  dayOfWeek: number,
): Date[] => {
  const occurrences: Date[] = []
  const current = new Date(startDate)

  // Find the first occurrence of the target day
  while (current.getDay() !== dayOfWeek && current <= endDate) {
    current.setDate(current.getDate() + 1)
  }

  // Add all subsequent occurrences
  while (current <= endDate) {
    occurrences.push(new Date(current))
    current.setDate(current.getDate() + 7)
  }

  return occurrences
}

// Interface for the new route metrics calculation result
export interface RouteMetricsData {
  // Network-wide metrics (all routes combined)
  hourlyPlanningTimeIndex: Map<number, number>
  hourlyTravelTimeIndex: Map<number, number>
  hourlyAverageTravelTime: Map<number, number>
  hourlyFreeFlowTime: Map<number, number>
  hourly95thPercentile: Map<number, number>

  // Per-route metrics (for individual route analysis)
  perRouteMetrics?: {
    hourly95thPercentile: Map<string, Map<number, number>> // routeId -> hour -> 95th percentile
    hourlyFreeFlowTime: Map<string, Map<number, number>> // routeId -> hour -> free flow time
  }
}

// Function to calculate average travel time for each hour from all filtered data
export const calculateAverageTravelTimeByHour = async (
  selectedCity: City,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
  realtimeRoadSegments: GeoJSON.FeatureCollection | null,
  rawHistoricalData: HistoricalRecord[],
): Promise<{
  routeHourlyAverages: Map<string, Map<number, number>>
  hourlyTotalAverages: Map<number, { totalDuration: number; count: number }>
}> => {
  const demoMode = isDemoMode()
  const { routeIds: allRouteIds } = await getAllRouteIdsFromRealtime(
    selectedCity.id,
    realtimeRoadSegments,
  )

  const allRouteIdsSet = new Set(allRouteIds)

  const filteredData = FilterData(
    rawHistoricalData,
    allRouteIdsSet,
    { ...timeFilters, hourRange: [0, 23] },
    selectedCity,
  )

  // Get the selected days and hour range from timeFilters
  const selectedDays = timeFilters.days || []
  const hourRange = [0, 23] as [number, number]
  const hoursToConsider = getHoursToConsider(hourRange)

  // Use the FILTERED date range based on time period selection
  // (this function respects time period filters, unlike calculateRouteMetrics)
  let startDate: Date = selectedCity.availableDateRanges.startDate
  let endDate: Date = selectedCity.availableDateRanges.endDate

  // Apply time period filtering to match FilterData logic
  if (timeFilters.timePeriod === "last-week") {
    // Use endDate from availableDateRanges as reference, not current date
    startDate = new Date(
      selectedCity.availableDateRanges.endDate.getTime() -
        7 * 24 * 60 * 60 * 1000,
    )
    startDate.setHours(0, 0, 0, 0)
    endDate = selectedCity.availableDateRanges.endDate
  } else if (timeFilters.timePeriod === "last-month") {
    // Use endDate from availableDateRanges as reference
    startDate = new Date(
      selectedCity.availableDateRanges.endDate.getTime() -
        30 * 24 * 60 * 60 * 1000,
    )
    startDate.setHours(0, 0, 0, 0)
    endDate = selectedCity.availableDateRanges.endDate
  } else if (timeFilters.timePeriod === "last-week-to-last-week") {
    // Two weeks ago to one week ago
    startDate = new Date(
      selectedCity.availableDateRanges.endDate.getTime() -
        14 * 24 * 60 * 60 * 1000,
    )
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(
      selectedCity.availableDateRanges.endDate.getTime() -
        7 * 24 * 60 * 60 * 1000,
    )
    endDate.setHours(23, 59, 59, 999)
  } else if (timeFilters.timePeriod === "custom") {
    // CustomTimeFilters type has startDate and endDate
    const customFilters = timeFilters as CustomTimeFilters
    startDate = customFilters.startDate
    endDate = customFilters.endDate
  }

  // Convert day names to day of week numbers
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const dayOfWeeks = selectedDays
    .map((day) =>
      dayNames.findIndex((d) => d.toLowerCase() === day.toLowerCase()),
    )
    .filter((index) => index !== -1)

  if (dayOfWeeks.length === 0) {
    const routeHourlyAverages = new Map<string, Map<number, number>>()
    const hourlyTotalAverages = new Map<
      number,
      { totalDuration: number; count: number }
    >()

    // Initialize with zeros
    allRouteIds.forEach((routeId) => {
      routeHourlyAverages.set(routeId, new Map<number, number>())
    })

    hoursToConsider.forEach((hour) => {
      hourlyTotalAverages.set(hour, { totalDuration: 0, count: 0 })
    })

    return {
      routeHourlyAverages,
      hourlyTotalAverages,
    }
  }

  // Get all occurrences of the selected days within the date range
  const dayOccurrences = dayOfWeeks.flatMap((dayOfWeek) =>
    getDayOccurrences(startDate, endDate, dayOfWeek),
  )

  // Create a Set of target date strings for faster lookup
  const targetDateStrings = new Set(
    dayOccurrences.map(
      (date) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    ),
  )

  // Pre-parse and filter all valid records in a single pass
  const validRecords: Array<{
    hour: number
    dateString: string
    routeId: string
    duration: number
  }> = []

  for (const record of filteredData) {
    // Early validation checks
    if (!allRouteIdsSet.has(record.selected_route_id)) continue

    // Parse both duration and static_duration
    // We need to validate BOTH to match the logic in getFilteredHistoricalData
    // Routes without static_duration are invalid/incomplete routes
    const duration =
      typeof record.duration_in_seconds === "string"
        ? parseFloat(record.duration_in_seconds)
        : record.duration_in_seconds

    const staticDuration =
      typeof record.static_duration_in_seconds === "string"
        ? parseFloat(record.static_duration_in_seconds)
        : record.static_duration_in_seconds

    // Validate both duration and static_duration (must match getFilteredHistoricalData logic)
    if (
      !duration ||
      !staticDuration ||
      staticDuration <= 0 ||
      isNaN(duration) ||
      isNaN(staticDuration)
    ) {
      continue
    }

    // Extract hour and date string
    try {
      const recordHour = demoMode
        ? getHourFromISOString(record.record_time)
        : getHourFromTimeString(record.record_time)

      // Extract date string directly from ISO string to avoid timezone conversion issues
      const dateString = demoMode
        ? getDateStringFromISOString(record.record_time)
        : (() => {
            const recordDate = new Date(record.record_time)
            return `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, "0")}-${String(recordDate.getDate()).padStart(2, "0")}`
          })()

      // Check if this record matches our target dates and hours
      if (
        targetDateStrings.has(dateString) &&
        hoursToConsider.includes(recordHour)
      ) {
        validRecords.push({
          hour: recordHour,
          dateString,
          routeId: record.selected_route_id,
          duration,
        })
      }
    } catch {
      // Skip invalid records
      continue
    }
  }

  // Group records by hour -> date -> route, then aggregate per route
  const hourlyRouteData = new Map<
    number,
    Map<string, Map<string, { totalDuration: number; count: number }>>
  >()

  for (const record of validRecords) {
    if (!hourlyRouteData.has(record.hour)) {
      hourlyRouteData.set(record.hour, new Map())
    }

    const hourData = hourlyRouteData.get(record.hour)!
    if (!hourData.has(record.dateString)) {
      hourData.set(record.dateString, new Map())
    }

    const dateData = hourData.get(record.dateString)!
    if (!dateData.has(record.routeId)) {
      dateData.set(record.routeId, { totalDuration: 0, count: 0 })
    }

    const routeData = dateData.get(record.routeId)!
    routeData.totalDuration += record.duration
    routeData.count += 1
  }

  // Calculate per-route averages for each hour (averaged across dates)
  const routeHourlyAverages = new Map<string, Map<number, number>>()

  // Calculate average for each route-hour across all dates
  for (const [hour, dateMap] of hourlyRouteData) {
    const routeDurations = new Map<string, number[]>()

    for (const [, routeMap] of dateMap) {
      for (const [routeId, routeData] of routeMap) {
        const avgDuration = routeData.totalDuration / routeData.count

        if (!routeDurations.has(routeId)) {
          routeDurations.set(routeId, [])
        }
        routeDurations.get(routeId)!.push(avgDuration)
      }
    }

    // Calculate average across all dates for each route
    for (const [routeId, durations] of routeDurations) {
      const avgDuration =
        durations.reduce((sum, d) => sum + d, 0) / durations.length

      // Only create map entry for routes that have data
      if (!routeHourlyAverages.has(routeId)) {
        routeHourlyAverages.set(routeId, new Map<number, number>())
      }
      routeHourlyAverages.get(routeId)!.set(hour, avgDuration)
    }
  }

  // Calculate total network travel time for each hour using same logic as calculateRouteMetrics
  const hourlyData = new Map<number, Map<string, { totalDuration: number }>>()

  for (const [hour, dateMap] of hourlyRouteData) {
    if (!hourlyData.has(hour)) {
      hourlyData.set(hour, new Map())
    }

    const hourData = hourlyData.get(hour)!

    for (const [dateString, routeMap] of dateMap) {
      let dateTotalDuration = 0

      // Sum up all unique routes for this hour-date
      for (const routeData of routeMap.values()) {
        // Average the durations if multiple records exist for the same route
        const avgDuration = routeData.totalDuration / routeData.count
        dateTotalDuration += avgDuration
      }

      hourData.set(dateString, {
        totalDuration: dateTotalDuration,
      })
    }
  }

  // Calculate final metrics for each hour (matching calculateRouteMetrics logic)
  const hourlyTotalAverages = new Map<
    number,
    { totalDuration: number; count: number }
  >()

  for (const hour of hoursToConsider) {
    const hourData = hourlyData.get(hour)

    if (!hourData || hourData.size === 0) {
      // No data for this hour
      hourlyTotalAverages.set(hour, { totalDuration: 0, count: 0 })
      continue
    }

    // Extract travel times
    const travelTimes: number[] = []

    for (const dayData of hourData.values()) {
      if (dayData.totalDuration > 0) {
        travelTimes.push(dayData.totalDuration)
      }
    }

    if (travelTimes.length === 0) {
      hourlyTotalAverages.set(hour, { totalDuration: 0, count: 0 })
      continue
    }

    // Calculate average travel time (matching calculateRouteMetrics logic)
    const averageTravelTime =
      travelTimes.reduce((sum, time) => sum + time, 0) / travelTimes.length

    hourlyTotalAverages.set(hour, {
      totalDuration: averageTravelTime,
      count: travelTimes.length,
    })
  }

  return {
    routeHourlyAverages,
    hourlyTotalAverages,
  }
}

// New function to calculate route metrics based on day-specific filtering
export const calculateRouteMetrics = async (
  selectedCity: City,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
  realtimeRoadSegments: GeoJSON.FeatureCollection | null,
  rawHistoricalData: HistoricalRecord[],
): Promise<RouteMetricsData> => {
  const demoMode = isDemoMode()
  const data = rawHistoricalData
  const { routeIds: allRouteIds } = await getAllRouteIdsFromRealtime(
    selectedCity.id,
    realtimeRoadSegments,
  )
  const allRouteIdsSet = new Set(allRouteIds)

  // Get the selected days and hour range
  let selectedDays = timeFilters.days || []
  const hoursToConsider = getHoursToConsider([0, 23])

  // ALWAYS use the full available date range for calculateRouteMetrics
  // (not filtered by time period, only by selected days)
  const startDate: Date = selectedCity.availableDateRanges.startDate
  const endDate: Date = selectedCity.availableDateRanges.endDate

  // If "all" is selected, expand to all 7 days instead of returning empty
  if (selectedDays.includes("all")) {
    selectedDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  }

  // If no specific days are selected, return empty data
  if (selectedDays.length === 0) {
    return {
      hourlyPlanningTimeIndex: new Map(),
      hourlyTravelTimeIndex: new Map(),
      hourlyAverageTravelTime: new Map(),
      hourlyFreeFlowTime: new Map(),
      hourly95thPercentile: new Map(),
    }
  }

  // Convert day names to day of week numbers
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const dayOfWeeks = selectedDays
    .map((day) =>
      dayNames.findIndex((d) => d.toLowerCase() === day.toLowerCase()),
    )
    .filter((index) => index !== -1)

  if (dayOfWeeks.length === 0) {
    return {
      hourlyPlanningTimeIndex: new Map(),
      hourlyTravelTimeIndex: new Map(),
      hourlyAverageTravelTime: new Map(),
      hourlyFreeFlowTime: new Map(),
      hourly95thPercentile: new Map(),
    }
  }

  // Get all occurrences of the selected days within the date range
  const dayOccurrences = dayOfWeeks.flatMap((dayOfWeek) =>
    getDayOccurrences(startDate, endDate, dayOfWeek),
  )

  // Create a Set of target date strings for faster lookup
  const targetDateStrings = new Set(
    dayOccurrences.map(
      (date) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    ),
  )

  // Pre-parse and filter all valid records in a single pass
  const validRecords: Array<{
    hour: number
    dateString: string
    routeId: string
    duration: number
    staticDuration: number
  }> = []

  for (const record of data) {
    // Early validation checks
    if (!allRouteIdsSet.has(record.selected_route_id)) continue

    // Parse durations once
    const duration =
      typeof record.duration_in_seconds === "string"
        ? parseFloat(record.duration_in_seconds)
        : record.duration_in_seconds
    let staticDuration =
      typeof record.static_duration_in_seconds === "string"
        ? parseFloat(record.static_duration_in_seconds)
        : record.static_duration_in_seconds

    // Fallback: If static_duration is missing or invalid, use duration as free-flow time
    // This allows reliability metrics to be calculated even when free-flow data is missing
    if (isNaN(staticDuration) || staticDuration <= 0) {
      staticDuration = duration
    }

    // Only skip if duration itself is invalid
    if (isNaN(duration) || duration <= 0) continue

    // Extract hour and date string
    try {
      const recordHour = demoMode
        ? getHourFromISOString(record.record_time)
        : getHourFromTimeString(record.record_time)

      // Extract date string directly from ISO string to avoid timezone conversion issues
      const dateString = demoMode
        ? getDateStringFromISOString(record.record_time)
        : (() => {
            const recordDate = new Date(record.record_time)
            return `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, "0")}-${String(recordDate.getDate()).padStart(2, "0")}`
          })()

      // Check if this record matches our target dates and hours
      if (
        targetDateStrings.has(dateString) &&
        hoursToConsider.includes(recordHour)
      ) {
        validRecords.push({
          hour: recordHour,
          dateString,
          routeId: record.selected_route_id,
          duration,
          staticDuration,
        })
      }
    } catch {
      // Skip invalid records
      continue
    }
  }

  // Group records by hour -> date -> route, then aggregate per route
  const hourlyRouteData = new Map<
    number,
    Map<
      string,
      Map<
        string,
        { totalDuration: number; totalStaticDuration: number; count: number }
      >
    >
  >()

  for (const record of validRecords) {
    if (!hourlyRouteData.has(record.hour)) {
      hourlyRouteData.set(record.hour, new Map())
    }

    const hourData = hourlyRouteData.get(record.hour)!
    if (!hourData.has(record.dateString)) {
      hourData.set(record.dateString, new Map())
    }

    const dateData = hourData.get(record.dateString)!
    if (!dateData.has(record.routeId)) {
      dateData.set(record.routeId, {
        totalDuration: 0,
        totalStaticDuration: 0,
        count: 0,
      })
    }

    const routeData = dateData.get(record.routeId)!
    routeData.totalDuration += record.duration
    routeData.totalStaticDuration += record.staticDuration
    routeData.count += 1
  }

  // Now aggregate unique routes per hour-date to get total network travel time
  const hourlyData = new Map<
    number,
    Map<string, { totalDuration: number; totalStaticDuration: number }>
  >()

  for (const [hour, dateMap] of hourlyRouteData) {
    if (!hourlyData.has(hour)) {
      hourlyData.set(hour, new Map())
    }

    const hourData = hourlyData.get(hour)!

    for (const [dateString, routeMap] of dateMap) {
      let dateTotalDuration = 0
      let dateTotalStaticDuration = 0

      // Sum up all unique routes for this hour-date
      for (const routeData of routeMap.values()) {
        // Average the durations if multiple records exist for the same route
        const avgDuration = routeData.totalDuration / routeData.count
        const avgStaticDuration =
          routeData.totalStaticDuration / routeData.count

        dateTotalDuration += avgDuration
        dateTotalStaticDuration += avgStaticDuration
      }

      hourData.set(dateString, {
        totalDuration: dateTotalDuration,
        totalStaticDuration: dateTotalStaticDuration,
      })
    }
  }

  // Calculate per-route 95th percentiles and free flow times
  const perRoute95thPercentile = new Map<string, Map<number, number>>()
  const perRouteFreeFlowTime = new Map<string, Map<number, number>>()

  // Initialize maps for each route
  for (const routeId of allRouteIds) {
    perRoute95thPercentile.set(routeId, new Map<number, number>())
    perRouteFreeFlowTime.set(routeId, new Map<number, number>())
  }

  // Calculate per-route metrics for each hour
  for (const [hour, dateMap] of hourlyRouteData) {
    // Collect all travel times per route across all dates for this hour
    const routeTravelTimesMap = new Map<string, number[]>()
    const routeFreeFlowTimesMap = new Map<string, number[]>()

    for (const routeMap of dateMap.values()) {
      for (const [routeId, routeData] of routeMap) {
        if (!routeTravelTimesMap.has(routeId)) {
          routeTravelTimesMap.set(routeId, [])
          routeFreeFlowTimesMap.set(routeId, [])
        }
        // Average per date for this route
        const avgDuration = routeData.totalDuration / routeData.count
        const avgStaticDuration =
          routeData.totalStaticDuration / routeData.count

        routeTravelTimesMap.get(routeId)!.push(avgDuration)
        routeFreeFlowTimesMap.get(routeId)!.push(avgStaticDuration)
      }
    }

    // Calculate 95th percentile for each route
    for (const [routeId, travelTimes] of routeTravelTimesMap) {
      if (travelTimes.length > 0) {
        const sortedTravelTimes = [...travelTimes].sort((a, b) => a - b)
        const percentile95 = calculatePercentile(sortedTravelTimes, 95)
        perRoute95thPercentile.get(routeId)!.set(hour, percentile95)

        // Calculate average free flow time for this route
        const freeFlowTimes = routeFreeFlowTimesMap.get(routeId) || []
        const avgFreeFlow =
          freeFlowTimes.reduce((sum, t) => sum + t, 0) / freeFlowTimes.length
        perRouteFreeFlowTime.get(routeId)!.set(hour, avgFreeFlow)
      }
    }
  }

  // Calculate final network-wide metrics for each hour
  const hourlyPlanningTimeIndex = new Map<number, number>()
  const hourlyTravelTimeIndex = new Map<number, number>()
  const hourlyAverageTravelTime = new Map<number, number>()
  const hourlyFreeFlowTime = new Map<number, number>()
  const hourly95thPercentile = new Map<number, number>()

  for (const hour of hoursToConsider) {
    const hourData = hourlyData.get(hour)

    if (!hourData || hourData.size === 0) {
      // No data for this hour
      hourlyPlanningTimeIndex.set(hour, 0)
      hourlyTravelTimeIndex.set(hour, 0)
      hourlyAverageTravelTime.set(hour, 0)
      hourlyFreeFlowTime.set(hour, 0)
      hourly95thPercentile.set(hour, 0)
      continue
    }

    // Extract travel times and free flow times
    const travelTimes: number[] = []
    const freeFlowTimes: number[] = []

    for (const dayData of hourData.values()) {
      if (dayData.totalDuration > 0 && dayData.totalStaticDuration > 0) {
        travelTimes.push(dayData.totalDuration)
        freeFlowTimes.push(dayData.totalStaticDuration)
      }
    }

    if (travelTimes.length === 0 || freeFlowTimes.length === 0) {
      hourlyPlanningTimeIndex.set(hour, 0)
      hourlyTravelTimeIndex.set(hour, 0)
      hourlyAverageTravelTime.set(hour, 0)
      hourlyFreeFlowTime.set(hour, 0)
      hourly95thPercentile.set(hour, 0)
      continue
    }

    // Calculate 95th percentile
    const sortedTravelTimes = [...travelTimes].sort((a, b) => a - b)
    const hour95thPercentileValue = calculatePercentile(sortedTravelTimes, 95)

    // Calculate averages
    const averageTravelTime =
      travelTimes.reduce((sum, time) => sum + time, 0) / travelTimes.length
    const averageFreeFlowTime =
      freeFlowTimes.reduce((sum, time) => sum + time, 0) / freeFlowTimes.length

    // Calculate indices
    const planningTimeIndex = hour95thPercentileValue / averageFreeFlowTime
    const travelTimeIndex = averageTravelTime / averageFreeFlowTime

    // Store results
    hourlyPlanningTimeIndex.set(hour, planningTimeIndex)
    hourlyTravelTimeIndex.set(hour, travelTimeIndex < 1 ? 1 : travelTimeIndex)
    hourlyAverageTravelTime.set(hour, averageTravelTime)
    hourlyFreeFlowTime.set(hour, averageFreeFlowTime)
    hourly95thPercentile.set(hour, hour95thPercentileValue)
  }

  return {
    hourlyPlanningTimeIndex,
    hourlyTravelTimeIndex,
    hourlyAverageTravelTime,
    hourlyFreeFlowTime,
    hourly95thPercentile,
    perRouteMetrics: {
      hourly95thPercentile: perRoute95thPercentile,
      hourlyFreeFlowTime: perRouteFreeFlowTime,
    },
  }
}

// New interface for route-specific metrics
export interface RouteSpecificMetricsData {
  routeId: string
  hourlyPlanningTimeIndex: Map<number, number>
  hourlyTravelTimeIndex: Map<number, number>
  hourlyAverageTravelTime: Map<number, number>
  hourlyFreeFlowTime: Map<number, number>
  hourly95thPercentile: Map<number, number>
  totalRecords: number
  averageDelayRatio: number
  peakCongestionHour: number
  peakCongestionLevel: number
}

// Function to calculate metrics for a specific route on hourly basis
export const calculateRouteSpecificMetrics = async (
  selectedCity: City,
  days: string[],
  routeId: string,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
  rawHistoricalData: HistoricalRecord[],
  realtimeRoadSegments: GeoJSON.FeatureCollection | null,
): Promise<RouteSpecificMetricsData> => {
  const demoMode = isDemoMode()
  const { routeIds: allRouteIds, routeIdsStaticDuration } =
    await getAllRouteIdsFromRealtime(selectedCity.id, realtimeRoadSegments)
  const allRouteIdsSet = new Set(allRouteIds)

  // Get the selected days and hour range
  const selectedDays = days || []
  const hoursToConsider = getHoursToConsider([0, 23])
  // Always fetch data for all 24 hours - hourRange is only a display filter
  const dataFetchFilters = {
    ...timeFilters,
    hourRange: [0, 23] as [number, number],
  }
  const filteredData = FilterData(
    rawHistoricalData,
    allRouteIdsSet,
    dataFetchFilters,
    selectedCity,
  )

  // If no specific days are selected, return empty data
  if (selectedDays.length === 0 || selectedDays.includes("all")) {
    return {
      routeId,
      hourlyPlanningTimeIndex: new Map(),
      hourlyTravelTimeIndex: new Map(),
      hourlyAverageTravelTime: new Map(),
      hourlyFreeFlowTime: new Map(),
      hourly95thPercentile: new Map(),
      totalRecords: 0,
      averageDelayRatio: 0,
      peakCongestionHour: 0,
      peakCongestionLevel: 0,
    }
  }

  // Convert day names to day of week numbers
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const dayOfWeeks = selectedDays
    .map((day) =>
      dayNames.findIndex((d) => d.toLowerCase() === day.toLowerCase()),
    )
    .filter((index) => index !== -1)

  if (dayOfWeeks.length === 0) {
    return {
      routeId,
      hourlyPlanningTimeIndex: new Map(),
      hourlyTravelTimeIndex: new Map(),
      hourlyAverageTravelTime: new Map(),
      hourlyFreeFlowTime: new Map(),
      hourly95thPercentile: new Map(),
      totalRecords: 0,
      averageDelayRatio: 0,
      peakCongestionHour: 0,
      peakCongestionLevel: 0,
    }
  }

  // Get all occurrences of the selected days within the date range

  // Pre-parse and filter all valid records for this specific route in a single pass
  const validRecords: Array<{
    hour: number
    dateString: string
    duration: number
    staticDuration: number
    delayRatio: number
  }> = []

  for (const record of filteredData) {
    // Early validation checks - filter by route ID first
    if (record.selected_route_id !== routeId) continue

    // Parse durations once
    const duration =
      typeof record.duration_in_seconds === "string"
        ? parseFloat(record.duration_in_seconds)
        : record.duration_in_seconds
    const staticDuration =
      typeof record.static_duration_in_seconds === "string"
        ? parseFloat(record.static_duration_in_seconds)
        : record.static_duration_in_seconds

    const staticDurationInRealtime =
      Number(routeIdsStaticDuration.get(record.selected_route_id)) || 0

    if (
      isNaN(duration) ||
      isNaN(staticDuration) ||
      staticDuration <= 0 ||
      staticDurationInRealtime !== staticDuration
    )
      continue

    // Extract hour and date string
    try {
      const recordHour = demoMode
        ? getHourFromISOString(record.record_time)
        : getHourFromTimeString(record.record_time)

      // Extract date string directly from ISO string to avoid timezone conversion issues
      const dateString = demoMode
        ? getDateStringFromISOString(record.record_time)
        : (() => {
            const recordDate = new Date(record.record_time)
            return `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, "0")}-${String(recordDate.getDate()).padStart(2, "0")}`
          })()

      // Check if this record matches our target dates and hours
      if (hoursToConsider.includes(recordHour)) {
        validRecords.push({
          hour: recordHour,
          dateString,
          duration,
          staticDuration,
          delayRatio: duration / staticDuration,
        })
      }
    } catch {
      // Skip invalid records
      continue
    }
  }

  // Group records by hour
  const hourlyData = new Map<
    number,
    {
      travelTimes: number[]
      freeFlowTimes: number[]
      delayRatios: number[]
    }
  >()

  for (const record of validRecords) {
    if (!hourlyData.has(record.hour)) {
      hourlyData.set(record.hour, {
        travelTimes: [],
        freeFlowTimes: [],
        delayRatios: [],
      })
    }

    const hourData = hourlyData.get(record.hour)!
    hourData.travelTimes.push(record.duration)
    hourData.freeFlowTimes.push(record.staticDuration)
    hourData.delayRatios.push(record.delayRatio)
  }

  // Calculate metrics for each hour
  const hourlyPlanningTimeIndex = new Map<number, number>()
  const hourlyTravelTimeIndex = new Map<number, number>()
  const hourlyAverageTravelTime = new Map<number, number>()
  const hourlyFreeFlowTime = new Map<number, number>()
  const hourly95thPercentile = new Map<number, number>()

  let totalRecords = 0
  let totalDelayRatio = 0
  let peakCongestionHour = 0
  let peakCongestionLevel = 0

  for (const hour of hoursToConsider) {
    const hourData = hourlyData.get(hour)

    if (!hourData || hourData.travelTimes.length === 0) {
      // No data for this hour
      hourlyPlanningTimeIndex.set(hour, 0)
      hourlyTravelTimeIndex.set(hour, 0)
      hourlyAverageTravelTime.set(hour, 0)
      hourlyFreeFlowTime.set(hour, 0)
      hourly95thPercentile.set(hour, 0)
      continue
    }

    const { travelTimes, freeFlowTimes, delayRatios } = hourData
    totalRecords += travelTimes.length

    // Calculate 95th percentile
    const sortedTravelTimes = [...travelTimes].sort((a, b) => a - b)
    const hour95thPercentileValue = calculatePercentile(sortedTravelTimes, 95)

    // Calculate averages
    const averageTravelTime =
      travelTimes.reduce((sum, time) => sum + time, 0) / travelTimes.length
    const averageFreeFlowTime =
      freeFlowTimes.reduce((sum, time) => sum + time, 0) / freeFlowTimes.length
    const averageDelayRatio =
      delayRatios.reduce((sum, ratio) => sum + ratio, 0) / delayRatios.length

    // Calculate indices
    const planningTimeIndex = hour95thPercentileValue / averageFreeFlowTime
    const travelTimeIndex = averageTravelTime / averageFreeFlowTime

    totalDelayRatio += averageDelayRatio

    // Track peak congestion
    if (averageDelayRatio > peakCongestionLevel) {
      peakCongestionLevel = averageDelayRatio
      peakCongestionHour = hour
    }

    // Store results
    hourlyPlanningTimeIndex.set(hour, planningTimeIndex)
    hourlyTravelTimeIndex.set(hour, travelTimeIndex < 1 ? 1 : travelTimeIndex)
    hourlyAverageTravelTime.set(hour, averageTravelTime)
    hourlyFreeFlowTime.set(hour, averageFreeFlowTime)
    hourly95thPercentile.set(hour, hour95thPercentileValue)
  }

  const averageDelayRatio =
    totalRecords > 0 ? totalDelayRatio / hoursToConsider.length : 0

  return {
    routeId,
    hourlyPlanningTimeIndex,
    hourlyTravelTimeIndex,
    hourlyAverageTravelTime,
    hourlyFreeFlowTime,
    hourly95thPercentile,
    totalRecords,
    averageDelayRatio,
    peakCongestionHour,
    peakCongestionLevel,
  }
}
