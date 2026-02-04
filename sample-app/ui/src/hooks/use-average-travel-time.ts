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

import { useEffect, useState } from "react"

import {
  type HistoricalRecord,
  calculateAverageTravelTimeByHour,
} from "../data/historical/data"
// HistoricalRecord is used in type assertion below
import { useAppStore } from "../store"
import { City } from "../types/city"
import { CustomTimeFilters, LastWeekMonthFilters } from "../types/filters"
import { isDemoMode } from "../utils"
import { apiCache } from "../utils/api-cache"

interface UseAverageTravelTimeResult {
  averageTravelTimeData: Map<number, number> | null
  routeHourlyAverages: Map<string, Map<number, number>> | null
  hourlyTotalAverages: Map<
    number,
    { totalDuration: number; count: number }
  > | null
  isLoading: boolean
  error: string | null
}

// Helper function to convert API response to Map format
const convertApiResponseToMaps = (apiResponse: {
  routeHourlyAverages?: Record<string, Record<string, number>>
  hourlyTotalAverages?: Record<string, { totalDuration: number; count: number }>
}) => {
  const routeHourlyAverages = new Map<string, Map<number, number>>()
  if (apiResponse.routeHourlyAverages) {
    Object.entries(apiResponse.routeHourlyAverages).forEach(
      ([routeId, hourData]) => {
        const hourMap = new Map<number, number>()
        Object.entries(hourData).forEach(([hour, duration]) => {
          hourMap.set(Number(hour), Number(duration))
        })
        routeHourlyAverages.set(routeId, hourMap)
      },
    )
  }

  // Convert hourlyTotalAverages: {hour: {totalDuration: x, count: y}} to Map<number, {totalDuration, count}>
  const hourlyTotalAverages = new Map<
    number,
    { totalDuration: number; count: number }
  >()
  if (apiResponse.hourlyTotalAverages) {
    Object.entries(apiResponse.hourlyTotalAverages).forEach(([hour, data]) => {
      hourlyTotalAverages.set(Number(hour), {
        totalDuration: Number(data.totalDuration),
        count: Number(data.count),
      })
    })
  }

  return {
    routeHourlyAverages,
    hourlyTotalAverages,
  }
}

export const useAverageTravelTime = (
  selectedCity: City | null,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters | null,
  enabled: boolean = true,
  layout: "main" | "comparison" = "main",
): UseAverageTravelTimeResult => {
  const [averageTravelTimeData, setAverageTravelTimeData] = useState<Map<
    number,
    number
  > | null>(null)
  const [routeHourlyAverages, setRouteHourlyAverages] = useState<Map<
    string,
    Map<number, number>
  > | null>(null)
  const [hourlyTotalAverages, setHourlyTotalAverages] = useState<Map<
    number,
    { totalDuration: number; count: number }
  > | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setQueryState = useAppStore((state) => state.setQueryState)
  const setAverageTravelTimeStore = useAppStore(
    (state) => state.setAverageTravelTime,
  )
  const { data: realtimeData, status: realtimeStatus } = useAppStore(
    (state) => state.queries.realtimeData,
  )
  const realtimeRoadSegments = realtimeData?.rawData

  const { data: rawHistoricalData, status: rawHistoricalDataStatus } =
    useAppStore((state) => state.queries.rawHistoricalData)

  useEffect(() => {
    const abortController = new AbortController()

    const fetchAverageTravelTime = async () => {
      const demoMode = isDemoMode()

      if (!enabled || !selectedCity || !timeFilters) {
        setAverageTravelTimeData(null)
        setRouteHourlyAverages(null)
        setHourlyTotalAverages(null)
        setIsLoading(false)
        setError(null)
        return
      }

      // In demo mode, we need to wait for realtime and historical data
      // In non-demo mode, we can proceed directly with API calls
      if (demoMode) {
        if (
          realtimeStatus !== "success" ||
          rawHistoricalDataStatus !== "success"
        ) {
          setAverageTravelTimeData(null)
          setRouteHourlyAverages(null)
          setHourlyTotalAverages(null)
          setIsLoading(false)
          setError(null)
          return
        }
      }

      // Generate cache key (exclude hourRange as it's just a display filter)
      const cacheKey = apiCache.generateKey({
        type: "average-travel-time",
        cityId: selectedCity.id,
        days: timeFilters.days,
        timePeriod: timeFilters.timePeriod,
        startDate:
          "startDate" in timeFilters
            ? timeFilters.startDate.toISOString()
            : null,
        endDate:
          "endDate" in timeFilters ? timeFilters.endDate.toISOString() : null,
      })

      // Check cache first
      const cachedData = apiCache.get<{
        routeHourlyAverages: Map<string, Map<number, number>>
        hourlyTotalAverages: Map<
          number,
          { totalDuration: number; count: number }
        >
      }>(cacheKey)
      if (cachedData) {
        // Convert hourlyTotalAverages to the expected format for averageTravelTimeData
        const averageData = new Map<number, number>()
        cachedData.hourlyTotalAverages.forEach(
          (value: { totalDuration: number; count: number }, hour: number) => {
            averageData.set(hour, value.totalDuration)
          },
        )
        setAverageTravelTimeData(averageData)
        setRouteHourlyAverages(cachedData.routeHourlyAverages)
        setHourlyTotalAverages(cachedData.hourlyTotalAverages)
        setIsLoading(false)
        setError(null)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        let data

        if (demoMode) {
          // Demo mode: use client-side calculation
          const historicalRecords: HistoricalRecord[] =
            rawHistoricalData as unknown as HistoricalRecord[]
          data = await calculateAverageTravelTimeByHour(
            selectedCity,
            timeFilters,
            realtimeRoadSegments || null,
            historicalRecords,
          )
        } else {
          // Non-demo mode: use API
          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
          const weekdays = (timeFilters.days || [])
            .map((day) =>
              dayNames.findIndex((d) => d.toLowerCase() === day.toLowerCase()),
            )
            .filter((index) => index !== -1)
            .map((index) => index + 1)

          const customFilters = timeFilters as CustomTimeFilters
          const startDate = customFilters.startDate
          const endDate = customFilters.endDate

          const fromDate = startDate.toISOString().split("T")[0]
          const toDate = endDate.toISOString().split("T")[0]

          const isLocalEnvironment = import.meta.env.DEV
          const url = isLocalEnvironment
            ? `http://localhost:8000/api/average-travel-time-by-hour/${selectedCity.id}`
            : `/api/average-travel-time-by-hour/${selectedCity.id}`

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              display_names: [],
              from_date: fromDate,
              to_date: toDate,
              weekdays: weekdays,
            }),
            signal: abortController.signal,
          })

          if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`)
          }

          const apiResponse = await response.json()

          // Convert API response to Map format
          data = convertApiResponseToMaps(apiResponse)
        }

        // Only update state if request wasn't aborted
        if (!abortController.signal.aborted) {
          // Cache the result
          apiCache.set(cacheKey, data)

          // Convert hourlyTotalAverages to the expected format for averageTravelTimeData
          const averageData = new Map<number, number>()
          data.hourlyTotalAverages.forEach(
            (value: { totalDuration: number; count: number }, hour: number) => {
              averageData.set(hour, value.totalDuration)
            },
          )
          setAverageTravelTimeData(averageData)
          setRouteHourlyAverages(data.routeHourlyAverages)
          setHourlyTotalAverages(data.hourlyTotalAverages)
        }
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === "AbortError") {
          console.log("[useAverageTravelTime] Request aborted")
          return
        }

        console.error("Error calculating average travel time:", err)
        setError(
          err instanceof Error
            ? err.message
            : "Failed to calculate average travel time",
        )
        setAverageTravelTimeData(null)
        setRouteHourlyAverages(null)
        setHourlyTotalAverages(null)
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchAverageTravelTime()

    // Cleanup function to abort the request when dependencies change
    return () => {
      abortController.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedCity,
    timeFilters?.days,
    timeFilters?.timePeriod,
    // Note: hourRange is excluded - it's just a display filter, not a data filter
    // For custom time periods, also track date changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    "startDate" in (timeFilters || {})
      ? (timeFilters as CustomTimeFilters).startDate?.toISOString()
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    "endDate" in (timeFilters || {})
      ? (timeFilters as CustomTimeFilters).endDate?.toISOString()
      : null,
    enabled,
    realtimeStatus,
    rawHistoricalDataStatus,
    realtimeRoadSegments,
    rawHistoricalData,
  ])

  // Update store when data changes
  useEffect(() => {
    if (hourlyTotalAverages) {
      setAverageTravelTimeStore(layout, {
        routeHourlyAverages:
          routeHourlyAverages || new Map<string, Map<number, number>>(),
        hourlyTotalAverages,
      })
    }
  }, [
    hourlyTotalAverages,
    routeHourlyAverages,
    layout,
    setAverageTravelTimeStore,
  ])

  // Sync query state with Zustand store
  useEffect(() => {
    if (isLoading) {
      setQueryState(
        "averageTravelTime",
        "loading",
        undefined,
        undefined,
        layout,
      )
    } else if (error) {
      setQueryState(
        "averageTravelTime",
        "error",
        undefined,
        new Error(error),
        layout,
      )
    } else if (hourlyTotalAverages) {
      setQueryState(
        "averageTravelTime",
        "success",
        {
          routeHourlyAverages:
            routeHourlyAverages || new Map<string, Map<number, number>>(),
          hourlyTotalAverages,
        },
        undefined,
        layout,
      )
    }
  }, [
    isLoading,
    error,
    hourlyTotalAverages,
    routeHourlyAverages,
    setQueryState,
    layout,
  ])

  return {
    averageTravelTimeData,
    routeHourlyAverages,
    hourlyTotalAverages,
    isLoading,
    error,
  }
}
