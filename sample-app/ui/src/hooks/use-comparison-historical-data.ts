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

import { getAllHistoricalData } from "../data"
import { useAppStore } from "../store"
import { City } from "../types/city"
import { CustomTimeFilters, LastWeekMonthFilters } from "../types/filters"
import { calculateLastWeekStart } from "../utils/date-utils"
import { useHistoricalDataWorker } from "./use-historical-data-worker"

export const useComparisonHistoricalData = (
  selectedCity: City | null,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters | null,
  enabled: boolean = true,
) => {
  const realtimeData = useAppStore((state) => state.queries.realtimeData.data)
  const realtimeRoadSegments = realtimeData?.rawData

  // Fetch separate raw historical data for comparison using React Query
  // This ensures that in non-demo mode, a separate API call is made with comparison time filters
  const {
    data: comparisonRawData,
    isLoading: isLoadingRawData,
    isError: isRawDataError,
    isSuccess: isRawDataSuccess,
  } = useQuery({
    queryKey: ["comparison-raw-historical-data", selectedCity?.id, timeFilters],
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

  // Use the web worker for heavy data processing with the comparison-specific raw data
  const {
    data: workerData,
    isLoading: workerIsLoading,
    error: workerError,
  } = useHistoricalDataWorker(
    selectedCity,
    timeFilters,
    realtimeRoadSegments ?? null,
    enabled && isRawDataSuccess,
    comparisonRawData ?? null,
    isRawDataSuccess ? "success" : isLoadingRawData ? "loading" : "pending",
  )

  // Create a query-like interface to maintain compatibility with existing code
  const query = {
    data: workerData,
    isLoading: isLoadingRawData || workerIsLoading,
    isError: isRawDataError || !!workerError,
    isSuccess:
      !isLoadingRawData &&
      !workerIsLoading &&
      !workerError &&
      workerData !== null,
    error: workerError,
    refetch: async () => ({ data: workerData }),
  }

  return query
}
