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

import { useEffect, useMemo, useRef } from "react"

import { getHistoricalSegments } from "../../data/historical/historical-segments"
import { convertToGeoJSON } from "../../deck-gl/helpers"
import { useAppStore } from "../../store"

export const useProcessedRouteData = () => {
  const mode = useAppStore((state) => state.mode)
  const setMapData = useAppStore((state) => state.setMapData)
  const shouldUseGreyRoutes = useAppStore((state) => state.shouldUseGreyRoutes)
  const setShouldUseGreyRoutes = useAppStore(
    (state) => state.setShouldUseGreyRoutes,
  )
  const selectedCity = useAppStore((state) => state.selectedCity)

  // Track previous city to detect city changes
  const previousCityIdRef = useRef(selectedCity.id)

  const { data: realtimeData, status: realtimeStatus } = useAppStore(
    (state) => state.queries.realtimeData,
  )
  const routeReliabilitySegments = realtimeData?.roadSegments

  const { data: historicalData, status: historicalStatus } = useAppStore(
    (state) => state.queries.filteredHistoricalData,
  )

  // Get query status for main layout
  const routeMetricsMainStatus = useAppStore(
    (state) => state.queries.routeMetrics.main.status,
  )
  const averageTravelTimeMainStatus = useAppStore(
    (state) => state.queries.averageTravelTime.main.status,
  )

  const processedData = useMemo(() => {
    if (!routeReliabilitySegments || realtimeStatus !== "success") {
      return []
    }

    if (mode === "historical") {
      if (historicalStatus === "success" && realtimeStatus === "success") {
        // Show processed historical data only if we should show grey routes (meaning we're loading new city/usecase data)
        if (shouldUseGreyRoutes) {
          // return grey routes data
          return routeReliabilitySegments.map((segment) => ({
            ...segment,
            color: "#808080",
          }))
        } else if (historicalData) {
          // Show processed historical data
          const historicalSegments =
            getHistoricalSegments(routeReliabilitySegments, historicalData) ||
            []
          return historicalSegments
        } else {
          // Return empty array if no historical data
          return []
        }
      } else if (shouldUseGreyRoutes && realtimeStatus === "success") {
        // Show realtime data as grey routes when initially switching to historical mode
        return routeReliabilitySegments.map((segment) => ({
          ...segment,
          color: "#808080",
        }))
      } else {
        // For filter changes, keep showing previous data (processedData will be updated by the mapData state)
        return []
      }
    } else if (mode === "live" && realtimeStatus === "success") {
      // Default to realtime data
      return []
    } else {
      return []
    }
  }, [
    mode,
    routeReliabilitySegments,
    historicalData,
    realtimeStatus,
    historicalStatus,
    shouldUseGreyRoutes,
  ])

  // Detect city changes and show grey routes (usecase changes are handled in store)
  useEffect(() => {
    const cityChanged = previousCityIdRef.current !== selectedCity.id

    if (cityChanged) {
      previousCityIdRef.current = selectedCity.id

      // Show grey routes when city changes in historical mode
      if (mode === "historical") {
        setShouldUseGreyRoutes(true)
      }
    }
  }, [selectedCity.id, mode, setShouldUseGreyRoutes])

  // Control grey routes display based on mode and data loading state
  useEffect(() => {
    if (mode === "historical") {
      if (shouldUseGreyRoutes) {
        if (historicalStatus === "loading") {
          // Keep grey routes when loading historical data initially (after mode switch)
          return
        } else if (historicalStatus === "success") {
          // Hide grey routes once historical data is loaded
          // Add a minimum delay to ensure grey routes are visible briefly
          setTimeout(() => {
            setShouldUseGreyRoutes(false)
          }, 300) // 300ms delay to show grey routes briefly
        }
      }
    } else if (mode === "live") {
      // Ensure grey routes are off when in live mode
      if (shouldUseGreyRoutes) {
        setShouldUseGreyRoutes(false)
      }
    }
  }, [
    mode,
    historicalStatus,
    shouldUseGreyRoutes,
    setShouldUseGreyRoutes,
    selectedCity.id,
  ])

  useEffect(() => {
    // Check if both routeMetrics and averageTravelTime have success status for main layout
    const mainDataReady =
      routeMetricsMainStatus === "success" &&
      averageTravelTimeMainStatus === "success"

    if (processedData?.length > 0 && mainDataReady) {
      // Convert processed data to MapData format
      const geoJsonData = convertToGeoJSON(processedData)
      const mapData = {
        features: geoJsonData,
      }
      setMapData(mapData)
    } else if (
      shouldUseGreyRoutes &&
      routeReliabilitySegments &&
      routeReliabilitySegments.length > 0
    ) {
      // If we should show grey routes but processedData is empty, use realtime data directly
      // Convert RouteSegment array to MapData format
      const geoJsonData = convertToGeoJSON(
        routeReliabilitySegments.map((segment) => ({
          ...segment,
          color: "#808080",
        })),
      )
      const mapData = {
        features: geoJsonData,
      }
      setMapData(mapData)
    }
  }, [
    processedData,
    setMapData,
    routeMetricsMainStatus,
    averageTravelTimeMainStatus,
    shouldUseGreyRoutes,
    routeReliabilitySegments,
  ])

  return {
    processedData,
    isLoading: historicalStatus === "success" && realtimeStatus === "success",
    routeReliabilitySegments,
    historicalData,
  }
}
