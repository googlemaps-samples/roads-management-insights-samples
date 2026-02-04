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

import {
  HistoricalRecord,
  getFilteredHistoricalData,
} from "../data/historical/data"
import type { City } from "../types/city"
import type { CustomTimeFilters, LastWeekMonthFilters } from "../types/filters"
import { isDemoMode, setApplicationMode } from "../utils/demo-mode"

// Helper function to create cache key that includes time filters for non-demo mode
const createCacheKey = (
  cityId: string,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
  demoMode: boolean,
): string => {
  if (demoMode) {
    // In demo mode, only cache by city ID since all data is loaded at once
    return cityId
  }

  // In non-demo mode, include time filters in cache key
  const timeFilterKey = JSON.stringify({
    timePeriod: timeFilters.timePeriod,
    hourRange: timeFilters.hourRange,
    days: timeFilters.days,
    ...(timeFilters.timePeriod === "custom" && "startDate" in timeFilters
      ? { startDate: timeFilters.startDate.toISOString().split("T")[0] }
      : {}),
    ...(timeFilters.timePeriod === "custom" && "endDate" in timeFilters
      ? { endDate: timeFilters.endDate.toISOString().split("T")[0] }
      : {}),
  })

  return `${cityId}-${btoa(timeFilterKey)}`
}

const CACHE: Record<
  string,
  {
    realtimeRoadSegments: GeoJSON.FeatureCollection
    rawHistoricalData: HistoricalRecord[]
    timeFilters?: LastWeekMonthFilters | CustomTimeFilters
  }
> = {}

// Listen for messages from the main thread
self.addEventListener("message", async (event) => {
  const { type, payload, env, requestId } = event.data
  console.log("event.data", event.data)

  setApplicationMode(env.DEMO_MODE === "true" ? "demo" : "production")

  try {
    switch (type) {
      case "GET_FILTERED_HISTORICAL_DATA": {
        const {
          selectedCity,
          timeFilters,
          // realtimeRoadSegments,
          // rawHistoricalData,
        } = payload as {
          selectedCity: City
          timeFilters: LastWeekMonthFilters | CustomTimeFilters
          // realtimeRoadSegments: GeoJSON.FeatureCollection
          // rawHistoricalData: any[]
        }

        const demoMode = isDemoMode()
        const cacheKey = createCacheKey(selectedCity.id, timeFilters, demoMode)

        // Check if we have cached data for this specific combination
        if (!CACHE[cacheKey]) {
          CACHE[cacheKey] = await new Promise((resolve, reject) => {
            self.addEventListener(
              "message",
              (event) => {
                if (event.data.type === "HISTORICAL_DATA_CACHE_SUCCESS") {
                  resolve(event.data.payload)
                } else if (event.data.type === "HISTORICAL_DATA_CACHE_ERROR") {
                  reject(new Error(event.data.payload))
                }
              },
              {
                once: true,
              },
            )
            self.postMessage({
              type: "GET_HISTORICAL_DATA_CACHE",
              requestId,
              payload: {
                selectedCity,
                timeFilters,
                demoMode,
              },
            })
          })
        }

        const { realtimeRoadSegments, rawHistoricalData } = CACHE[cacheKey]

        // Perform the heavy calculation in the worker thread
        const result = await getFilteredHistoricalData(
          selectedCity,
          timeFilters,
          realtimeRoadSegments,
          rawHistoricalData,
        )

        // Send the result back to the main thread with the request ID
        self.postMessage({
          type: "FILTERED_HISTORICAL_DATA_SUCCESS",
          requestId,
          payload: result,
        })
        break
      }
      default:
        throw new Error(`Unknown message type: ${type}`)
    }
  } catch (error) {
    // Send error back to main thread with the request ID
    self.postMessage({
      type: "FILTERED_HISTORICAL_DATA_ERROR",
      requestId,
      payload: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

export {} // Make this a module
