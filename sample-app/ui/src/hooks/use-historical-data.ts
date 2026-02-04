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
import type { FeatureCollection } from "geojson"
import { useEffect } from "react"

import { getAllHistoricalData } from "../data"
import { useAppStore } from "../store"
import { City } from "../types/city"
import { CustomTimeFilters, LastWeekMonthFilters } from "../types/filters"
import type { HistoricalData } from "../types/store-data"
import { calculateLastWeekStart } from "../utils/date-utils"
import { useHistoricalDataWorker } from "./use-historical-data-worker"

export const useHistoricalData = (
  selectedCity: City | null,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters | null,
  enabled: boolean = true,
) => {
  const setQueryState = useAppStore((state) => state.setQueryState)
  const queryState = useAppStore(
    (state) => state.queries.filteredHistoricalData,
  )
  const selectedRouteId = useAppStore((state) => state.selectedRouteId)
  const setSelectedRouteSegment = useAppStore(
    (state) => state.setSelectedRouteSegment,
  )

  const realtimeData = useAppStore((state) => state.queries.realtimeData.data)
  const realtimeRoadSegments = realtimeData?.rawData
  const { data: rawHistoricalData, status: rawHistoricalDataStatus } =
    useAppStore((state) => state.queries.rawHistoricalData)

  // Use the web worker for heavy data processing
  const {
    data: workerData,
    isLoading: workerIsLoading,
    error: workerError,
  } = useHistoricalDataWorker(
    selectedCity,
    timeFilters,
    realtimeRoadSegments ?? null,
    enabled,
    rawHistoricalData as unknown as unknown[],
    rawHistoricalDataStatus,
  )

  // Create a query-like interface to maintain compatibility with existing code
  const query = {
    data: workerData,
    isLoading: workerIsLoading,
    isError: !!workerError,
    isSuccess: !workerIsLoading && !workerError && workerData !== null,
    error: workerError,
    refetch: () => Promise.resolve({ data: workerData }),
  }

  // Sync worker state with Zustand store
  useEffect(() => {
    if (query.isLoading) {
      setQueryState("filteredHistoricalData", "loading")
    } else if (query.isError) {
      setQueryState(
        "filteredHistoricalData",
        "error",
        undefined,
        query.error ? new Error(query.error) : undefined,
      )
    } else if (query.isSuccess && query.data) {
      setQueryState(
        "filteredHistoricalData",
        "success",
        query.data as unknown as HistoricalData,
      )
    }
  }, [
    query.isLoading,
    query.isError,
    query.isSuccess,
    query.data,
    query.error,
    setQueryState,
    rawHistoricalDataStatus,
    rawHistoricalData,
  ])

  // Update selectedRouteSegment when filters change and we have a selectedRouteId
  useEffect(() => {
    if (query.isSuccess && query.data && selectedRouteId) {
      const { routeDelays } = query.data.stats

      // Find the route segment that matches the selectedRouteId
      const matchingRoute = routeDelays.find(
        (route) => route.routeId === selectedRouteId,
      )

      const segmentColor = query.data.routeColors.get(selectedRouteId)
      if (matchingRoute) {
        // Update the selectedRouteSegment with the new filtered data
        setSelectedRouteSegment({
          id: matchingRoute.routeId,
          routeId: matchingRoute.routeId,
          path: [], // Default empty path since we don't have path data here
          length: 0, // Default length since we don't have length data here
          duration: matchingRoute.averageDuration,
          staticDuration: matchingRoute.staticDuration,
          delayTime: matchingRoute.delayTime,
          delayRatio: matchingRoute.delayRatio,
          delayPercentage: matchingRoute.delayPercentage,
          count: matchingRoute.count,
          peakCongestionHourRange: matchingRoute.peakCongestionHourRange,
          peakCongestionLevel: matchingRoute.peakCongestionLevel,
          color: segmentColor?.color,
        })
      } else {
        // If the selected route is not found in the filtered data, clear the selection
        setSelectedRouteSegment(null)
      }
    }
  }, [
    query.data,
    query.isSuccess,
    selectedRouteId,
    setSelectedRouteSegment,
    rawHistoricalData,
    rawHistoricalDataStatus,
  ])

  return {
    ...query,
    storeState: queryState,
  }
}

export const useRawHistoricalData = (
  selectedCity: City | null,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters | null,
  enabled: boolean = true,
) => {
  const setQueryState = useAppStore((state) => state.setQueryState)
  const queryState = useAppStore((state) => state.queries.rawHistoricalData)

  // Create a stable query key that only includes fields that affect the API request
  // Note: hourRange is NOT included because it's applied client-side, not in the API request
  const queryKey = [
    "raw-historical-data",
    selectedCity?.id,
    timeFilters?.timePeriod,
    timeFilters?.timePeriod === "custom" && "startDate" in timeFilters
      ? timeFilters.startDate.toISOString().split("T")[0]
      : null,
    timeFilters?.timePeriod === "custom" && "endDate" in timeFilters
      ? timeFilters.endDate.toISOString().split("T")[0]
      : null,
    timeFilters?.days?.slice().sort().join(",") || "all", // Sort days for consistent cache key
  ]

  const { data, isLoading, isError, isSuccess, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!selectedCity || !timeFilters) {
        throw new Error("City and time filters are required")
      }

      const updateTimeFilters = { ...timeFilters } as CustomTimeFilters
      if (timeFilters.timePeriod === "last-week") {
        updateTimeFilters.startDate = calculateLastWeekStart(
          selectedCity.availableDateRanges.endDate,
        )
        updateTimeFilters.endDate = selectedCity.availableDateRanges.endDate
      }
      const rawData = await getAllHistoricalData(
        selectedCity.id,
        updateTimeFilters,
      )
      return rawData
    },
    enabled: enabled && !!selectedCity && !!timeFilters,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep unused data in cache for 10 minutes
  })

  // Sync query state with Zustand store
  useEffect(() => {
    if (isLoading) {
      setQueryState("rawHistoricalData", "loading")
    } else if (isError) {
      setQueryState("rawHistoricalData", "error", undefined, error)
    } else if (isSuccess && data && selectedCity && timeFilters) {
      // Include metadata about what this data was fetched for
      const fetchedFor = {
        cityId: selectedCity.id,
        timePeriod: timeFilters.timePeriod,
        startDate:
          "startDate" in timeFilters
            ? timeFilters.startDate.toISOString().split("T")[0]
            : undefined,
        endDate:
          "endDate" in timeFilters
            ? timeFilters.endDate.toISOString().split("T")[0]
            : undefined,
        days: timeFilters.days.slice().sort(),
      }
      setQueryState(
        "rawHistoricalData",
        "success",
        data as unknown as FeatureCollection,
        undefined,
        undefined,
        fetchedFor,
      )
    }
  }, [
    isLoading,
    isError,
    isSuccess,
    data,
    error,
    setQueryState,
    selectedCity,
    timeFilters,
  ])

  return {
    data,
    isLoading,
    isError,
    isSuccess,
    error,
    storeState: queryState,
  }
}
