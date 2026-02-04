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

import { Paper } from "@mui/material"
import { styled } from "@mui/material/styles"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { useCallback } from "react"
import { createPortal } from "react-dom"

import { useAppStore } from "../store"
import { getAvailableDays } from "../utils/formatters"

interface CalendarPosition {
  top: number
  left: number
}

interface CustomCalendarProps {
  value: Date
  onChange: (date: Date) => void
  onClose: () => void
  position: CalendarPosition
  isEndDateCalendar?: boolean
}

const CalendarContainer = styled(Paper)({
  position: "fixed",
  zIndex: 10000,
  fontFamily: '"Google Sans", Roboto, sans-serif',
})

export const CustomCalendar = ({
  value,
  onChange,
  onClose,
  position,
  isEndDateCalendar = false,
}: CustomCalendarProps) => {
  const selectedCity = useAppStore((state) => state.selectedCity)
  const timeFilters = useAppStore((state) => state.timeFilters)
  const setSelectedDays = useAppStore((state) => state.setSelectedDays)

  const { startDate: cityStartDate, endDate } = selectedCity.availableDateRanges

  const effectiveStartDate = useCallback(() => {
    if (isEndDateCalendar && timeFilters.timePeriod === "custom") {
      return timeFilters.startDate
    }
    return cityStartDate
  }, [isEndDateCalendar, timeFilters, cityStartDate])

  const handleDateChange = useCallback(
    (newDate: Date | null) => {
      if (newDate) {
        if (timeFilters.timePeriod === "custom") {
          const currentDays = timeFilters.days || []
          let newStartDate: Date
          let newEndDate: Date

          if (isEndDateCalendar) {
            newStartDate = timeFilters.startDate
            newEndDate = newDate
          } else {
            newStartDate = newDate
            newEndDate = timeFilters.endDate
          }

          if (newStartDate <= newEndDate) {
            const availableDays = getAvailableDays(newStartDate, newEndDate)

            const validSelectedDays = currentDays.filter((day) =>
              availableDays.includes(day),
            )

            if (validSelectedDays.length === 0 && availableDays.length > 0) {
              setSelectedDays([availableDays[0]])
            } else if (validSelectedDays.length !== currentDays.length) {
              setSelectedDays(
                validSelectedDays.length > 0
                  ? validSelectedDays
                  : [availableDays[0]],
              )
            }
          }
        }

        onChange(newDate)
        onClose()
      }
    },
    [onChange, onClose, timeFilters, isEndDateCalendar, setSelectedDays],
  )

  return createPortal(
    <CalendarContainer
      sx={{
        top: position.top,
        left: position.left,
      }}
    >
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <DateCalendar
          value={value}
          onChange={handleDateChange}
          minDate={effectiveStartDate()}
          maxDate={endDate}
          sx={{
            fontFamily: '"Google Sans", Roboto, sans-serif',
            "& .MuiPickersCalendarHeader-root": {
              fontFamily: '"Google Sans", Roboto, sans-serif',
            },
            "& .MuiPickersDay-root": {
              fontFamily: '"Google Sans", Roboto, sans-serif',
            },
            "& .MuiDayCalendar-weekDayLabel": {
              fontFamily: '"Google Sans", Roboto, sans-serif',
            },
          }}
        />
      </LocalizationProvider>
    </CalendarContainer>,
    document.body,
  )
}
