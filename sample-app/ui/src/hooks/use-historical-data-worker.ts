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

import type { UnifiedHistoricalData } from "../data/historical/data"
import { useAppStore } from "../store"
import type { City } from "../types/city"
import type { CustomTimeFilters, LastWeekMonthFilters } from "../types/filters"
import type { RouteSegment } from "../types/route-segment"
import { isDemoMode } from "../utils"

// Type for the state ref
interface StateRef {
  selectedCity: City | null
  realtimeRoadSegments: GeoJSON.FeatureCollection | null
  rawHistoricalData: unknown[] | null
}

interface UseHistoricalDataWorkerResult {
  data: UnifiedHistoricalData | null
  isLoading: boolean
  error: string | null
}

export const useHistoricalDataWorker = (
  selectedCity: City | null,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters | null,
  realtimeRoadSegments: GeoJSON.FeatureCollection | null,
  enabled: boolean = true,
  rawHistoricalData: unknown[] | null,
  rawHistoricalDataStatus?: "pending" | "loading" | "success" | "error",
): UseHistoricalDataWorkerResult => {
  const [data, setData] = useState<UnifiedHistoricalData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentRequestIdRef = useRef<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setQueryState = useAppStore((state) => state.setQueryState)

  const stateRef = useRef<StateRef | null>(null)

  stateRef.current = {
    selectedCity,
    realtimeRoadSegments,
    rawHistoricalData,
  }

  useEffect(() => {
    // Create worker if it doesn't exist
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../workers/historical-data.worker.ts", import.meta.url),
        { type: "module" },
      )

      // Message handling is now done in the promise-based approach
      workerRef.current.onmessage = (event) => {
        const { type, payload } = event.data

        switch (type) {
          case "GET_HISTORICAL_DATA_CACHE": {
            const currentState = stateRef.current
            if (currentState) {
              const { realtimeRoadSegments, rawHistoricalData } = currentState
              workerRef.current?.postMessage({
                type: "HISTORICAL_DATA_CACHE_SUCCESS",
                env: {
                  DEMO_MODE: isDemoMode() ? "true" : "false",
                },
                payload: {
                  realtimeRoadSegments,
                  rawHistoricalData,
                },
              })
            }
            break
          }
          case "FILTERED_HISTORICAL_DATA_SUCCESS":
            setData(payload)
            setIsLoading(false)
            setError(null)
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
  }, [])

  useEffect(() => {
    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    // Cancel any previous request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    if (!enabled || !selectedCity || !timeFilters) {
      // Reset state immediately when conditions aren't met
      setData(null)
      setIsLoading(false)
      setError(null)
      currentRequestIdRef.current = null
      return
    }

    // Wait for rawHistoricalData to be loaded
    if (!rawHistoricalData || rawHistoricalDataStatus !== "success") {
      // Show loading state while waiting for raw data
      setIsLoading(true)
      setError(null)
      return
    }

    if (!workerRef.current) {
      return
    }

    // Set loading state immediately
    setIsLoading(true)
    setError(null)

    // Debounce the request to avoid rapid-fire requests when dependencies change quickly
    // Use longer debounce during autoplay to reduce worker load
    const isAutoplayPlaying = useAppStore.getState().isAutoplayPlaying
    const debounceTime = isAutoplayPlaying ? 500 : 200
    debounceTimerRef.current = setTimeout(() => {
      fetchData()
    }, debounceTime)

    const fetchData = async () => {
      console.log("fetchData")
      if (
        !enabled ||
        !selectedCity ||
        !timeFilters ||
        !workerRef.current ||
        !rawHistoricalData ||
        rawHistoricalDataStatus !== "success"
      ) {
        return
      }

      // Generate a unique request ID
      const requestId = `${Date.now()}-${Math.random()}`
      currentRequestIdRef.current = requestId

      // Create new abort controller for this request
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // Sync raw data loading state
      setQueryState("allHistoricalData", "loading")

      // Create a promise for this request
      const requestPromise = new Promise<UnifiedHistoricalData>(
        (resolve, reject) => {
          // Check if request was aborted before starting
          if (abortController.signal.aborted) {
            reject(new Error("Request aborted"))
            return
          }

          const handleMessage = (event: MessageEvent) => {
            const { type, payload, requestId: responseRequestId } = event.data

            // Only process responses that match the current request ID
            if (responseRequestId !== requestId) {
              return
            }

            // Check if request was aborted
            if (abortController.signal.aborted) {
              workerRef.current?.removeEventListener("message", handleMessage)
              reject(new Error("Request aborted"))
              return
            }

            if (type === "FILTERED_HISTORICAL_DATA_SUCCESS") {
              workerRef.current?.removeEventListener("message", handleMessage)
              resolve(payload)
            } else if (type === "FILTERED_HISTORICAL_DATA_ERROR") {
              workerRef.current?.removeEventListener("message", handleMessage)
              reject(new Error(payload))
            }
          }

          // Listen for abort signal
          abortController.signal.addEventListener("abort", () => {
            workerRef.current?.removeEventListener("message", handleMessage)
            reject(new Error("Request aborted"))
          })

          workerRef.current?.addEventListener("message", handleMessage)

          // Send calculation request to worker with request ID
          workerRef.current?.postMessage({
            type: "GET_FILTERED_HISTORICAL_DATA",
            requestId,
            env: {
              DEMO_MODE: window.DEMO_MODE,
            },
            payload: {
              selectedCity,
              timeFilters,
              // realtimeRoadSegments,
              // rawHistoricalData,
            },
          })
        },
      )

      try {
        const result = await requestPromise

        // Check if request was aborted after completion or if a newer request has started
        if (
          abortController.signal.aborted ||
          currentRequestIdRef.current !== requestId
        ) {
          return
        }

        setData(result)
        setIsLoading(false)
        setError(null)

        // Sync raw data success state
        setQueryState("allHistoricalData", "success", {
          data: result,
          routeColors: result.routeColors,
          stats: {
            routeDelays: result.stats.routeDelays as unknown as RouteSegment[],
            congestionLevel: result.stats.congestionLevel,
            averageStats: result.stats.averageStats,
          },
        })
      } catch (err) {
        // Don't update state if request was aborted or if a newer request has started
        if (
          abortController.signal.aborted ||
          currentRequestIdRef.current !== requestId
        ) {
          return
        }
        setError(err instanceof Error ? err.message : "Unknown error")
        setIsLoading(false)

        // Sync raw data error state
        setQueryState(
          "allHistoricalData",
          "error",
          undefined,
          err instanceof Error ? err : new Error(String(err)),
        )
      }
    }

    // Cleanup: clear debounce timer and abort the request if the component unmounts or deps change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [
    selectedCity,
    timeFilters?.days,
    timeFilters?.timePeriod,
    timeFilters?.hourRange,
    // For custom time periods, also track date changes
    timeFilters && "startDate" in timeFilters
      ? (timeFilters as CustomTimeFilters).startDate?.toISOString()
      : null,
    timeFilters && "endDate" in timeFilters
      ? (timeFilters as CustomTimeFilters).endDate?.toISOString()
      : null,
    realtimeRoadSegments,
    enabled,
    setQueryState,
    rawHistoricalData,
    rawHistoricalDataStatus,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ])

  return {
    data,
    isLoading,
    error,
  }
}
