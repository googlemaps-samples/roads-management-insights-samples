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
import { useEffect, useState } from "react"

import { useAppStore } from "../store"
import { formatDuration } from "../utils"
import { CustomTooltip } from "./custom-tooltip"

const RouteTimeGraphContent = () => {
  const selectedCity = useAppStore((state) => state.selectedCity)
  const [hasEverLoadedData, setHasEverLoadedData] = useState(false)

  // Get route metrics and average travel time from store
  const routeMetricsData = useAppStore((state) => state.routeMetrics.main)
  const hourlyTotalAverages = useAppStore(
    (state) => state.averageTravelTime.main,
  )

  // Get query states for proper loading detection
  const routeMetricsStatus = useAppStore(
    (state) => state.queries.routeMetrics.main.status,
  )
  const avgTravelTimeStatus = useAppStore(
    (state) => state.queries.averageTravelTime.main.status,
  )

  const isLoading =
    routeMetricsStatus !== "success" || avgTravelTimeStatus !== "success"

  // Store the last successfully loaded data to show while new data loads
  const [lastValidData, setLastValidData] = useState<{
    routeMetrics: typeof routeMetricsData
    hourlyAverages: typeof hourlyTotalAverages
  } | null>(null)

  // Track when data is successfully loaded and save it
  useEffect(() => {
    if (
      routeMetricsStatus === "success" &&
      avgTravelTimeStatus === "success" &&
      routeMetricsData &&
      hourlyTotalAverages
    ) {
      setHasEverLoadedData(true)
      setLastValidData({
        routeMetrics: routeMetricsData,
        hourlyAverages: hourlyTotalAverages,
      })
    }
  }, [
    routeMetricsData,
    hourlyTotalAverages,
    routeMetricsStatus,
    avgTravelTimeStatus,
  ])

  // Reset the flag and clear cached data when city changes (new initial load)
  useEffect(() => {
    setHasEverLoadedData(false)
    setLastValidData(null)
  }, [selectedCity.id])

  // Format hour label function (matching graph.tsx format)
  const formatHourLabel = (hour: number): string => {
    if (hour === 0) return "12AM"
    if (hour < 12) return `${hour}AM`
    if (hour === 12) return "12PM"
    return `${hour - 12}PM`
  }

  // Determine what data to display
  const dataToDisplay = {
    routeMetrics: routeMetricsData || lastValidData?.routeMetrics,
    hourlyAverages: hourlyTotalAverages || lastValidData?.hourlyAverages,
  }

  // Show loading state ONLY on initial load (no previous data)
  if (!dataToDisplay.routeMetrics || !dataToDisplay.hourlyAverages) {
    if (!hasEverLoadedData) {
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
  }

  // This ensures previous data remains visible during loading
  if (dataToDisplay.routeMetrics && dataToDisplay.hourlyAverages) {
    // Generate hourly labels and data for all 24 hours
    const chartLabels: string[] = []
    const originalTravelTimeData: number[] = []
    const originalPlanningTimeData: number[] = []

    for (let hour = 0; hour < 24; hour++) {
      // Use hourly total averages from the new optimized calculation
      const hourData =
        dataToDisplay.hourlyAverages?.hourlyTotalAverages.get(hour)
      const averageTravelTime = hourData?.totalDuration || 0
      const planningTime =
        dataToDisplay.routeMetrics.hourly95thPercentile.get(hour) || 0

      chartLabels.push(formatHourLabel(hour))
      originalTravelTimeData.push(averageTravelTime)
      originalPlanningTimeData.push(planningTime)
    }

    // Check if all data is zero
    const hasNonZeroData =
      originalTravelTimeData.some((v) => v > 0) ||
      originalPlanningTimeData.some((v) => v > 0)

    if (!hasNonZeroData) {
      return (
        <div className="flex items-center justify-center h-[200px] bg-gray-50 rounded-lg">
          <Typography variant="body2" color="text.secondary">
            No data available for selected filters
          </Typography>
        </div>
      )
    }

    // Calculate max value for dynamic y-axis scaling (using original values in seconds)
    const allValues = [...originalTravelTimeData, ...originalPlanningTimeData]
    const maxValue = Math.max(...allValues, 1)

    // Determine the best unit and conversion factor based on data range
    const getOptimalUnitAndConversion = (maxValueSeconds: number) => {
      // If max value is less than 2 minutes (120 seconds), show seconds
      if (maxValueSeconds < 120) {
        return { unit: "seconds", conversion: 1, label: "Time (seconds)" }
      }
      // If max value is less than 2 hours (7200 seconds), show minutes
      else if (maxValueSeconds < 7200) {
        return { unit: "minutes", conversion: 60, label: "Time (minutes)" }
      }
      // For larger values, show hours
      else {
        return { unit: "hours", conversion: 3600, label: "Time (hours)" }
      }
    }

    const { unit, conversion, label } = getOptimalUnitAndConversion(maxValue)

    // Convert to display data using the optimal unit
    const travelTimeData = originalTravelTimeData.map(
      (value) => value / conversion,
    )
    const planningTimeData = originalPlanningTimeData.map(
      (value) => value / conversion,
    )

    // Calculate optimal y-axis range and interval
    const calculateOptimalYAxis = (maxValueInUnit: number) => {
      // Handle edge cases
      if (maxValueInUnit <= 0) {
        return { max: 1, interval: 0.2 }
      }

      // For very small values, ensure minimum range
      const minRange = unit === "seconds" ? 1 : unit === "minutes" ? 0.1 : 0.01
      const effectiveMax = Math.max(maxValueInUnit, minRange)
      const paddedMax = effectiveMax * 1.1

      // Calculate a nice round number for the max
      const magnitude = Math.pow(10, Math.floor(Math.log10(paddedMax)))
      const normalizedMax = paddedMax / magnitude

      let niceMax: number
      if (normalizedMax <= 1) niceMax = 1
      else if (normalizedMax <= 2) niceMax = 2
      else if (normalizedMax <= 5) niceMax = 5
      else niceMax = 10

      const finalMax = niceMax * magnitude

      // Calculate a nice interval (aim for 4-6 ticks)
      const targetTicks = 5
      const rawInterval = finalMax / targetTicks
      const intervalMagnitude = Math.pow(
        10,
        Math.floor(Math.log10(rawInterval)),
      )
      const normalizedInterval = rawInterval / intervalMagnitude

      let niceInterval: number
      if (normalizedInterval <= 1) niceInterval = 1
      else if (normalizedInterval <= 2) niceInterval = 2
      else if (normalizedInterval <= 5) niceInterval = 5
      else niceInterval = 10

      const finalInterval = niceInterval * intervalMagnitude

      // Ensure minimum interval for readability
      const minInterval =
        unit === "seconds" ? 0.1 : unit === "minutes" ? 0.01 : 0.001

      return {
        max: Math.ceil(finalMax),
        interval: Math.max(finalInterval, minInterval),
      }
    }

    const yAxisConfig = calculateOptimalYAxis(maxValue / conversion)

    // Chart configuration - matching original RouteTimeComparisonGraph
    const chartOption = {
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
        formatter: (
          params: Array<{
            seriesName: string
            dataIndex: number
            name?: string
          }>,
        ) => {
          const travelTime = params.find((p) => p.seriesName === "Travel Time")
          const planningTime = params.find(
            (p) => p.seriesName === "95% Reliable Time",
          )

          // Get the original values from the data arrays using the dataIndex
          const dataIndex =
            travelTime?.dataIndex ?? planningTime?.dataIndex ?? 0
          const originalTravelValue = originalTravelTimeData[dataIndex] || 0
          const originalPlanningValue = originalPlanningTimeData[dataIndex] || 0

          // Use formatDuration for consistent formatting (always in seconds)
          const travelValue = formatDuration(originalTravelValue)
          const planningValue = formatDuration(originalPlanningValue)

          return `
            <div style="font-family: 'Google Sans', sans-serif;">
              <div style="font-weight: 600; color: #202124; margin-bottom: 4px;">
                ${travelTime?.name || planningTime?.name}
              </div>
              <div style="color: #5f6368; font-size: 11px; margin-bottom: 2px;">
                95% Reliable Time: <span style="color: #4285F4; font-weight: 500;">${planningValue}</span>
              </div>
              <div style="color: #5f6368; font-size: 11px;">
                Travel Time: <span style="color: #9333ea; font-weight: 500;">${travelValue}</span>
              </div>
            </div>
          `
        },
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
          interval: 3, // Show every 4 hours to get at most 6 markers (0, 4, 8, 12, 16, 20)
          show: true,
        },
      },
      yAxis: {
        type: "value",
        name: label,
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
          formatter: (value: number) => {
            // Handle zero case first
            if (value === 0) {
              return "0"
            }

            // Format based on unit for better readability
            if (unit === "seconds") {
              return `${Math.round(value)}`
            } else if (unit === "minutes") {
              // Show decimals for minutes if the value is small
              return value < 1 ? `${value.toFixed(1)}` : `${Math.round(value)}`
            } else {
              // Show decimals for hours if the value is small
              return value < 1 ? `${value.toFixed(1)}` : `${Math.round(value)}`
            }
          },
        },
        splitLine: {
          lineStyle: {
            color: "#f1f3f4",
            type: "solid",
            width: 1,
          },
        },
        min: 0,
        max: yAxisConfig.max,
        interval: yAxisConfig.interval,
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
              color: "#1a73e8",
              borderColor: "#ffffff",
              borderWidth: 3,
              shadowColor: "rgba(26, 115, 232, 0.4)",
              shadowBlur: 12,
            },
          },
        },
      ],
    }

    // Check if we're showing cached data while loading new data
    const isShowingCachedData = isLoading && lastValidData !== null

    return (
      <>
        {/* Chart */}
        <div className="bg-gray-50 px-4 py-0 relative">
          <div
            style={{
              opacity: isShowingCachedData ? 0.6 : 1,
              transition: "opacity 0.2s",
            }}
          >
            <ReactECharts
              option={chartOption}
              style={{ height: "248px", width: "100%" }}
              opts={{ renderer: "canvas" }}
            />
          </div>
        </div>

        {/* Custom Legend - matching original */}
        <div className="flex justify-center gap-3 pb-2 px-4 bg-gray-50 rounded-b-lg">
          <CustomTooltip
            title="95th percentile travel time represents the time that 95% of trips will complete within - used for reliable trip planning"
            placement="top"
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-0.5 bg-[#4286f5] rounded-sm" />
              <div className="text-xs text-gray-900">95% Reliable Time</div>
            </div>
          </CustomTooltip>
          <CustomTooltip
            title="Actual travel time experienced by users, including delays from traffic congestion and other factors"
            placement="top"
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-0.5 bg-purple-600 rounded-sm" />
              <div className="text-xs text-gray-900">Travel Time</div>
            </div>
          </CustomTooltip>
        </div>
      </>
    )
  }

  return null
}

export default RouteTimeGraphContent
