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

import { CustomTimeFilters, LastWeekMonthFilters } from "../types/filters"
import { calculateLastWeekStart } from "./date-utils"

// Helper function to format duration in a user-friendly way
export const formatDuration = (seconds: number): string => {
  if (seconds <= 0) {
    return `0s`
  } else if (seconds < 60) {
    return `${Math.round(seconds)}s`
  } else if (seconds < 3600) {
    // Less than 1 hour
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ${Math.round(seconds % 60)}s`
  } else {
    const hours = Math.floor(seconds / 3600)
    const remainingMinutes = Math.round((seconds % 3600) / 60)
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  }
}

export const formatHour = (hour: number) => {
  if (hour === 0 || hour === 24) return "12 AM"
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return "12 PM"
  return `${hour - 12} PM`
}

export const formatHourRange = (hourRange: string): string => {
  if (!hourRange || hourRange === "N/A") return "N/A"

  // Handle single hour (e.g., "5")
  if (!hourRange.includes("-")) {
    const hour = parseInt(hourRange)
    if (isNaN(hour)) return hourRange
    return formatHour(hour)
  }

  // Handle hour range (e.g., "5-8")
  const [startHour, endHour] = hourRange.split("-")
  const start = parseInt(startHour)
  const end = parseInt(endHour)

  if (isNaN(start) || isNaN(end)) return hourRange

  // If start and end are the same, create a 1-hour range
  if (start === end) {
    const nextHour = (start + 1) % 24
    return `${formatHour(start)} - ${formatHour(nextHour)}`
  }

  return `${formatHour(start)} - ${formatHour(end)}`
}

export type TimePeriod = {
  startDate: Date
  endDate: Date
}

export function getTimePeriod(
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
  availableTimePeriod: TimePeriod,
): TimePeriod {
  if (timeFilters.timePeriod === "last-week") {
    return {
      startDate: calculateLastWeekStart(availableTimePeriod.endDate),
      endDate: availableTimePeriod.endDate,
    }
  } else if (timeFilters.timePeriod === "last-month") {
    return {
      startDate: availableTimePeriod.startDate,
      endDate: availableTimePeriod.endDate,
    }
  } else if (timeFilters.timePeriod === "custom") {
    return {
      startDate: timeFilters.startDate,
      endDate: timeFilters.endDate,
    }
  } else {
    throw new Error("Invalid time period")
  }
}

export const getTimePeriodDescription = (timePeriod: TimePeriod) => {
  const { startDate, endDate } = timePeriod

  const startMonth = startDate.toLocaleDateString("en-US", { month: "short" })
  const startDay = startDate.toLocaleDateString("en-US", { day: "numeric" })
  const endMonth = endDate.toLocaleDateString("en-US", { month: "short" })
  const endDay = endDate.toLocaleDateString("en-US", { day: "numeric" })

  // Use shorter format: "Sep 8-15" instead of "Sep 8 to Sep 15"
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`
  } else {
    return `${startMonth} ${startDay}-${endMonth} ${endDay}`
  }
}

export const getTimeDescription = (hourRange: [number, number]) => {
  const startTime = formatHour(hourRange[0])
  const endTime = formatHour(hourRange[1])
  const result =
    hourRange[0] === hourRange[1]
      ? `at ${startTime}`
      : `between ${startTime} to ${endTime}`
  return result
}

export const getDayDescription = (day: string | null): string => {
  switch (day) {
    case "Sun":
      return "Sundays"
    case "Mon":
      return "Mondays"
    case "Tue":
      return "Tuesdays"
    case "Wed":
      return "Wednesdays"
    case "Thu":
      return "Thursdays"
    case "Fri":
      return "Fridays"
    case "Sat":
      return "Saturdays"
    default:
      return "Unknown day"
  }
}

export const getDaysDescription = (days: string[]): string => {
  if (days.length === 0) return "No days selected"
  if (days.length === 1) return getDayDescription(days[0])

  // Define the correct order of days (Sunday to Saturday)
  const dayOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  // Sort the days according to the correct order
  const sortedDays = days.sort((a, b) => {
    const indexA = dayOrder.indexOf(a)
    const indexB = dayOrder.indexOf(b)
    return indexA - indexB
  })

  const dayNames = sortedDays.map((day) => {
    switch (day) {
      case "Sun":
        return "Sun"
      case "Mon":
        return "Mon"
      case "Tue":
        return "Tue"
      case "Wed":
        return "Wed"
      case "Thu":
        return "Thu"
      case "Fri":
        return "Fri"
      case "Sat":
        return "Sat"
      default:
        return day
    }
  })

  if (days.length === 2) return `${dayNames[0]} & ${dayNames[1]}`
  if (days.length <= 4) return dayNames.join(", ")
  return `${dayNames.slice(0, 2).join(", ")} +${days.length - 2} more`
}

export const getAllDaysDescription = (days: string[]): string => {
  if (days.length === 0) return "No days selected"
  if (days.length === 1) return getDayDescription(days[0])

  // Define the correct order of days (Sunday to Saturday)
  const dayOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  // Sort the days according to the correct order
  const sortedDays = days.sort((a, b) => {
    const indexA = dayOrder.indexOf(a)
    const indexB = dayOrder.indexOf(b)
    return indexA - indexB
  })

  const dayNames = sortedDays.map((day) => {
    switch (day) {
      case "Sun":
        return "Sun"
      case "Mon":
        return "Mon"
      case "Tue":
        return "Tue"
      case "Wed":
        return "Wed"
      case "Thu":
        return "Thu"
      case "Fri":
        return "Fri"
      case "Sat":
        return "Sat"
    }
  })

  return dayNames.join(", ")
}

export const formatDateTime = (date: Date): string => {
  const timeString = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  const dateString = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return `${timeString} on ${dateString}`
}

export const formatDateDisplay = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })
}

export const isDaySelectable = (
  dayValue: string,
  timePeriod: string,
  timeFilters: LastWeekMonthFilters | CustomTimeFilters,
  availableDays: string[],
): boolean => {
  if (
    timePeriod === "custom" &&
    timeFilters.timePeriod === "custom" &&
    timeFilters.startDate &&
    timeFilters.endDate
  ) {
    return availableDays.includes(dayValue)
  }
  return true // If no custom date range, all days selectable
}

export const validateSliderValue = (
  start: number,
  end: number,
): [number, number] => {
  // Enforce minimum 1-hour difference (handle wrap-around)
  if (end === start) {
    if (end === 0 && start === 0) {
      return [0, 1]
    } else if (end === 24 && start === 24) {
      return [23, 24]
    } else {
      return [start, start + 1]
    }
  }
  return [start, end]
}

export const getAvailableDays = (start: Date, end: Date): string[] => {
  const availableDays: string[] = []
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const currentDate = new Date(start)
  const endDateCheck = new Date(end)

  while (currentDate <= endDateCheck) {
    const dayName = dayNames[currentDate.getDay()]
    if (!availableDays.includes(dayName)) {
      availableDays.push(dayName)
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return availableDays
}

export const formatSecondsToShow = (seconds: number) => {
  if (isNaN(seconds) || !isFinite(seconds)) {
    return "0"
  }
  if (seconds < 1) {
    return seconds.toFixed(1)
  }
  return Math.round(seconds)
}
