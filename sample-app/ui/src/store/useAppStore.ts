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

import type { FeatureCollection } from "geojson"
import { create } from "zustand"
import { combine } from "zustand/middleware"

import type {
  RouteAlert,
  RouteAlertWithPosition,
} from "../data/realtime/identify-high-delay-routes"
import {
  handleMapResetZoom,
  updateMapPosition,
} from "../deck-gl/map-navigation"
import { City } from "../types/city"
import { Usecase } from "../types/common"
import { CustomTimeFilters, LastWeekMonthFilters } from "../types/filters"
import { RouteSegment } from "../types/route-segment"
import type {
  AverageTravelTimeData,
  FetchedForInfo,
  HistoricalData,
  MapData,
  RealtimeData,
  RouteMetricsData,
} from "../types/store-data"
import { selectRoute } from "../usecases/realtime-monitoring/helper"
import { getAvailableDays } from "../utils/formatters"

export interface AppState {
  availableCities: Record<string, City>
  selectedCity: City
  selectedRouteSegment: RouteSegment | null
  usecase: Usecase

  timeFilters: LastWeekMonthFilters | CustomTimeFilters
  comparisonTimeFilters: LastWeekMonthFilters | CustomTimeFilters | null
  previousTimeFilters: LastWeekMonthFilters | CustomTimeFilters | null

  mode: "live" | "historical"
  isComparisonMode: boolean
  activeComparisonShortcut:
    | "weekdays-vs-weekends"
    | "last-week-vs-this-week"
    | null
  selectedRouteId: string | null
  isAutoplayPlaying: boolean

  mapMarker: google.maps.marker.AdvancedMarkerElement | null
  tooltip: {
    element: HTMLElement | null
    moveListener: google.maps.MapsEventListener | null
    originalMapState: {
      center: google.maps.LatLng | null
      zoom: number | null
    }
    isFirstPan: boolean
    currentLocation: string | null
    currentSegmentId: string | null
  }

  refs: {
    map: google.maps.Map | null
    leftMap: google.maps.Map | null
    rightMap: google.maps.Map | null
  }

  routeData: {
    tooltipCoordinates: [number, number] | null
    geoJsonData: FeatureCollection | null
  }

  timeReplayState: {
    currentHour: number
    hasStartedReplay: boolean
    showResetButton: boolean
    previousTimeFilters: LastWeekMonthFilters | CustomTimeFilters | null
    intervalId: ReturnType<typeof setInterval> | null
  }

  panels: {
    settingsPanel: boolean
    leftPanel: boolean
    rightPanel: boolean
    previousLeftPanelState: boolean
  }

  previousPanelStates: {
    settingsPanel: boolean
    leftPanel: boolean
    rightPanel: boolean
  } | null

  queries: {
    allHistoricalData: {
      status: "pending" | "loading" | "success" | "error"
      data: HistoricalData | null
      error: Error | null
    }
    realtimeData: {
      status: "pending" | "loading" | "success" | "error"
      data: RealtimeData | null
      error: Error | null
      fetchedFor?: {
        cityId: string
      }
    }
    filteredHistoricalData: {
      status: "pending" | "loading" | "success" | "error"
      data: HistoricalData | null
      error: Error | null
    }
    historicalRouteSegments: {
      status: "pending" | "loading" | "success" | "error"
      data: FeatureCollection | null
      error: Error | null
    }
    rawHistoricalData: {
      status: "pending" | "loading" | "success" | "error"
      data: FeatureCollection | null
      error: Error | null
      fetchedFor?: FetchedForInfo
    }
    averageTravelTime: {
      main: {
        status: "pending" | "loading" | "success" | "error"
        data: AverageTravelTimeData | null
        error: Error | null
      }
      comparison: {
        status: "pending" | "loading" | "success" | "error"
        data: AverageTravelTimeData | null
        error: Error | null
      }
    }
    routeMetrics: {
      main: {
        status: "pending" | "loading" | "success" | "error"
        data: RouteMetricsData | null
        error: Error | null
      }
      comparison: {
        status: "pending" | "loading" | "success" | "error"
        data: RouteMetricsData | null
        error: Error | null
      }
    }
  }

  comparisonMapData: MapData | null
  isComparisonApplied: boolean
  alerts: RouteAlert[] | RouteAlertWithPosition[] | null
  mapData: MapData | null
  shouldUseGreyRoutes: boolean

  routeMetrics: {
    main: RouteMetricsData | null
    comparison: RouteMetricsData | null
  }
  averageTravelTime: {
    main: AverageTravelTimeData | null
    comparison: AverageTravelTimeData | null
  }
}

interface AppActions {
  loadCities: (cities: Record<string, City>) => void
  setUsecase: (usecase: Usecase) => void
  setSelectedRouteSegment: (route: RouteSegment | null) => void
  setSelectedTimePeriod: (
    timePeriod: "last-week" | "last-month" | "custom" | "last-to-last-week",
  ) => void
  setStartDate: (date: Date) => void
  setEndDate: (date: Date) => void
  setSelectedHourRange: (hourRange: [number, number]) => void
  setSelectedDays: (days: string[]) => void
  toggleDay: (day: string) => void

  setComparisonMode: (isComparisonMode: boolean) => void
  applyComparisonShortcut: (
    shortcut: "weekdays-vs-weekends" | "last-week-vs-this-week",
  ) => void
  applyComparison: () => void
  clearComparisonMode: () => void

  setComparisonTimeFilters: (
    filters: LastWeekMonthFilters | CustomTimeFilters | null,
  ) => void

  selectCity: (cityId: string) => void
  updateCityZoom: (cityId: string, zoom: number, usecase?: Usecase) => void
  setTooltip: (
    field: keyof AppState["tooltip"],
    value:
      | HTMLElement
      | google.maps.MapsEventListener
      | google.maps.LatLng
      | number
      | boolean
      | string
      | null,
  ) => void
  resetTooltip: () => void
  setSelectedRouteId: (routeId: string) => void
  setIsAutoplayPlaying: (isPlaying: boolean) => void

  switchMode: (mode: string) => void
  setRef: <T extends keyof AppState["refs"]>(
    name: T,
    ref: AppState["refs"][T],
  ) => void
  getRef: <T extends keyof AppState["refs"]>(name: T) => AppState["refs"][T]

  setComparisonMapData: (data: MapData) => void
  setComparisonApplied: (applied: boolean) => void

  setRouteData: (
    tooltipCoordinates: [number, number] | null,
    geoJsonData: FeatureCollection | null,
  ) => void

  setMapMarker: (
    marker: google.maps.marker.AdvancedMarkerElement | null,
  ) => void

  expandPanel: (panelName: "settingsPanel" | "leftPanel" | "rightPanel") => void
  collapsePanel: (
    panelName: "settingsPanel" | "leftPanel" | "rightPanel",
  ) => void

  setMapViewControllerExpanded: (isExpanded: boolean) => void
  setFloatingPanelExpanded: (isExpanded: boolean) => void
  setPreviousFloatingPanelExpanded: (isExpanded: boolean) => void

  setAlerts: (alerts: RouteAlert[] | RouteAlertWithPosition[]) => void
  setQueryState: (
    queryKey: keyof AppState["queries"],
    status: "pending" | "loading" | "success" | "error",
    data?:
      | HistoricalData
      | RealtimeData
      | FeatureCollection
      | RouteSegment[]
      | AverageTravelTimeData
      | RouteMetricsData
      | FeatureCollection,
    error?: Error,
    layout?: "main" | "comparison",
    fetchedFor?: FetchedForInfo,
  ) => void

  setMapData: (data: MapData) => void
  setShouldUseGreyRoutes: (shouldUse: boolean) => void

  setTimeReplayState: (state: Partial<AppState["timeReplayState"]>) => void
  resetTimeReplayState: () => void

  setRouteMetrics: (
    layout: "main" | "comparison",
    data: RouteMetricsData,
  ) => void
  setAverageTravelTime: (
    layout: "main" | "comparison",
    data: AverageTravelTimeData,
  ) => void
}

const FALLBACK_CITY: City = {
  id: "fallback",
  name: "Loading...",
  coords: { lat: 0, lng: 0 },
  availableDateRanges: {
    startDate: new Date(),
    endDate: new Date(),
  },
  liveDataDate: new Date(),
  zoom: 12,
  useCases: ["realtime-monitoring"],
  timezone: "UTC",
}

const getDefaultUsecase = (cities: Record<string, City>): Usecase => {
  const usecasePriority: Usecase[] = [
    "realtime-monitoring",
    "data-analytics",
    "route-reliability",
  ]

  for (const usecase of usecasePriority) {
    const hasCity = (Object.keys(cities) as Array<keyof typeof cities>)
      .map((key) => cities[key])
      .some((city) => city.useCases && city.useCases.indexOf(usecase) !== -1)
    if (hasCity) {
      return usecase
    }
  }

  return "realtime-monitoring"
}

const getFirstValidDay = (
  city: City | undefined,
  timePeriod: string,
): string[] => {
  if (!city || city.id === "fallback") {
    return ["Mon"]
  }

  if (timePeriod === "last-week" || timePeriod === "last-month") {
    return ["Mon"]
  }

  if (timePeriod === "custom") {
    const availableDays = getAvailableDays(
      city.availableDateRanges.startDate,
      city.availableDateRanges.endDate,
    )
    return availableDays.length > 0 ? [availableDays[0]] : ["Mon"]
  }

  return ["Mon"]
}
export const useAppStore = create(
  combine(
    {
      demoMode: false,
      alerts: null,
      availableCities: { fallback: FALLBACK_CITY },
      usecase: "realtime-monitoring" as Usecase,
      selectedCity: FALLBACK_CITY,
      selectedRouteSegment: null,
      selectedRouteId: null,
      isAutoplayPlaying: false,
      timeFilters: {
        startDate: new Date(),
        endDate: new Date(),
        timePeriod: "last-week",
        hourRange: [9, 17],
        days: ["Mon"],
      },
      comparisonTimeFilters: null,
      previousTimeFilters: null,
      isComparisonMode: false,
      isComparisonApplied: false,
      activeComparisonShortcut: null,

      queries: {
        allHistoricalData: {
          status: "pending",
          data: null,
          error: null,
        },
        realtimeData: {
          status: "pending",
          data: null,
          error: null,
        },
        filteredHistoricalData: {
          status: "pending",
          data: null,
          error: null,
        },
        historicalRouteSegments: {
          status: "pending",
          data: null,
          error: null,
        },
        rawHistoricalData: {
          status: "pending",
          data: null,
          error: null,
        },
        averageTravelTime: {
          main: {
            status: "pending",
            data: null,
            error: null,
          },
          comparison: {
            status: "pending",
            data: null,
            error: null,
          },
        },
        routeMetrics: {
          main: {
            status: "pending",
            data: null,
            error: null,
          },
          comparison: {
            status: "pending",
            data: null,
            error: null,
          },
        },
      },

      mode: "live",
      realtimeRoadSegments: null,
      refs: {
        map: null,
        leftMap: null,
        rightMap: null,
      },
      comparisonMapData: null,
      routeData: {
        tooltipCoordinates: null,
        geoJsonData: null,
      },
      timeReplayState: {
        currentHour: 0,
        hasStartedReplay: false,
        showResetButton: false,
        previousTimeFilters: null,
        intervalId: null,
      },
      tooltip: {
        element: null,
        moveListener: null,
        originalMapState: { center: null, zoom: null },
        isFirstPan: false,
        currentLocation: null,
        currentSegmentId: null,
      },
      panels: {
        settingsPanel: true,
        leftPanel: true,
        rightPanel: true,
        previousLeftPanelState: true,
      },
      previousPanelStates: null,
      mapMarker: null,
      mapData: null,
      shouldUseGreyRoutes: false,

      routeMetrics: {
        main: null,
        comparison: null,
      },
      averageTravelTime: {
        main: null,
        comparison: null,
      },
    } as AppState,
    (set, get) =>
      ({
        loadCities: (cities: Record<string, City>) => {
          const currentState = get()

          set({ availableCities: cities })

          if (currentState.selectedCity.id === "fallback") {
            const firstCityId = Object.keys(cities)[0]
            const firstCity = cities[firstCityId]

            if (firstCity && firstCity.id !== "fallback") {
              const defaultUsecase = getDefaultUsecase(cities)

              set({
                usecase: defaultUsecase,
                selectedCity: firstCity,
                timeFilters: {
                  startDate: firstCity.availableDateRanges.startDate,
                  endDate: firstCity.availableDateRanges.endDate,
                  timePeriod:
                    defaultUsecase === "data-analytics"
                      ? "custom"
                      : "last-week",
                  hourRange:
                    defaultUsecase === "data-analytics" ? [17, 19] : [9, 17],
                  days: getFirstValidDay(
                    firstCity,
                    defaultUsecase === "data-analytics"
                      ? "custom"
                      : "last-week",
                  ),
                } as CustomTimeFilters,
              })

              const map = currentState.refs.map
              if (map && firstCity) {
                updateMapPosition(
                  map,
                  firstCity.coords,
                  firstCity.customZoom?.[defaultUsecase] || firstCity.zoom,
                )
              }
            }
          }
        },
        setUsecase: (usecase: Usecase) => {
          const currentState = get()

          // Show grey routes when switching use cases in historical mode
          if (
            currentState.mode === "historical" &&
            currentState.usecase !== usecase
          ) {
            set({ shouldUseGreyRoutes: true })
          }

          const availableCitiesForUsecase = Object.keys(
            currentState.availableCities,
          )
            .map(
              (key) =>
                [key, currentState.availableCities[key]] as [string, City],
            )
            .filter(
              ([, city]) =>
                city.useCases && city.useCases.indexOf(usecase) !== -1,
            )

          if (availableCitiesForUsecase.length === 0) {
            console.warn(`No cities available for usecase: ${usecase}`)
            return
          }

          const currentTimeReplayState = get().timeReplayState
          if (currentTimeReplayState.previousTimeFilters) {
            set({
              timeFilters: {
                ...get().timeFilters,
                hourRange: currentTimeReplayState.previousTimeFilters.hourRange,
              },
            })
          }

          if (currentTimeReplayState.intervalId !== null) {
            clearInterval(currentTimeReplayState.intervalId)
          }

          const newState = {
            usecase,
            selectedRouteId: null,
            selectedRouteSegment: null,
            isAutoplayPlaying: false,
            mapData: null,
            isComparisonMode: false,
            activeComparisonShortcut: null,
            timeReplayState: {
              currentHour: 0,
              hasStartedReplay: false,
              showResetButton: false,
              previousTimeFilters: null,
              intervalId: null,
            },
            routeMetrics: {
              main: null,
              comparison: null,
            },
            averageTravelTime: {
              main: null,
              comparison: null,
            },
          }

          const getCityForUsecase = (targetUsecase: Usecase) => {
            const availableCities = get().availableCities
            const cityEntries = Object.keys(availableCities).map(
              (key) => [key, availableCities[key]] as [string, City],
            )
            const cityEntry = cityEntries.filter(
              ([, city]) =>
                city.useCases && city.useCases.indexOf(targetUsecase) !== -1,
            )[0]
            return cityEntry ? availableCities[cityEntry[0]] : null
          }

          let currentCity = get().selectedCity
          if (usecase === "data-analytics") {
            const cityToSelect = getCityForUsecase("data-analytics")
            if (cityToSelect) {
              currentCity = cityToSelect
              const currentPanels = get().panels

              set({
                ...newState,
                selectedCity: cityToSelect,
                mode: "historical",
                panels: {
                  ...currentPanels,
                  settingsPanel: false,
                  leftPanel: true,
                  previousLeftPanelState: currentPanels.leftPanel,
                },
                timeFilters: {
                  startDate: cityToSelect.availableDateRanges.startDate,
                  endDate: cityToSelect.availableDateRanges.endDate,
                  timePeriod: "custom",
                  hourRange: [17, 19],
                  days: getFirstValidDay(cityToSelect, "custom"),
                } as CustomTimeFilters,
              })
            }
          } else if (usecase === "realtime-monitoring") {
            const cityToSelect = getCityForUsecase("realtime-monitoring")
            set({ mode: "live" })
            if (cityToSelect) {
              currentCity =
                get().selectedCity.useCases &&
                get().selectedCity.useCases.indexOf("realtime-monitoring") !==
                  -1
                  ? get().selectedCity
                  : cityToSelect

              const currentPanels = get().panels
              set({
                ...newState,
                selectedCity: currentCity,
                panels: {
                  ...currentPanels,
                  settingsPanel: false,
                  leftPanel: true,
                  previousLeftPanelState: currentPanels.leftPanel,
                },
                timeFilters: {
                  startDate: currentCity.availableDateRanges.startDate,
                  endDate: currentCity.availableDateRanges.endDate,
                  timePeriod: "last-week",
                  hourRange: [9, 17],
                  days: getFirstValidDay(currentCity, "last-week"),
                } as LastWeekMonthFilters,
              })
            }
          } else if (usecase === "route-reliability") {
            const cityToSelect = getCityForUsecase("route-reliability")
            if (cityToSelect) {
              const currentPanels = get().panels
              currentCity = cityToSelect
              set({
                ...newState,
                selectedCity: cityToSelect,
                mode: "historical",
                panels: {
                  ...currentPanels,
                  settingsPanel: false,
                  leftPanel: true,
                  previousLeftPanelState: currentPanels.leftPanel,
                },
                timeFilters: {
                  timePeriod: "custom",
                  days: ["Tue"],
                  startDate: cityToSelect.availableDateRanges.startDate,
                  endDate: cityToSelect.availableDateRanges.endDate,
                  hourRange: [7, 22],
                },
              })
            }
          }
          const map = get().refs.map

          if (map && currentCity) {
            updateMapPosition(
              map,
              currentCity.coords,
              currentCity.customZoom?.[usecase] || currentCity.zoom,
            )
          }
        },
        setAlerts: (alerts: RouteAlert[] | RouteAlertWithPosition[]) =>
          set({ alerts: alerts }),

        setRef: (name, ref) => set({ refs: { ...get().refs, [name]: ref } }),
        getRef: (name) => get().refs[name],

        setRouteData: (tooltipCoordinates, geoJsonData) =>
          set({ routeData: { tooltipCoordinates, geoJsonData } }),

        selectCity: (cityId: string) => {
          const currentState = get()
          const newCity = currentState.availableCities[cityId]

          if (!newCity || newCity.id === "fallback") {
            console.warn(
              `City ${cityId} not found or is fallback, skipping selection`,
            )
            return
          }

          const timeReplayState = get().timeReplayState
          if (timeReplayState.previousTimeFilters) {
            set({
              timeFilters: {
                ...get().timeFilters,
                hourRange: timeReplayState.previousTimeFilters.hourRange,
              },
            })
          }

          if (timeReplayState.intervalId !== null) {
            clearInterval(timeReplayState.intervalId)
          }

          set({
            selectedCity: newCity,
          })
          set({ selectedRouteId: null })
          set({ selectedRouteSegment: null })
          set({ isAutoplayPlaying: false })

          set({
            timeReplayState: {
              currentHour: 0,
              hasStartedReplay: false,
              showResetButton: false,
              previousTimeFilters: null,
              intervalId: null,
            },
          })

          set({
            routeMetrics: {
              main: null,
              comparison: null,
            },
            averageTravelTime: {
              main: null,
              comparison: null,
            },
          })

          const map = get().refs.map
          if (map) {
            updateMapPosition(
              map,
              newCity.coords,
              newCity.customZoom?.[get().usecase] || newCity.zoom,
            )
          }

          const leftMap = get().refs.leftMap
          const rightMap = get().refs.rightMap
          if (leftMap) {
            updateMapPosition(
              leftMap,
              newCity.coords,
              newCity.customZoom?.[get().usecase] || newCity.zoom,
            )
          }
          if (rightMap) {
            updateMapPosition(
              rightMap,
              newCity.coords,
              newCity.customZoom?.[get().usecase] || newCity.zoom,
            )
          }

          const currentTimeFilters = get().timeFilters
          const activeComparisonShortcut = get().activeComparisonShortcut
          const isComparisonMode = get().isComparisonMode

          if (currentTimeFilters.timePeriod === "custom") {
            const validDays = getFirstValidDay(newCity, "custom")
            set({
              timeFilters: {
                ...currentTimeFilters,
                startDate: newCity.availableDateRanges.startDate,
                endDate: newCity.availableDateRanges.endDate,
                days:
                  currentTimeFilters.days && currentTimeFilters.days.length > 0
                    ? currentTimeFilters.days
                    : validDays,
              } as CustomTimeFilters,
            })
          } else {
            const validDays = getFirstValidDay(
              newCity,
              currentTimeFilters.timePeriod,
            )
            set({
              timeFilters: {
                ...currentTimeFilters,
                startDate: newCity.availableDateRanges.startDate,
                endDate: newCity.availableDateRanges.endDate,
                hourRange: currentTimeFilters.hourRange,
                days:
                  currentTimeFilters.days && currentTimeFilters.days.length > 0
                    ? currentTimeFilters.days
                    : validDays,
              } as LastWeekMonthFilters,
            })
          }

          if (isComparisonMode && activeComparisonShortcut) {
            const comparisonFilters = get().comparisonTimeFilters

            if (activeComparisonShortcut === "weekdays-vs-weekends") {
              set({
                timeFilters: {
                  timePeriod: "custom",
                  startDate: newCity.availableDateRanges.startDate,
                  endDate: newCity.availableDateRanges.endDate,
                  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
                  hourRange: [9, 17],
                } as CustomTimeFilters,
              })
              set({
                comparisonTimeFilters: {
                  timePeriod: "custom",
                  startDate: newCity.availableDateRanges.startDate,
                  endDate: newCity.availableDateRanges.endDate,
                  days: ["Sat", "Sun"],
                  hourRange: [9, 17],
                } as CustomTimeFilters,
              })
            } else if (activeComparisonShortcut === "last-week-vs-this-week") {
              const endDate = new Date(
                newCity.availableDateRanges.endDate.getTime(),
              )

              const leftStartDate = new Date(endDate.getTime())
              leftStartDate.setDate(leftStartDate.getDate() - 14)
              const leftEndDate = new Date(endDate.getTime())
              leftEndDate.setDate(leftEndDate.getDate() - 7)

              const rightStartDate = new Date(endDate.getTime())
              rightStartDate.setDate(rightStartDate.getDate() - 7)

              set({
                timeFilters: {
                  timePeriod: "custom",
                  startDate: leftStartDate,
                  endDate: leftEndDate,
                  days: comparisonFilters?.days || currentTimeFilters.days,
                  hourRange: [9, 17],
                } as CustomTimeFilters,
              })
              set({
                comparisonTimeFilters: {
                  timePeriod: "custom",
                  startDate: rightStartDate,
                  endDate: endDate,
                  days: comparisonFilters?.days || currentTimeFilters.days,
                  hourRange: [9, 17],
                } as CustomTimeFilters,
              })
            }
          }
        },

        updateCityZoom: (cityId: string, zoom: number, usecase?: Usecase) => {
          const currentState = get()

          if (currentState.selectedCity.id !== cityId) {
            console.warn(
              `City ${cityId} is not the selected city, skipping zoom update`,
            )
            return
          }

          const selectedCity = currentState.selectedCity

          if (!selectedCity || selectedCity.id === "fallback") {
            console.warn(`Selected city not found, cannot update zoom`)
            return
          }

          const updatedCity = { ...selectedCity }

          if (usecase) {
            updatedCity.customZoom = {
              ...selectedCity.customZoom,
              [usecase]: zoom,
            }
          } else {
            updatedCity.zoom = zoom
          }

          set({ selectedCity: updatedCity })

          const map = currentState.refs.map
          if (map) {
            updateMapPosition(map, updatedCity.coords, zoom)
          }
        },

        setSelectedRouteId: (routeId: string) => {
          const state = get()

          if (state.selectedRouteId === routeId) {
            return
          }

          if (!routeId) {
            set({ selectedRouteSegment: null })
            set({ selectedRouteId: "" })

            if (state.refs.map) {
              handleMapResetZoom(null, null, null)
            }
            return
          } else {
            if (state.usecase === "route-reliability") {
              handleMapResetZoom(
                routeId,
                state.routeData.tooltipCoordinates,
                state.routeData.geoJsonData,
              )
            }
            selectRoute({
              routeId: routeId,
              setSelectedRouteSegment: (route: RouteSegment | null) =>
                set({ selectedRouteSegment: route }),
              mode: state.mode,
              data:
                state.mode === "historical"
                  ? state.queries.filteredHistoricalData.data ||
                    ({
                      data: {} as unknown,
                      routeColors: (() => {
                        try {
                          return new Map()
                        } catch {
                          return {} as Record<
                            string,
                            { color: string; delayRatio: number }
                          >
                        }
                      })(),
                      stats: {
                        routeDelays: [],
                        congestionLevel: 0,
                        averageStats: {
                          congestionLevel: 0,
                          peakCongestionHourRange: "",
                          bestTimeRange: "",
                          averageDuration: 0,
                          averageStaticDuration: 0,
                        },
                      },
                    } as HistoricalData)
                  : state.queries.realtimeData.data?.roadSegments || [],
            })
            set({ selectedRouteId: routeId })
          }
        },

        setIsAutoplayPlaying: (isPlaying: boolean) => {
          set({ isAutoplayPlaying: isPlaying })
        },

        setSelectedRouteSegment: (route: RouteSegment | null) => {
          set({ selectedRouteSegment: route })
        },
        setSelectedHourRange: (hourRange: [number, number]) => {
          set({ timeFilters: { ...get().timeFilters, hourRange } })

          if (get().isComparisonMode) {
            const comparisonTimeFilters = get().comparisonTimeFilters
            if (comparisonTimeFilters) {
              set({
                comparisonTimeFilters: { ...comparisonTimeFilters, hourRange },
              })
            }
          }
        },
        setSelectedDays: (days: string[]) => {
          const timeReplayState = get().timeReplayState
          if (
            timeReplayState.hasStartedReplay &&
            get().isAutoplayPlaying &&
            timeReplayState.previousTimeFilters
          ) {
            const daysChanged =
              JSON.stringify(days || []) !==
              JSON.stringify(get().timeFilters.days)

            if (daysChanged) {
              set({ isAutoplayPlaying: false })
              set({
                timeFilters: {
                  ...get().timeFilters,
                  hourRange: timeReplayState.previousTimeFilters.hourRange,
                  days: days || [],
                },
              })
              if (timeReplayState.intervalId !== null) {
                clearInterval(timeReplayState.intervalId)
              }
              set({
                timeReplayState: {
                  currentHour: 0,
                  hasStartedReplay: false,
                  showResetButton: false,
                  previousTimeFilters: null,
                  intervalId: null,
                },
              })

              if (get().isComparisonMode) {
                const comparisonTimeFilters = get().comparisonTimeFilters
                if (comparisonTimeFilters) {
                  if (
                    get().activeComparisonShortcut === "last-week-vs-this-week"
                  ) {
                    set({
                      comparisonTimeFilters: {
                        ...comparisonTimeFilters,
                        days: days || [],
                      },
                    })
                  }
                }
              }

              return
            }
          }

          set({ timeFilters: { ...get().timeFilters, days: days || [] } })

          if (get().isComparisonMode) {
            const comparisonTimeFilters = get().comparisonTimeFilters
            if (comparisonTimeFilters) {
              if (get().activeComparisonShortcut === "last-week-vs-this-week") {
                set({
                  comparisonTimeFilters: {
                    ...comparisonTimeFilters,
                    days: days || [],
                  },
                })
              }
            }
          }
        },
        toggleDay: (day: string) => {
          const currentDays = get().timeFilters.days
          const newDays =
            currentDays.indexOf(day) !== -1
              ? currentDays.filter((d) => d !== day)
              : [...currentDays, day]

          const timeReplayState = get().timeReplayState
          if (
            timeReplayState.hasStartedReplay &&
            get().isAutoplayPlaying &&
            timeReplayState.previousTimeFilters
          ) {
            set({ isAutoplayPlaying: false })
            set({
              timeFilters: {
                ...get().timeFilters,
                hourRange: timeReplayState.previousTimeFilters.hourRange,
              },
            })
            if (timeReplayState.intervalId !== null) {
              clearInterval(timeReplayState.intervalId)
            }
            set({
              timeReplayState: {
                currentHour: 0,
                hasStartedReplay: false,
                showResetButton: false,
                previousTimeFilters: null,
                intervalId: null,
              },
            })
          }

          set({ timeFilters: { ...get().timeFilters, days: newDays } })

          if (get().isComparisonMode) {
            const comparisonTimeFilters = get().comparisonTimeFilters
            if (comparisonTimeFilters) {
              if (get().activeComparisonShortcut === "last-week-vs-this-week") {
                set({
                  comparisonTimeFilters: {
                    ...comparisonTimeFilters,
                    days: newDays,
                  },
                })
              }
            }
          }
        },

        setSelectedTimePeriod: (
          timePeriod:
            | "last-week"
            | "last-month"
            | "custom"
            | "last-to-last-week",
        ) => {
          const timeReplayState = get().timeReplayState
          if (
            timeReplayState.hasStartedReplay &&
            get().isAutoplayPlaying &&
            timeReplayState.previousTimeFilters
          ) {
            const timePeriodChanged =
              timePeriod !== get().timeFilters.timePeriod

            if (timePeriodChanged) {
              set({ isAutoplayPlaying: false })
              set({
                timeFilters: {
                  ...get().timeFilters,
                  hourRange: timeReplayState.previousTimeFilters.hourRange,
                },
              })
              if (timeReplayState.intervalId !== null) {
                clearInterval(timeReplayState.intervalId)
              }
              set({
                timeReplayState: {
                  currentHour: 0,
                  hasStartedReplay: false,
                  showResetButton: false,
                  previousTimeFilters: null,
                  intervalId: null,
                },
              })
            }
          }

          const currentFilters = get().timeFilters
          if (timePeriod === "custom") {
            const startDate =
              "startDate" in currentFilters
                ? currentFilters.startDate
                : get().selectedCity.availableDateRanges.startDate
            const endDate =
              "endDate" in currentFilters
                ? currentFilters.endDate
                : get().selectedCity.availableDateRanges.endDate
            set({
              timeFilters: {
                ...currentFilters,
                timePeriod,
                startDate,
                endDate,
              } as CustomTimeFilters,
            })
          } else {
            set({
              timeFilters: {
                ...currentFilters,
                timePeriod,
              } as LastWeekMonthFilters,
            })
          }

          if (get().isComparisonMode) {
            const comparisonTimeFilters = get().comparisonTimeFilters
            if (comparisonTimeFilters) {
              if (timePeriod === "custom") {
                const currentComparisonFilters = comparisonTimeFilters
                const startDate =
                  "startDate" in currentComparisonFilters
                    ? currentComparisonFilters.startDate
                    : get().selectedCity.availableDateRanges.startDate
                const endDate =
                  "endDate" in currentComparisonFilters
                    ? currentComparisonFilters.endDate
                    : get().selectedCity.availableDateRanges.endDate

                if (get().activeComparisonShortcut === "weekdays-vs-weekends") {
                  set({
                    comparisonTimeFilters: {
                      ...currentComparisonFilters,
                      timePeriod,
                      startDate,
                      endDate,
                    } as CustomTimeFilters,
                  })
                } else {
                  set({
                    comparisonTimeFilters: {
                      ...currentComparisonFilters,
                      timePeriod,
                      startDate,
                      endDate,
                    } as CustomTimeFilters,
                  })
                }
              } else {
                if (get().activeComparisonShortcut === "weekdays-vs-weekends") {
                  set({
                    comparisonTimeFilters: {
                      ...comparisonTimeFilters,
                      timePeriod,
                    } as LastWeekMonthFilters,
                  })
                } else {
                  set({
                    comparisonTimeFilters: {
                      ...comparisonTimeFilters,
                      timePeriod,
                    } as LastWeekMonthFilters,
                  })
                }
              }
            }
          }
        },
        setStartDate: (date: Date) => {
          const timeReplayState = get().timeReplayState
          if (
            timeReplayState.hasStartedReplay &&
            get().isAutoplayPlaying &&
            timeReplayState.previousTimeFilters
          ) {
            set({ isAutoplayPlaying: false })
            set({
              timeFilters: {
                ...get().timeFilters,
                hourRange: timeReplayState.previousTimeFilters.hourRange,
              },
            })
            if (timeReplayState.intervalId !== null) {
              clearInterval(timeReplayState.intervalId)
            }
            set({
              timeReplayState: {
                currentHour: 0,
                hasStartedReplay: false,
                showResetButton: false,
                previousTimeFilters: null,
                intervalId: null,
              },
            })
          }

          const currentFilters = get().timeFilters
          if (currentFilters.timePeriod === "custom") {
            const currentDays = currentFilters.days || []

            let updatedDays = currentDays
            if ("endDate" in currentFilters && currentFilters.endDate) {
              if (date <= currentFilters.endDate) {
                const availableDays = getAvailableDays(
                  date,
                  currentFilters.endDate,
                )
                const validSelectedDays = currentDays.filter(
                  (day) => availableDays.indexOf(day) !== -1,
                )

                if (
                  validSelectedDays.length === 0 &&
                  availableDays.length > 0
                ) {
                  updatedDays = [availableDays[0]]
                } else if (validSelectedDays.length !== currentDays.length) {
                  updatedDays =
                    validSelectedDays.length > 0
                      ? validSelectedDays
                      : [availableDays[0]]
                }
              }
            }

            set({
              timeFilters: {
                ...currentFilters,
                startDate: date,
                days: updatedDays,
              } as CustomTimeFilters,
            })

            if (
              get().isComparisonMode &&
              get().activeComparisonShortcut === "last-week-vs-this-week"
            ) {
              const comparisonTimeFilters = get().comparisonTimeFilters
              if (
                comparisonTimeFilters &&
                "startDate" in comparisonTimeFilters
              ) {
                set({
                  comparisonTimeFilters: {
                    ...comparisonTimeFilters,
                    startDate: date,
                    days: updatedDays,
                  } as CustomTimeFilters,
                })
              }
            }
          }
        },
        setEndDate: (date: Date) => {
          const timeReplayState = get().timeReplayState
          if (
            timeReplayState.hasStartedReplay &&
            get().isAutoplayPlaying &&
            timeReplayState.previousTimeFilters
          ) {
            set({ isAutoplayPlaying: false })
            set({
              timeFilters: {
                ...get().timeFilters,
                hourRange: timeReplayState.previousTimeFilters.hourRange,
              },
            })
            if (timeReplayState.intervalId !== null) {
              clearInterval(timeReplayState.intervalId)
            }
            set({
              timeReplayState: {
                currentHour: 0,
                hasStartedReplay: false,
                showResetButton: false,
                previousTimeFilters: null,
                intervalId: null,
              },
            })
          }

          const currentFilters = get().timeFilters
          if (currentFilters.timePeriod === "custom") {
            const currentDays = currentFilters.days || []

            let updatedDays = currentDays
            if ("startDate" in currentFilters && currentFilters.startDate) {
              if (currentFilters.startDate <= date) {
                const availableDays = getAvailableDays(
                  currentFilters.startDate,
                  date,
                )
                const validSelectedDays = currentDays.filter(
                  (day) => availableDays.indexOf(day) !== -1,
                )

                if (
                  validSelectedDays.length === 0 &&
                  availableDays.length > 0
                ) {
                  updatedDays = [availableDays[0]]
                } else if (validSelectedDays.length !== currentDays.length) {
                  updatedDays =
                    validSelectedDays.length > 0
                      ? validSelectedDays
                      : [availableDays[0]]
                }
              }
            }

            set({
              timeFilters: {
                ...currentFilters,
                endDate: date,
                days: updatedDays,
              } as CustomTimeFilters,
            })

            if (
              get().isComparisonMode &&
              get().activeComparisonShortcut === "last-week-vs-this-week"
            ) {
              const comparisonTimeFilters = get().comparisonTimeFilters
              if (comparisonTimeFilters && "endDate" in comparisonTimeFilters) {
                set({
                  comparisonTimeFilters: {
                    ...comparisonTimeFilters,
                    endDate: date,
                    days: updatedDays,
                  } as CustomTimeFilters,
                })
              }
            }
          }
        },

        setComparisonMode: (isComparisonMode: boolean) => {
          const timeReplayState = get().timeReplayState
          if (timeReplayState.previousTimeFilters) {
            set({
              timeFilters: {
                ...get().timeFilters,
                hourRange: timeReplayState.previousTimeFilters.hourRange,
              },
            })
          }

          if (get().isAutoplayPlaying) {
            set({ isAutoplayPlaying: false })
          }

          if (timeReplayState.intervalId !== null) {
            clearInterval(timeReplayState.intervalId)
          }

          set({
            timeReplayState: {
              currentHour: 0,
              hasStartedReplay: false,
              showResetButton: false,
              previousTimeFilters: null,
              intervalId: null,
            },
          })

          set({ isComparisonMode })
          if (isComparisonMode) {
            set({
              selectedRouteId: null,
              selectedRouteSegment: null,
            })
            set({
              panels: {
                ...get().panels,
                settingsPanel: false,
                rightPanel: false,
                leftPanel: false,
              },
            })
          } else {
            set({ isComparisonApplied: false, comparisonTimeFilters: null })
          }
        },
        applyComparisonShortcut: (
          shortcut: "weekdays-vs-weekends" | "last-week-vs-this-week",
        ) => {
          const selectedCity = get().selectedCity
          const currentTimeFilters = get().timeFilters
          const isAlreadyInComparisonMode = get().isComparisonMode
          const timeReplayState = get().timeReplayState
          set({ mapData: null })
          set({ comparisonMapData: null })

          if (!isAlreadyInComparisonMode) {
            set({
              timeReplayState: {
                ...timeReplayState,
                previousTimeFilters: {
                  ...currentTimeFilters,
                  hourRange: [9, 17],
                },
              },
            })

            set({
              previousTimeFilters: {
                ...currentTimeFilters,
                hourRange: [9, 17],
              },
              previousPanelStates: {
                settingsPanel: get().panels.settingsPanel,
                leftPanel: get().panels.leftPanel,
                rightPanel: get().panels.rightPanel,
              },
            })
          }

          if (shortcut === "weekdays-vs-weekends") {
            set({
              timeFilters: {
                timePeriod: "custom",
                startDate: selectedCity.availableDateRanges.startDate,
                endDate: selectedCity.availableDateRanges.endDate,
                days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
                hourRange: [9, 17],
              } as CustomTimeFilters,
            })
            set({
              comparisonTimeFilters: {
                timePeriod: "custom",
                startDate: selectedCity.availableDateRanges.startDate,
                endDate: selectedCity.availableDateRanges.endDate,
                days: ["Sat", "Sun"],
                hourRange: [9, 17],
              } as CustomTimeFilters,
            })
          } else if (shortcut === "last-week-vs-this-week") {
            const endDate = new Date(
              selectedCity.availableDateRanges.endDate.getTime(),
            )

            const leftStartDate = new Date(endDate.getTime())
            leftStartDate.setDate(leftStartDate.getDate() - 14)
            const leftEndDate = new Date(endDate.getTime())
            leftEndDate.setDate(leftEndDate.getDate() - 7)

            const rightStartDate = new Date(endDate.getTime())
            rightStartDate.setDate(rightStartDate.getDate() - 7)

            set({
              timeFilters: {
                timePeriod: "custom",
                startDate: leftStartDate,
                endDate: leftEndDate,
                days: ["Tue", "Wed", "Thu"],
                hourRange: [9, 17],
              } as CustomTimeFilters,
            })
            set({
              comparisonTimeFilters: {
                timePeriod: "custom",
                startDate: rightStartDate,
                endDate: endDate,
                days: ["Tue", "Wed", "Thu"],
                hourRange: [9, 17],
              } as CustomTimeFilters,
            })
          }

          const currentPanels = get().panels

          const panelsToSet = isAlreadyInComparisonMode
            ? currentPanels
            : {
                ...currentPanels,
                settingsPanel: false,
                rightPanel: false,
                leftPanel: false,
                previousLeftPanelState: currentPanels.leftPanel,
              }

          set({
            isComparisonMode: true,
            activeComparisonShortcut: shortcut,
            isComparisonApplied: true,
            selectedRouteId: null,
            selectedRouteSegment: null,
            panels: panelsToSet,
          })
        },
        applyComparison: () => {
          set({ isComparisonApplied: true })
        },
        clearComparisonMode: () => {
          const currentPanels = get().panels
          const previousFilters = {
            days: ["Tue"],
            startDate: get().selectedCity.availableDateRanges.startDate,
            endDate: get().selectedCity.availableDateRanges.endDate,
            timePeriod: "custom",
            hourRange: [7, 22],
          }
          set({ mapData: null })
          set({ comparisonMapData: null })
          const previousPanels = get().previousPanelStates

          const timeReplayState = get().timeReplayState

          if (get().isAutoplayPlaying) {
            set({ isAutoplayPlaying: false })
          }

          if (timeReplayState.intervalId !== null) {
            clearInterval(timeReplayState.intervalId)
          }

          const map = get().refs.map
          const selectedCity = get().selectedCity
          if (map && selectedCity) {
            updateMapPosition(
              map as google.maps.Map,
              selectedCity.coords,
              selectedCity.customZoom?.[get().usecase] || selectedCity.zoom,
            )
          }
          const filtersToRestore: LastWeekMonthFilters | CustomTimeFilters =
            (previousFilters as LastWeekMonthFilters | CustomTimeFilters) || {
              timePeriod: "custom" as const,
              startDate: get().selectedCity.availableDateRanges.startDate,
              endDate: get().selectedCity.availableDateRanges.endDate,
              hourRange: [9, 17] as [number, number],
              days: ["Mon"],
            }

          const panelsToRestore = previousPanels
            ? {
                ...currentPanels,
                settingsPanel: previousPanels.settingsPanel,
                leftPanel: previousPanels.leftPanel,
                rightPanel: previousPanels.rightPanel,
              }
            : {
                ...currentPanels,
                settingsPanel: true,
                rightPanel: true,
                leftPanel: currentPanels.previousLeftPanelState,
              }

          set({
            isComparisonMode: false,
            activeComparisonShortcut: null,
            isComparisonApplied: false,
            comparisonTimeFilters: null,
            timeFilters: filtersToRestore,
            previousTimeFilters: null,
            previousPanelStates: null,
            timeReplayState: {
              currentHour: 0,
              hasStartedReplay: false,
              showResetButton: false,
              previousTimeFilters: null,
              intervalId: null,
            },
            routeMetrics: {
              ...get().routeMetrics,
              comparison: null,
            },
            averageTravelTime: {
              ...get().averageTravelTime,
              comparison: null,
            },
            panels: panelsToRestore,
          })
        },

        setComparisonTimeFilters: (
          filters: LastWeekMonthFilters | CustomTimeFilters | null,
        ) => {
          set({ comparisonTimeFilters: filters })
        },
        expandPanel: (
          panelName: "settingsPanel" | "leftPanel" | "rightPanel",
        ) => {
          const currentPanels = get().panels

          if (panelName === "settingsPanel") {
            const timeReplayState = get().timeReplayState
            if (timeReplayState.previousTimeFilters) {
              set({
                timeFilters: {
                  ...get().timeFilters,
                  hourRange: timeReplayState.previousTimeFilters.hourRange,
                },
              })
              set({
                comparisonTimeFilters: {
                  ...(get().comparisonTimeFilters as CustomTimeFilters),
                  hourRange: timeReplayState.previousTimeFilters.hourRange,
                },
              })
            }

            if (get().isAutoplayPlaying) {
              set({ isAutoplayPlaying: false })
            }

            if (timeReplayState.intervalId !== null) {
              clearInterval(timeReplayState.intervalId)
            }

            set({
              timeReplayState: {
                currentHour: 0,
                hasStartedReplay: false,
                showResetButton: false,
                previousTimeFilters: null,
                intervalId: null,
              },
            })

            set({
              panels: {
                ...currentPanels,
                settingsPanel: true,
                leftPanel: false,
                previousLeftPanelState: currentPanels.leftPanel,
              },
            })
          } else if (panelName === "leftPanel") {
            set({
              panels: {
                ...currentPanels,
                leftPanel: true,
                settingsPanel: false,
              },
            })
          } else if (panelName === "rightPanel") {
            set({
              panels: {
                ...currentPanels,
                rightPanel: true,
              },
            })
          }
        },

        collapsePanel: (
          panelName: "settingsPanel" | "leftPanel" | "rightPanel",
        ) => {
          const currentPanels = get().panels

          if (panelName === "settingsPanel") {
            const timeReplayState = get().timeReplayState
            if (timeReplayState.previousTimeFilters) {
              set({
                timeFilters: {
                  ...get().timeFilters,
                  hourRange: timeReplayState.previousTimeFilters.hourRange,
                },
              })
            }

            if (get().isAutoplayPlaying) {
              set({ isAutoplayPlaying: false })
            }

            if (timeReplayState.intervalId !== null) {
              clearInterval(timeReplayState.intervalId)
            }

            set({
              timeReplayState: {
                currentHour: 0,
                hasStartedReplay: false,
                showResetButton: false,
                previousTimeFilters: null,
                intervalId: null,
              },
            })
          }

          set({
            panels: {
              ...currentPanels,
              [panelName]: false,
            },
          })
        },

        switchMode: (mode: "live" | "historical") => {
          const timeReplayState = get().timeReplayState
          if (timeReplayState.previousTimeFilters) {
            set({
              timeFilters: {
                ...get().timeFilters,
                hourRange: timeReplayState.previousTimeFilters.hourRange,
              },
            })
          }

          if (timeReplayState.intervalId !== null) {
            clearInterval(timeReplayState.intervalId)
          }

          const currentPanels = get().panels
          const shouldShowGreyRoutes = mode === "historical"
          set({
            mode,
            selectedRouteId: null,
            selectedRouteSegment: null,
            isAutoplayPlaying: false,
            shouldUseGreyRoutes: shouldShowGreyRoutes, // Show grey routes when switching to historical
            timeReplayState: {
              currentHour: 0,
              hasStartedReplay: false,
              showResetButton: false,
              previousTimeFilters: null,
              intervalId: null,
            },
            panels:
              mode === "live"
                ? {
                    ...currentPanels,
                    settingsPanel: false,
                    leftPanel: currentPanels.previousLeftPanelState,
                    previousLeftPanelState: currentPanels.leftPanel,
                  }
                : {
                    ...currentPanels,
                    settingsPanel: true,
                    leftPanel: false,
                    previousLeftPanelState: currentPanels.leftPanel,
                  },
          })

          const map = get().refs.map
          const selectedCity = get().selectedCity
          if (map && selectedCity) {
            updateMapPosition(
              map,
              selectedCity.coords,
              selectedCity.customZoom?.[get().usecase] || selectedCity.zoom,
            )
          }
        },

        setTooltip: (
          field: keyof AppState["tooltip"],
          value:
            | HTMLElement
            | google.maps.MapsEventListener
            | google.maps.LatLng
            | number
            | boolean
            | string
            | null,
        ) => set({ tooltip: { ...get().tooltip, [field]: value } }),
        setMapMarker: (
          marker: google.maps.marker.AdvancedMarkerElement | null,
        ) => set({ mapMarker: marker }),

        setMapViewControllerExpanded: (isExpanded: boolean) =>
          set({
            panels: { ...get().panels, settingsPanel: isExpanded },
          }),
        setFloatingPanelExpanded: (isExpanded: boolean) =>
          set({
            panels: { ...get().panels, leftPanel: isExpanded },
          }),
        setPreviousFloatingPanelExpanded: (isExpanded: boolean) =>
          set({
            panels: {
              ...get().panels,
              previousLeftPanelState: isExpanded,
            },
          }),

        setMapData: (data: MapData) => set({ mapData: data }),
        setShouldUseGreyRoutes: (shouldUse: boolean) =>
          set({ shouldUseGreyRoutes: shouldUse }),
        setTimeReplayState: (state: Partial<AppState["timeReplayState"]>) => {
          set({
            timeReplayState: {
              ...get().timeReplayState,
              ...state,
            },
          })
        },
        resetTimeReplayState: () => {
          const currentState = get().timeReplayState

          if (currentState.previousTimeFilters) {
            set({
              timeFilters: {
                ...get().timeFilters,
                hourRange: currentState.previousTimeFilters.hourRange,
              },
            })
          }

          if (get().isAutoplayPlaying) {
            set({ isAutoplayPlaying: false })
          }

          if (currentState.intervalId !== null) {
            clearInterval(currentState.intervalId)
          }

          set({
            timeReplayState: {
              currentHour: 0,
              hasStartedReplay: false,
              showResetButton: false,
              previousTimeFilters: null,
              intervalId: null,
            },
          })
        },

        setComparisonMapData: (data: MapData) =>
          set({ comparisonMapData: data }),
        setComparisonApplied: (applied: boolean) =>
          set({ isComparisonApplied: applied }),

        setRouteMetrics: (
          layout: "main" | "comparison",
          data: RouteMetricsData,
        ) => {
          set({
            routeMetrics: {
              ...get().routeMetrics,
              [layout]: data,
            },
          })
        },
        setAverageTravelTime: (
          layout: "main" | "comparison",
          data: AverageTravelTimeData,
        ) => {
          set({
            averageTravelTime: {
              ...get().averageTravelTime,
              [layout]: data,
            },
          })
        },

        setQueryState: (
          queryKey: keyof AppState["queries"],
          status: "pending" | "loading" | "success" | "error",
          data?:
            | HistoricalData
            | RealtimeData
            | FeatureCollection
            | AverageTravelTimeData
            | RouteMetricsData,
          error?: Error,
          layout?: "main" | "comparison",
          fetchedFor?: FetchedForInfo,
        ) => {
          const currentQueries = get().queries

          if (
            (queryKey === "routeMetrics" || queryKey === "averageTravelTime") &&
            layout
          ) {
            set({
              queries: {
                ...currentQueries,
                [queryKey]: {
                  ...currentQueries[queryKey],
                  [layout]: {
                    status,
                    data:
                      data !== undefined
                        ? data
                        : (
                            currentQueries[queryKey] as {
                              main: {
                                data:
                                  | AverageTravelTimeData
                                  | RouteMetricsData
                                  | null
                                error: Error | null
                              }
                              comparison: {
                                data:
                                  | AverageTravelTimeData
                                  | RouteMetricsData
                                  | null
                                error: Error | null
                              }
                            }
                          )[layout].data,
                    error:
                      error !== undefined
                        ? error
                        : (
                            currentQueries[queryKey] as {
                              main: {
                                data:
                                  | AverageTravelTimeData
                                  | RouteMetricsData
                                  | null
                                error: Error | null
                              }
                              comparison: {
                                data:
                                  | AverageTravelTimeData
                                  | RouteMetricsData
                                  | null
                                error: Error | null
                              }
                            }
                          )[layout].error,
                  },
                },
              },
            })
          } else {
            set({
              queries: {
                ...currentQueries,
                [queryKey]: {
                  status,
                  data:
                    data !== undefined
                      ? data
                      : (
                          currentQueries[queryKey] as {
                            data:
                              | HistoricalData
                              | RealtimeData
                              | FeatureCollection
                              | null
                            error: Error | null
                          }
                        ).data,
                  error:
                    error !== undefined
                      ? error
                      : (
                          currentQueries[queryKey] as {
                            data:
                              | HistoricalData
                              | RealtimeData
                              | FeatureCollection
                              | null
                            error: Error | null
                          }
                        ).error,
                  ...(fetchedFor !== undefined && { fetchedFor }),
                },
              },
            })
          }
        },
      }) as AppActions,
  ),
)
;(window as { useAppStore?: typeof useAppStore }).useAppStore = useAppStore
