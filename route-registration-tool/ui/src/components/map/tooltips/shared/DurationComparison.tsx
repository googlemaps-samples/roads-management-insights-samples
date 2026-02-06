// Copyright 2026 Google LLC
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

import React, { useMemo } from "react"

interface DurationComparisonProps {
  currentDurationSeconds: number
  staticDurationSeconds: number
  typicalCurrentDurationSeconds?: number
  title?: string
  routeLabel?: string
  className?: string
  delaySeconds?: number
  delayPercentage?: number
}

const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return "0s"

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.round(seconds % 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  if (minutes > 0) {
    // For durations less than 10 minutes, show seconds too
    if (seconds < 600) {
      return `${minutes}m ${remainingSeconds}s`
    }
    return `${minutes} min`
  }

  return `${remainingSeconds}s`
}

export const DurationComparison: React.FC<DurationComparisonProps> = ({
  currentDurationSeconds,
  staticDurationSeconds,
  typicalCurrentDurationSeconds,
  delaySeconds,
  delayPercentage,
  title = "Duration Comparison",
  routeLabel,
  className = "",
}) => {
  const calculatedValues = useMemo(() => {
    const delay = currentDurationSeconds - staticDurationSeconds

    const hasDelay = delay > 0

    const delayPercentageCalc =
      staticDurationSeconds > 0 ? (delay / staticDurationSeconds) * 100 : 0

    // Calculate a dynamic base that's larger than all three values for better visual comparison
    const maxOfAll = Math.max(
      currentDurationSeconds,
      staticDurationSeconds,
      typicalCurrentDurationSeconds || 0,
    )

    // Use a base that's 15% larger than the maximum, or at least 1.25x the static duration
    const visualBase = Math.max(
      maxOfAll * 1.1, // 10% larger than the max
      staticDurationSeconds * 1.25, // At least 1.25x static duration
      currentDurationSeconds * 1.1, // At least 1.1x current duration for edge cases
      (typicalCurrentDurationSeconds || 0) * 1.1, // At least 1.1x typical current duration for edge cases
    )

    // Calculate bar widths as percentages of the visual base
    const currentBarDisplayWidth =
      visualBase > 0 ? (currentDurationSeconds / visualBase) * 100 : 0

    const freeFlowBarDisplayWidth =
      visualBase > 0 ? (staticDurationSeconds / visualBase) * 100 : 0

    const typicalBarDisplayWidth =
      visualBase > 0 && typicalCurrentDurationSeconds
        ? (typicalCurrentDurationSeconds / visualBase) * 100
        : 0

    return {
      currentBarWidth: Math.max(currentBarDisplayWidth, 3), // Minimum 3% for visibility
      freeFlowBarWidth: Math.max(freeFlowBarDisplayWidth, 3), // Minimum 3% for visibility
      typicalBarWidth: Math.max(typicalBarDisplayWidth, 3), // Minimum 3% for visibility
      delay,
      hasDelay,
      delayPercentage: delayPercentage || delayPercentageCalc,
    }
  }, [
    currentDurationSeconds,
    staticDurationSeconds,
    typicalCurrentDurationSeconds,
    delayPercentage,
  ])

  return (
    <div
      className={`bg-gray-50 rounded-lg shadow-sm border border-gray-200/80 p-2 pt-3 ${className}`}
    >
      <div className="flex items-center justify-between">
        {/* Title and route label removed for compact tooltip */}
      </div>

      <div className="space-y-0.5">
        {/* Current Duration */}
        <div className="flex items-center justify-between">
          <div className="flex items-center flex-1">
            <span className="text-xs text-gray-500 min-w-14">Current</span>
            <div className="flex-1 mx-2">
              <div className="h-1.5 bg-white border border-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out bg-blue-600"
                  style={{
                    width: `${calculatedValues.currentBarWidth}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <span className="text-xs font-normal text-gray-500 ml-2 max-w-12">
            {formatDuration(currentDurationSeconds)}
          </span>
        </div>

        {/* Free Flow Duration - Same line as Current */}
        <div className="flex items-center justify-between">
          <div className="flex items-center flex-1">
            <span className="text-xs text-gray-500 min-w-14">Free Flow</span>
            <div className="flex-1 mx-2">
              <div className="h-1.5 bg-white border border-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out bg-blue-600"
                  style={{
                    width: `${calculatedValues.freeFlowBarWidth}%`,
                    opacity: 0.25,
                  }}
                />
              </div>
            </div>
          </div>
          <span className="text-xs font-normal text-gray-500 ml-2 max-w-12">
            {formatDuration(staticDurationSeconds)}
          </span>
        </div>

        {/* Total Delay */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center">
            <span className="text-xs text-gray-500 font-normal">
              Total Delay
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-bold text-gray-800">
              {calculatedValues.hasDelay
                ? formatDuration(delaySeconds || calculatedValues.delay)
                : "No Delay"}
            </span>
            {calculatedValues.hasDelay && (
              <span className="text-xs font-bold text-red-600">
                (+
                {calculatedValues.delayPercentage > 0
                  ? calculatedValues.delayPercentage.toFixed(1)
                  : "0.0"}
                %)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DurationComparison
