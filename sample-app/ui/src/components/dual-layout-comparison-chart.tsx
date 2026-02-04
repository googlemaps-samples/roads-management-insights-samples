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
import { useEffect, useMemo, useRef, useState } from "react"

import { useAppStore } from "../store"
import { formatDuration } from "../utils/formatters"
import { CustomTooltip } from "./custom-tooltip"

interface DualLayoutComparisonChartProps {
  isVisible?: boolean
}

const DualLayoutComparisonChart: React.FC<DualLayoutComparisonChartProps> = ({
  isVisible = true,
}) => {
  const selectedCity = useAppStore((state) => state.selectedCity)
  const activeComparisonShortcut = useAppStore(
    (state) => state.activeComparisonShortcut,
  )
  const isComparisonMode = useAppStore((state) => state.isComparisonMode)
  const isComparisonApplied = useAppStore((state) => state.isComparisonApplied)

  const leftRouteMetrics = useAppStore((state) => state.routeMetrics.main)
  const leftHourlyAverages = useAppStore(
    (state) => state.averageTravelTime.main,
  )
  const rightRouteMetrics = useAppStore(
    (state) => state.routeMetrics.comparison,
  )
  const rightHourlyAverages = useAppStore(
    (state) => state.averageTravelTime.comparison,
  )

  const leftRouteMetricsStatus = useAppStore(
    (state) => state.queries.routeMetrics.main.status,
  )
  const leftAvgTravelTimeStatus = useAppStore(
    (state) => state.queries.averageTravelTime.main.status,
  )
  const rightRouteMetricsStatus = useAppStore(
    (state) => state.queries.routeMetrics.comparison.status,
  )
  const rightAvgTravelTimeStatus = useAppStore(
    (state) => state.queries.averageTravelTime.comparison.status,
  )

  const shouldShowChart =
    isVisible &&
    isComparisonMode &&
    isComparisonApplied &&
    activeComparisonShortcut

  const isLoading =
    leftRouteMetricsStatus === "loading" ||
    leftRouteMetricsStatus === "pending" ||
    leftAvgTravelTimeStatus === "loading" ||
    leftAvgTravelTimeStatus === "pending" ||
    (shouldShowChart &&
      (rightRouteMetricsStatus === "loading" ||
        rightRouteMetricsStatus === "pending" ||
        rightAvgTravelTimeStatus === "loading" ||
        rightAvgTravelTimeStatus === "pending"))

  const [stableLeftRouteMetrics, setStableLeftRouteMetrics] =
    useState<typeof leftRouteMetrics>(null)
  const [stableLeftHourlyAverages, setStableLeftHourlyAverages] = useState<Map<
    number,
    { totalDuration: number; count: number }
  > | null>(null)
  const [stableRightRouteMetrics, setStableRightRouteMetrics] =
    useState<typeof rightRouteMetrics>(null)
  const [stableRightHourlyAverages, setStableRightHourlyAverages] =
    useState<Map<number, { totalDuration: number; count: number }> | null>(null)

  const allValuesAbove6000secondsRef = useRef<boolean>(false)
  useEffect(() => {
    if (
      !isLoading &&
      leftRouteMetricsStatus === "success" &&
      leftAvgTravelTimeStatus === "success" &&
      leftRouteMetrics &&
      leftHourlyAverages &&
      leftHourlyAverages.hourlyTotalAverages.size > 0 &&
      rightRouteMetricsStatus === "success" &&
      rightAvgTravelTimeStatus === "success" &&
      rightRouteMetrics &&
      rightHourlyAverages &&
      rightHourlyAverages.hourlyTotalAverages.size > 0
    ) {
      // Only update if data has actually changed to avoid unnecessary re-renders
      const hasChanged =
        stableLeftRouteMetrics !== leftRouteMetrics ||
        stableLeftHourlyAverages !== leftHourlyAverages.hourlyTotalAverages ||
        stableRightRouteMetrics !== rightRouteMetrics ||
        stableRightHourlyAverages !== rightHourlyAverages.hourlyTotalAverages

      if (hasChanged) {
        setStableLeftRouteMetrics(leftRouteMetrics)
        setStableLeftHourlyAverages(leftHourlyAverages.hourlyTotalAverages)
        setStableRightRouteMetrics(rightRouteMetrics)
        setStableRightHourlyAverages(rightHourlyAverages.hourlyTotalAverages)
      }
    }
  }, [
    isLoading,
    leftRouteMetrics,
    leftHourlyAverages,
    rightRouteMetrics,
    rightHourlyAverages,
    leftRouteMetricsStatus,
    leftAvgTravelTimeStatus,
    rightRouteMetricsStatus,
    rightAvgTravelTimeStatus,
    stableLeftRouteMetrics,
    stableLeftHourlyAverages,
    stableRightRouteMetrics,
    stableRightHourlyAverages,
  ])

  // Track previous values to detect actual changes (not just mount)
  const prevCityIdRef = useRef(selectedCity.id)
  const prevShortcutRef = useRef(activeComparisonShortcut)

  // Reset stable data when city or comparison shortcut ACTUALLY changes (not on mount)
  useEffect(() => {
    const cityChanged = prevCityIdRef.current !== selectedCity.id
    const shortcutChanged = prevShortcutRef.current !== activeComparisonShortcut

    if (cityChanged || shortcutChanged) {
      setStableLeftRouteMetrics(null)
      setStableLeftHourlyAverages(null)
      setStableRightRouteMetrics(null)
      setStableRightHourlyAverages(null)
    }

    // Update refs for next comparison
    prevCityIdRef.current = selectedCity.id
    prevShortcutRef.current = activeComparisonShortcut
  }, [selectedCity.id, activeComparisonShortcut])

  // Format hour label function
  const formatHourLabel = (hour: number): string => {
    if (hour === 0) return "12 AM"
    if (hour === 12) return "12 PM"
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`
  }

  // Prepare chart data using stable data - memoized to prevent recalculation on every render
  // MUST be called on every render (before any conditional returns)
  const {
    planningTimeData,
    leftTravelTimeData,
    rightTravelTimeData,
    chartLabels,
    maxValue,
    allValuesAbove6000seconds,
  } = useMemo(() => {
    // Safety check: if no stable data, return empty data structures
    if (
      !stableLeftRouteMetrics ||
      !stableLeftHourlyAverages ||
      !stableRightHourlyAverages
    ) {
      return {
        planningTimeData: [],
        leftTravelTimeData: [],
        rightTravelTimeData: [],
        chartLabels: [],
        maxValue: 1,
        allValuesAbove6000seconds: false,
      }
    }

    const planningTimeData: number[] = []
    const leftTravelTimeData: number[] = []
    const rightTravelTimeData: number[] = []
    const chartLabels: string[] = []

    const valuesAbove6000seconds: boolean[] = []

    // Generate data for all 24 hours
    for (let hour = 0; hour < 24; hour++) {
      // Planning time (using left layout's planning time as reference)
      const freeFlowTime =
        stableLeftRouteMetrics.hourlyFreeFlowTime.get(hour) || 0
      const planningIndex =
        stableLeftRouteMetrics.hourlyPlanningTimeIndex.get(hour) || 0
      const planningTime = planningIndex * freeFlowTime

      // Left layout travel time
      const leftTravelTime =
        stableLeftHourlyAverages.get(hour)?.totalDuration || 0

      // Right layout travel time
      const rightTravelTime =
        stableRightHourlyAverages.get(hour)?.totalDuration || 0

      chartLabels.push(formatHourLabel(hour))
      if (
        planningTime > 6000 ||
        leftTravelTime > 6000 ||
        rightTravelTime > 6000
      ) {
        valuesAbove6000seconds.push(true)
      } else {
        valuesAbove6000seconds.push(false)
      }
      planningTimeData.push(planningTime)
      leftTravelTimeData.push(leftTravelTime)
      rightTravelTimeData.push(rightTravelTime)
    }

    const allValuesAbove6000seconds = valuesAbove6000seconds.every(
      (value) => value,
    )
    allValuesAbove6000secondsRef.current = allValuesAbove6000seconds

    // Calculate max value for dynamic y-axis scaling
    const allValues = [
      ...planningTimeData,
      ...leftTravelTimeData,
      ...rightTravelTimeData,
    ]
    const maxValue = Math.max(...allValues, 1)

    return {
      planningTimeData,
      leftTravelTimeData,
      rightTravelTimeData,
      chartLabels,
      maxValue,
      allValuesAbove6000seconds,
    }
  }, [
    stableLeftRouteMetrics,
    stableLeftHourlyAverages,
    stableRightHourlyAverages,
  ])

  // Memoize chart options to prevent unnecessary re-renders and flickering
  const chartOption = useMemo(() => {
    return {
      title: [],
      animation: false,
      legend: {
        show: false, // We'll use custom legend below
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
          params: Array<{ seriesName: string; value: number; name: string }>,
        ) => {
          const planningTime = params.find(
            (p) => p.seriesName === "95% Reliable Time",
          )
          const leftLayout = params.find((p) => p.seriesName === "Left Layout")
          const rightLayout = params.find(
            (p) => p.seriesName === "Right Layout",
          )

          const planningSeconds = planningTime?.value || 0
          const leftSeconds = leftLayout?.value || 0
          const rightSeconds = rightLayout?.value || 0

          // Get descriptive labels based on comparison type
          const leftLabel =
            activeComparisonShortcut === "weekdays-vs-weekends"
              ? "Weekdays (Mon-Fri)"
              : activeComparisonShortcut === "last-week-vs-this-week"
                ? "Last Week"
                : "Left Layout"

          const rightLabel =
            activeComparisonShortcut === "weekdays-vs-weekends"
              ? "Weekends (Sat-Sun)"
              : activeComparisonShortcut === "last-week-vs-this-week"
                ? "This Week"
                : "Right Layout"

          return `
            <div style="font-family: 'Google Sans', sans-serif;">
              <div style="font-weight: 600; color: #202124; margin-bottom: 4px;">
                ${planningTime?.name || leftLayout?.name || rightLayout?.name}
              </div>
              <div style="color: #5f6368; font-size: 11px; margin-bottom: 2px;">
                95% Reliable Time: <span style="color: #4285F4; font-weight: 500;">${formatDuration(planningSeconds * 60)}</span>
              </div>
              <div style="color: #5f6368; font-size: 11px; margin-bottom: 2px;">
                ${leftLabel}: <span style="color: #9333ea; font-weight: 500;">${formatDuration(leftSeconds * 60)}</span>
              </div>
              <div style="color: #5f6368; font-size: 11px;">
                ${rightLabel}: <span style="color: #ec4899; font-weight: 500;">${formatDuration(rightSeconds * 60)}</span>
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
        name: `Travel Time (${allValuesAbove6000seconds ? "hours" : "minutes"})`,
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
            if (allValuesAbove6000seconds) {
              return Math.round(value / 60) === 1
                ? "1h"
                : `${Math.round(value / 60)}`
            }
            return `${Math.round(value)}`
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
        max: Math.ceil((maxValue * 1.1) / 60),
        interval: Math.ceil(maxValue / 5 / 60),
      },
      series: [
        {
          name: "95% Reliable Time",
          type: "line",
          data: planningTimeData.map((value) => value / 60),
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
        {
          name: "Left Layout",
          type: "line",
          data: leftTravelTimeData.map((value) => value / 60),
          smooth: leftTravelTimeData.length > 1,
          lineStyle: {
            color: "#9333ea",
            width: 3,
            shadowColor: "rgba(147, 51, 234, 0.3)",
            shadowBlur: 8,
          },
          areaStyle:
            leftTravelTimeData.length > 1
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
          symbol: leftTravelTimeData.length === 1 ? "circle" : "none",
          showSymbol: leftTravelTimeData.length === 1,
          symbolSize: leftTravelTimeData.length === 1 ? 8 : 0,
          itemStyle:
            leftTravelTimeData.length === 1
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
          name: "Right Layout",
          type: "line",
          data: rightTravelTimeData.map((value) => value / 60),
          smooth: rightTravelTimeData.length > 1,
          lineStyle: {
            color: "#ec4899",
            width: 3,
            shadowColor: "rgba(236, 72, 153, 0.3)",
            shadowBlur: 8,
          },
          areaStyle:
            rightTravelTimeData.length > 1
              ? {
                  color: {
                    type: "linear",
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: "rgba(236, 72, 153, 0.25)" },
                      { offset: 0.5, color: "rgba(236, 72, 153, 0.1)" },
                      { offset: 1, color: "rgba(236, 72, 153, 0.02)" },
                    ],
                  },
                }
              : null,
          symbol: rightTravelTimeData.length === 1 ? "circle" : "none",
          showSymbol: rightTravelTimeData.length === 1,
          symbolSize: rightTravelTimeData.length === 1 ? 8 : 0,
          itemStyle:
            rightTravelTimeData.length === 1
              ? {
                  color: "#ec4899",
                  borderColor: "#ffffff",
                  borderWidth: 2,
                }
              : {},
          emphasis: {
            showSymbol: true,
            symbol: "circle",
            symbolSize: 8,
            itemStyle: {
              color: "#db2777",
              borderColor: "#ffffff",
              borderWidth: 3,
              shadowColor: "rgba(219, 39, 119, 0.4)",
              shadowBlur: 12,
            },
          },
        },
      ],
    }
  }, [
    chartLabels,
    planningTimeData,
    leftTravelTimeData,
    rightTravelTimeData,
    maxValue,
    allValuesAbove6000seconds,
    activeComparisonShortcut,
  ])

  // Check if we have stable data to show
  const hasStableData =
    stableLeftRouteMetrics &&
    stableLeftHourlyAverages &&
    stableRightRouteMetrics &&
    stableRightHourlyAverages

  // Show loading state ONLY on initial load when there's no data at all
  if (isLoading && !hasStableData) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "224px",
          gap: 2,
        }}
      >
        <CircularProgress size={24} />
        <Typography variant="body2" color="text.secondary">
          Loading comparison data...
        </Typography>
      </Box>
    )
  }

  // If not loading and no stable data, show empty state
  if (!hasStableData) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "224px",
          gap: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No comparison data available
        </Typography>
      </Box>
    )
  }

  // If we're loading but have stable data, show the chart with old data
  // (it will update seamlessly when new data arrives)

  if (!shouldShowChart) {
    return null
  }

  return (
    <div>
      {/* Chart */}
      <div className="bg-gray-50 rounded-lg">
        <ReactECharts
          option={chartOption}
          style={{ height: "200px", width: "100%" }}
          opts={{ renderer: "canvas" }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>

      {/* Custom Legend */}
      <div className="flex justify-center gap-3 pb-2 px-4 bg-gray-50 rounded-b-2xl">
        <CustomTooltip
          title={
            activeComparisonShortcut === "weekdays-vs-weekends"
              ? "Travel time data for weekdays (Monday-Friday), showing typical weekday traffic patterns"
              : activeComparisonShortcut === "last-week-vs-this-week"
                ? "Travel time data for the previous week, showing historical traffic patterns"
                : "Travel time data for the left comparison period"
          }
          placement="top"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-0.5 rounded-sm"
              style={{ backgroundColor: "#9333ea" }}
            />
            <div className="text-xs text-gray-900 whitespace-nowrap">
              {activeComparisonShortcut === "weekdays-vs-weekends"
                ? "Weekdays"
                : activeComparisonShortcut === "last-week-vs-this-week"
                  ? "Last Week"
                  : "Left Layout"}
            </div>
          </div>
        </CustomTooltip>
        <CustomTooltip
          title={
            activeComparisonShortcut === "weekdays-vs-weekends"
              ? "Travel time data for weekends (Saturday-Sunday), showing typical weekend traffic patterns"
              : activeComparisonShortcut === "last-week-vs-this-week"
                ? "Travel time data for the current week, showing recent traffic patterns"
                : "Travel time data for the right comparison period"
          }
          placement="top"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-0.5 rounded-sm"
              style={{ backgroundColor: "#ec4899" }}
            />
            <div className="text-xs text-gray-900 whitespace-nowrap">
              {activeComparisonShortcut === "weekdays-vs-weekends"
                ? "Weekends"
                : activeComparisonShortcut === "last-week-vs-this-week"
                  ? "This Week"
                  : "Right Layout"}
            </div>
          </div>
        </CustomTooltip>
        <CustomTooltip
          title="95th percentile travel time represents the time that 95% of trips will complete within - used for reliable trip planning"
          placement="top"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-0.5 rounded-sm"
              style={{ backgroundColor: "#4285F4" }}
            />
            <div className="text-xs text-gray-900 whitespace-nowrap">
              95% Reliable Time
            </div>
          </div>
        </CustomTooltip>
      </div>
    </div>
  )
}

export default DualLayoutComparisonChart
