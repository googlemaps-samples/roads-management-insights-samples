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

import CloseIcon from "@mui/icons-material/Close"
import React from "react"

import { useAppStore } from "../store"
import { RouteSegment } from "../types/route-segment"
import { formatDuration, formatSecondsToShow } from "../utils/formatters"
import { shouldShowDelay } from "./helpers"

// Common data source interface that covers all possible data structures
interface TooltipDataSource {
  id?: string
  routeId?: string
  duration?: number
  averageDuration?: number
  staticDuration?: number
  delay?: number
  delayTime?: number
  delayRatio?: number
  averageSpeed?: number
  length?: number
  color?: string
  path?: (google.maps.LatLng | { lat: number; lng: number })[]
  name?: string
  type?: string
  congestionLevel?: string
  historicalRouteId?: string
}

interface TooltipProps {
  hoveredObject: {
    properties?: TooltipDataSource
  } | null
  mode: string
  usecase?: string
  onClose?: () => void
  positionBelow?: boolean
  x?: number
  y?: number
}

/**
 * Custom tooltip component for DeckGL map that matches the Google Maps style
 */
const DeckTooltip: React.FC<TooltipProps> = ({
  hoveredObject,
  mode,
  onClose,
  positionBelow = false,
}) => {
  // Get selectedRouteSegment from the store - this has the most up-to-date data
  const selectedRouteSegment = useAppStore(
    (state) => state.selectedRouteSegment,
  )

  const currentUsecase = useAppStore((state) => state.usecase)

  const { data: realtimeData } = useAppStore(
    (state) => state.queries.realtimeData,
  )

  const realtimeRoadSegmentsData = realtimeData?.roadSegments

  // Get historical data for historical mode
  const { data: historicalData } = useAppStore(
    (state) => state.queries.filteredHistoricalData,
  )

  if (!hoveredObject) {
    return null
  }
  // Find the correct segment based on mode and use case
  let correctSegment: TooltipDataSource | null = null

  if (
    currentUsecase === "realtime-monitoring" ||
    currentUsecase === "data-analytics"
  ) {
    // For realtime monitoring, use the appropriate data source based on mode
    if (mode === "live") {
      // In live mode, use realtime roadSegments directly
      // realtimeRoadSegmentsData is already processed, not raw GeoJSON
      const liveSegment = realtimeRoadSegmentsData?.find(
        (segment: RouteSegment) =>
          (segment as RouteSegment & { routeId?: string }).routeId ===
            selectedRouteSegment?.id || segment.id === selectedRouteSegment?.id,
      )
      correctSegment = liveSegment || null
    } else {
      // In historical mode, prioritize hoveredObject properties since it contains processed data
      // from getHistoricalSegments which includes grey routes for segments without historical data
      if (hoveredObject?.properties) {
        correctSegment = hoveredObject.properties
      } else {
        // Fallback to historical data stats for selected route
        const routeDelays = historicalData?.stats?.routeDelays
        if (routeDelays) {
          const historicalSegment = routeDelays.find(
            (route: RouteSegment) =>
              (route as RouteSegment & { routeId?: string }).routeId ===
              selectedRouteSegment?.id,
          )
          correctSegment = historicalSegment || null
        }
      }
    }
  }

  // Use correct segment data if available, otherwise fall back to selectedRouteSegment or hoveredObject properties
  const rawDataSource: TooltipDataSource =
    correctSegment || selectedRouteSegment || hoveredObject?.properties || {}

  // Normalize the data structure to handle different field names between realtime and historical
  const dataSource: TooltipDataSource = {
    ...rawDataSource,
    // Historical data uses 'averageDuration', realtime uses 'duration'
    duration: rawDataSource.duration || rawDataSource.averageDuration,
  }

  const {
    delay = 0,
    duration = 0,
    delayRatio = 1,
    delayTime = 0,
    color = "#9E9E9E",
  } = dataSource

  // Check if route has no historical data based on color
  const hasNoHistoricalData = color === "#9E9E9E" || color === "#9e9e9e"

  // Use delayTime directly to match the panel behavior
  const actualDelay = delayTime || delay || 0

  // Ensure delay is a valid number
  const validDelay = actualDelay && !isNaN(actualDelay) ? actualDelay : 0

  // Calculate values for display
  const averageDelayPercentage =
    delayRatio && !isNaN(delayRatio) ? (delayRatio - 1) * 100 : 0
  const averageDuration = duration && !isNaN(duration) ? duration : 0
  const staticDuration =
    dataSource.staticDuration && !isNaN(dataSource.staticDuration)
      ? dataSource.staticDuration
      : 0

  const delayToShow = shouldShowDelay(validDelay)
    ? `${averageDelayPercentage.toFixed(1)}% (+${formatSecondsToShow(validDelay)}s)`
    : "No delay"

  let tooltipTitle: string
  let tooltipSubtitle: string
  let travelTimeText: string
  let delayText: string

  if (mode === "historical") {
    tooltipTitle = "Historical Analysis"
    tooltipSubtitle = hasNoHistoricalData
      ? "This route segment does not have historical traffic data for analysis."
      : "Historical traffic pattern analysis"
    travelTimeText = "Travel Time (Average)"
    delayText = "Delay (Average)"
  } else {
    tooltipTitle = "Route Status"
    tooltipSubtitle = "Realtime traffic data"
    travelTimeText = "Travel Time (Now)"
    delayText = "Delay"
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onClose) {
      onClose()
    }
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()} // Prevent clicks on tooltip from propagating
      style={{
        position: "absolute",
        transform: positionBelow
          ? "translate(-50%, 20px)"
          : "translate(-50%, calc(-100% - 20px))",
        backgroundColor: "white",
        borderRadius: "12px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        padding: "12px",
        minWidth: "220px",
        maxWidth: "280px",
        zIndex: 1000,
        fontFamily: '"Google Sans", Roboto, Arial, sans-serif',
        border: "1px solid rgba(0,0,0,0.12)",
        pointerEvents: "auto", // Allow interaction with the tooltip
      }}
    >
      {/* Header with title and close button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "8px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: 500,
            color: "#1a73e8",
            fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
            letterSpacing: "0.1px",
            lineHeight: "16px",
          }}
        >
          {tooltipTitle}
        </h3>
        <button
          onClick={(e) => {
            handleClose(e)
          }}
          style={{
            cursor: "pointer",
            padding: "2px", // Increased padding for easier clicking
            margin: "-3px -3px 0 0",
            borderRadius: "50%",
            border: "none",
            background: "#f1f3f4", // Make button more visible for debugging
            color: "#5f6368",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background-color 0.2s",
            zIndex: 2147483647, // Ensure it's above other elements
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#e0e0e0" // Darker hover state
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#f1f3f4"
          }}
        >
          <CloseIcon style={{ fontSize: 14 }} /> {/* Slightly larger icon */}
        </button>
      </div>

      {/* Content area */}
      <div style={{ margin: "12px 0" }}>
        {/* Show "No historical data available" if route color is grey */}
        {hasNoHistoricalData ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "4px",
              fontSize: "11px",
              color: "#5f6368",
              fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
            }}
          >
            <span>Status:</span>
            <span style={{ fontWeight: 500, color: color || "#9E9E9E" }}>
              No historical data available
            </span>
          </div>
        ) : (
          <>
            {/* Travel Time (Average) */}
            {averageDuration > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                  fontSize: "11px",
                  color: "#5f6368",
                  fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
                }}
              >
                <span>{travelTimeText}:</span>
                <span style={{ fontWeight: 500, color: "#202124" }}>
                  {formatDuration(averageDuration)}
                </span>
              </div>
            )}

            {/* Travel Time (Free Flow) */}
            {staticDuration > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                  fontSize: "11px",
                  color: "#5f6368",
                  fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
                }}
              >
                <span>Travel Time (Free Flow):</span>
                <span style={{ fontWeight: 500, color: "#202124" }}>
                  {formatDuration(staticDuration)}
                </span>
              </div>
            )}

            {/* Delay */}
            {staticDuration > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                  fontSize: "11px",
                  color: "#5f6368",
                  fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
                }}
              >
                <span>{delayText}:</span>
                <span
                  style={{
                    fontWeight: 500,
                    color: delayToShow === "No delay" ? "#4285F4" : "#E94335",
                  }}
                >
                  {delayToShow}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          paddingTop: "8px",
          borderTop: "1px solid #e8eaed",
          marginTop: "8px",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            color: "#5f6368",
            fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
            textAlign: "center",
            fontStyle: "italic",
          }}
        >
          {tooltipSubtitle}
        </div>
      </div>

      {/* Arrow pointing to the segment */}
      <div
        style={{
          position: "absolute",
          ...(positionBelow
            ? { top: "-8px", left: "50%" }
            : { bottom: "-8px", left: "50%" }),
          transform: "translateX(-50%)",
          width: "16px",
          height: "8px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "10px",
            height: "10px",
            backgroundColor: "white",
            transform: "translateX(-50%) rotate(45deg)",
            ...(positionBelow
              ? {
                  bottom: "-5px",
                  left: "50%",
                  boxShadow: "0 -2px 4px rgba(0,0,0,0.15)",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderBottom: "none",
                  borderRight: "none",
                }
              : {
                  top: "-5px",
                  left: "50%",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderTop: "none",
                  borderLeft: "none",
                }),
          }}
        ></div>
      </div>
    </div>
  )
}

export default DeckTooltip
