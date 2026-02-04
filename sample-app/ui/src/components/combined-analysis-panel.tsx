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
  Box,
  CardContent,
  CircularProgress,
  Collapse,
  Typography,
} from "@mui/material"
import { styled } from "@mui/material/styles"
import { Suspense, lazy, useEffect, useRef, useState } from "react"

import { useAppStore } from "../store"
import { CustomTimeFilters } from "../types/filters"
import { formatDuration, formatHourRange } from "../utils/formatters"
import { CustomTooltip } from "./custom-tooltip"
import { PanelHeader } from "./panel-header"
import { RightCard } from "./right-panel-shared"

const RouteTimeGraphContent = lazy(() => import("./route-time-graph-content"))
const SelectedRouteSegmentGraph = lazy(
  () => import("./selected-route-segment-graph"),
)

const StatsGrid = styled(Box)(() => ({
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "6px",
  marginBottom: "8px",
}))

const StatCard = styled(Box)(() => ({
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "8px",
  border: "1px solid #e8eaed",
  boxShadow: "0 1px 4px rgba(0, 0, 0, 0.06)",
  transition: "box-shadow 0.2s ease",
  "&:hover": {
    transform: "translateY(-1px)",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
  },
}))

const StatLabel = styled(Typography)(() => ({
  fontSize: "9px",
  color: "#5f6368",
  textTransform: "uppercase",
  fontFamily: '"Google Sans", Roboto, sans-serif',
  fontWeight: 500,
  letterSpacing: "0.3px",
  marginBottom: "2px",
}))

const StatValue = styled(Typography)<{ color?: string }>(({ color }) => ({
  fontSize: "13px",
  fontWeight: 500,
  color: color || "#202124",
  fontFamily: '"Google Sans", Roboto, sans-serif',
}))

const calculateAverageForHourRange = (
  hourlyData: Map<number, { totalDuration: number; count: number }> | null,
  hourRange: [number, number],
): number | null => {
  if (!hourlyData || hourlyData.size === 0) return null

  let totalDuration = 0
  let totalCount = 0

  for (let hour = hourRange[0]; hour <= hourRange[1]; hour++) {
    const hourData = hourlyData.get(hour)
    if (hourData) {
      totalDuration += hourData.totalDuration
      totalCount += 1
    }
  }

  if (totalCount === 0) return null
  return totalDuration / totalCount
}

const GraphLoadingSkeleton = () => {
  return (
    <div className="flex items-center justify-center h-[200px] bg-gray-50 rounded-lg">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
        }}
      >
        <CircularProgress size={24} />
        <Typography variant="caption" color="text.secondary">
          Loading route metrics...
        </Typography>
      </Box>
    </div>
  )
}

const GraphErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Box sx={{ color: "error.main", mb: 1 }}>Failed to load graph data</Box>
        <Box
          sx={{
            color: "primary.main",
            cursor: "pointer",
            textDecoration: "underline",
            fontSize: "12px",
          }}
          onClick={() => setHasError(false)}
        >
          Retry
        </Box>
      </Box>
    )
  }

  try {
    return <>{children}</>
  } catch (error) {
    console.error(error)
    setHasError(true)
    return null
  }
}

interface CombinedAnalysisPanelProps {
  isMinimized: boolean
  setIsMinimized: (minimized: boolean) => void
}

const CombinedAnalysisPanel = ({
  isMinimized,
  setIsMinimized,
}: CombinedAnalysisPanelProps) => {
  const historicalData = useAppStore(
    (state) => state.queries.filteredHistoricalData.data,
  )
  const historicalDataStatus = useAppStore(
    (state) => state.queries.filteredHistoricalData.status,
  )
  const selectedRouteId = useAppStore((state) => state.selectedRouteId)
  const selectedCity = useAppStore((state) => state.selectedCity)
  const timeFilters = useAppStore((state) => state.timeFilters)

  const averageTravelTimeData = useAppStore(
    (state) => state.averageTravelTime.main,
  )
  const hourlyTotalAverages = averageTravelTimeData?.hourlyTotalAverages
  const averageTravelTimeStatus = useAppStore(
    (state) => state.queries.averageTravelTime.main.status,
  )
  const isHourlyDataLoading = averageTravelTimeData === null

  const selectedHourRangeAverage = calculateAverageForHourRange(
    hourlyTotalAverages || null,
    timeFilters.hourRange,
  )

  const [stableData, setStableData] = useState<{
    averageTravelTime: number | null
    peakCongestion: number | null
  }>({
    averageTravelTime: null,
    peakCongestion: null,
  })

  const hasReceivedDataRef = useRef(false)

  const lastDataSnapshot = useRef<{
    historicalData: number | null
    averageTravelTimeData: number | null
  }>({
    historicalData: null,
    averageTravelTimeData: null,
  })

  const newDataFlags = useRef<{
    historical: boolean
    averageTime: boolean
  }>({
    historical: false,
    averageTime: false,
  })

  useEffect(() => {
    const isHistoricalLoading =
      historicalDataStatus === "loading" || historicalDataStatus === "pending"
    const isAverageTimeLoading =
      averageTravelTimeStatus === "loading" ||
      averageTravelTimeStatus === "pending"

    if (isHistoricalLoading || isAverageTimeLoading) {
      return
    }

    const bothQueriesSuccess =
      historicalDataStatus === "success" &&
      averageTravelTimeStatus === "success"

    if (!bothQueriesSuccess) {
      return
    }

    const isHistoricalDataValid =
      historicalData?.stats?.averageStats?.congestionLevel !== undefined
    const isAverageTravelTimeValid =
      selectedHourRangeAverage !== null && !isHourlyDataLoading

    if (!isHistoricalDataValid || !isAverageTravelTimeValid) {
      return
    }

    const currentPeakCongestion =
      historicalData?.stats?.averageStats?.congestionLevel || 0
    const currentAverageTravelTime = selectedHourRangeAverage

    if (lastDataSnapshot.current.historicalData !== currentPeakCongestion) {
      newDataFlags.current.historical = true
    }

    if (
      lastDataSnapshot.current.averageTravelTimeData !==
      currentAverageTravelTime
    ) {
      newDataFlags.current.averageTime = true
    }

    const bothHaveNewData =
      newDataFlags.current.historical && newDataFlags.current.averageTime
    const onlyAverageTimeChanged =
      !newDataFlags.current.historical && newDataFlags.current.averageTime
    const isInitialLoad = !hasReceivedDataRef.current

    if (bothHaveNewData || onlyAverageTimeChanged || isInitialLoad) {
      const newData = {
        averageTravelTime: currentAverageTravelTime,
        peakCongestion: currentPeakCongestion,
      }

      setStableData(newData)
      hasReceivedDataRef.current = true

      lastDataSnapshot.current = {
        historicalData: currentPeakCongestion,
        averageTravelTimeData: currentAverageTravelTime,
      }

      newDataFlags.current = {
        historical: false,
        averageTime: false,
      }
    }
  }, [
    selectedHourRangeAverage,
    isHourlyDataLoading,
    historicalData?.stats?.averageStats?.congestionLevel,
    historicalDataStatus,
    averageTravelTimeStatus,
  ])

  useEffect(() => {
    setStableData({
      averageTravelTime: null,
      peakCongestion: null,
    })
    lastDataSnapshot.current = {
      historicalData: null,
      averageTravelTimeData: null,
    }
    newDataFlags.current = {
      historical: false,
      averageTime: false,
    }
    hasReceivedDataRef.current = false
  }, [selectedCity.id])

  // Extract complex expressions for useEffect dependencies
  const startDateTime =
    "startDate" in timeFilters
      ? (timeFilters as CustomTimeFilters).startDate?.getTime()
      : null
  const endDateTime =
    "endDate" in timeFilters
      ? (timeFilters as CustomTimeFilters).endDate?.getTime()
      : null

  useEffect(() => {
    newDataFlags.current = {
      historical: false,
      averageTime: false,
    }
  }, [
    timeFilters.days,
    timeFilters.timePeriod,
    timeFilters.hourRange,
    startDateTime,
    endDateTime,
  ])

  const shouldShowLoading =
    stableData.averageTravelTime === null || stableData.peakCongestion === null

  const handleToggleMinimize = () => {
    setIsMinimized(!isMinimized)
  }

  return (
    <RightCard $variant="live">
      <PanelHeader
        title={`Route Analysis - ${selectedCity.name}`}
        subTitle={selectedCity.subTitle}
        isMinimized={isMinimized}
        onToggleMinimize={handleToggleMinimize}
        infoTooltip="Route analysis and historical travel time patterns"
      />
      <Collapse in={!isMinimized}>
        <CardContent >
          {!selectedRouteId && (
            <StatsGrid>
              {/* Peak Congestion Level */}
              <CustomTooltip
                title="The highest congestion percentage observed during peak hours, indicating how much slower traffic moves compared to free-flow conditions"
                placement="top"
              >
                <StatCard>
                  <StatLabel>Peak Congestion</StatLabel>
                  {shouldShowLoading ? (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        minHeight: "20px",
                      }}
                    >
                      <StatValue color="#ea4335" sx={{ fontSize: "11px" }}>
                        Calculating...
                      </StatValue>
                    </Box>
                  ) : (
                    <StatValue color="#ea4335">
                      {stableData.peakCongestion !== null &&
                      stableData.peakCongestion > 0
                        ? `${stableData.peakCongestion.toFixed(1)}%`
                        : "No congestion"}
                    </StatValue>
                  )}
                </StatCard>
              </CustomTooltip>

              {/* Selected Hour Range Average */}
              <CustomTooltip
                title={`Average travel time for the selected time range (${formatHourRange(
                  `${timeFilters.hourRange[0]}-${timeFilters.hourRange[1]}`,
                )}), calculated from historical data`}
                placement="top"
              >
                <StatCard>
                  <StatLabel>Travel Time</StatLabel>
                  {shouldShowLoading ? (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        minHeight: "20px",
                      }}
                    >
                      <StatValue color="#4285F4" sx={{ fontSize: "11px" }}>
                        Calculating...
                      </StatValue>
                    </Box>
                  ) : (
                    <StatValue color="#4285F4">
                      {stableData.averageTravelTime !== null
                        ? formatDuration(stableData.averageTravelTime)
                        : "No travel time data"}
                    </StatValue>
                  )}
                </StatCard>
              </CustomTooltip>
            </StatsGrid>
          )}

          {/* Route Time Graph or Selected Route Graph */}
          <Box sx={{ mt: 0 }}>
            <GraphErrorBoundary>
              <Suspense fallback={<GraphLoadingSkeleton />}>
                {selectedRouteId ? (
                  <SelectedRouteSegmentGraph />
                ) : (
                  <RouteTimeGraphContent />
                )}
              </Suspense>
            </GraphErrorBoundary>
          </Box>
        </CardContent>
      </Collapse>
    </RightCard>
  )
}

export default CombinedAnalysisPanel
