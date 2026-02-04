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

import { Box } from "@mui/material"
import React, { useEffect, useMemo } from "react"

import DualMapLayout from "../../components/dual-map-layout"
import { getHistoricalSegments } from "../../data/historical/historical-segments"
import { useProcessedRouteData } from "../../hooks"
import { useAverageTravelTime } from "../../hooks/use-average-travel-time"
import { useComparisonHistoricalData } from "../../hooks/use-comparison-historical-data"
import { useRouteMetricsWorker } from "../../hooks/use-route-metrics-worker"
import { useAppStore } from "../../store"

export const RouteReliabilityPage: React.FC = () => {
  useProcessedRouteData()

  const isComparisonMode = useAppStore((state) => state.isComparisonMode)
  const isComparisonApplied = useAppStore((state) => state.isComparisonApplied)
  const setComparisonMapData = useAppStore(
    (state) => state.setComparisonMapData,
  )
  const selectedCity = useAppStore((state) => state.selectedCity)
  const timeFilters = useAppStore((state) => state.timeFilters)
  const comparisonTimeFilters = useAppStore(
    (state) => state.comparisonTimeFilters,
  )

  // Get realtime segments for processing comparison data
  const { data: realtimeData, status: realtimeStatus } = useAppStore(
    (state) => state.queries.realtimeData,
  )
  const routeReliabilitySegments = realtimeData?.roadSegments

  // Check if comparison mode is active and applied
  const shouldShowDualLayout = isComparisonMode && isComparisonApplied

  // Fetch route metrics and average travel time for main layout
  // These hooks will automatically update the store
  useRouteMetricsWorker(selectedCity, timeFilters, true, "main")
  useAverageTravelTime(selectedCity, timeFilters, true, "main")

  // Fetch route metrics and average travel time for comparison layout
  useRouteMetricsWorker(
    selectedCity,
    comparisonTimeFilters,
    shouldShowDualLayout && comparisonTimeFilters !== null,
    "comparison",
  )
  useAverageTravelTime(
    selectedCity,
    comparisonTimeFilters,
    shouldShowDualLayout && comparisonTimeFilters !== null,
    "comparison",
  )

  // Fetch comparison data using comparison time filters
  const { data: comparisonData, isLoading: isLoadingComparison } =
    useComparisonHistoricalData(
      selectedCity,
      comparisonTimeFilters,
      shouldShowDualLayout,
    )

  // Process comparison data similar to how main data is processed
  const processedComparisonData = useMemo(() => {
    if (
      !shouldShowDualLayout ||
      !comparisonData ||
      !routeReliabilitySegments ||
      realtimeStatus !== "success"
    ) {
      return []
    }

    return getHistoricalSegments(routeReliabilitySegments, comparisonData) || []
  }, [
    shouldShowDualLayout,
    comparisonData,
    routeReliabilitySegments,
    realtimeStatus,
  ])

  // Get query status for comparison layout
  const routeMetricsComparisonStatus = useAppStore(
    (state) => state.queries.routeMetrics.comparison.status,
  )
  const averageTravelTimeComparisonStatus = useAppStore(
    (state) => state.queries.averageTravelTime.comparison.status,
  )

  useEffect(() => {
    if (shouldShowDualLayout) {
      // Check if both routeMetrics and averageTravelTime have success status for comparison layout
      const comparisonDataReady =
        routeMetricsComparisonStatus === "success" &&
        averageTravelTimeComparisonStatus === "success"

      // Always set comparison data when dual layout is shown, even if empty
      // This ensures the map is properly initialized
      if (
        !isLoadingComparison &&
        processedComparisonData.length &&
        comparisonDataReady
      ) {
        console.log(
          "setting comparison map data: processedComparisonData",
          processedComparisonData,
        )
        setComparisonMapData(processedComparisonData)
      }
    } else {
      // setComparisonMapData(null)
    }
  }, [
    shouldShowDualLayout,
    processedComparisonData,
    isLoadingComparison,
    setComparisonMapData,
    routeMetricsComparisonStatus,
    averageTravelTimeComparisonStatus,
  ])

  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none", // Allow clicks to pass through to the map
        "& > *": {
          pointerEvents: "auto", // Re-enable pointer events for child components
        },
      }}
    >
      <DualMapLayout
        shouldShowDualLayout={shouldShowDualLayout}
      ></DualMapLayout>
    </Box>
  )
}
