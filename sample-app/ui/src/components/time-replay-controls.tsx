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

import { Box, CircularProgress, IconButton, Typography } from "@mui/material"
import { styled } from "@mui/material/styles"
import React, { useCallback, useEffect, useMemo, useState } from "react"

import { useAppStore } from "../store"
import { isDemoMode } from "../utils"
import {
  formatDateTime,
  getAllDaysDescription,
  getDaysDescription,
  getTimeDescription,
  getTimePeriod,
  getTimePeriodDescription,
} from "../utils/formatters"
import { CustomTooltip } from "./custom-tooltip"
import { HighlightBorderComponent } from "./highlight-border"

// Styled Components
const TimeReplayContainer = styled(Box)<{
  isPlaying?: boolean
  isEmbedded?: boolean
}>(({ isPlaying, isEmbedded }) => ({
  position: isEmbedded ? "static" : "fixed",
  bottom: isEmbedded ? "auto" : "20px",
  left: isEmbedded ? "auto" : "50%",
  transform: isEmbedded ? "none" : "translateX(-50%)",
  zIndex: isEmbedded ? "auto" : 10,
  backgroundColor: "#ffffff",
  borderRadius: "16px",
  padding: "10px 16px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "8px",
  boxShadow: isPlaying
    ? "0 1px 4px 0 rgba(60,64,67,.2), 0 4px 8px 2px rgba(60,64,67,.1), 0 0 0 1px rgba(66, 133, 244, 0.15)"
    : "0 1px 4px 0 rgba(60,64,67,.2), 0 4px 8px 2px rgba(60,64,67,.1)",
  border: "1px solid rgba(218, 220, 224, 0.6)",
  minWidth: "360px",
  maxWidth: "480px",
  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  overflow: "hidden",
  "&:hover": {
    transform: isEmbedded ? "none" : "translateX(-50%) translateY(-1px)",
    boxShadow: isPlaying
      ? "0 2px 6px 0 rgba(60,64,67,.25), 0 6px 12px 3px rgba(60,64,67,.15), 0 0 0 1px rgba(66, 133, 244, 0.2)"
      : "0 2px 6px 0 rgba(60,64,67,.25), 0 6px 12px 3px rgba(60,64,67,.15)",
  },
  "@media (max-width: 1240px)": {
    padding: "8px 14px",
    bottom: isEmbedded ? "auto" : "calc(0.5rem + 64px + 8px)", // Above left panel (0.5rem + left panel height + gap)
    top: isEmbedded ? "auto" : "auto",
    left: isEmbedded ? "auto" : "0.5rem",
    right: isEmbedded ? "auto" : "0.5rem",
    transform: isEmbedded ? "none" : "none",
    minWidth: isEmbedded ? "auto" : "360px",
    maxWidth: isEmbedded ? "100%" : "480px",
    "&:hover": {
      transform: isEmbedded ? "none" : "translateY(-1px)",
      boxShadow: isPlaying
        ? "0 2px 6px 0 rgba(60,64,67,.25), 0 6px 12px 3px rgba(60,64,67,.15), 0 0 0 1px rgba(66, 133, 244, 0.2)"
        : "0 2px 6px 0 rgba(60,64,67,.25), 0 6px 12px 3px rgba(60,64,67,.15)",
    },
  },
}))

const SummaryLine = styled(Typography)(() => ({
  color: "#5f6368",
  fontSize: "11px",
  fontWeight: 400,
  fontFamily: '"Google Sans", Roboto, Arial, sans-serif',
  textAlign: "center",
  letterSpacing: "0.1px",
  lineHeight: "16px",
  fontStyle: "normal",
  margin: "0",
  maxWidth: "100%",
  wordWrap: "break-word",
  height: "16px", // Fixed height
  overflow: "hidden",
}))

const TimeDisplayProminent = styled(Typography)(() => ({
  color: "#3c4043",
  fontSize: "11px",
  fontWeight: 600,
  fontFamily: '"Google Sans", Roboto, Arial, sans-serif',
  textAlign: "center",
  letterSpacing: "0.2px",
  lineHeight: "20px",
  margin: "0",
  maxWidth: "100%",
  whiteSpace: "pre-line",
  overflow: "hidden",
  minHeight: "20px",
  maxHeight: "40px", // Maximum 2 lines at 20px line-height
}))

const ControlButton = styled(IconButton)(() => ({
  color: "#5f6368",
  backgroundColor: "transparent",
  borderRadius: "50%",
  width: "32px",
  height: "32px",
  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  border: "none",
  "&:hover": {
    backgroundColor: "rgba(60, 64, 67, 0.08)",
    transform: "scale(1.05)",
    boxShadow: "0 2px 4px rgba(60,64,67,.1)",
  },
  "&:active": {
    backgroundColor: "rgba(60, 64, 67, 0.12)",
    transform: "scale(0.95)",
  },
  "&.play": {
    backgroundColor: "#4285F4",
    color: "#ffffff",
    boxShadow: "0 2px 4px rgba(66, 133, 244, 0.3)",
    "&:hover": {
      backgroundColor: "#3367D6",
      boxShadow: "0 4px 8px rgba(66, 133, 244, 0.4)",
      transform: "scale(1.05)",
    },
    "&:active": {
      backgroundColor: "#2E5BB8",
      transform: "scale(0.95)",
    },
  },
  "&.pause": {
    backgroundColor: "#FBBB05",
    color: "#ffffff",
    boxShadow: "0 2px 4px rgba(251, 187, 5, 0.3)",
    "&:hover": {
      backgroundColor: "#e6a804",
      boxShadow: "0 4px 8px rgba(251, 187, 5, 0.4)",
      transform: "scale(1.05)",
    },
    "&:active": {
      backgroundColor: "#d19904",
      transform: "scale(0.95)",
    },
  },
  "&.close": {
    backgroundColor: "#5f6368",
    color: "#ffffff",
    boxShadow: "0 2px 4px rgba(95, 99, 104, 0.3)",
    "&:hover": {
      backgroundColor: "#4a4d52",
      boxShadow: "0 4px 8px rgba(95, 99, 104, 0.4)",
      transform: "scale(1.05)",
    },
    "&:active": {
      backgroundColor: "#3c4043",
      transform: "scale(0.95)",
    },
  },
}))

interface TimeReplayControlsProps {
  isVisible: boolean
  isEmbedded?: boolean
}

export const TimeReplayControls: React.FC<TimeReplayControlsProps> = ({
  isVisible,
  isEmbedded = false,
}) => {
  const timeFilters = useAppStore((state) => state.timeFilters)
  const setSelectedHourRange = useAppStore(
    (state) => state.setSelectedHourRange,
  )
  const mode = useAppStore((state) => state.mode)
  const usecase = useAppStore((state) => state.usecase)
  const selectedCity = useAppStore((state) => state.selectedCity)
  const isPlaying = useAppStore((state) => state.isAutoplayPlaying)
  const setIsAutoplayPlaying = useAppStore(
    (state) => state.setIsAutoplayPlaying,
  )
  const isComparisonMode = useAppStore((state) => state.isComparisonMode)
  const isComparisonApplied = useAppStore((state) => state.isComparisonApplied)
  const activeComparisonShortcut = useAppStore(
    (state) => state.activeComparisonShortcut,
  )
  const comparisonTimeFilters = useAppStore(
    (state) => state.comparisonTimeFilters,
  )
  const { data: realtimeData, status: realtimeDataStatus } = useAppStore(
    (state) => state.queries.realtimeData,
  )
  const rawRealtimeDataTime = realtimeData?.lastUpdated

  const demoMode = isDemoMode()
  const [hasSeenPlayHighlight, setHasSeenPlayHighlight] = useState(false)

  // Check if we should show the highlight overlay for data-analytics and route-reliability usecases
  const shouldShowPlayHighlight =
    (usecase === "data-analytics" || usecase === "route-reliability") &&
    mode === "historical" &&
    !isPlaying &&
    !hasSeenPlayHighlight

  // Use the hook to get raw historical data loading state
  const { status: isHistoricalDataLoading } = useAppStore(
    (state) => state.queries.rawHistoricalData,
  )

  // Get route metrics and average travel time loading states for route-reliability
  const { status: routeMetricsStatus } = useAppStore(
    (state) => state.queries.routeMetrics.main,
  )
  const { status: averageTravelTimeStatus } = useAppStore(
    (state) => state.queries.averageTravelTime.main,
  )
  const timeReplayState = useAppStore((state) => state.timeReplayState)
  const setTimeReplayState = useAppStore((state) => state.setTimeReplayState)
  const {
    currentHour,
    hasStartedReplay,
    previousTimeFilters,
    showResetButton,
    intervalId,
  } = timeReplayState

  // Generate time range for current hour
  const getTimeRange = useCallback((hour: number) => {
    const startHour = hour
    const endHour = hour + 1

    const formatHour = (h: number) => {
      // Handle hour 24 as hour 0 (midnight)
      const normalizedHour = h === 24 ? 0 : h
      const displayHour =
        normalizedHour === 0
          ? 12
          : normalizedHour > 12
            ? normalizedHour - 12
            : normalizedHour
      const period = normalizedHour < 12 ? "AM" : "PM"
      return `${displayHour}:00 ${period}`
    }

    return {
      start: formatHour(startHour),
      end: formatHour(endHour),
      startHour,
      endHour,
    }
  }, [])

  // Get summary text for both historical and live data
  const summaryData = useMemo(() => {
    try {
      // Show comparison information if comparison mode is active
      if (isComparisonMode && isComparisonApplied && activeComparisonShortcut) {
        const timeText = getTimeDescription(timeFilters.hourRange)
        const timePeriod = getTimePeriod(
          timeFilters,
          selectedCity.availableDateRanges,
        )
        const timePeriodText = getTimePeriodDescription(timePeriod)

        if (activeComparisonShortcut === "weekdays-vs-weekends") {
          const weekdaysText = "Mon–Fri"
          const weekendsText = "Sat–Sun"
          return {
            dataRange: `Comparing Weekdays vs Weekends traffic patterns`,
            dayTime: `${weekdaysText} vs ${weekendsText} | ${timeText}\n${timePeriodText}`,
          }
        } else if (activeComparisonShortcut === "last-week-vs-this-week") {
          const dayText = getDaysDescription(timeFilters.days || [])

          // Get separate date ranges for both weeks
          const lastWeekPeriod = getTimePeriod(
            timeFilters,
            selectedCity.availableDateRanges,
          )
          const thisWeekPeriod = comparisonTimeFilters
            ? getTimePeriod(
                comparisonTimeFilters,
                selectedCity.availableDateRanges,
              )
            : lastWeekPeriod

          const lastWeekText = getTimePeriodDescription(lastWeekPeriod)
          const thisWeekText = getTimePeriodDescription(thisWeekPeriod)

          return {
            dataRange: `Comparing This Week vs Last Week traffic patterns`,
            dayTime: `Last Week (${lastWeekText}) vs This Week (${thisWeekText})\n${dayText} | ${timeText}`,
          }
        }
      }

      if (mode === "historical") {
        const timePeriod = getTimePeriod(
          timeFilters,
          selectedCity.availableDateRanges,
        )
        const timePeriodText = getTimePeriodDescription(timePeriod)
        // Use multiple days selection
        const dayText = getDaysDescription(timeFilters.days || [])
        const timeText = getTimeDescription(timeFilters.hourRange)

        return {
          dataRange: `Historical traffic data from ${timePeriodText}`,
          dayTime: `${dayText} ${timeText}`,
        }
      } else if (mode === "live") {
        const realtimeDate = demoMode
          ? selectedCity?.liveDataDate
          : new Date(rawRealtimeDataTime || "")

        return {
          dataRange: `Showing real-time traffic for ${selectedCity.name}`,
          dayTime: `at ${formatDateTime(realtimeDate)}`,
        }
      }

      return { dataRange: "", dayTime: "" }
    } catch {
      return {
        dataRange:
          mode === "historical"
            ? "Historical traffic data analysis"
            : "Live traffic monitoring",
        dayTime: "",
      }
    }
  }, [
    mode,
    timeFilters,
    selectedCity,
    isComparisonMode,
    isComparisonApplied,
    activeComparisonShortcut,
    comparisonTimeFilters,
    demoMode,
    rawRealtimeDataTime,
  ])

  // Update time filters based on current hour
  const updateTimeFilters = useCallback(
    (hour: number) => {
      const timeRange = getTimeRange(hour)

      // Batch the time filter update to reduce re-renders during autoplay
      // Use a more efficient update that doesn't trigger unnecessary side effects
      const state = useAppStore.getState()
      if (
        state.timeFilters.hourRange[0] !== timeRange.startHour ||
        state.timeFilters.hourRange[1] !== timeRange.endHour
      ) {
        setSelectedHourRange([timeRange.startHour, timeRange.endHour])
      }
    },
    [setSelectedHourRange, getTimeRange],
  )

  // Play function
  const handlePlay = useCallback(() => {
    // Hide the highlight overlay once user has clicked the play button
    setHasSeenPlayHighlight(true)

    // Only save current time filters if this is the first time playing (not resuming from pause)
    if (!hasStartedReplay) {
      setTimeReplayState({
        previousTimeFilters: { ...timeFilters },
        showResetButton: true,
        hasStartedReplay: true,
      })
    }

    // Start from the current selectedHourRange start hour
    const startHour = timeFilters.hourRange[0]
    setTimeReplayState({ currentHour: startHour })
    updateTimeFilters(startHour)

    setIsAutoplayPlaying(true)

    const newIntervalId = setInterval(() => {
      const state = useAppStore.getState()
      const prevHour = state.timeReplayState.currentHour
      const nextHour = prevHour + 1

      // Loop back to 0 (12 AM) when reaching 24 (midnight) to complete full 24-hour cycle
      if (nextHour >= 24) {
        updateTimeFilters(0)
        setTimeReplayState({ currentHour: 0 })
      } else {
        updateTimeFilters(nextHour)
        setTimeReplayState({ currentHour: nextHour })
      }
    }, 1500) // Update every 1.5 seconds

    // Store the interval ID in the store
    setTimeReplayState({ intervalId: newIntervalId })
  }, [
    updateTimeFilters,
    timeFilters,
    setIsAutoplayPlaying,
    hasStartedReplay,
    setTimeReplayState,
  ])

  // Pause function
  const handlePause = useCallback(() => {
    setIsAutoplayPlaying(false)
    if (intervalId !== null) {
      clearInterval(intervalId)
      setTimeReplayState({ intervalId: null })
    }
  }, [setIsAutoplayPlaying, intervalId, setTimeReplayState])

  // Close function - restore previous time filters
  const handleClose = useCallback(() => {
    setIsAutoplayPlaying(false)

    if (intervalId !== null) {
      clearInterval(intervalId)
    }

    // Restore previous time filters (user's original selection)
    if (previousTimeFilters) {
      setSelectedHourRange(previousTimeFilters.hourRange)
    }

    // Reset replay state
    setTimeReplayState({
      currentHour: 0,
      hasStartedReplay: false,
      showResetButton: false,
      previousTimeFilters: null,
      intervalId: null,
    })
  }, [
    previousTimeFilters,
    setSelectedHourRange,
    setIsAutoplayPlaying,
    setTimeReplayState,
    intervalId,
  ])

  // Stop replay when comparison mode changes
  useEffect(() => {
    // If replay is active, stop it when comparison mode changes
    if (isPlaying || showResetButton) {
      // When entering comparison mode, pause autoplay but preserve previousTimeFilters
      // so they can be restored when exiting comparison mode
      setIsAutoplayPlaying(false)

      if (intervalId !== null) {
        clearInterval(intervalId)
      }

      // Reset replay state BUT preserve previousTimeFilters
      setTimeReplayState({
        currentHour: 0,
        hasStartedReplay: false,
        showResetButton: false,
        intervalId: null,
        // Preserve previousTimeFilters so it can be restored when exiting comparison mode
        previousTimeFilters: previousTimeFilters,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComparisonMode, isComparisonApplied, activeComparisonShortcut])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const state = useAppStore.getState()
      if (state.timeReplayState.intervalId !== null) {
        clearInterval(state.timeReplayState.intervalId)
      }
    }
  }, [])

  // Don't render if not visible or not in historical/live mode
  if (!isVisible || (mode !== "historical" && mode !== "live")) {
    return null
  }

  // Show loading indicator for data in non-demo mode
  const isLoadingData =
    !demoMode &&
    (() => {
      if (mode === "historical") {
        // For route-reliability use case, also check route metrics and average travel time
        if (usecase === "route-reliability") {
          return (
            isHistoricalDataLoading !== "success" ||
            routeMetricsStatus !== "success" ||
            averageTravelTimeStatus !== "success"
          )
        }
        // For other use cases, only check historical data
        return isHistoricalDataLoading !== "success"
      }

      if (mode === "live") {
        return (
          realtimeDataStatus === "loading" || realtimeDataStatus === "pending"
        )
      }

      return false
    })()

  const timeRange = getTimeRange(currentHour)

  return (
    <TimeReplayContainer isPlaying={isPlaying} isEmbedded={isEmbedded}>
      {isLoadingData ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Box
            sx={{
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress size={24} sx={{ color: "#4285F4" }} />
          </Box>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              flex: 1,
              minHeight: "38px",
              justifyContent: "center",
            }}
          >
            <SummaryLine>
              {mode === "historical"
                ? usecase === "route-reliability"
                  ? "Loading route reliability data..."
                  : "Loading historical data..."
                : "Loading real-time data..."}
            </SummaryLine>
            <TimeDisplayProminent>
              {mode === "historical" && usecase === "route-reliability"
                ? "Calculating route metrics and travel times..."
                : "Please wait while we fetch traffic data"}
            </TimeDisplayProminent>
          </Box>
        </Box>
      ) : (
        summaryData.dataRange && (
          <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Close replay button - show when replay is active */}
            {mode === "historical" &&
              previousTimeFilters &&
              showResetButton && (
                <ControlButton
                  className="close"
                  onClick={handleClose}
                  size="small"
                  title="Close replay and restore original time range"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </ControlButton>
              )}

            {mode === "historical" && !isPlaying && (
              <CustomTooltip
                title={
                  shouldShowPlayHighlight ? "Click to start time replay" : ""
                }
                placement="top"
                arrow
              >
                <Box sx={{ position: "relative" }}>
                  {shouldShowPlayHighlight && <HighlightBorderComponent />}
                  <ControlButton
                    className="play"
                    onClick={handlePlay}
                    size="small"
                    title="Start traffic pattern replay"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </ControlButton>
                </Box>
              </CustomTooltip>
            )}

            {mode === "historical" && isPlaying && (
              <ControlButton
                className="pause"
                onClick={handlePause}
                size="small"
                title="Pause traffic pattern replay"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              </ControlButton>
            )}

            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                flex: 1,
                minHeight: "38px", // Minimum height: 16px + 2px gap + 20px = 38px
                justifyContent: "center", // Center content vertically
              }}
            >
              <SummaryLine>{summaryData.dataRange}</SummaryLine>
              {isPlaying && mode === "historical" ? (
                <TimeDisplayProminent>
                  Currently viewing:{" "}
                  {isComparisonMode &&
                  activeComparisonShortcut === "weekdays-vs-weekends" ? (
                    <>
                      {timeRange.start} - {timeRange.end}
                    </>
                  ) : isComparisonMode &&
                    activeComparisonShortcut === "last-week-vs-this-week" ? (
                    <>
                      {timeRange.start} - {timeRange.end}
                    </>
                  ) : (
                    <>
                      {timeFilters.days && timeFilters.days.length > 0 ? (
                        timeFilters.days.length > 4 ? (
                          <CustomTooltip
                            title={getAllDaysDescription(timeFilters.days)}
                            arrow
                            placement="top"
                          >
                            <span style={{ cursor: "help" }}>
                              {getDaysDescription(timeFilters.days)},
                            </span>
                          </CustomTooltip>
                        ) : (
                          `${getDaysDescription(timeFilters.days)}, `
                        )
                      ) : (
                        ""
                      )}
                      {timeRange.start} - {timeRange.end}
                    </>
                  )}
                </TimeDisplayProminent>
              ) : (
                <TimeDisplayProminent>
                  {(() => {
                    // In comparison mode, don't show individual day tooltips since the summary already contains the comparison info
                    if (
                      isComparisonMode &&
                      isComparisonApplied &&
                      activeComparisonShortcut
                    ) {
                      return summaryData.dayTime
                    }

                    // For non-comparison mode, show tooltip if there are many days
                    return timeFilters.days && timeFilters.days.length > 4 ? (
                      <CustomTooltip
                        title={getAllDaysDescription(timeFilters.days)}
                        arrow
                        placement="top"
                      >
                        <span style={{ cursor: "help" }}>
                          {summaryData.dayTime}
                        </span>
                      </CustomTooltip>
                    ) : (
                      summaryData.dayTime
                    )
                  })()}
                </TimeDisplayProminent>
              )}
            </Box>
          </Box>
        )
      )}
    </TimeReplayContainer>
  )
}
