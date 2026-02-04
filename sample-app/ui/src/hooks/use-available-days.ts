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

import { useMemo } from "react"

import { useAppStore } from "../store"
import { getAvailableDays } from "../utils/formatters"

/**
 * Custom hook to calculate available days based on start and end date range
 * Returns memoized available days array
 */
export const useAvailableDays = () => {
  const timeFilters = useAppStore((state) => state.timeFilters)
  const setSelectedDays = useAppStore((state) => state.setSelectedDays)

  const availableDays = useMemo(() => {
    // Check if timeFilters has startDate and endDate (custom time period)
    if (
      "startDate" in timeFilters &&
      "endDate" in timeFilters &&
      timeFilters.startDate &&
      timeFilters.endDate
    ) {
      if (timeFilters.timePeriod === "custom") {
        const days = getAvailableDays(
          timeFilters.startDate,
          timeFilters.endDate,
        )

        // Set initial days to the first day of the date range
        // Only if we don't already have a selected day that's valid
        if (days.length > 0) {
          const currentSelectedDays = timeFilters.days || []
          const isCurrentDaysValid =
            currentSelectedDays.length > 0 &&
            currentSelectedDays.some((day) => days.includes(day))

          if (!isCurrentDaysValid) {
            // Use setTimeout to avoid state updates during render
            setTimeout(() => {
              setSelectedDays([days[0]])
            }, 0)
          }
        }

        return days
      }
    } else {
      // For non-custom time periods, ensure at least one day is selected
      const currentSelectedDays = timeFilters.days || []

      // If no days are selected, automatically select Monday as default
      if (currentSelectedDays.length === 0) {
        setTimeout(() => {
          setSelectedDays(["Mon"])
        }, 0)
      }

      // Return empty array if not in custom time period mode
      return []
    }
  }, [
    timeFilters,
    "startDate" in timeFilters ? timeFilters.startDate : null,
    "endDate" in timeFilters ? timeFilters.endDate : null,
    timeFilters.days,
    setSelectedDays,
  ])

  return {
    availableDays,
  }
}
