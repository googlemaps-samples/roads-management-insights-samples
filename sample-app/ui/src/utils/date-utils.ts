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
 * Calculate the start date of the last week based on the available date range
 * The last week is defined as the 7 days before the end date
 */
export const calculateLastWeekStart = (endDate: Date): Date => {
  const lastWeekStart = new Date(endDate)
  lastWeekStart.setDate(endDate.getDate() - 6) // 7 days total (including end date)
  lastWeekStart.setHours(0, 0, 0, 0) // Start of day
  return lastWeekStart
}

/**
 * Get the last week date range for a city
 */
export const getLastWeekRange = (endDate: Date) => {
  const lastWeekStart = calculateLastWeekStart(endDate)
  const lastWeekEnd = new Date(endDate)
  lastWeekEnd.setHours(23, 59, 59, 999) // End of day

  return {
    start: lastWeekStart,
    end: lastWeekEnd,
  }
}
