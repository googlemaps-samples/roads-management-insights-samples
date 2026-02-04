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
import { Suspense, lazy, useEffect, useState } from "react"

import { useAppStore } from "../store"
import { formatDuration, formatHourRange } from "../utils/formatters"
import { PanelHeader } from "./panel-header"
import { RightCard } from "./right-panel-shared"

const DualLayoutComparisonChart = lazy(
  () => import("./dual-layout-comparison-chart"),
)

const StatsGrid = styled(Box)(() => ({
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "8px",
  marginBottom: "12px",
}))

const StatCard = styled(Box)(() => ({
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "10px",
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
  marginBottom: "4px",
}))

const StatValue = styled(Typography)<{ color?: string }>(({ color }) => ({
  fontSize: "13px",
  fontWeight: 500,
  color: color || "#202124",
  fontFamily: '"Google Sans", Roboto, sans-serif',
}))

const StatSubValue = styled(Typography)(() => ({
  fontSize: "10px",
  color: "#5f6368",
  fontFamily: '"Google Sans", Roboto, sans-serif',
  fontWeight: 400,
  marginTop: "2px",
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

const ChartLoadingSkeleton = () => {
  return (
    <div className="flex items-center justify-center h-[223px] bg-gray-50 rounded-lg">
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
          Loading comparison data...
        </Typography>
      </Box>
    </div>
  )
}

const ChartErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Box sx={{ color: "error.main", mb: 1 }}>
          Failed to load comparison data
        </Box>
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
  } catch {
    setHasError(true)
    return null
  }
}

interface DualLayoutAnalysisPanelProps {
  isMinimized: boolean
  setIsMinimized: (minimized: boolean) => void
}

const DualLayoutAnalysisPanel = ({
  isMinimized,
  setIsMinimized,
}: DualLayoutAnalysisPanelProps) => {
  const activeComparisonShortcut = useAppStore(
    (state) => state.activeComparisonShortcut,
  )
  const selectedCity = useAppStore((state) => state.selectedCity)
  const timeFilters = useAppStore((state) => state.timeFilters)
  const comparisonTimeFilters = useAppStore(
    (state) => state.comparisonTimeFilters,
  )

  const leftHourlyAverages = useAppStore(
    (state) => state.averageTravelTime.main,
  )
  const rightHourlyAverages = useAppStore(
    (state) => state.averageTravelTime.comparison,
  )
  const [noDataRightText, setNoDataRightText] = useState<string>("loading...")
  const [noDataLeftText, setNoDataLeftText] = useState<string>("loading...")

  const isLeftLoading = leftHourlyAverages === null
  const isRightLoading = comparisonTimeFilters && rightHourlyAverages === null

  const [stableLeftAverage, setStableLeftAverage] = useState<number | null>(
    null,
  )
  const [stableRightAverage, setStableRightAverage] = useState<number | null>(
    null,
  )

  const leftHourRangeAverage = calculateAverageForHourRange(
    leftHourlyAverages?.hourlyTotalAverages || null,
    timeFilters.hourRange,
  )

  const rightHourRangeAverage = calculateAverageForHourRange(
    rightHourlyAverages?.hourlyTotalAverages || null,
    comparisonTimeFilters?.hourRange || timeFilters.hourRange,
  )

  useEffect(() => {
    const isLeftValid =
      leftHourRangeAverage !== null &&
      leftHourRangeAverage > 0 &&
      !isLeftLoading
    const isRightValid =
      rightHourRangeAverage !== null &&
      rightHourRangeAverage > 0 &&
      !isRightLoading

    if (isLeftValid) {
      setStableLeftAverage(leftHourRangeAverage)
    } else {
      setNoDataLeftText("No data available")
    }
    if (isRightValid) {
      setStableRightAverage(rightHourRangeAverage)
    } else {
      setNoDataRightText("No data available")
    }
  }, [
    leftHourRangeAverage,
    rightHourRangeAverage,
    isLeftLoading,
    isRightLoading,
  ])

  useEffect(() => {
    setStableLeftAverage(null)
    setStableRightAverage(null)
  }, [selectedCity.id, activeComparisonShortcut])

  const handleToggleMinimize = () => {
    setIsMinimized(!isMinimized)
  }

  const getComparisonTypeLabel = () => {
    if (activeComparisonShortcut === "weekdays-vs-weekends") {
      return "Weekdays vs Weekends"
    } else if (activeComparisonShortcut === "last-week-vs-this-week") {
      return "Last Week vs This Week"
    }
    return "Comparison Analysis"
  }

  const getComparisonDescription = () => {
    if (activeComparisonShortcut === "weekdays-vs-weekends") {
      return "Comparing weekday traffic patterns (Mon-Fri) with weekend patterns (Sat-Sun)"
    } else if (activeComparisonShortcut === "last-week-vs-this-week") {
      return "Comparing traffic patterns from last week with current week"
    }
    return "Dual layout comparison analysis"
  }

  const getLeftPanelLabel = () => {
    if (activeComparisonShortcut === "weekdays-vs-weekends") {
      return "Weekdays (Mon-Fri)"
    } else if (activeComparisonShortcut === "last-week-vs-this-week") {
      return "Last Week"
    }
    return "Left Layout"
  }

  const getRightPanelLabel = () => {
    if (activeComparisonShortcut === "weekdays-vs-weekends") {
      return "Weekends (Sat-Sun)"
    } else if (activeComparisonShortcut === "last-week-vs-this-week") {
      return "This Week"
    }
    return "Right Layout"
  }

  return (
    <RightCard $variant="live">
      <PanelHeader
        title={`${getComparisonTypeLabel()} - ${selectedCity.name}`}
        isMinimized={isMinimized}
        onToggleMinimize={handleToggleMinimize}
        infoTooltip={getComparisonDescription()}
      />
      <Collapse in={!isMinimized}>
        <CardContent>
          {/* Average Travel Time Stats for Both Panels */}
          <StatsGrid>
            {/* Left Panel Stats */}
            <StatCard>
              <StatLabel>{getLeftPanelLabel()}</StatLabel>
              <StatValue color="#9333ea">
                {stableLeftAverage !== null
                  ? `${formatDuration(stableLeftAverage)}`
                  : noDataLeftText}
              </StatValue>
              <StatSubValue>
                Travel Time <br />
                {formatHourRange(
                  `${timeFilters.hourRange[0]}-${timeFilters.hourRange[1]}`,
                )}
              </StatSubValue>
            </StatCard>

            {/* Right Panel Stats */}
            <StatCard>
              <StatLabel>{getRightPanelLabel()}</StatLabel>
              <StatValue color="#ec4899">
                {stableRightAverage !== null
                  ? `${formatDuration(stableRightAverage)}`
                  : noDataRightText}
              </StatValue>
              <StatSubValue>
                Travel Time <br />
                {formatHourRange(
                  `${comparisonTimeFilters?.hourRange?.[0] || timeFilters.hourRange[0]}-${comparisonTimeFilters?.hourRange?.[1] || timeFilters.hourRange[1]}`,
                )}
              </StatSubValue>
            </StatCard>
          </StatsGrid>

          {/* Comparison Chart */}
          <ChartErrorBoundary>
            <Suspense fallback={<ChartLoadingSkeleton />}>
              <DualLayoutComparisonChart />
            </Suspense>
          </ChartErrorBoundary>
        </CardContent>
      </Collapse>
    </RightCard>
  )
}

export default DualLayoutAnalysisPanel
