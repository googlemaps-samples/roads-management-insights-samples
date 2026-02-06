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

import { create } from "zustand"
import { persist } from "zustand/middleware"

import { DistanceUnit, RouteColorMode, UserPreferences } from "../types/user"

interface UserPreferencesStore {
  // State
  distanceUnit: DistanceUnit
  googleCloudAccount: string | null
  show_tooltip: boolean
  show_instructions: boolean
  routeColorMode: RouteColorMode
  isLoading: boolean

  // Actions
  setDistanceUnit: (unit: DistanceUnit) => void
  setGoogleCloudAccount: (account: string | null) => void
  setShowTooltip: (show: boolean) => void
  setShowInstructions: (show: boolean) => void
  setRouteColorMode: (mode: RouteColorMode) => void
  loadPreferences: (preferences: UserPreferences) => void
  reset: () => void
}

const DEFAULT_PREFERENCES: UserPreferences = {
  id: 1,
  distanceUnit: "km",
  googleCloudAccount: null,
  show_tooltip: true,
  show_instructions: true,
  route_color_mode: "sync_status",
}

export const useUserPreferencesStore = create<UserPreferencesStore>()(
  persist(
    (set) => ({
      // Initial state
      distanceUnit: "km",
      googleCloudAccount: null,
      show_tooltip: true,
      show_instructions: true,
      routeColorMode: "sync_status",
      isLoading: false,

      // Actions
      setDistanceUnit: (unit) => {
        set({ distanceUnit: unit })
      },

      setGoogleCloudAccount: (account) => {
        set({ googleCloudAccount: account })
      },

      setShowTooltip: (show) => {
        set({ show_tooltip: show })
      },

      setShowInstructions: (show) => {
        set({ show_instructions: show })
      },
      setRouteColorMode: (mode) => {
        set({ routeColorMode: mode })
      },

      loadPreferences: (preferences) => {
        set({
          distanceUnit: preferences.distanceUnit,
          googleCloudAccount: preferences.googleCloudAccount,
          show_tooltip: preferences.show_tooltip ?? true,
          show_instructions: preferences.show_instructions ?? true,
          routeColorMode: preferences.route_color_mode || "sync_status",
        })
      },

      reset: () => {
        set({
          distanceUnit: DEFAULT_PREFERENCES.distanceUnit,
          googleCloudAccount: DEFAULT_PREFERENCES.googleCloudAccount,
          show_tooltip: DEFAULT_PREFERENCES.show_tooltip,
          show_instructions: DEFAULT_PREFERENCES.show_instructions,
          routeColorMode: DEFAULT_PREFERENCES.route_color_mode,
        })
      },
    }),
    {
      name: "user-preferences-store",
      partialize: (state) => ({
        // Persist preferences to localStorage
        distanceUnit: state.distanceUnit,
        googleCloudAccount: state.googleCloudAccount,
        show_tooltip: state.show_tooltip,
        show_instructions: state.show_instructions,
        routeColorMode: state.routeColorMode,
      }),
    },
  ),
)
