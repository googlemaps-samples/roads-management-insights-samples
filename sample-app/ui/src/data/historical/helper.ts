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

/**
 * Get timezone offset string for a specific date and timezone
 * @param date - The date to get the offset for
 * @param timezone - IANA timezone name (e.g., "Asia/Tokyo")
 * @returns Offset string in format "+09:00" or "-05:00"
 */
export const getTimezoneOffsetString = (
  date: Date,
  timezone: string,
): string => {
  // Format the same moment in both timezones and compare
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  // Use formatToParts if available, otherwise fall back to manual parsing
  let partsObj: Record<string, string>
  let utcPartsObj: Record<string, string>

  if (
    typeof (
      formatter as unknown as {
        formatToParts?: (...args: unknown[]) => unknown
      }
    ).formatToParts === "function"
  ) {
    const parts = (
      formatter as unknown as {
        formatToParts: (date: Date) => Array<{ type: string; value: string }>
      }
    ).formatToParts(date)
    const utcParts = (
      utcFormatter as unknown as {
        formatToParts: (date: Date) => Array<{ type: string; value: string }>
      }
    ).formatToParts(date)

    const getPartsObj = (
      partsArray: Array<{ type: string; value: string }>,
    ) => {
      const obj: Record<string, string> = {}
      partsArray.forEach((part) => {
        if (part.type !== "literal") {
          obj[part.type] = part.value
        }
      })
      return obj
    }

    partsObj = getPartsObj(parts)
    utcPartsObj = getPartsObj(utcParts)
  } else {
    // Fallback implementation for older environments
    const tzFormatted = formatter.format(date)
    const utcFormatted = utcFormatter.format(date)

    // Parse the formatted strings manually
    const parseFormattedDate = (formatted: string) => {
      const match = formatted.match(
        /(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/,
      )
      if (!match) throw new Error("Failed to parse formatted date")
      return {
        month: match[1],
        day: match[2],
        year: match[3],
        hour: match[4],
        minute: match[5],
        second: match[6],
      }
    }

    partsObj = parseFormattedDate(tzFormatted)
    utcPartsObj = parseFormattedDate(utcFormatted)
  }

  // Convert to total minutes from epoch  (for accurate comparison)
  const toTotalMinutes = (p: Record<string, string>): number => {
    const year = parseInt(p.year)
    const month = parseInt(p.month)
    const day = parseInt(p.day)
    const hour = parseInt(p.hour)
    const minute = parseInt(p.minute)

    // Create a Date object and get milliseconds, then convert to minutes
    // This handles month/year boundaries correctly
    const d = new Date(Date.UTC(year, month - 1, day, hour, minute))
    return Math.floor(d.getTime() / 60000)
  }

  const tzMinutes = toTotalMinutes(partsObj)
  const utcMinutes = toTotalMinutes(utcPartsObj)

  const offsetMinutes = tzMinutes - utcMinutes
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const absOffset = Math.abs(offsetMinutes)
  const hours = Math.floor(absOffset / 60)
  const minutes = absOffset % 60

  // Use padStart if available, otherwise fall back to manual padding
  const padString = (str: string, length: number, padChar: string): string => {
    if (
      typeof (str as unknown as { padStart?: (...args: unknown[]) => unknown })
        .padStart === "function"
    ) {
      return (
        str as unknown as {
          padStart: (length: number, padChar: string) => string
        }
      ).padStart(length, padChar)
    }
    // Manual padding fallback
    const repeatChar = (char: string, count: number): string => {
      if (
        typeof (char as unknown as { repeat?: (...args: unknown[]) => unknown })
          .repeat === "function"
      ) {
        return (
          char as unknown as { repeat: (count: number) => string }
        ).repeat(count)
      }
      // Manual repeat fallback
      let result = ""
      for (let i = 0; i < count; i++) {
        result += char
      }
      return result
    }
    return repeatChar(padChar, Math.max(0, length - str.length)) + str
  }

  return `${sign}${padString(String(hours), 2, "0")}:${padString(String(minutes), 2, "0")}`
}

// Helper function to get hours to consider based on selectedHourRange
export const getHoursToConsider = (
  selectedHourRange: [number, number],
): number[] => {
  const [startHour, endHour] = selectedHourRange
  const hoursToConsider: number[] = []

  if (startHour > endHour) {
    // Handle wrap-around case (e.g., 23-5)
    for (let hour = startHour; hour < 24; hour++) {
      hoursToConsider.push(hour)
    }
    for (let hour = 0; hour <= endHour; hour++) {
      hoursToConsider.push(hour)
    }
  } else {
    // Multi-hour case (e.g., 10-14, 12-20)
    for (let hour = startHour; hour <= endHour; hour++) {
      hoursToConsider.push(hour)
    }
  }

  return hoursToConsider
}

/**
 * Extract the hour (0-23) directly from an ISO date string
 * @param dateStr - ISO date string in format "2025-07-10T05:00:00+09:00"
 * @returns hour as number (0-23)
 */
export const getHourFromISOString = (dateStr: string): number => {
  // Extract hour from format "2025-07-10T05:00:00+09:00"
  const hourMatch = dateStr.match(/T(\d{2}):/)
  if (!hourMatch) {
    throw new Error(`Invalid date format: ${dateStr}`)
  }
  return parseInt(hourMatch[1], 10)
}

/**
 * Extract the hour (0-23) from a time string in format "HH:MM:SS"
 * @param timeStr - Time string in format "00:00:00"
 * @returns hour as number (0-23)
 */
export const getHourFromTimeString = (timeStr: string): number => {
  // Extract hour from format "00:00:00"
  return parseInt(timeStr.split(":")[0], 10)
}

/**
 * Extract the day of week (0-6, where 0 is Sunday) directly from an ISO date string
 * @param dateStr - ISO date string in format "2025-07-10T05:00:00+09:00"
 * @returns day of week as number (0-6)
 */
export const getDayOfWeekFromISOString = (dateStr: string): number => {
  // Extract date part from format "2025-07-10T05:00:00+09:00"
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  if (!dateMatch) {
    throw new Error(`Invalid date format: ${dateStr}`)
  }

  const year = parseInt(dateMatch[1], 10)
  const month = parseInt(dateMatch[2], 10) - 1 // Month is 0-indexed
  const day = parseInt(dateMatch[3], 10)

  // Use Date constructor only for day calculation, not for timezone conversion
  const date = new Date(year, month, day)
  return date.getDay()
}

/**
 * Extract timestamp in milliseconds directly from an ISO date string
 * Properly respects the timezone offset in the string
 * @param dateStr - ISO date string in format "2025-07-10T05:00:00+09:00"
 * @returns timestamp in milliseconds (UTC)
 */
export const getTimestampFromISOString = (dateStr: string): number => {
  // Use native Date constructor which properly handles timezone offsets
  const timestamp = new Date(dateStr).getTime()

  if (isNaN(timestamp)) {
    throw new Error(`Invalid date format: ${dateStr}`)
  }

  return timestamp
}

/**
 * Extract timestamp in milliseconds from a time string in format "HH:MM:SS"
 * Note: This requires a base date context since time string doesn't contain date info
 * @param timeStr - Time string in format "00:00:00"
 * @param baseDate - Base date to use for the timestamp (defaults to current date)
 * @returns timestamp in milliseconds
 */
export const getTimestampFromTimeString = (
  timeStr: string,
  baseDate: Date = new Date(),
): number => {
  // Extract time parts from format "00:00:00"
  const timeMatch = timeStr.match(/^(\d{2}):(\d{2}):(\d{2})$/)
  if (!timeMatch) {
    throw new Error(`Invalid time format: ${timeStr}`)
  }

  const hour = parseInt(timeMatch[1], 10)
  const minute = parseInt(timeMatch[2], 10)
  const second = parseInt(timeMatch[3], 10)

  // Create a new date using the base date but with the extracted time
  const date = new Date(baseDate.getTime())
  date.setHours(hour, minute, second, 0) // Reset milliseconds to 0
  return date.getTime()
}

/**
 * Check if a date string matches a specific day filter
 * @param dateStr - ISO date string in format "2025-07-10T05:00:00+09:00"
 * @param selectedDay - Day filter (Sun, Mon, Tue, etc.)
 * @returns boolean indicating if the date matches the day filter
 */
export const matchesDayFilterFromISOString = (
  dateStr: string,
  selectedDay?: string,
): boolean => {
  if (!selectedDay || selectedDay.toLowerCase() === "all") return true

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const recordDay = dayNames[getDayOfWeekFromISOString(dateStr)]
  return recordDay.toLowerCase() === selectedDay.toLowerCase()
}

/**
 * Extract date string (YYYY-MM-DD) from an ISO date string
 * Uses the date components from the ISO string directly, not local timezone conversion
 * @param dateStr - ISO date string in format "2025-07-10T05:00:00+09:00"
 * @returns date string in format "YYYY-MM-DD"
 */
export const getDateStringFromISOString = (dateStr: string): string => {
  // Extract date part from format "2025-07-10T05:00:00+09:00"
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!dateMatch) {
    throw new Error(`Invalid date format: ${dateStr}`)
  }
  return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
}
