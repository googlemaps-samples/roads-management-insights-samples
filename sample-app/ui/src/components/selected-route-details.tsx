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

import { InfoOutlined } from "@mui/icons-material"
import { Box, Tab, Tabs, Typography } from "@mui/material"
import { useState } from "react"

import { shouldShowDelay } from "../deck-gl/helpers"
import { useAppStore } from "../store"
import { formatHour, formatSecondsToShow } from "../utils/formatters"
import { BackButton } from "./back-button"
import { CustomTooltip } from "./custom-tooltip"
import Graph from "./graph"

interface SelectedRouteDetailsProps {
  onBack: () => void
  showGraph?: boolean
  title?: string
}

export const SelectedRouteDetails = ({
  onBack,
  showGraph = true,
  title,
}: SelectedRouteDetailsProps) => {
  const selectedRouteSegment = useAppStore(
    (state) => state.selectedRouteSegment,
  )
  const setSelectedRouteId = useAppStore((state) => state.setSelectedRouteId)
  const [isGraphView, setIsGraphView] = useState(false)

  if (!selectedRouteSegment) return null

  const shouldShowDelayValue = shouldShowDelay(
    Number(selectedRouteSegment.delayTime) || 0,
  )

  // Calculate peak congestion time and level
  const getPeakCongestionInfo = () => {
    // Use the actual peakCongestionLevel from selectedRouteSegment if available
    const congestionLevel = selectedRouteSegment.peakCongestionLevel as
      | number
      | undefined

    // Use the actual peakCongestionHourRange from selectedRouteSegment if available
    let timeRange = null
    const hourRange = selectedRouteSegment.peakCongestionHourRange as
      | string
      | undefined
    if (hourRange && typeof hourRange === "string") {
      // Convert hour range to AM/PM format
      const formatHourToAMPM = (hour: number) => {
        // Handle hour 24 as hour 0 (midnight)
        if (hour === 24) hour = 0
        return formatHour(hour)
      }

      // Extract start and end hours from the range
      const hourMatch = hourRange.match(/(\d+)-(\d+)/)
      if (hourMatch) {
        const startHour = parseInt(hourMatch[1])
        const endHour = parseInt(hourMatch[2])

        // Handle cases where start and end hours are the same
        const displayStartHour = startHour
        let displayEndHour = endHour

        if (startHour === endHour) {
          // If hours are the same, create a proper range
          displayEndHour = startHour + 1
        }

        const startTime = formatHourToAMPM(displayStartHour)
        const endTime = formatHourToAMPM(displayEndHour)
        timeRange = `${startTime} - ${endTime}`
      } else {
        // Fallback to original format if parsing fails
        timeRange = hourRange
      }
    }

    return { level: congestionLevel, timeRange }
  }

  const peakCongestionInfo = getPeakCongestionInfo()

  return (
    <Box>
      {/* Back Button and Route Header */}
      <BackButton
        onClick={() => {
          setSelectedRouteId("")
          onBack()
        }}
        subtitle={
          title ||
          `Route ${((selectedRouteSegment.id || (selectedRouteSegment as { routeId?: string }).routeId) as string)?.slice(0, 8).toUpperCase() || "Unknown"}`
        }
      />

      {/* Tabbed Navigation - Stats/Graph View */}
      {showGraph && (
        <Box sx={{ mb: 2 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <Tabs
              value={isGraphView ? 1 : 0}
              onChange={(_, newValue) => setIsGraphView(newValue === 1)}
              sx={{
                width: "100%",
                minHeight: "32px",
                "& .MuiTabs-indicator": {
                  backgroundColor: "#1a73e8",
                  height: "2px",
                },
                "& .MuiTab-root": {
                  flex: 1,
                  minHeight: "32px",
                  padding: "6px 16px",
                  fontSize: "12px",
                  fontFamily: '"Google Sans", Roboto, sans-serif',
                  fontWeight: 600,
                  textTransform: "none",
                  color: "#5f6368",
                  "&.Mui-selected": {
                    color: "#1a73e8",
                  },
                  "&:hover": {
                    backgroundColor: "rgba(26, 115, 232, 0.04)",
                    color: "#1a73e8",
                  },
                },
              }}
            >
              <Tab label="Stats" />
              <Tab label="Graph" />
            </Tabs>
          </Box>
        </Box>
      )}

      {/* Metrics Grid - Only show when stats view is selected or no graph */}
      {(!showGraph || !isGraphView) && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "12px",
            mb: 2,
          }}
        >
          {/* Peak Congestion Card */}
          <Box
            sx={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "16px",
              border: "1px solid #e8eaed",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
              transition: "all 0.2s ease",
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
              },
            }}
          >
            <Typography
              sx={{
                fontSize: "11px",
                color: "#5f6368",
                fontFamily: '"Google Sans", Roboto, sans-serif',
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                mb: 1,
              }}
            >
              Peak Congestion
            </Typography>
            <Box
              sx={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#FBBB05",
                fontFamily: '"Google Sans", Roboto, sans-serif',
              }}
            >
              {peakCongestionInfo.level &&
              peakCongestionInfo.level > 0 &&
              shouldShowDelayValue ? (
                <>
                  {peakCongestionInfo.timeRange}
                  <br />
                  <span style={{ fontSize: "12px" }}>
                    {peakCongestionInfo.level.toFixed(1)}% congestion
                  </span>
                </>
              ) : (
                <span style={{ fontSize: "18px" }}>None</span>
              )}
            </Box>
            <CustomTooltip
              title="Time of day when this route experiences the highest traffic congestion and longest delays."
              arrow
              placement="top"
            >
              <Typography
                sx={{
                  fontSize: "10px",
                  color: "#9aa0a6",
                  fontFamily: '"Google Sans", Roboto, sans-serif',
                  cursor: "help",
                  marginTop: "4px",
                }}
              >
                Busiest hour(s){" "}
                <InfoOutlined
                  sx={{
                    fontSize: "10px",
                    color: "#5f6368",
                    cursor: "help",
                    opacity: 0.7,
                    "&:hover": { opacity: 1 },
                  }}
                />
              </Typography>
            </CustomTooltip>
          </Box>

          {/* Average Delay Card */}
          <Box
            sx={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "16px",
              border: "1px solid #e8eaed",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
              transition: "all 0.2s ease",
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
              },
            }}
          >
            <Typography
              sx={{
                fontSize: "11px",
                color: "#5f6368",
                textTransform: "uppercase",
                fontFamily: "Google Sans, Roboto, sans-serif",
                fontWeight: 500,
                letterSpacing: "0.5px",
                mb: 1,
              }}
            >
              Average Delay
            </Typography>
            <Typography
              sx={{
                fontSize: "18px",
                fontWeight: 600,
                color: shouldShowDelayValue ? "#ea4336" : "#4285F4",
                fontFamily: '"Google Sans", Roboto, sans-serif',
              }}
            >
              {shouldShowDelayValue
                ? `${formatSecondsToShow(Number(selectedRouteSegment.delayTime) || 0)}s`
                : "No delay"}
            </Typography>
            <CustomTooltip
              title="Average time delay compared to expected travel time. Calculated as the mean of all route delays in the selected time period."
              arrow
              placement="top"
            >
              <Typography
                sx={{
                  fontSize: "10px",
                  color: "#9aa0a6",
                  fontFamily: '"Google Sans", Roboto, sans-serif',
                  cursor: "help",
                  marginTop: "4px",
                }}
              >
                Longer than usual{" "}
                <InfoOutlined
                  sx={{
                    fontSize: "10px",
                    color: "#5f6368",
                    cursor: "help",
                    opacity: 0.7,
                    "&:hover": { opacity: 1 },
                  }}
                />
              </Typography>
            </CustomTooltip>
          </Box>
        </Box>
      )}

      {/* Graph View for Route - Only show when graph view is selected */}
      {showGraph && isGraphView && (
        <Box>
          <Graph />
        </Box>
      )}
    </Box>
  )
}
