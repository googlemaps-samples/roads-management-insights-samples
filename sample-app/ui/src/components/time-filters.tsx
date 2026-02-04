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

import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import {
  Box,
  ClickAwayListener,
  Slider,
  Typography,
  debounce,
  styled,
  useMediaQuery,
} from "@mui/material"
import { useCallback, useEffect, useState } from "react"

import { useAvailableDays } from "../hooks"
import { useAppStore } from "../store"
import { formatHour } from "../utils"
import {
  isDaySelectable as checkDaySelectable,
  formatDateDisplay,
  validateSliderValue,
} from "../utils/formatters"
import { CustomCalendar } from "./custom-calendar"

const Separator = styled(Box)(({ theme }) => ({
  height: "1px",
  backgroundColor: theme.palette.borders.light,
  width: "100%",
  margin: "4px 0",
}))

const FilterSection = styled(Box)({
  marginBottom: "8px",
  padding: "0 8px",
})

const FilterTitle = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.primary,
  marginBottom: "8px",
  fontWeight: 600,
  fontSize: "12px",
  fontFamily: "Google Sans, Product Sans, Roboto, sans-serif",
}))

const TimePeriodContainer = styled(Box)({
  display: "flex",
  gap: "8px",
})

const TimePeriodButton = styled(Box)<{ isSelected: boolean }>(
  ({ theme, isSelected }) => ({
    padding: "6px 12px",
    borderRadius: "6px",
    backgroundColor: isSelected
      ? theme.palette.interactive.primary
      : theme.palette.surfaces.secondary,
    color: isSelected
      ? theme.palette.common.white
      : theme.palette.text.secondary,
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: 600,
    border: isSelected ? "none" : `1px solid ${theme.palette.borders.light}`,
    flex: 1,
    textAlign: "center",
    "&:hover": {
      backgroundColor: isSelected
        ? theme.palette.interactive.primaryHover
        : theme.palette.surfaces.tertiary,
      borderColor: isSelected ? "transparent" : theme.palette.borders.medium,
    },
  }),
)

const CustomDateContainer = styled(Box)<{ isVisible: boolean }>(
  ({ isVisible }) => ({
    marginBottom: "16px",
    padding: "0 8px",
    overflow: "hidden",
    transition: "all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)",
    maxHeight: isVisible ? "120px" : "0px",
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "translateY(0)" : "translateY(-10px)",
  }),
)

const DateRangeContainer = styled(Box)({
  display: "flex",
  alignItems: "center",
  gap: "8px",
})

const DateFieldContainer = styled(Box)({
  display: "flex",
  alignItems: "center",
  gap: "4px",
  flex: 1,
})

const DateLabel = styled(Typography)(({ theme }) => ({
  fontSize: "11px",
  color: theme.palette.text.secondary,
  fontFamily: '"Google Sans", Roboto, sans-serif',
  fontWeight: 600,
}))

const DayContainer = styled(Box)({
  display: "flex",
  gap: "4px",
  justifyContent: "space-between",
})

const DayButton = styled(Box)<{ isSelected: boolean; isSelectable: boolean }>(
  ({ theme, isSelected, isSelectable }) => ({
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    backgroundColor: isSelected
      ? theme.palette.interactive.primary
      : "transparent",
    color: isSelected
      ? theme.palette.common.white
      : isSelectable
        ? theme.palette.text.primary
        : theme.palette.borders.medium,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: isSelectable ? "pointer" : "default",
    fontSize: "12px",
    fontWeight: 600,
    fontFamily: '"Google Sans", Roboto, sans-serif',
    // transition: "all 0.2s ease",
    "&:hover": {
      backgroundColor: isSelected
        ? theme.palette.interactive.primaryHover
        : isSelectable
          ? theme.palette.surfaces.tertiary
          : "transparent",
    },
  }),
)

const SliderContainer = styled(Box)({
  width: "100%",
  padding: "0 20px",
  margin: "0 10px",
  overflow: "visible",
})

const StyledSlider = styled(Slider)(({ theme }) => ({
  color: theme.palette.interactive.primary,
  height: 4,
  "& .MuiSlider-track": { border: "none" },
  "& .MuiSlider-thumb": {
    height: 18,
    width: 18,
    backgroundColor: theme.palette.interactive.primary,
    border: `2px solid ${theme.palette.common.white}`,
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
    "&:hover, &.Mui-focusVisible": {
      boxShadow: "0 0 0 8px rgba(138,180,248,0.16)",
    },
  },
  "& .MuiSlider-rail": {
    backgroundColor: theme.palette.borders.medium,
  },
  "& .MuiSlider-markLabel": {
    fontSize: "11px",
    color: theme.palette.text.secondary,
  },
  "& .MuiSlider-valueLabel": {
    fontSize: "12px",
    fontWeight: 600,
    backgroundColor: theme.palette.interactive.primary,
    color: theme.palette.common.white,
  },
}))

const DateButtonContainer = styled(Box)({
  position: "relative",
  flex: 1,
  minWidth: 0,
})

const DateButtonWrapper = styled(Box)(({ theme }) => ({
  fontSize: "11px",
  padding: "6px 12px",
  border: `1px solid ${theme.palette.borders.light}`,
  borderRadius: "6px",
  fontWeight: 600,
  color: theme.palette.text.secondary,
  fontFamily: '"Google Sans", Roboto, sans-serif',
  backgroundColor: theme.palette.surfaces.secondary,
  width: "100%",
  outline: "none",
  transition: "all 0.2s ease",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: "24px",
  "&:hover": {
    borderColor: theme.palette.interactive.primary,
    boxShadow: "0 1px 3px rgba(26, 115, 232, 0.1)",
  },
}))

const DateButtonText = styled("span")({
  // No additional styles needed
})

const DateButtonIcon = styled(ExpandMoreIcon)(({ theme }) => ({
  fontSize: "14px",
  color: theme.palette.text.secondary,
}))

const TimeFilters = () => {
  const timePeriod = useAppStore((state) => state.timeFilters.timePeriod)
  const setSelectedTimePeriod = useAppStore(
    (state) => state.setSelectedTimePeriod,
  )
  const useCase = useAppStore((state) => state.usecase)
  const timeFilters = useAppStore((state) => state.timeFilters)
  const setStartDate = useAppStore((state) => state.setStartDate)
  const setEndDate = useAppStore((state) => state.setEndDate)
  const hourRange = useAppStore((state) => state.timeFilters.hourRange)
  const setSelectedHourRange = useAppStore(
    (state) => state.setSelectedHourRange,
  )
  const selectedCity = useAppStore((state) => state.selectedCity)
  const isComparisonMode = useAppStore((state) => state.isComparisonMode)
  const activeComparisonShortcut = useAppStore(
    (state) => state.activeComparisonShortcut,
  )

  const setComparisonTimeFilters = useAppStore(
    (state) => state.setComparisonTimeFilters,
  )
  const setSelectedDays = useAppStore((state) => state.setSelectedDays)
  const comparisonTimeFilters = useAppStore(
    (state) => state.comparisonTimeFilters,
  )

  const isMobile = useMediaQuery("(max-width: 768px)")

  const [startCalendarOpen, setStartCalendarOpen] = useState(false)
  const [endCalendarOpen, setEndCalendarOpen] = useState(false)
  const [startCalendarPosition, setStartCalendarPosition] = useState({
    top: 0,
    left: 0,
  })
  const [endCalendarPosition, setEndCalendarPosition] = useState({
    top: 0,
    left: 0,
  })
  const [sliderValue, setSliderValue] = useState<[number, number]>(hourRange)
  const [localSelectedDays, setLocalSelectedDays] = useState<string[]>(
    timeFilters.days || [],
  )

  const sliderMarks = [
    { value: 0, label: "12AM" },
    { value: 6, label: "6AM" },
    { value: 12, label: "12PM" },
    { value: 18, label: "6PM" },
    { value: 24, label: "12AM" },
  ]

  // Use custom hook to manage available days
  const { availableDays } = useAvailableDays()

  const handleDebouncedSliderChange = useCallback(
    debounce((newValue: [number, number]) => {
      const [start, end] = newValue
      setSelectedHourRange([start, end])
    }, 500),
    [],
  )

  const handleDebouncedDaysChange = useCallback(
    debounce((newDays: string[]) => {
      setSelectedDays(newDays)
    }, 500),
    [],
  )

  useEffect(() => {
    handleDebouncedDaysChange(localSelectedDays)
  }, [localSelectedDays])

  // Sync slider value with store when hourRange changes externally
  useEffect(() => {
    setSliderValue(hourRange)
  }, [hourRange])

  useEffect(() => {
    const storeDays = timeFilters.days || []
    // Only update local state if store has days and local state is empty
    // This prevents overriding automatic day selection from useAvailableDays hook
    if (storeDays.length > 0) {
      setLocalSelectedDays(storeDays)
    }
  }, [timeFilters.days])

  return (
    <>
      {/* First separator - hide during comparison mode */}
      {!isComparisonMode && <Separator />}

      {/* Time Period Filter - hide during comparison mode */}
      {!isComparisonMode && (
        <FilterSection>
          <FilterTitle variant="caption">Time Period</FilterTitle>
          <TimePeriodContainer>
            {[
              { value: "last-week", label: "Last Week" },
              { value: "custom", label: "Custom" },
            ].map((period) => {
              const isSelected = timePeriod === period.value
              return (
                <TimePeriodButton
                  key={period.value}
                  isSelected={isSelected}
                  onPointerDown={() => {
                    setSelectedTimePeriod(
                      period.value as "last-week" | "last-month" | "custom",
                    )
                  }}
                >
                  {period.label}
                </TimePeriodButton>
              )
            })}
          </TimePeriodContainer>
        </FilterSection>
      )}

      {/* Custom Date Range - hide during comparison mode */}
      {!isComparisonMode && timePeriod === "custom" && (
        <CustomDateContainer isVisible={timePeriod === "custom"}>
          <DateRangeContainer>
            {/* Start Date */}
            <DateFieldContainer>
              <DateLabel>From:</DateLabel>
              <DateButtonContainer>
                <ClickAwayListener
                  onClickAway={() => setStartCalendarOpen(false)}
                >
                  <Box>
                    <DateButtonWrapper
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setStartCalendarPosition({
                          top: rect.top + 16, // Position above the button
                          left: isMobile ? 16 : rect.left,
                        })
                        setStartCalendarOpen(!startCalendarOpen)
                      }}
                    >
                      <DateButtonText>
                        {timeFilters.timePeriod === "custom" &&
                        timeFilters.startDate
                          ? formatDateDisplay(timeFilters.startDate)
                          : formatDateDisplay(
                              selectedCity.availableDateRanges.startDate,
                            )}
                      </DateButtonText>
                      <DateButtonIcon />
                    </DateButtonWrapper>
                    {startCalendarOpen && (
                      <CustomCalendar
                        value={
                          (timeFilters.timePeriod === "custom" &&
                            timeFilters.startDate) ||
                          selectedCity.availableDateRanges.startDate
                        }
                        onChange={(date) => {
                          setStartDate(date)
                          // Auto-update end date if start date is greater than end date
                          if (
                            timeFilters.timePeriod === "custom" &&
                            timeFilters.endDate &&
                            date > timeFilters.endDate
                          ) {
                            setEndDate(date)
                          }
                          setStartCalendarOpen(false)
                        }}
                        onClose={() => setStartCalendarOpen(false)}
                        position={startCalendarPosition}
                        isEndDateCalendar={false}
                      />
                    )}
                  </Box>
                </ClickAwayListener>
              </DateButtonContainer>
            </DateFieldContainer>

            {/* End Date */}
            <DateFieldContainer>
              <DateLabel>To:</DateLabel>
              <DateButtonContainer>
                <ClickAwayListener
                  onClickAway={() => setEndCalendarOpen(false)}
                >
                  <Box>
                    <DateButtonWrapper
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setEndCalendarPosition({
                          top: rect.top + 16, // Position above the button
                          left: isMobile ? 16 : rect.left,
                        })
                        setEndCalendarOpen(!endCalendarOpen)
                      }}
                    >
                      <DateButtonText>
                        {timeFilters.timePeriod === "custom" &&
                        timeFilters.endDate
                          ? formatDateDisplay(timeFilters.endDate)
                          : formatDateDisplay(
                              selectedCity.availableDateRanges.endDate,
                            )}
                      </DateButtonText>
                      <DateButtonIcon />
                    </DateButtonWrapper>
                    {endCalendarOpen && (
                      <CustomCalendar
                        value={
                          (timeFilters.timePeriod === "custom" &&
                            timeFilters.endDate) ||
                          selectedCity.availableDateRanges.endDate
                        }
                        onChange={(date) => {
                          setEndDate(date)
                          setEndCalendarOpen(false)
                        }}
                        onClose={() => setEndCalendarOpen(false)}
                        position={endCalendarPosition}
                        isEndDateCalendar={true}
                      />
                    )}
                  </Box>
                </ClickAwayListener>
              </DateButtonContainer>
            </DateFieldContainer>
          </DateRangeContainer>
        </CustomDateContainer>
      )}

      {/* Separator - hide during comparison mode */}
      {!isComparisonMode && <Separator />}

      {/* Day Filter - show for last-week-vs-this-week comparison, hide for weekdays-vs-weekends */}
      {(!isComparisonMode ||
        activeComparisonShortcut === "last-week-vs-this-week") && (
        <>
          {/* Separator above Day of Week when in comparison mode */}
          {isComparisonMode && <Separator />}
          <FilterSection>
            <FilterTitle>Day of Week</FilterTitle>
            <DayContainer>
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => {
                const dayValue = [
                  "Sun",
                  "Mon",
                  "Tue",
                  "Wed",
                  "Thu",
                  "Fri",
                  "Sat",
                ][index]
                const isSelected = localSelectedDays.includes(dayValue)

                // Determine if this day should be selectable based on date range
                const isSelectable = checkDaySelectable(
                  dayValue,
                  timePeriod as "last-week" | "last-month" | "custom",
                  timeFilters,
                  availableDays || [],
                )

                return (
                  <DayButton
                    key={`${day}-${index}`}
                    isSelected={isSelected}
                    isSelectable={isSelectable}
                    onClick={() => {
                      // Handle if only day is selected, do nothing
                      if (
                        localSelectedDays.length === 1 &&
                        localSelectedDays[0] === dayValue
                      ) {
                        return
                      }
                      if (isSelectable) {
                        if (
                          useCase === "realtime-monitoring" ||
                          useCase === "data-analytics"
                        ) {
                          setLocalSelectedDays([dayValue])
                          return
                        }
                        // Toggle day selection
                        const newDays = isSelected
                          ? localSelectedDays.filter((d) => d !== dayValue)
                          : [...localSelectedDays, dayValue]
                        setLocalSelectedDays(newDays)

                        // In comparison mode, also update comparison filters
                        if (
                          isComparisonMode &&
                          activeComparisonShortcut === "last-week-vs-this-week"
                        ) {
                          if (comparisonTimeFilters) {
                            setComparisonTimeFilters({
                              ...comparisonTimeFilters,
                              days: newDays,
                            })
                          }
                        }
                      }
                    }}
                  >
                    {day}
                  </DayButton>
                )
              })}
            </DayContainer>
          </FilterSection>
        </>
      )}

      {/* Separator before time range - always show */}
      <Separator />

      {/* Time Range Slider - always visible */}
      <FilterSection>
        <FilterTitle>Time Range</FilterTitle>
        <SliderContainer>
          <StyledSlider
            getAriaLabel={() => "Time range"}
            value={sliderValue}
            onChange={(_, newValue) => {
              const [start, end] = newValue as [number, number]
              const [validatedStart, validatedEnd] = validateSliderValue(
                start,
                end,
              )
              setSliderValue([validatedStart, validatedEnd])
              handleDebouncedSliderChange([validatedStart, validatedEnd])
            }}
            min={0}
            max={24}
            step={1}
            valueLabelDisplay="auto"
            valueLabelFormat={formatHour}
            getAriaValueText={formatHour}
            marks={sliderMarks}
          />
        </SliderContainer>
      </FilterSection>
    </>
  )
}

export default TimeFilters
