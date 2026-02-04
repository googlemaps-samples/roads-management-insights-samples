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
import { useEffect } from "react"

import { fetchRealtimeData, getRealtimeRoadSegments } from "../data"
import { useAppStore } from "../store"
import { RealtimeData } from "../types/store-data"
import { isDemoMode } from "../utils"

/**
 * Unified hook for fetching realtime data with multiple output formats
 * Sets all relevant query states in the store automatically
 * @param cityId - The city ID to fetch data for (e.g., "paris", "tokyo")
 * @param enabled - Whether the query should be enabled
 * @param options - Configuration options for data processing
 * @returns React Query result with realtime data and processed segments
 */
export const useRealtimeData = (cityId: string, enabled: boolean = true) => {
  const includeRoadSegments = true

  const demoMode = isDemoMode()

  const setQueryState = useAppStore((state) => state.setQueryState)
  const queryState = useAppStore((state) => state.queries.realtimeData)

  const query = useQuery({
    queryKey: ["realtimeData", cityId],
    queryFn: async () => {
      if (!cityId || cityId === "") {
        const error = new Error("City ID is required")
        setQueryState("realtimeData", "error", undefined, error)
      }

      try {
        // Set loading states for all enabled data types
        setQueryState("realtimeData", "loading")

        // Fetch raw data first
        const rawData = await fetchRealtimeData(cityId)

        const result: RealtimeData = {
          alerts: [],
          lastUpdated: new Date(),
          rawData: demoMode ? rawData : rawData.data,
          roadSegments: [],
        }

        if (includeRoadSegments) {
          const roadSegments = await getRealtimeRoadSegments(
            cityId,
            demoMode ? rawData : rawData.data,
          )
          result.roadSegments = roadSegments
        }

        setQueryState("realtimeData", "success", result)
        return result
      } catch (error) {
        const errorObj =
          error instanceof Error ? error : new Error(String(error))
        setQueryState("realtimeData", "error", undefined, errorObj)
        throw error // Re-throw the error so React Query can handle it properly
      }
    },
    enabled: enabled && !!cityId, // Only run query when cityId is available and enabled
  })

  // Sync React Query state with app store for the main realtimeData state
  useEffect(() => {
    if (query.isLoading || query.isFetching) {
      setQueryState("realtimeData", "loading")
    } else if (query.isError) {
      setQueryState("realtimeData", "error", undefined, query.error)
    } else if (query.isSuccess && query.data) {
      // Include metadata about what this data was fetched for
      const fetchedFor = {
        cityId,
      }
      setQueryState(
        "realtimeData",
        "success",
        query.data,
        undefined,
        undefined,
        fetchedFor,
      )
    }
  }, [
    query.isLoading,
    query.isFetching,
    query.isError,
    query.isSuccess,
    query.data,
    query.error,
    setQueryState,
    cityId,
  ])

  return {
    ...query,
    storeState: queryState,
    // Also return the other store states for convenience
  }
}

/**
 * Convenience hook that automatically enables all data types
 * Sets all relevant query states in the store automatically
 * @param cityId - The city ID to fetch data for (e.g., "paris", "tokyo")
 * @param enabled - Whether the query should be enabled
 * @returns React Query result with all realtime data types
 */
export const useAllRealtimeData = (cityId: string, enabled: boolean = true) => {
  return useRealtimeData(cityId, enabled)
}
