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

import { Box, CircularProgress, Typography } from "@mui/material"
import ReactECharts from "echarts-for-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useAppStore } from "../store"
import { formatDuration } from "../utils"
import { BackButton } from "./back-button"
import { CustomTooltip } from "./custom-tooltip"

const SelectedRouteSegmentGraph = () => {
  const selectedRouteId = useAppStore((state) => state.selectedRouteId)
  const setSelectedRouteId = useAppStore((state) => state.setSelectedRouteId)

  // Get average travel time data from store (calculated by use-average-travel-time hook)
  // This updates with date range/day changes and fetches all 24 hours
  const averageTravelTimeQuery = useAppStore(
    (state) => state.queries.averageTravelTime.main,
  )
  const routeHourlyAverages = averageTravelTimeQuery.data?.routeHourlyAverages

  // Get route metrics from store (calculated by use-route-metrics-worker hook)
  // This includes perRouteMetrics with 95th percentile data for each route
  const routeMetricsQuery = useAppStore(
    (state) => state.queries.routeMetrics.main,
  )
  const routeMetrics = routeMetricsQuery.data

  const [hasEverLoadedData, setHasEverLoadedData] = useState(false)

  // Combine data from both sources to build complete route metrics
  const routeMetricsData = useMemo(() => {
    if (!selectedRouteId || !routeHourlyAverages || !routeMetrics) {
      return null
    }

    // Get average travel times for this specific route (updates with filters)
    const routeAvgTimes = routeHourlyAverages.get(selectedRouteId)

    // Get per-route 95th percentile and free flow metrics
    const perRoute95th =
      routeMetrics.perRouteMetrics?.hourly95thPercentile?.get(selectedRouteId)
    const perRouteFreeFlow =
      routeMetrics.perRouteMetrics?.hourlyFreeFlowTime?.get(selectedRouteId)

    // If route has no average travel time data, initialize with zeros
    // This can happen for routes without valid historical data (e.g., missing static_duration)
    const finalRouteAvgTimes = routeAvgTimes || new Map<number, number>()

    if (!perRoute95th || !perRouteFreeFlow) {
      return null
    }

    // Build the final metrics combining both data sources
    const hourlyAverageTravelTime = new Map<number, number>()
    const hourlyFreeFlowTime = new Map<number, number>()
    const hourly95thPercentile = new Map<number, number>()
    const hourlyPlanningTimeIndex = new Map<number, number>()

    for (let hour = 0; hour < 24; hour++) {
      // Average travel time (updates with date range)
      // Use finalRouteAvgTimes which may be empty for routes without valid data
      const avgTravelTime = finalRouteAvgTimes.get(hour) || 0

      // 95th percentile and free flow (from all selected days)
      const freeFlow = perRouteFreeFlow.get(hour) || 0
      const percentile95 = perRoute95th.get(hour) || 0
      const planningIndex = freeFlow > 0 ? percentile95 / freeFlow : 0

      hourlyAverageTravelTime.set(hour, avgTravelTime)
      hourlyFreeFlowTime.set(hour, freeFlow)
      hourly95thPercentile.set(hour, percentile95)
      hourlyPlanningTimeIndex.set(hour, planningIndex)
    }

    return {
      routeId: selectedRouteId,
      hourlyAverageTravelTime,
      hourlyFreeFlowTime,
      hourly95thPercentile,
      hourlyPlanningTimeIndex,
    }
  }, [selectedRouteId, routeHourlyAverages, routeMetrics])

  // Track loading state
  const isLoading =
    averageTravelTimeQuery.status === "loading" ||
    routeMetricsQuery.status === "loading"

  // Update hasEverLoadedData when data becomes available
  useEffect(() => {
    if (routeMetricsData && !isLoading) {
      setHasEverLoadedData(true)
    }
  }, [routeMetricsData, isLoading])

  // Keep track of the last valid data to prevent blinking
  const lastValidDataRef = useRef(routeMetricsData)

  const handleBackClick = () => {
    setSelectedRouteId("")
  }

  // Update the last valid data reference when new data arrives
  useEffect(() => {
    if (routeMetricsData && !isLoading) {
      lastValidDataRef.current = routeMetricsData
      setHasEverLoadedData(true)
    }
  }, [routeMetricsData, isLoading])

  // Use the last valid data if current data is not available
  const displayData = routeMetricsData || lastValidDataRef.current

  // Format hour label function (must be before early return to follow Rules of Hooks)
  const formatHourLabel = useCallback((hour: number): string => {
    if (hour === 0) return "12AM"
    if (hour < 12) return `${hour}AM`
    if (hour === 12) return "12PM"
    return `${hour - 12}PM`
  }, [])

  // Memoize chart data processing
  const chartData = useMemo(() => {
    const chartLabels: string[] = []
    const travelTimeData: number[] = []
    const planningTimeData: number[] = []

    for (let hour = 0; hour < 24; hour++) {
      const averageTravelTime =
        displayData?.hourlyAverageTravelTime.get(hour) || 0
      const percentile95 = displayData?.hourly95thPercentile.get(hour) || 0

      chartLabels.push(formatHourLabel(hour))

      // Use the values directly (already in seconds)
      travelTimeData.push(averageTravelTime)
      planningTimeData.push(percentile95)
    }

    // Calculate max value for dynamic y-axis scaling
    const allValues = [...travelTimeData, ...planningTimeData]
    const maxValue = Math.max(...allValues, 1)

    // Calculate clean y-axis range and interval
    const yAxisMax = Math.ceil(maxValue * 1.1)
    const yAxisInterval = Math.ceil(yAxisMax / 5)

    // Determine if we're showing seconds or minutes based on the data
    const hasMinutesData = allValues.some((value) => value >= 3.33) // 200 seconds = 3.33 minutes
    const hasSecondsData = allValues.some((value) => value < 3.33 && value > 0)

    let yAxisLabel = "Time"
    if (hasMinutesData && hasSecondsData) {
      yAxisLabel = "Time (seconds/minutes)"
    } else if (hasMinutesData) {
      yAxisLabel = "Time (minutes)"
    } else if (hasSecondsData) {
      yAxisLabel = "Time (seconds)"
    }

    return {
      chartLabels,
      travelTimeData,
      planningTimeData,
      maxValue,
      yAxisMax,
      yAxisInterval,
      yAxisLabel,
      hasMinutesData,
      hasSecondsData,
    }
  }, [displayData, formatHourLabel])

  const {
    chartLabels,
    travelTimeData,
    planningTimeData,
    yAxisMax,
    yAxisInterval,
    yAxisLabel,
  } = chartData

  // Memoize tooltip formatter
  const tooltipFormatter = useCallback(
    (
      params: Array<{ seriesName: string; dataIndex: number; name: string }>,
    ) => {
      const travelTime = params.find((p) => p.seriesName === "Travel Time")
      const planningTime = params.find(
        (p) => p.seriesName === "95% Reliable Time",
      )

      const dataIndex = travelTime?.dataIndex ?? planningTime?.dataIndex ?? 0
      const travelValue = formatDuration(travelTimeData[dataIndex])
      const planningValue = formatDuration(planningTimeData[dataIndex])

      return `
      <div style="font-family: 'Google Sans', sans-serif;">
        <div style="font-weight: 600; color: #202124; margin-bottom: 4px;">
          ${travelTime?.name || planningTime?.name}
        </div>
        <div style="color: #5f6368; font-size: 11px; margin-bottom: 2px;">
          95% Reliable Time: <span style="color: #4286f5; font-weight: 500;">${planningValue}</span>
        </div>
        <div style="color: #5f6368; font-size: 11px;">
          Travel Time: <span style="color: #9333ea; font-weight: 500;">${travelValue}</span>
        </div>
      </div>
    `
    },
    [travelTimeData, planningTimeData],
  )

  // Memoize chart configuration
  const chartOption = useMemo(
    () => ({
      title: [],
      animation: false,
      legend: {
        show: false,
      },
      grid: {
        left: "20%",
        right: "1%",
        top: "8%",
        bottom: "30%",
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255, 255, 255, 0.98)",
        borderColor: "#e8eaed",
        borderWidth: 1,
        borderRadius: 8,
        padding: [8, 12],
        confine: true,
        position: function (
          point: [number, number],
          _params: unknown,
          _dom: unknown,
          _rect: unknown,
          size: { viewSize: [number, number]; contentSize: [number, number] },
        ) {
          const [x, y] = point
          const { viewSize } = size
          const [width] = viewSize

          const tooltipWidth = size.contentSize[0]
          const tooltipHeight = size.contentSize[1]

          let posX = x + 10
          if (posX + tooltipWidth > width - 20) {
            posX = x - tooltipWidth - 10
          }

          let posY = y - tooltipHeight - 10
          if (posY < 20) {
            posY = y + 10
          }

          return [posX, posY]
        },
        textStyle: {
          color: "#202124",
          fontSize: 12,
          fontFamily: "Google Sans, sans-serif",
        },
        formatter: tooltipFormatter,
      },
      xAxis: {
        type: "category",
        data: chartLabels,
        name: "Time of Day",
        nameLocation: "middle",
        nameGap: 35,
        nameTextStyle: {
          color: "#202124",
          fontSize: 13,
          fontFamily: "Google Sans, sans-serif",
          fontWeight: 600,
        },
        axisLine: {
          lineStyle: {
            color: "#dadce0",
            width: 1,
          },
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: "#5f6368",
          fontSize: 11,
          fontFamily: "Google Sans, sans-serif",
          fontWeight: 500,
          interval: 3, // Show every 4 hours
          show: true,
        },
      },
      yAxis: {
        type: "value",
        name: yAxisLabel,
        nameLocation: "middle",
        nameGap: 40,
        nameTextStyle: {
          color: "#202124",
          fontSize: 13,
          fontFamily: "Google Sans, sans-serif",
          fontWeight: 600,
        },
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: "#5f6368",
          fontSize: 11,
          fontFamily: "Google Sans, sans-serif",
          fontWeight: 500,
          formatter: (value: number) => `${Math.round(value)}`,
        },
        splitLine: {
          lineStyle: {
            color: "#f1f3f4",
            type: "solid",
            width: 1,
          },
        },
        min: 0,
        max: yAxisMax,
        interval: yAxisInterval,
      },
      series: [
        {
          name: "Travel Time",
          type: "line",
          data: travelTimeData,
          smooth: travelTimeData.length > 1,
          lineStyle: {
            color: "#9333ea",
            width: 3,
            shadowColor: "rgba(147, 51, 234, 0.3)",
            shadowBlur: 8,
          },
          areaStyle:
            travelTimeData.length > 1
              ? {
                  color: {
                    type: "linear",
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: "rgba(147, 51, 234, 0.25)" },
                      { offset: 0.5, color: "rgba(147, 51, 234, 0.1)" },
                      { offset: 1, color: "rgba(147, 51, 234, 0.02)" },
                    ],
                  },
                }
              : null,
          symbol: travelTimeData.length === 1 ? "circle" : "none",
          showSymbol: travelTimeData.length === 1,
          symbolSize: travelTimeData.length === 1 ? 8 : 0,
          itemStyle:
            travelTimeData.length === 1
              ? {
                  color: "#9333ea",
                  borderColor: "#ffffff",
                  borderWidth: 2,
                }
              : {},
          emphasis: {
            showSymbol: true,
            symbol: "circle",
            symbolSize: 8,
            itemStyle: {
              color: "#7e22ce",
              borderColor: "#ffffff",
              borderWidth: 3,
              shadowColor: "rgba(126, 34, 206, 0.4)",
              shadowBlur: 12,
            },
          },
        },
        {
          name: "95% Reliable Time",
          type: "line",
          data: planningTimeData,
          smooth: planningTimeData.length > 1,
          lineStyle: {
            color: "#4285F4",
            width: 3,
            shadowColor: "rgba(66, 133, 244, 0.3)",
            shadowBlur: 8,
          },
          areaStyle:
            planningTimeData.length > 1
              ? {
                  color: {
                    type: "linear",
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: "rgba(66, 133, 244, 0.25)" },
                      { offset: 0.5, color: "rgba(66, 133, 244, 0.1)" },
                      { offset: 1, color: "rgba(66, 133, 244, 0.02)" },
                    ],
                  },
                }
              : null,
          symbol: planningTimeData.length === 1 ? "circle" : "none",
          showSymbol: planningTimeData.length === 1,
          symbolSize: planningTimeData.length === 1 ? 8 : 0,
          itemStyle:
            planningTimeData.length === 1
              ? {
                  color: "#4285F4",
                  borderColor: "#ffffff",
                  borderWidth: 2,
                }
              : {},
          emphasis: {
            showSymbol: true,
            symbol: "circle",
            symbolSize: 8,
            itemStyle: {
              color: "#3367d6",
              borderColor: "#ffffff",
              borderWidth: 3,
              shadowColor: "rgba(51, 103, 214, 0.4)",
              shadowBlur: 12,
            },
          },
        },
      ],
    }),
    [
      chartLabels,
      travelTimeData,
      planningTimeData,
      yAxisMax,
      yAxisInterval,
      yAxisLabel,
      tooltipFormatter,
    ],
  )

  // Show loading state for initial data fetch only
  if (!displayData && !hasEverLoadedData) {
    return (
      <div>
        {/* Back Button with Route ID */}
        <BackButton
          onClick={handleBackClick}
          subtitle={
            selectedRouteId
              ? `Route ${selectedRouteId.slice(0, 8).toUpperCase()}`
              : "Unknown Route"
          }
        />

        {/* Loading Content */}
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
              Loading route segment graph...
            </Typography>
          </Box>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Back Button with Route ID */}
      <BackButton
        onClick={handleBackClick}
        subtitle={
          selectedRouteId
            ? `Route ${selectedRouteId.slice(0, 8).toUpperCase()}`
            : "Unknown Route"
        }
      />

      {/* Chart */}
      <div className="bg-gray-50 px-4 py-0 relative">
        <ReactECharts
          option={chartOption}
          style={{ height: "200px", width: "100%" }}
          opts={{ renderer: "canvas" }}
        />
      </div>

      {/* Custom Legend */}
      <div className="flex justify-center gap-3 pb-2 px-4 bg-gray-50 rounded-b-lg">
        <CustomTooltip
          title="95th percentile travel time represents the time that 95% of trips will complete within - used for reliable trip planning"
          placement="top"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-0.5 rounded-sm"
              style={{ backgroundColor: "#4285F4" }}
            />
            <div className="text-xs text-gray-900">95% Reliable Time</div>
          </div>
        </CustomTooltip>
        <CustomTooltip
          title="Actual travel time experienced by users, including delays from traffic congestion and other factors"
          placement="top"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-0.5 rounded-sm"
              style={{ backgroundColor: "#9333ea" }}
            />
            <div className="text-xs text-gray-900">Travel Time</div>
          </div>
        </CustomTooltip>
      </div>
    </div>
  )
}

export default SelectedRouteSegmentGraph
