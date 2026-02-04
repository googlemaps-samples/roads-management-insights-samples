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

import { Box, Typography } from "@mui/material"
import { styled } from "@mui/material/styles"
import ReactECharts from "echarts-for-react"
import React, { useEffect, useRef, useState } from "react"

import { useGraphData } from "../hooks"
import { useAppStore } from "../store"
import { GraphSegment } from "../types/segment"
import { formatDuration } from "../utils"

const ChartContainer = styled(Box)({
  padding: "0",
  paddingBottom: "0",
  backgroundColor: "transparent",
  marginBottom: "0",
})

interface GraphProps {
  splitSegments?: GraphSegment[]
}

const Graph: React.FC<GraphProps> = () => {
  const selectedCity = useAppStore((state) => state.selectedCity)
  const selectedRouteId = useAppStore((state) => state.selectedRouteId)
  const selectedRouteSegment = useAppStore(
    (state) => state.selectedRouteSegment,
  )
  const usecase = useAppStore((state) => state.usecase)
  const timeFilters = useAppStore((state) => state.timeFilters)

  const [chartData, setChartData] = useState<{
    data: number[]
    labels: string[]
    title: string
  }>({
    data: [],
    labels: [],
    title: "Loading...",
  })

  // Keep track of the last valid chart data to prevent blinking
  const lastValidChartDataRef = useRef(chartData)

  // Use the custom hook for fetching graph data (for route-specific data)
  const chartQuery = useGraphData({
    selectedCity,
    selectedRouteSegment: selectedRouteId, // Pass route ID, not the full segment object
    timeFilters,
  })

  // Update local state when query data changes or use case changes
  useEffect(() => {
    let newChartData: {
      data: number[]
      labels: string[]
      title: string
    } | null = null

    if (
      (usecase === "realtime-monitoring" || usecase === "data-analytics") &&
      selectedRouteSegment
    ) {
      // Use existing route-specific data
      if (chartQuery.data) {
        newChartData = chartQuery.data
      } else if (chartQuery.isError) {
        newChartData = { data: [], labels: [], title: "Error Loading Data" }
      } else if (chartQuery.isLoading) {
        newChartData = { data: [], labels: [], title: "Loading..." }
      } else {
        newChartData = { data: [], labels: [], title: "No Route Selected" }
      }
    } else {
      // Default case
      newChartData = {
        data: [],
        labels: [],
        title: "Select a polygon or route",
      }
    }

    if (newChartData) {
      setChartData(newChartData)
      // Cache valid data (data with actual values, not loading/error states)
      if (newChartData.data && newChartData.data.length > 0) {
        lastValidChartDataRef.current = newChartData
      }
    }
  }, [
    usecase,
    selectedRouteId,
    selectedRouteSegment,
    chartQuery.data,
    chartQuery.isError,
    chartQuery.isLoading,
    timeFilters,
  ])

  // Use the last valid chart data if current data is empty (prevents blinking)
  const displayChartData =
    chartData.data && chartData.data.length > 0
      ? chartData
      : lastValidChartDataRef.current

  const getChartOption = () => {
    const data = displayChartData
    const isRouteSpecific =
      (usecase === "realtime-monitoring" || usecase === "data-analytics") &&
      selectedRouteSegment
    const isPolygonSpecific = false

    // Check if polygon delays should be shown in minutes (if any value > 500 seconds)
    const shouldShowInMinutes =
      isPolygonSpecific &&
      data.data &&
      data.data.length > 0 &&
      data.data.some((d) => d > 500)

    // Convert data to minutes if needed
    const processedData = shouldShowInMinutes
      ? data.data.map((d) => Math.max(0, d) / 60) // Convert seconds to minutes
      : data.data.map((d) => Math.max(0, d)) // Keep as seconds

    // Helper function to get the maximum delay value for dynamic y-axis scaling
    const getMaxDelayValue = () => {
      if (!processedData || processedData.length === 0)
        return shouldShowInMinutes ? 1 : 60 // Default minimum

      const maxDelay = Math.max(...processedData)

      return shouldShowInMinutes
        ? Math.max(1, maxDelay) // Ensure minimum of 1 minute
        : Math.max(60, maxDelay) // Ensure minimum of 60 seconds
    }

    return {
      title: [],
      animation: false,
      legend: {
        selected: {
          [isRouteSpecific
            ? "Average Delay In Seconds"
            : isPolygonSpecific
              ? shouldShowInMinutes
                ? "Average Delay (minutes)"
                : "Average Delay (seconds)"
              : "Delay Percentage"]: true,
        },
        selector: false,
        selectedMode: false,
      },
      grid: {
        left: "10%",
        right: "8%",
        top: "15%",
        bottom: "30%",
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255, 255, 255, 0.98)",
        borderColor: "#e8eaed",
        borderWidth: 1,
        borderRadius: 8,
        padding: [8, 12],
        confine: true, // Prevent tooltip from going outside chart boundaries
        position: function (
          point: [number, number],
          _params: unknown,
          _dom: unknown,
          _rect: unknown,
          size: { viewSize: [number, number]; contentSize: [number, number] },
        ) {
          // Custom positioning to ensure tooltip stays within bounds
          const [x, y] = point
          const { viewSize } = size
          const [width] = viewSize

          // Calculate tooltip dimensions
          const tooltipWidth = size.contentSize[0]
          const tooltipHeight = size.contentSize[1]

          // Ensure tooltip doesn't go off the left edge
          let posX = x + 10
          if (posX + tooltipWidth > width - 20) {
            posX = x - tooltipWidth - 10
          }

          // Ensure tooltip doesn't go off the top edge
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
        formatter: (params: Array<{ name: string; value: number }>) => {
          const data = params[0]
          if (isRouteSpecific) {
            const delayValue = data.value
            const delayText =
              delayValue < 0
                ? `${Math.abs(delayValue).toFixed(0)}s faster`
                : `${delayValue.toFixed(0)}s slower`
            const delayColor = delayValue < 0 ? "#34a853" : "#ea4335"

            return `
              <div style="font-family: 'Google Sans', sans-serif;">
                <div style="font-weight: 600; color: #202124; margin-bottom: 4px;">
                  ${data.name}
                </div>
                <div style="color: #5f6368; font-size: 11px;">
                  Average Delay: <span style="color: ${delayColor}; font-weight: 500;">${delayText}</span>
                </div>
              </div>
            `
          } else if (isPolygonSpecific) {
            const delayValue = data.value
            let delayText: string
            let delayColor: string

            if (shouldShowInMinutes) {
              // Data is already in minutes
              delayText =
                delayValue > 0 ? `+${delayValue.toFixed(1)} min` : "No delay"
              delayColor = delayValue > 0 ? "#ea4335" : "#34a853"
            } else {
              // Data is in seconds
              delayText =
                delayValue > 0 ? `+${formatDuration(delayValue)}` : "No delay"
              delayColor = delayValue > 0 ? "#ea4335" : "#34a853"
            }

            return `
              <div style="font-family: 'Google Sans', sans-serif;">
                <div style="font-weight: 600; color: #202124; margin-bottom: 4px;">
                  ${data.name}
                </div>
                <div style="color: #5f6368; font-size: 11px;">
                  Block Delay: <span style="color: ${delayColor}; font-weight: 500;">${delayText}</span>
                </div>
              </div>
            `
          } else {
            return `
              <div style="font-family: 'Google Sans', sans-serif;">
                <div style="font-weight: 600; color: #202124; margin-bottom: 4px;">
                  ${data.name}
                </div>
                <div style="color: #5f6368; font-size: 11px;">
                  Traffic Volume: <span style="color: #4285f4; font-weight: 500;">${data.value}%</span>
                </div>
              </div>
            `
          }
        },
      },
      xAxis: {
        type: "category",
        data: data.labels,
        name: "Time of Day",
        nameLocation: "middle",
        nameGap: 35,
        nameTextStyle: {
          color: "#202124",
          fontSize: 13,
          fontFamily: "Google Sans, Roboto, sans-serif",
          fontWeight: 400,
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
        },
      },
      yAxis: {
        type: "value",
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
        },
        splitLine: {
          lineStyle: {
            color: "#f1f3f4",
            type: "solid",
            width: 1,
          },
        },
        min: 0, // Always start from 0, treat negative values as 0
        max:
          isRouteSpecific || isPolygonSpecific
            ? shouldShowInMinutes
              ? Math.max(1, Math.ceil(getMaxDelayValue() * 1.2))
              : Math.max(60, Math.ceil(getMaxDelayValue() * 1.2))
            : 25, // Dynamic max based on data, minimum 1 min or 60s
        interval:
          isRouteSpecific || isPolygonSpecific
            ? shouldShowInMinutes
              ? Math.ceil((getMaxDelayValue() * 1.2) / 5)
              : Math.ceil((getMaxDelayValue() * 1.2) / 5)
            : 5, // Dynamic interval based on max value
        nameTextStyle: {
          color: "#5f6368",
          fontSize: 11,
          fontFamily: "Google Sans, sans-serif",
          fontWeight: 500,
        },
      },
      series: [
        {
          name: isRouteSpecific
            ? "Average Delay (s)"
            : isPolygonSpecific
              ? shouldShowInMinutes
                ? "Average Delay (min)"
                : "Average Delay (s)"
              : "Delay Percentage",
          type: "line",
          data: processedData,
          smooth: true,
          lineStyle: {
            color: isRouteSpecific || isPolygonSpecific ? "#ea4335" : "#4285f4",
            width: 3,
            shadowColor:
              isRouteSpecific || isPolygonSpecific
                ? "rgba(234, 67, 53, 0.3)"
                : "rgba(66, 133, 244, 0.3)",
            shadowBlur: 8,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops:
                isRouteSpecific || isPolygonSpecific
                  ? [
                      { offset: 0, color: "rgba(234, 67, 53, 0.25)" },
                      { offset: 0.5, color: "rgba(234, 67, 53, 0.1)" },
                      { offset: 1, color: "rgba(234, 67, 53, 0.02)" },
                    ]
                  : [
                      { offset: 0, color: "rgba(66, 133, 244, 0.25)" },
                      { offset: 0.5, color: "rgba(66, 133, 244, 0.1)" },
                      { offset: 1, color: "rgba(66, 133, 244, 0.02)" },
                    ],
            },
          },
          symbol: "circle",
          symbolSize: 8,
          symbolBorderWidth: 2,
          symbolBorderColor: "#ffffff",
          itemStyle: {
            color: isRouteSpecific || isPolygonSpecific ? "#ea4335" : "#4285f4",
            borderWidth: 2,
            borderColor: "#ffffff",
          },
          emphasis: {
            itemStyle: {
              color:
                isRouteSpecific || isPolygonSpecific ? "#d93025" : "#1a73e8",
              borderColor: "#ffffff",
              borderWidth: 3,
              shadowColor:
                isRouteSpecific || isPolygonSpecific
                  ? "rgba(217, 48, 37, 0.4)"
                  : "rgba(26, 115, 232, 0.4)",
              shadowBlur: 12,
            },
          },
        },
      ],
    }
  }

  // Determine the data type for the header
  const isRouteSpecific =
    (usecase === "realtime-monitoring" || usecase === "data-analytics") &&
    selectedRouteSegment
  const isPolygonSpecific = false

  const getDataLevelHeader = () => {
    if (isRouteSpecific) {
      return "Route Delay"
    } else if (isPolygonSpecific) {
      return "Block Delay"
    } else {
      return "Delay Analysis"
    }
  }

  return (
    <Box sx={{ paddingBottom: 0, marginBottom: 0 }} key={new Date().getTime()}>
      {/* Data Level Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 16px",
          backgroundColor: "#f8f9fa",
          border: "1px solid #e8eaed",
          borderBottom: "none",
          borderRadius: "8px 8px 0 0",
        }}
      >
        <Typography
          sx={{
            fontSize: "12px",
            fontWeight: 600,
            color: "#5f6368",
            fontFamily: '"Google Sans", Roboto, sans-serif',
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {getDataLevelHeader()}
        </Typography>
      </Box>

      {/* Traffic Line Chart */}
      <ChartContainer>
        <Box
          sx={{
            backgroundColor: "#fafbfc",
            borderRadius: "0 0 8px 8px",
            padding: "16px",
            paddingBottom: "0px",
            border: "1px solid #f1f3f4",
            borderTop: "none",
            position: "relative",
          }}
        >
          <ReactECharts
            option={getChartOption()}
            style={{ height: "180px", width: "100%" }}
            opts={{ renderer: "canvas" }}
          />
        </Box>
      </ChartContainer>
    </Box>
  )
}

export default Graph
