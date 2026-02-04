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
import React, { useCallback, useEffect, useMemo } from "react"

import { useMapContext } from "../../contexts/map-context"
import { getHistoricalSegments } from "../../data/historical/historical-segments"
import { identifyHighDelayRoutesWithPosition } from "../../data/realtime/identify-high-delay-routes"
import { convertToGeoJSON } from "../../deck-gl/helpers"
import { useAppStore } from "../../store"

const RealtimeMonitoringPage: React.FC = () => {
  const mode = useAppStore((state) => state.mode)
  const setMapData = useAppStore((state) => state.setMapData)
  const shouldUseGreyRoutes = useAppStore((state) => state.shouldUseGreyRoutes)
  const setShouldUseGreyRoutes = useAppStore(
    (state) => state.setShouldUseGreyRoutes,
  )
  const selectedCity = useAppStore((state) => state.selectedCity)

  // Use map context to communicate with UnifiedMap
  const { setOnSegmentClick } = useMapContext()
  const setAlerts = useAppStore((state) => state.setAlerts)

  // Use app store for route selection
  const setSelectedRouteId = useAppStore((state) => state.setSelectedRouteId)

  // React Query hooks for data fetching
  const { data: historicalData, status: historicalStatus } = useAppStore(
    (state) => state.queries.filteredHistoricalData,
  )

  const { data: realtimeData, status: realtimeStatus } = useAppStore(
    (state) => state.queries.realtimeData,
  )

  const realtimeRoadSegmentsData = realtimeData?.roadSegments

  // Process data for DeckGL based on mode and available data
  const processedData = useMemo(() => {
    if (!realtimeRoadSegmentsData || realtimeStatus !== "success") {
      return []
    }

    if (mode === "historical") {
      if (historicalStatus === "success" && realtimeStatus === "success") {
        // Show processed historical data only if we should show grey routes (meaning we're loading new city data)
        if (shouldUseGreyRoutes) {
          // return grey routes data
          return realtimeRoadSegmentsData.map((segment) => ({
            ...segment,
            color: "#808080",
          }))
        } else if (historicalData) {
          // Show processed historical data
          const historicalSegments =
            getHistoricalSegments(realtimeRoadSegmentsData, historicalData) ||
            []
          return historicalSegments
        } else {
          // Return empty array if no historical data
          return []
        }
      } else if (shouldUseGreyRoutes && realtimeStatus === "success") {
        // Show realtime data as grey routes when initially switching to historical mode
        return realtimeRoadSegmentsData.map((segment) => ({
          ...segment,
          color: "#808080",
        }))
      } else {
        // For filter changes, keep showing previous data (processedData will be updated by the mapData state)
        return []
      }
    } else if (mode === "live" && realtimeStatus === "success") {
      // Default to realtime data
      return realtimeRoadSegmentsData
    } else {
      return []
    }
  }, [
    mode,
    realtimeRoadSegmentsData,
    historicalData,
    realtimeStatus,
    historicalStatus,
    shouldUseGreyRoutes,
  ])

  // Generate alerts for live mode
  const routeAlerts = useMemo(() => {
    if (
      mode !== "live" ||
      !realtimeRoadSegmentsData ||
      realtimeStatus !== "success"
    ) {
      return []
    }

    return identifyHighDelayRoutesWithPosition(realtimeRoadSegmentsData)
  }, [mode, realtimeRoadSegmentsData, realtimeStatus])

  // Handle segment click
  const handleSegmentClick = useCallback(
    (segmentId: string) => {
      // Guard against undefined/null/empty segmentId
      if (!segmentId || typeof segmentId !== "string") {
        return
      }
      setSelectedRouteId(segmentId)
    },
    [setSelectedRouteId],
  )

  // Track previous city to detect city changes
  const previousCityIdRef = React.useRef(selectedCity.id)

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

  // Update map context when data changes
  useEffect(() => {
    if (processedData?.length > 0) {
      // Convert processed data to MapData format
      const geoJsonData = convertToGeoJSON(processedData)
      const mapData = {
        features: geoJsonData,
      }
      setMapData(mapData)
    } else if (
      shouldUseGreyRoutes &&
      realtimeRoadSegmentsData &&
      realtimeRoadSegmentsData.length > 0
    ) {
      // If we should show grey routes but processedData is empty, use realtime data directly
      // Convert RouteSegment array to MapData format
      const geoJsonData = convertToGeoJSON(realtimeRoadSegmentsData)
      const mapData = {
        features: geoJsonData,
      }
      setMapData(mapData)
    }

    setAlerts(routeAlerts)
    setOnSegmentClick(handleSegmentClick)
  }, [
    processedData,
    routeAlerts,
    setMapData,
    setAlerts,
    setOnSegmentClick,
    handleSegmentClick,
    shouldUseGreyRoutes,
    realtimeRoadSegmentsData,
    mode,
    historicalStatus,
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
    ></Box>
  )
}

export default RealtimeMonitoringPage
