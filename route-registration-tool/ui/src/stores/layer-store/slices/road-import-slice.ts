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

import { StateCreator } from "zustand"

import { useLayerStore } from ".."
import {
  ImportedRoadFeature,
  ImportedRoadsCollection,
} from "../../../types/imported-road"
import { mergeRoadToRoute } from "../../../utils/multi-select-route"
import { combineRoadsToRoute } from "../../../utils/route-combination"
import { generateMultiSelectRouteName } from "../../../utils/route-naming"
import { useProjectWorkspaceStore } from "../../project-workspace-store"
import { LayerStore, PanelRoute, RoadImportState } from "../types"

export interface RoadImportSlice {
  roadImport: RoadImportState
  setImportedRoads: (
    featureCollection: ImportedRoadsCollection,
    polygon: GeoJSON.Polygon,
  ) => void
  toggleSelectedRoad: (roadId: string) => void // Toggle selection - immediately adds/removes from panel
  removeRouteFromPanel: (routeId: string) => void
  updateRouteName: (routeId: string, name: string) => void
  setHoveredRoadId: (roadId: string | null) => void
  setSelectionMode: (mode: "single" | "lasso" | "multi-select" | null) => void
  clearRoadImport: () => void
  setPendingModeSwitch: (pending: { from: string; to: string } | null) => void
  // Lasso mode functions
  setLassoFilteredRoads: (roadIds: string[]) => void
  setLassoSelectedPriorities: (priorities: string[]) => void
  addLassoFilteredRoadsToPanel: () => void // Add all lasso filtered roads to panel as individual routes
  clearLassoFilteredRoads: () => void
  // Multi-select mode functions
  addRoadToMultiSelect: (roadId: string) => void
  removeRoadFromMultiSelect: (roadId: string) => void
  clearMultiSelectTemp: () => void
  setMultiSelectValidationResult: (result: any) => void
  setMultiSelectValidating: (isValidating: boolean) => void
  combineMultiSelectRoadsToRoute: () => Promise<void>
  // Multi-select continuous path functions
  initializeRouteInMaking: (roadId: string) => void
  addRoadToRouteInMaking: (roadId: string, position: "front" | "back") => void
  clearRouteInMaking: () => void
  saveRouteInMaking: () => void
}

export const createRoadImportSlice: StateCreator<
  LayerStore,
  [],
  [],
  RoadImportSlice
> = (set, get) => ({
  roadImport: {
    importedRoads: null,
    importedPolygon: null,
    panelRoutes: [],
    hoveredRoadId: null,
    selectionMode: "single",
    pendingModeSwitch: null,
    lassoFilteredRoadIds: null,
    lassoSelectedPriorities: null,
    multiSelectTempSelection: [],
    multiSelectValidationResult: null,
    multiSelectValidating: false,
    routeInMaking: null,
    routeInMakingRoadIds: [],
  },

  setImportedRoads: (featureCollection, polygon) => {
    // Only clear temporal history when FIRST entering road import mode
    // (when importedRoads is null/undefined, meaning we're starting fresh)
    // Don't clear if roads are already imported (to preserve history when re-importing)
    const currentState = get()
    const isFirstImport = !currentState.roadImport.importedRoads

    if (isFirstImport) {
      // Clear temporal history when entering road import mode
      // This creates a clean slate for road import undo/redo
      useLayerStore.temporal.getState().clear()
    }

    set((state) => ({
      roadImport: {
        ...state.roadImport,
        importedRoads: featureCollection,
        importedPolygon: polygon,
        // Ensure selectionMode is always set to "single" if it's null
        // This prevents road selection when no mode is active
        selectionMode: state.roadImport.selectionMode || "single",
      },
    }))
  },

  toggleSelectedRoad: (roadId) => {
    set((state) => {
      if (!state.roadImport.importedRoads) return state

      // Auto-set to single mode if no selection mode is active
      // This ensures road selection always has an active mode
      const effectiveSelectionMode = state.roadImport.selectionMode || "single"
      if (!state.roadImport.selectionMode) {
        console.warn(
          "⚠️ No selection mode active. Defaulting to single select mode.",
        )
      }

      // Check if road is already in panel
      const existingRouteIndex = state.roadImport.panelRoutes.findIndex((r) =>
        r.roadIds.includes(roadId),
      )

      if (existingRouteIndex >= 0) {
        // Remove from panel
        const newPanelRoutes = state.roadImport.panelRoutes.filter(
          (_, index) => index !== existingRouteIndex,
        )
        return {
          roadImport: {
            ...state.roadImport,
            panelRoutes: newPanelRoutes,
            // Ensure selectionMode is set if it was null
            selectionMode: effectiveSelectionMode,
          },
        }
      } else {
        // Add to panel - find the road feature and create a route
        const roadFeature = state.roadImport.importedRoads.features.find(
          (f) => f.properties?.road_id?.toString() === roadId,
        )

        if (!roadFeature || roadFeature.geometry.type !== "LineString") {
          return state
        }

        const route: PanelRoute = {
          id: `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: roadFeature.properties?.name || `Route ${roadId}`,
          roadIds: [roadId],
          geometry: roadFeature.geometry,
          priority: roadFeature.properties?.priority,
          distance: roadFeature.properties?.length || 0,
        }

        return {
          roadImport: {
            ...state.roadImport,
            panelRoutes: [...state.roadImport.panelRoutes, route],
            // Ensure selectionMode is set if it was null
            selectionMode: effectiveSelectionMode,
          },
        }
      }
    })
  },

  removeRouteFromPanel: (routeId) => {
    set((state) => {
      // Find the route to get its roadIds
      const routeToRemove = state.roadImport.panelRoutes.find(
        (r) => r.id === routeId,
      )

      // Get roadIds from the route
      const roadIdsToRemove = routeToRemove?.roadIds || []

      // Remove route from panel
      const updatedPanelRoutes = state.roadImport.panelRoutes.filter(
        (r) => r.id !== routeId,
      )

      // Only remove roads from importedRoads if they are NOT pure imported roads
      // (i.e., they have isStretched or isMultiSelected flags)
      // Pure imported roads (single/lasso selection) should remain visible on map
      let updatedImportedRoads = state.roadImport.importedRoads
      if (updatedImportedRoads && roadIdsToRemove.length > 0) {
        updatedImportedRoads = {
          ...updatedImportedRoads,
          features: updatedImportedRoads.features.filter((feature) => {
            const featureRoadId = feature.properties?.road_id?.toString() || ""

            // Only remove if this road is in the list to remove
            if (!roadIdsToRemove.includes(featureRoadId)) {
              return true // Keep roads not in the removal list
            }

            // Check if this is a pure imported road (no isStretched or isMultiSelected flags)
            const isPureImportedRoad =
              !(feature.properties?.isStretched === true) &&
              !(feature.properties?.isMultiSelected === true)

            // Only remove if NOT a pure imported road (i.e., it's stretched or multi-selected)
            // Pure imported roads should remain visible on the map
            return isPureImportedRoad
          }),
        }
      }

      return {
        roadImport: {
          ...state.roadImport,
          panelRoutes: updatedPanelRoutes,
          importedRoads: updatedImportedRoads,
        },
      }
    })
  },

  updateRouteName: (routeId, name) => {
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        panelRoutes: state.roadImport.panelRoutes.map((r) =>
          r.id === routeId ? { ...r, name } : r,
        ),
      },
    }))
  },

  setHoveredRoadId: (roadId) => {
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        hoveredRoadId: roadId,
      },
    }))
  },

  setSelectionMode: (mode) => {
    // IMPORTANT: Do NOT clear temporal history when switching selection modes
    // History should be preserved to allow undo/redo across mode switches
    // (single ↔ lasso ↔ multi-select)
    const previousMode = get().roadImport.selectionMode
    const historyBefore = useLayerStore.temporal.getState()

    set((state) => {
      // Clear multi-select temp selection and routeInMaking when switching modes
      const shouldClearMultiSelect =
        mode !== "multi-select" &&
        (state.roadImport.multiSelectTempSelection.length > 0 ||
          state.roadImport.routeInMaking !== null)

      return {
        roadImport: {
          ...state.roadImport,
          selectionMode: mode,
          ...(shouldClearMultiSelect && {
            multiSelectTempSelection: [],
            multiSelectValidationResult: null,
            multiSelectValidating: false,
            routeInMaking: null,
            routeInMakingRoadIds: [],
          }),
        },
      }
    })

    // Verify history wasn't cleared (check after state update completes)
    setTimeout(() => {
      const historyAfter = useLayerStore.temporal.getState()
      if (
        historyAfter.pastStates.length !== historyBefore.pastStates.length ||
        historyAfter.futureStates.length !== historyBefore.futureStates.length
      ) {
        console.error(
          "❌ [setSelectionMode] History was cleared! This should not happen.",
          {
            before: {
              past: historyBefore.pastStates.length,
              future: historyBefore.futureStates.length,
            },
            after: {
              past: historyAfter.pastStates.length,
              future: historyAfter.futureStates.length,
            },
          },
        )
      }
    }, 0)
  },

  clearRoadImport: () => {
    set(() => ({
      roadImport: {
        importedRoads: null,
        importedPolygon: null,
        panelRoutes: [],
        hoveredRoadId: null,
        selectionMode: "single", // Default to single select mode
        pendingModeSwitch: null,
        lassoFilteredRoadIds: null,
        lassoSelectedPriorities: null,
        multiSelectTempSelection: [],
        multiSelectValidationResult: null,
        multiSelectValidating: false,
        routeInMaking: null,
        routeInMakingRoadIds: [],
      },
    }))
  },

  setPendingModeSwitch: (pending) => {
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        pendingModeSwitch: pending,
      },
    }))
  },

  // Lasso mode functions
  setLassoFilteredRoads: (roadIds) => {
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        lassoFilteredRoadIds: roadIds,
      },
    }))
  },

  setLassoSelectedPriorities: (priorities) => {
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        lassoSelectedPriorities: priorities,
      },
    }))
  },

  addLassoFilteredRoadsToPanel: () => {
    set((state) => {
      if (
        !state.roadImport.importedRoads ||
        !state.roadImport.lassoFilteredRoadIds ||
        state.roadImport.lassoFilteredRoadIds.length === 0
      ) {
        return state
      }

      // Create individual routes for each filtered road
      const newRoutes: PanelRoute[] = []
      for (const roadId of state.roadImport.lassoFilteredRoadIds) {
        // Check if already in panel
        const alreadyInPanel = state.roadImport.panelRoutes.some((r) =>
          r.roadIds.includes(roadId),
        )
        if (alreadyInPanel) continue

        const roadFeature = state.roadImport.importedRoads.features.find(
          (f) => f.properties?.road_id?.toString() === roadId,
        )

        if (!roadFeature || roadFeature.geometry.type !== "LineString") {
          continue
        }

        const route: PanelRoute = {
          id: `route-${Date.now()}-${roadId}-${Math.random().toString(36).substr(2, 9)}`,
          name: roadFeature.properties?.name || `Route ${roadId}`,
          roadIds: [roadId],
          geometry: roadFeature.geometry,
          priority: roadFeature.properties?.priority,
          distance: roadFeature.properties?.length || 0,
        }

        newRoutes.push(route)
      }

      return {
        roadImport: {
          ...state.roadImport,
          panelRoutes: [...state.roadImport.panelRoutes, ...newRoutes],
          lassoFilteredRoadIds: null, // Clear after adding
        },
      }
    })
  },

  clearLassoFilteredRoads: () => {
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        lassoFilteredRoadIds: null,
        lassoSelectedPriorities: null,
      },
    }))
  },

  // Multi-select mode functions
  addRoadToMultiSelect: (roadId) => {
    set((state) => {
      if (state.roadImport.multiSelectTempSelection.includes(roadId)) {
        return state // Already in selection
      }
      return {
        roadImport: {
          ...state.roadImport,
          multiSelectTempSelection: [
            ...state.roadImport.multiSelectTempSelection,
            roadId,
          ],
        },
      }
    })
  },

  removeRoadFromMultiSelect: (roadId) => {
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        multiSelectTempSelection:
          state.roadImport.multiSelectTempSelection.filter(
            (id) => id !== roadId,
          ),
        // Clear validation result when removing roads
        multiSelectValidationResult: null,
      },
    }))
  },

  clearMultiSelectTemp: () => {
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        multiSelectTempSelection: [],
        multiSelectValidationResult: null,
        multiSelectValidating: false,
        routeInMaking: null,
        routeInMakingRoadIds: [],
      },
    }))
  },

  setMultiSelectValidationResult: (result) => {
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        multiSelectValidationResult: result,
        multiSelectValidating: false,
      },
    }))
  },

  setMultiSelectValidating: (isValidating) => {
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        multiSelectValidating: isValidating,
      },
    }))
  },

  combineMultiSelectRoadsToRoute: async () => {
    const state = get()
    const { roadImport } = state

    if (
      !roadImport.importedRoads ||
      roadImport.multiSelectTempSelection.length === 0
    ) {
      throw new Error("No roads selected for combination")
    }

    // Get road features from imported roads
    const selectedRoads = roadImport.multiSelectTempSelection
      .map((roadId: string) => {
        const feature = roadImport.importedRoads!.features.find(
          (f: GeoJSON.Feature) => f.properties?.road_id?.toString() === roadId,
        )
        if (!feature || feature.geometry.type !== "LineString") {
          return null
        }
        return {
          id: roadId,
          linestringGeoJson: feature.geometry as GeoJSON.LineString,
          distanceKm: feature.properties?.length || 0,
          priority: feature.properties?.priority,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (selectedRoads.length === 0) {
      throw new Error("No valid roads found for combination")
    }

    // Get project ID from project workspace store
    const projectId = useProjectWorkspaceStore.getState().projectId

    if (!projectId) {
      throw new Error("Project ID not available")
    }

    // Combine roads using utility function
    const combinedRoute = await combineRoadsToRoute(selectedRoads, projectId)

    // Add to panel routes and clear temp selection
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        panelRoutes: [...state.roadImport.panelRoutes, combinedRoute],
        multiSelectTempSelection: [],
        multiSelectValidationResult: null,
        multiSelectValidating: false,
      },
    }))
  },

  // Multi-select continuous path functions
  initializeRouteInMaking: (roadId) => {
    set((state) => {
      if (!state.roadImport.importedRoads) {
        return state
      }

      const roadFeature = state.roadImport.importedRoads.features.find(
        (f) => f.properties.road_id === roadId,
      ) as ImportedRoadFeature | undefined

      if (!roadFeature || roadFeature.geometry.type !== "LineString") {
        return state
      }

      return {
        roadImport: {
          ...state.roadImport,
          routeInMaking: roadFeature,
          routeInMakingRoadIds: [roadId],
        },
      }
    })
  },

  addRoadToRouteInMaking: (roadId, position) => {
    set((state) => {
      if (!state.roadImport.importedRoads || !state.roadImport.routeInMaking) {
        return state
      }

      const roadFeature = state.roadImport.importedRoads.features.find(
        (f) => f.properties.road_id === roadId,
      ) as ImportedRoadFeature | undefined

      if (!roadFeature || roadFeature.geometry.type !== "LineString") {
        return state
      }

      // Merge road into routeInMaking
      const mergedRoute = mergeRoadToRoute(
        state.roadImport.routeInMaking,
        roadFeature,
        position,
      )

      // Update routeInMakingRoadIds based on position
      const newRoadIds =
        position === "front"
          ? [roadId, ...state.roadImport.routeInMakingRoadIds]
          : [...state.roadImport.routeInMakingRoadIds, roadId]

      return {
        roadImport: {
          ...state.roadImport,
          routeInMaking: mergedRoute,
          routeInMakingRoadIds: newRoadIds,
        },
      }
    })
  },

  clearRouteInMaking: () => {
    set((state) => ({
      roadImport: {
        ...state.roadImport,
        routeInMaking: null,
        routeInMakingRoadIds: [],
      },
    }))
  },

  saveRouteInMaking: () => {
    set((state) => {
      if (!state.roadImport.routeInMaking) {
        return state
      }

      // Create a single new multi-select road feature (m1) representing the combined route
      // This is a NEW road feature, not the individual roads
      const multiSelectRoadId = `multi-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`
      const routeName =
        generateMultiSelectRouteName(
          state.roadImport.routeInMakingRoadIds.length,
        ) ||
        state.roadImport.routeInMaking.properties.name ||
        "Multi-select Route"

      // Use start and end points from routeInMaking properties (already calculated by mergeRoadToRoute)
      const startPoint =
        state.roadImport.routeInMaking.properties.start_point ||
        (() => {
          const coords = state.roadImport.routeInMaking.geometry.coordinates
          return coords[0] as [number, number]
        })()
      const endPoint =
        state.roadImport.routeInMaking.properties.end_point ||
        (() => {
          const coords = state.roadImport.routeInMaking.geometry.coordinates
          return coords[coords.length - 1] as [number, number]
        })()

      // Create the new multi-select road feature
      const multiSelectRoadFeature: ImportedRoadFeature = {
        type: "Feature",
        geometry: state.roadImport.routeInMaking.geometry,
        properties: {
          road_id: multiSelectRoadId,
          name: routeName,
          length: state.roadImport.routeInMaking.properties.length || 0,
          priority: state.roadImport.routeInMaking.properties.priority,
          start_point: startPoint,
          end_point: endPoint,
          isMultiSelected: true,
        },
      }

      // Create PanelRoute - roadIds contains the new multi-select road ID so it can be highlighted
      const route: PanelRoute = {
        id: `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: routeName,
        roadIds: [multiSelectRoadId], // Reference the new multi-select road feature (m1)
        geometry: state.roadImport.routeInMaking.geometry,
        priority: state.roadImport.routeInMaking.properties.priority,
        distance: state.roadImport.routeInMaking.properties.length || 0,
      }

      // Add the new multi-select road feature to importedRoads
      const currentImportedRoads = state.roadImport.importedRoads
      const updatedImportedRoads = currentImportedRoads
        ? {
            ...currentImportedRoads,
            features: [
              ...currentImportedRoads.features,
              multiSelectRoadFeature,
            ],
          }
        : null

      return {
        roadImport: {
          ...state.roadImport,
          importedRoads: updatedImportedRoads,
          panelRoutes: [...state.roadImport.panelRoutes, route],
          routeInMaking: null,
          routeInMakingRoadIds: [],
        },
      }
    })
    useLayerStore.temporal.getState().clear()
  },
})
