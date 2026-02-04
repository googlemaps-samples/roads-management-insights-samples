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
import { CustomTimeFilters, LastWeekMonthFilters } from "../../types/filters"
import { isDemoMode } from "../../utils"

// Interface for historical data records
interface HistoricalRecord {
  selected_route_id: string
  duration_in_seconds: number | string
  static_duration_in_seconds: number | string
  record_time: string
}

// Cache for route IDs to avoid repeated extraction
const routeIdsCache = new Map<string, string[]>()
const historicalRouteIdsCache = new Map<string, Set<string>>()
const historicalDataCache = new Map<string, HistoricalRecord[]>()
// Cache for non-demo mode API calls with date range and days keys
const apiDataCache = new Map<string, HistoricalRecord[]>()
// Track ongoing requests to prevent duplicate API calls
const ongoingRequests = new Map<string, Promise<HistoricalRecord[]>>()
// Track abort controllers for request cancellation
const abortControllers = new Map<string, AbortController>()

// Function to get all historical data (filtered or unfiltered based on mode)
export const getAllHistoricalData = async (
  selectedCityId: string,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
): Promise<HistoricalRecord[]> => {
  try {
    const demoMode = isDemoMode()
    // In demo mode, use cached data and apply client-side filtering
    // In non-demo mode, get pre-filtered data from API
    if (demoMode) {
      if (historicalDataCache.has(selectedCityId)) {
        return historicalDataCache.get(selectedCityId)!
      }
      const historicalData = await fetchHistoricalData(selectedCityId)
      historicalDataCache.set(selectedCityId, historicalData)
      return historicalData
    } else {
      // Non-demo mode: get pre-filtered data from API
      // Caching is handled in fetchHistoricalData
      const historicalData = await fetchHistoricalData(
        selectedCityId,
        timeFilters,
      )
      return historicalData
    }
  } catch (error) {
    console.error("Error loading historical data:", error)
    return []
  }
}

// Helper function to create cache key for API calls
const createApiCacheKey = (
  cityId: string,
  timeFilters?: LastWeekMonthFilters | CustomTimeFilters,
): string => {
  if (!timeFilters) {
    return `${cityId}-default`
  }

  // Convert days to a sorted string for consistent cache keys
  const daysKey = timeFilters.days?.sort().join(",") || "all"

  // For custom time period, include date range in cache key
  if (timeFilters.timePeriod === "custom" && "startDate" in timeFilters) {
    const startDate = timeFilters.startDate.toISOString().split("T")[0]
    const endDate = timeFilters.endDate.toISOString().split("T")[0]
    return `${cityId}-${timeFilters.timePeriod}-${startDate}-${endDate}-${daysKey}`
  }

  // For other time periods, use the period name and days
  return `${cityId}-${timeFilters.timePeriod}-${daysKey}`
}

// Helper function to clear route IDs cache for a specific city
export const clearRouteIdsCache = (selectedCityName: string) => {
  routeIdsCache.delete(selectedCityName)
}

// Helper function to get all route IDs from realtime data for a given location
export const getAllRouteIdsFromRealtime = async (
  selectedCityName: string,
  realtimeRoadSegments?: GeoJSON.FeatureCollection | null,
): Promise<{
  routeIds: string[]
  routeIdsStaticDuration: Map<string, number>
}> => {
  try {
    const routeIdsStaticDuration = new Map<string, number>()
    const locationKey = selectedCityName

    // Always extract fresh route IDs from the provided realtimeRoadSegments
    // to ensure we're using the correct data for the current city
    if (realtimeRoadSegments && realtimeRoadSegments.features) {
      const routeIds = realtimeRoadSegments.features.map(
        (record: GeoJSON.Feature) => {
          if (record.properties) {
            routeIdsStaticDuration.set(
              record.properties.selected_route_id,
              record.properties.travel_duration.static_duration_in_seconds,
            )
            return record.properties.selected_route_id
          }
          return ""
        },
      )

      // Update cache with fresh data
      routeIdsCache.set(locationKey, routeIds)
      return { routeIds, routeIdsStaticDuration }
    }

    // Fallback to cached route IDs if realtimeRoadSegments is not provided
    if (routeIdsCache.has(locationKey)) {
      return {
        routeIds: routeIdsCache.get(locationKey)!,
        routeIdsStaticDuration,
      }
    }

    return { routeIds: [], routeIdsStaticDuration }
  } catch (error) {
    console.warn(
      `Error getting route IDs from realtime data for ${selectedCityName}:`,
      error,
    )
    return { routeIds: [], routeIdsStaticDuration: new Map<string, number>() }
  }
}

export function getHistoricalRouteIds(cityId: string): Set<string> {
  const locationKey = cityId
  return historicalRouteIdsCache.get(locationKey) || new Set<string>()
}

/**
 * Fetches historical data for a location
 * Note: Caching is handled by React Query, not here
 * @param location - The location to fetch data for (e.g., "paris", "tokyo")
 * @param timeFilters - Optional time filters for non-demo mode API calls
 * @returns Promise with the historical data array
 */
export const fetchHistoricalData = async (
  location: string,
  timeFilters?: LastWeekMonthFilters | CustomTimeFilters,
): Promise<HistoricalRecord[]> => {
  const demoMode = isDemoMode()

  // In demo mode, check cache first
  if (demoMode && historicalDataCache.has(location)) {
    console.log(`📦 Using cached demo historical data for ${location}`)
    return historicalDataCache.get(location)!
  }

  // In non-demo mode, check for ongoing requests FIRST, then cache
  if (!demoMode && timeFilters) {
    const cacheKey = createApiCacheKey(location, timeFilters)

    // Check if there's already an ongoing request for this key
    if (ongoingRequests.has(cacheKey)) {
      return ongoingRequests.get(cacheKey)!
    }

    // Cancel any previous request for this key
    if (abortControllers.has(cacheKey)) {
      abortControllers.get(cacheKey)?.abort()
      abortControllers.delete(cacheKey)
    }

    // Check API cache
    if (apiDataCache.has(cacheKey)) {
      return apiDataCache.get(cacheKey)!
    }
  }

  // Create abort controller for this request
  const abortController = new AbortController()
  if (!demoMode && timeFilters) {
    const cacheKey = createApiCacheKey(location, timeFilters)
    abortControllers.set(cacheKey, abortController)
  }

  // Create a promise for this request to prevent duplicates
  const requestPromise = (async () => {
    let url: string
    let requestBody:
      | {
          from_date: string
          to_date: string
          weekdays: number[]
        }
      | undefined = undefined

    const isDevelopmentMode = import.meta.env.DEV

    if (demoMode) {
      // Demo mode: fetch from local JSON files
      url = isDevelopmentMode
        ? `http://localhost:8000/api/data/realtime-monitoring/historical/${location}.json`
        : `/api/data/realtime-monitoring/historical/${location}.json`
    } else {
      // Non-demo mode: fetch from API with filters
      url = isDevelopmentMode
        ? `http://localhost:8000/api/historical/${location}`
        : `/api/historical/${location}`

      // Prepare request body with filters for API
      if (timeFilters) {
        // Convert days to weekday numbers (Mon=1, Tue=2, ..., Sun=7)
        const dayToWeekdayNumber = (day: string): number => {
          const dayMap: Record<string, number> = {
            Sun: 1,
            Mon: 2,
            Tue: 3,
            Wed: 4,
            Thu: 5,
            Fri: 6,
            Sat: 7,
          }
          return dayMap[day] || 1
        }

        // Custom date range - only available in CustomTimeFilters
        if (
          timeFilters.timePeriod === "custom" &&
          "startDate" in timeFilters &&
          "endDate" in timeFilters
        ) {
          const fromDate = timeFilters.startDate.toISOString().split("T")[0]
          const toDate = timeFilters.endDate.toISOString().split("T")[0]

          requestBody = {
            from_date: fromDate,
            to_date: toDate,
            weekdays: timeFilters.days?.map(dayToWeekdayNumber) || [
              1, 2, 3, 4, 5,
            ], // Default to weekdays
          }
        }
      }
    }

    const fetchOptions: RequestInit = {
      method: requestBody ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: abortController.signal,
      ...(requestBody && { body: JSON.stringify(requestBody) }),
    }

    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      throw new Error(
        `Failed to fetch historical data for ${location}: ${response.status} ${response.statusText}`,
      )
    }

    const data = await response.json()

    // Cache route IDs for quick access
    historicalRouteIdsCache.set(
      location,
      new Set(data.map((record: HistoricalRecord) => record.selected_route_id)),
    )

    // Cache data based on mode
    if (demoMode) {
      historicalDataCache.set(location, data)
      console.log(`💾 Cached demo historical data for ${location}`)
    } else if (timeFilters) {
      // Cache API data with the same key used for checking
      const cacheKey = createApiCacheKey(location, timeFilters)
      apiDataCache.set(cacheKey, data)
      console.log(`💾 Cached API historical data for ${location}`)
    }

    console.log(
      `✅ Successfully fetched historical data for ${location} (${data.length} records)`,
    )

    return data
  })()

  // Store the promise for non-demo mode to prevent duplicate requests
  if (!demoMode && timeFilters) {
    const cacheKey = createApiCacheKey(location, timeFilters)
    ongoingRequests.set(cacheKey, requestPromise)

    // Clean up the ongoing request when it completes
    requestPromise.finally(() => {
      ongoingRequests.delete(cacheKey)
      abortControllers.delete(cacheKey)
    })
  }

  return requestPromise
}
