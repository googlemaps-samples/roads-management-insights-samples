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

// Web Worker for heavy route metrics calculations
// This runs in a separate thread to prevent UI blocking
import {
  HistoricalRecord,
  calculateRouteMetrics,
} from "../data/historical/data"
import type { City } from "../types/city"
import type { CustomTimeFilters, LastWeekMonthFilters } from "../types/filters"
import { setApplicationMode } from "../utils/demo-mode"

// Listen for messages from the main thread
self.addEventListener("message", async (event) => {
  const { type, env, payload } = event.data

  setApplicationMode(env.DEMO_MODE === "true" ? "demo" : "production")

  try {
    switch (type) {
      case "CALCULATE_ROUTE_METRICS": {
        const {
          selectedCity,
          timeFilters,
          realtimeRoadSegments,
          rawHistoricalData,
        } = payload as {
          selectedCity: City
          timeFilters: LastWeekMonthFilters | CustomTimeFilters
          realtimeRoadSegments: GeoJSON.FeatureCollection
          rawHistoricalData: HistoricalRecord[]
        }

        // Perform the heavy calculation in the worker thread
        const result = await calculateRouteMetrics(
          selectedCity,
          timeFilters,
          realtimeRoadSegments,
          rawHistoricalData,
        )

        // Send the result back to the main thread
        self.postMessage({
          type: "ROUTE_METRICS_SUCCESS",
          payload: result,
        })
        break
      }
      default:
        throw new Error(`Unknown message type: ${type}`)
    }
  } catch (error) {
    // Send error back to main thread
    self.postMessage({
      type: "ROUTE_METRICS_ERROR",
      payload: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

export {} // Make this a module
