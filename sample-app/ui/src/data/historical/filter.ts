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
import { City } from "../../types/city"
import { CustomTimeFilters, LastWeekMonthFilters } from "../../types/filters"
import { isDemoMode } from "../../utils"
import {
  getHourFromISOString,
  getHourFromTimeString,
  getTimestampFromISOString,
  getTimestampFromTimeString,
  getTimezoneOffsetString,
  matchesDayFilterFromISOString,
} from "./helper"

/**
 * Pre-calculate timezone-aware date ranges and hour mappings
 * This should be called once before filtering to avoid repeated calculations
 * Now properly respects timezone offsets to match record timestamps
 */
export const createTimezoneAwareFilters = (
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
  selectedCity: City,
) => {
  const { timePeriod } = timeFilters
  let customStartTime: number | null = null
  let customEndTime: number | null = null

  // Pre-calculate timezone-aware date ranges
  if (timePeriod) {
    if (timePeriod === "custom") {
      const { startDate, endDate } = timeFilters
      if (startDate && endDate) {
        // Extract date components (year, month, day) from the Date object
        // These represent the user's intended date selection
        const startYear = startDate.getFullYear()
        const startMonth = String(startDate.getMonth() + 1).padStart(2, "0")
        const startDay = String(startDate.getDate()).padStart(2, "0")
        const startDateString = `${startYear}-${startMonth}-${startDay}`

        const endYear = endDate.getFullYear()
        const endMonth = String(endDate.getMonth() + 1).padStart(2, "0")
        const endDay = String(endDate.getDate()).padStart(2, "0")
        const endDateString = `${endYear}-${endMonth}-${endDay}`

        // Get timezone offset for the target city on these dates
        // Use a reference date to get the offset (accounts for DST)
        const startRefDate = new Date(`${startDateString}T12:00:00Z`)
        const endRefDate = new Date(`${endDateString}T12:00:00Z`)
        const startOffset = getTimezoneOffsetString(
          startRefDate,
          selectedCity.timezone,
        )
        const endOffset = getTimezoneOffsetString(
          endRefDate,
          selectedCity.timezone,
        )

        // Create timestamps for the start and end of the day in the target timezone
        customStartTime = new Date(
          `${startDateString}T00:00:00${startOffset}`,
        ).getTime()
        customEndTime = new Date(
          `${endDateString}T23:59:59.999${endOffset}`,
        ).getTime()
      }
    } else if (timePeriod === "last-week") {
      const startTime = new Date(
        selectedCity.availableDateRanges.endDate.getTime() -
          7 * 24 * 60 * 60 * 1000,
      )
      startTime.setHours(0, 0, 0, 0)

      // Extract date components without timezone conversion
      const startYear = startTime.getFullYear()
      const startMonth = String(startTime.getMonth() + 1).padStart(2, "0")
      const startDay = String(startTime.getDate()).padStart(2, "0")
      const startDateString = `${startYear}-${startMonth}-${startDay}`

      const endYear = selectedCity.availableDateRanges.endDate.getFullYear()
      const endMonth = String(
        selectedCity.availableDateRanges.endDate.getMonth() + 1,
      ).padStart(2, "0")
      const endDay = String(
        selectedCity.availableDateRanges.endDate.getDate(),
      ).padStart(2, "0")
      const endDateString = `${endYear}-${endMonth}-${endDay}`

      // Get timezone offsets
      const startRefDate = new Date(`${startDateString}T12:00:00Z`)
      const endRefDate = new Date(`${endDateString}T12:00:00Z`)
      const startOffset = getTimezoneOffsetString(
        startRefDate,
        selectedCity.timezone,
      )
      const endOffset = getTimezoneOffsetString(
        endRefDate,
        selectedCity.timezone,
      )

      customStartTime = new Date(
        `${startDateString}T00:00:00${startOffset}`,
      ).getTime()
      customEndTime = new Date(
        `${endDateString}T23:59:59.999${endOffset}`,
      ).getTime()
    } else if (timePeriod === "last-week-to-last-week") {
      const startTime = new Date(
        selectedCity.availableDateRanges.endDate.getTime() -
          14 * 24 * 60 * 60 * 1000,
      )
      startTime.setHours(0, 0, 0, 0)
      const endTime = new Date(
        selectedCity.availableDateRanges.endDate.getTime() -
          7 * 24 * 60 * 60 * 1000,
      )
      endTime.setHours(23, 59, 59, 999)

      // Extract date components without timezone conversion
      const startYear = startTime.getFullYear()
      const startMonth = String(startTime.getMonth() + 1).padStart(2, "0")
      const startDay = String(startTime.getDate()).padStart(2, "0")
      const startDateString = `${startYear}-${startMonth}-${startDay}`

      const endYear = endTime.getFullYear()
      const endMonth = String(endTime.getMonth() + 1).padStart(2, "0")
      const endDay = String(endTime.getDate()).padStart(2, "0")
      const endDateString = `${endYear}-${endMonth}-${endDay}`

      // Get timezone offsets
      const startRefDate = new Date(`${startDateString}T12:00:00Z`)
      const endRefDate = new Date(`${endDateString}T12:00:00Z`)
      const startOffset = getTimezoneOffsetString(
        startRefDate,
        selectedCity.timezone,
      )
      const endOffset = getTimezoneOffsetString(
        endRefDate,
        selectedCity.timezone,
      )

      customStartTime = new Date(
        `${startDateString}T00:00:00${startOffset}`,
      ).getTime()
      customEndTime = new Date(
        `${endDateString}T23:59:59.999${endOffset}`,
      ).getTime()
    } else {
      // Extract date components without timezone conversion
      const startYear = selectedCity.availableDateRanges.startDate.getFullYear()
      const startMonth = String(
        selectedCity.availableDateRanges.startDate.getMonth() + 1,
      ).padStart(2, "0")
      const startDay = String(
        selectedCity.availableDateRanges.startDate.getDate(),
      ).padStart(2, "0")
      const startDateString = `${startYear}-${startMonth}-${startDay}`

      const endYear = selectedCity.availableDateRanges.endDate.getFullYear()
      const endMonth = String(
        selectedCity.availableDateRanges.endDate.getMonth() + 1,
      ).padStart(2, "0")
      const endDay = String(
        selectedCity.availableDateRanges.endDate.getDate(),
      ).padStart(2, "0")
      const endDateString = `${endYear}-${endMonth}-${endDay}`

      // Get timezone offsets
      const startRefDate = new Date(`${startDateString}T12:00:00Z`)
      const endRefDate = new Date(`${endDateString}T12:00:00Z`)
      const startOffset = getTimezoneOffsetString(
        startRefDate,
        selectedCity.timezone,
      )
      const endOffset = getTimezoneOffsetString(
        endRefDate,
        selectedCity.timezone,
      )

      customStartTime = new Date(
        `${startDateString}T00:00:00${startOffset}`,
      ).getTime()
      customEndTime = new Date(
        `${endDateString}T23:59:59.999${endOffset}`,
      ).getTime()
    }
  }

  return {
    customStartTime,
    customEndTime,
    timezone: selectedCity.timezone,
  }
}

interface Record {
  selected_route_id: string
  record_time: string
  duration_in_seconds: number | string
  static_duration_in_seconds: number | string
}

export interface RecordWithLength extends Record {
  length: number
}

export const filterRecord = (
  record: Record,
  allRouteIdsSet: Set<string>,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
  timezoneFilters?: {
    customStartTime: number | null
    customEndTime: number | null
    timezone: string
  },
) => {
  const demoMode = isDemoMode()
  const { timePeriod, hourRange, days } = timeFilters

  // Early exit for route ID check
  if (!allRouteIdsSet.has(record.selected_route_id)) {
    return false
  }

  // Extract date information with timezone consideration
  let recordHour: number
  let recordTime: number

  try {
    recordHour = demoMode
      ? getHourFromISOString(record.record_time)
      : getHourFromTimeString(record.record_time)
    recordTime = demoMode
      ? getTimestampFromISOString(record.record_time)
      : getTimestampFromTimeString(record.record_time)
  } catch (error) {
    console.error(`Error getting hour from ISO string:`, error)
    return false // Skip logging in hot path
  }

  // Check day filter
  if (days && days.length > 0 && demoMode) {
    // Check if record matches any of the selected days
    const recordMatchesAnyDay = days.some((selectedDay) =>
      matchesDayFilterFromISOString(record.record_time, selectedDay),
    )
    if (!recordMatchesAnyDay) {
      return false
    }
  }

  if (!demoMode) {
    const [startHour, endHour] = hourRange
    return startHour > endHour
      ? recordHour >= startHour || recordHour <= endHour
      : recordHour >= startHour && recordHour <= endHour
  }
  // Combined filtering logic with optimized branching
  if (timePeriod && hourRange) {
    const [startHour, endHour] = hourRange

    // Check time period first (likely to filter more records)
    let isInTimePeriod = false
    if (timezoneFilters?.customStartTime && timezoneFilters?.customEndTime) {
      isInTimePeriod =
        recordTime >= timezoneFilters.customStartTime &&
        recordTime <= timezoneFilters.customEndTime
    }

    if (!isInTimePeriod) return false

    // Check hour range
    return startHour > endHour
      ? recordHour >= startHour || recordHour <= endHour
      : recordHour >= startHour && recordHour <= endHour
  } else if (timePeriod) {
    // Only time period filter
    if (timezoneFilters?.customStartTime && timezoneFilters?.customEndTime) {
      return (
        recordTime >= timezoneFilters.customStartTime &&
        recordTime <= timezoneFilters.customEndTime
      )
    }
  } else if (hourRange) {
    // Only hour range filter
    const [startHour, endHour] = hourRange as [number, number]
    return startHour > endHour
      ? recordHour >= startHour || recordHour <= endHour
      : recordHour >= startHour && recordHour <= endHour
  }

  return true
}
