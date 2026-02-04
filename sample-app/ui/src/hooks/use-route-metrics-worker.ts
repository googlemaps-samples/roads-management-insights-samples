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

import { useEffect, useRef, useState } from "react"

import type { RouteMetricsData } from "../data/historical/data"
import { useAppStore } from "../store"
import type { City } from "../types/city"
import type { CustomTimeFilters, LastWeekMonthFilters } from "../types/filters"
import { isDemoMode } from "../utils"
import { apiCache } from "../utils/api-cache"

interface UseRouteMetricsWorkerResult {
  routeMetricsData: RouteMetricsData | null
  isLoading: boolean
  error: string | null
}

// Helper to convert day names to weekday numbers (1=Sunday, 7=Saturday)
const convertDaysToWeekdays = (days: string[]): number[] => {
  const dayMap: Record<string, number> = {
    sun: 1,
    mon: 2,
    tue: 3,
    wed: 4,
    thu: 5,
    fri: 6,
    sat: 7,
  }

  return days
    .map((day) => dayMap[day.toLowerCase()])
    .filter((weekday) => weekday !== undefined)
}

// Helper to get date range based on time period
const getDateRange = (city: City): { fromDate: string; toDate: string } => {
  return {
    fromDate: city.availableDateRanges.startDate.toISOString().split("T")[0],
    toDate: city.availableDateRanges.endDate.toISOString().split("T")[0],
  }
}

// Helper to fetch route metrics from API
const fetchRouteMetricsFromAPI = async (
  city: City,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
): Promise<RouteMetricsData> => {
  const { fromDate, toDate } = getDateRange(city)
  const weekdays = convertDaysToWeekdays(timeFilters.days)

  const isLocalEnvironment = import.meta.env.DEV
  const response = await fetch(
    isLocalEnvironment
      ? `http://localhost:8000/api/route-metrics/${city.id}`
      : `/api/route-metrics/${city.id}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        display_names: [], // Empty array for all routes
        from_date: fromDate,
        to_date: toDate,
        weekdays: weekdays,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Convert API response to RouteMetricsData format
  const result: RouteMetricsData = {
    hourlyPlanningTimeIndex: new Map(
      Object.entries(data.hourlyPlanningTimeIndex).map(([k, v]) => [
        Number(k),
        v as number,
      ]),
    ),
    hourlyTravelTimeIndex: new Map(
      Object.entries(data.hourlyTravelTimeIndex).map(([k, v]) => [
        Number(k),
        v as number,
      ]),
    ),
    hourlyAverageTravelTime: new Map(
      Object.entries(data.hourlyAverageTravelTime).map(([k, v]) => [
        Number(k),
        v as number,
      ]),
    ),
    hourlyFreeFlowTime: new Map(
      Object.entries(data.hourlyFreeFlowTime).map(([k, v]) => [
        Number(k),
        v as number,
      ]),
    ),
    hourly95thPercentile: new Map(
      Object.entries(data.hourly95thPercentile).map(([k, v]) => [
        Number(k),
        v as number,
      ]),
    ),
  }

  // Add perRouteMetrics if present in API response
  if (data.perRouteMetrics) {
    const perRoute95th = new Map<string, Map<number, number>>()
    const perRouteFreeFlow = new Map<string, Map<number, number>>()

    // Convert hourly95thPercentile: {route_id: {hour: value}}
    if (data.perRouteMetrics.hourly95thPercentile) {
      Object.entries(data.perRouteMetrics.hourly95thPercentile).forEach(
        ([routeId, hourData]) => {
          const hourMap = new Map<number, number>()
          if (typeof hourData === "object" && hourData !== null) {
            Object.entries(hourData as Record<string, unknown>).forEach(
              ([hour, value]) => {
                hourMap.set(Number(hour), value as number)
              },
            )
          }
          perRoute95th.set(routeId, hourMap)
        },
      )
    }

    // Convert hourlyFreeFlowTime: {route_id: {hour: value}}
    if (data.perRouteMetrics.hourlyFreeFlowTime) {
      Object.entries(data.perRouteMetrics.hourlyFreeFlowTime).forEach(
        ([routeId, hourData]) => {
          const hourMap = new Map<number, number>()
          if (typeof hourData === "object" && hourData !== null) {
            Object.entries(hourData as Record<string, unknown>).forEach(
              ([hour, value]) => {
                hourMap.set(Number(hour), value as number)
              },
            )
          }
          perRouteFreeFlow.set(routeId, hourMap)
        },
      )
    }

    result.perRouteMetrics = {
      hourly95thPercentile: perRoute95th,
      hourlyFreeFlowTime: perRouteFreeFlow,
    }
  }

  return result
}

export const useRouteMetricsWorker = (
  selectedCity: City | null,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters | null,
  enabled: boolean = true,
  layout: "main" | "comparison" = "main",
): UseRouteMetricsWorkerResult => {
  const [routeMetricsData, setRouteMetricsData] =
    useState<RouteMetricsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const cacheKeyRef = useRef<string>("")

  const setQueryState = useAppStore((state) => state.setQueryState)
  const setRouteMetricsStore = useAppStore((state) => state.setRouteMetrics)

  // Subscribe to store changes to trigger re-calculation when data updates
  const {
    data: realtimeData,
    status: realtimeDataStatus,
    fetchedFor: realtimeDataFetchedFor,
  } = useAppStore((state) => state.queries.realtimeData)
  const {
    data: rawHistoricalData,
    status: rawHistoricalDataStatus,
    fetchedFor: rawHistoricalFetchedFor,
  } = useAppStore((state) => state.queries.rawHistoricalData)

  const demoMode = isDemoMode()

  // Initialize worker only in demo mode
  useEffect(() => {
    if (!demoMode) {
      return // No worker needed for non-demo mode
    }

    // Create worker if it doesn't exist
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../workers/route-metrics.worker.ts", import.meta.url),
        { type: "module" },
      )

      // Listen for messages from the worker
      workerRef.current.onmessage = (event) => {
        const { type, payload } = event.data

        switch (type) {
          case "ROUTE_METRICS_SUCCESS":
            // Cache the result from worker
            if (cacheKeyRef.current) {
              apiCache.set(cacheKeyRef.current, payload)
            }
            setRouteMetricsData(payload)
            setIsLoading(false)
            setError(null)
            break
          case "ROUTE_METRICS_ERROR":
            setError(payload)
            setIsLoading(false)
            setRouteMetricsData(null)
            break
        }
      }

      // Handle worker errors
      workerRef.current.onerror = (error) => {
        console.error("Worker error:", error)
        setError("Worker failed to load")
        setIsLoading(false)
      }
    }

    return () => {
      // Cleanup worker on unmount
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [demoMode])

  // Extract complex expressions for dependency array
  const startDateString =
    timeFilters && "startDate" in timeFilters
      ? (timeFilters as CustomTimeFilters).startDate?.toISOString()
      : null
  const endDateString =
    timeFilters && "endDate" in timeFilters
      ? (timeFilters as CustomTimeFilters).endDate?.toISOString()
      : null
  const daysString = rawHistoricalFetchedFor?.days?.join(",")

  useEffect(() => {
    const calculateMetrics = async () => {
      if (!enabled || !selectedCity || !timeFilters) {
        setRouteMetricsData(null)
        setIsLoading(false)
        setError(null)
        return
      }

      // In demo mode, we need to wait for data to be loaded
      // In non-demo mode, we can proceed directly with API calls
      if (demoMode) {
        if (
          realtimeDataStatus !== "success" ||
          rawHistoricalDataStatus !== "success"
        ) {
          setRouteMetricsData(null)
          setIsLoading(false)
          setError(null)
          return
        }

        // Validate that data was fetched for the correct city and filters
        // If validation fails, we wait for correct data rather than showing an error
        if (realtimeDataFetchedFor?.cityId !== selectedCity.id) {
          console.log(
            `[useRouteMetricsWorker ${layout}] Waiting for realtime data for city:`,
            selectedCity.id,
            "current:",
            realtimeDataFetchedFor?.cityId,
          )
          return
        }

        // Only validate raw historical data for main layout in demo mode
        // Comparison layout uses separate historical data fetched by useComparisonHistoricalData
        if (layout === "main") {
          if (rawHistoricalFetchedFor?.cityId !== selectedCity.id) {
            console.log(
              `[useRouteMetricsWorker ${layout}] Waiting for historical data for city:`,
              selectedCity.id,
              "current:",
              rawHistoricalFetchedFor?.cityId,
            )
            return
          }

          // Validate time period and days match
          if (rawHistoricalFetchedFor?.timePeriod !== timeFilters.timePeriod) {
            console.log(
              `[useRouteMetricsWorker ${layout}] Waiting for correct time period:`,
              timeFilters.timePeriod,
              "current:",
              rawHistoricalFetchedFor?.timePeriod,
            )
            return
          }

          // Validate days match (compare sorted arrays)
          const expectedDays = timeFilters.days.slice().sort().join(",")
          const actualDays = rawHistoricalFetchedFor?.days
            ?.slice()
            .sort()
            .join(",")
          if (expectedDays !== actualDays) {
            console.log(
              `[useRouteMetricsWorker ${layout}] Waiting for correct days:`,
              expectedDays,
              "current:",
              actualDays,
            )
            return
          }

          // For custom time periods, validate dates
          if (
            timeFilters.timePeriod === "custom" &&
            "startDate" in timeFilters &&
            "endDate" in timeFilters
          ) {
            const expectedStartDate = timeFilters.startDate
              .toISOString()
              .split("T")[0]
            const expectedEndDate = timeFilters.endDate
              .toISOString()
              .split("T")[0]

            if (
              rawHistoricalFetchedFor?.startDate !== expectedStartDate ||
              rawHistoricalFetchedFor?.endDate !== expectedEndDate
            ) {
              console.log(
                `[useRouteMetricsWorker ${layout}] Waiting for correct date range:`,
                { expectedStartDate, expectedEndDate },
                "current:",
                {
                  startDate: rawHistoricalFetchedFor?.startDate,
                  endDate: rawHistoricalFetchedFor?.endDate,
                },
              )
              return
            }
          }
        }

        console.log(
          `[useRouteMetricsWorker ${layout}] Validation passed, proceeding with calculation`,
        )
      }

      // Generate cache key (exclude hourRange as it's just a display filter)
      const cacheKey = apiCache.generateKey({
        type: "route-metrics",
        fetchedFor: {
          cityId: selectedCity.id,
          timePeriod: timeFilters.timePeriod,
          startDate: selectedCity.availableDateRanges.startDate
            .toISOString()
            .split("T")[0],
          endDate: selectedCity.availableDateRanges.endDate
            .toISOString()
            .split("T")[0],
          days: timeFilters.days,
        },
        layout,
      })

      // Check cache first
      const cachedData = apiCache.get<RouteMetricsData>(cacheKey)
      if (cachedData) {
        console.log("[useRouteMetricsWorker] Using cached data")
        setRouteMetricsData(cachedData)
        setIsLoading(false)
        setError(null)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        if (demoMode) {
          // Demo mode: Use worker for heavy client-side computation
          if (!workerRef.current) {
            throw new Error("Worker not initialized")
          }

          // Store cache key for when worker returns result
          cacheKeyRef.current = cacheKey

          // Send calculation request to worker
          workerRef.current.postMessage({
            type: "CALCULATE_ROUTE_METRICS",
            env: {
              DEMO_MODE: isDemoMode() ? "true" : "false",
            },
            payload: {
              selectedCity,
              timeFilters,
              realtimeRoadSegments: realtimeData?.rawData,
              rawHistoricalData,
            },
          })
          // Note: result will be handled by the worker's onmessage handler
          // Cache will be set in the onmessage handler
        } else {
          // Non-demo mode: Use API endpoint directly
          const metrics = await fetchRouteMetricsFromAPI(
            selectedCity,
            timeFilters,
          )
          // Cache the result
          apiCache.set(cacheKey, metrics)
          setRouteMetricsData(metrics)
          setIsLoading(false)
        }
      } catch (err) {
        console.error("Error calculating route metrics:", err)
        setError(
          err instanceof Error
            ? err.message
            : "Failed to calculate route metrics",
        )
        setRouteMetricsData(null)
        setIsLoading(false)
      }
    }

    calculateMetrics()
  }, [
    selectedCity,
    timeFilters?.days,
    timeFilters?.timePeriod,
    startDateString,
    endDateString,
    enabled,
    demoMode,
    // Track store data status to trigger re-calculation when data loads
    realtimeDataStatus,
    rawHistoricalDataStatus,
    layout,
    // Track fetchedFor values (not object references) to detect data changes
    realtimeDataFetchedFor?.cityId,
    rawHistoricalFetchedFor?.cityId,
    rawHistoricalFetchedFor?.timePeriod,
    rawHistoricalFetchedFor?.startDate,
    rawHistoricalFetchedFor?.endDate,
    daysString,
    // Include missing dependencies
    rawHistoricalData,
    realtimeData?.rawData,
    timeFilters,
    rawHistoricalFetchedFor?.days,
  ])

  // Update store when data changes
  useEffect(() => {
    if (routeMetricsData) {
      setRouteMetricsStore(layout, routeMetricsData)
    }
  }, [routeMetricsData, layout, setRouteMetricsStore])

  // Sync query state with Zustand store
  useEffect(() => {
    if (isLoading) {
      setQueryState("routeMetrics", "loading", undefined, undefined, layout)
    } else if (error) {
      const errorObj = new Error(error)
      setQueryState("routeMetrics", "error", undefined, errorObj, layout)
    } else if (routeMetricsData) {
      setQueryState(
        "routeMetrics",
        "success",
        routeMetricsData,
        undefined,
        layout,
      )
    }
  }, [isLoading, error, routeMetricsData, setQueryState, layout])

  return {
    routeMetricsData,
    isLoading,
    error,
  }
}
