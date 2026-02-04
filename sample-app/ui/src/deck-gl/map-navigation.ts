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

import { useAppStore } from "../store"
import { City } from "../types/city"
import { Usecase } from "../types/common"
import type { HistoricalData } from "../types/store-data"
import {
  handlePolygonSelectionZoom,
  handleRouteZoom,
  resetToHomeView,
} from "./map-navigation-helpers"

// Re-export helper functions for backward compatibility
export {
  animateMapTransition,
  handlePolygonSelectionZoom,
  handleRouteZoom,
  resetToHomeView,
  updateMapPosition,
} from "./map-navigation-helpers"

export const handleMapResetZoom = (
  selectedRouteId: string | null,
  tooltipCoordinates?: [number, number] | null,
  geoJsonData?: FeatureCollection | null,
) => {
  // Get map reference and city from global state in a single call
  const state = useAppStore.getState()
  const map = state.refs.map
  const selectedCity = state.selectedCity
  const usecase = state.usecase

  if (!map) {
    console.warn("Map not available for reset zoom")
    return
  }

  if (
    usecase === "realtime-monitoring" ||
    usecase === "route-reliability" ||
    usecase === "data-analytics"
  ) {
    // Realtime-monitoring use case
    if (selectedRouteId) {
      // 1. When a route is selected, zoom into the route
      if (tooltipCoordinates && geoJsonData) {
        handleRouteZoom(
          selectedRouteId,
          tooltipCoordinates,
          geoJsonData,
          selectedCity,
          usecase,
        )
      }
    } else {
      // 2. When no route is selected, go back to home view
      resetToHomeView(map, selectedCity, usecase)
    }
  }
}

// Function to handle polygon selection zoom (called from page components)
export const handlePolygonSelection = (
  selectedPolygonId: string | null,
  urbanCongestionData: HistoricalData | null,
  selectedCity: City,
  usecase: Usecase,
) => {
  if (!selectedPolygonId || !urbanCongestionData) {
    return
  }

  // Use the existing polygon selection zoom function
  handlePolygonSelectionZoom(
    selectedPolygonId,
    Array.from(urbanCongestionData.data.routeColors.values()) as [], // Convert Map to array for compatibility
    selectedCity,
    usecase,
  )
}
