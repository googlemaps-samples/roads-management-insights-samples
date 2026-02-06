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

import { temporal } from "zundo"
import { create } from "zustand"

import { createIndividualSlice } from "./slices/individual-slice"
import { createPolygonSlice } from "./slices/polygon-slice"
import { createRoadImportSlice } from "./slices/road-import-slice"
import { createRoadsNetworkSlice } from "./slices/roads-network-slice"
import { createSegmentationSlice } from "./slices/segmentation-slice"
import { createUiSlice } from "./slices/ui-slice"
import { createUserRoutesSlice } from "./slices/user-routes-slice"
import { createUtilsSlice } from "./slices/utils-slice"
import { LayerStore } from "./types"

export const useLayerStore = create<LayerStore>()(
  temporal(
    (...args) => ({
      ...createIndividualSlice(...args),
      ...createPolygonSlice(...args),
      ...createRoadImportSlice(...args),
      ...createRoadsNetworkSlice(...args),
      ...createSegmentationSlice(...args),
      ...createUiSlice(...args),
      ...createUserRoutesSlice(...args),
      ...createUtilsSlice(...args),
    }),
    {
      // Optimized temporal configuration: track only undoable domains
      // (individual drawing, segmentation, road import panel routes,
      // snapped roads editing, uploaded routes) and ignore map-view-only state.
      limit: 50,
      partialize: (state: LayerStore) => {
        return {
          // --- Individual route drawing ---
          individualRoute: {
            // Core undoable data
            ...state.individualRoute,

            currentRouteId: null,
            validationError: null,
          },

          // --- Segmentation (cut points + distance + type) ---
          segmentation: {
            ...state.segmentation,
            // Track cutPoints, distanceKm, and type for undo/redo
            // These are needed to restore distance-based segmentation state
            cutPoints: state.segmentation.cutPoints,
            distanceKm: state.segmentation.distanceKm,
            type: state.segmentation.type,
            // Derived fields excluded - can be recomputed on restore
            isCalculating: false,
            error: undefined,
            previewSegments: [],
          },

          // --- Road import (panel routes) ---
          roadImport: {
            // Panel routes and selection mode are what matter for undo/redo.
            panelRoutes: state.roadImport.panelRoutes,
            selectionMode: state.roadImport.selectionMode,
            importedRoads: state.roadImport.importedRoads,
            importedPolygon: state.roadImport.importedPolygon,
            hoveredRoadId: null,
            pendingModeSwitch: state.roadImport.pendingModeSwitch,
            multiSelectTempSelection: state.roadImport.multiSelectTempSelection,
            multiSelectValidationResult: null, // Don't track validation result
            multiSelectValidating: false, // Don't track validating state
            routeInMaking: state.roadImport.routeInMaking,
            routeInMakingRoadIds: state.roadImport.routeInMakingRoadIds,
          },
        }
      },
      equality: (past, current) => {
        // 1. Block snapshots while dragging markers or cut points.
        if (current.segmentation.isDragging) {
          return true
        }

        // 2. Segmentation: cutPoints, distanceKm, and type matter.
        const segmentationChanged =
          JSON.stringify(past.segmentation.cutPoints) !==
            JSON.stringify(current.segmentation.cutPoints) ||
          past.segmentation.distanceKm !== current.segmentation.distanceKm ||
          past.segmentation.type !== current.segmentation.type

        // 3. Individual route: compare points length + content.
        const individualChanged =
          past.individualRoute.points.length !==
            current.individualRoute.points.length ||
          JSON.stringify(past.individualRoute.points) !==
            JSON.stringify(current.individualRoute.points)

        // 4. Road import: panel routes list, multi-select temp selection, or selection mode changed.
        const importChanged =
          JSON.stringify(past.roadImport.panelRoutes) !==
            JSON.stringify(current.roadImport.panelRoutes) ||
          JSON.stringify(past.roadImport.multiSelectTempSelection) !==
            JSON.stringify(current.roadImport.multiSelectTempSelection) ||
          past.roadImport.selectionMode !== current.roadImport.selectionMode ||
          JSON.stringify(past.roadImport.routeInMaking) !==
            JSON.stringify(current.roadImport.routeInMaking) ||
          JSON.stringify(past.roadImport.routeInMakingRoadIds) !==
            JSON.stringify(current.roadImport.routeInMakingRoadIds) ||
          JSON.stringify(past.roadImport.routeInMaking) !==
            JSON.stringify(current.roadImport.routeInMaking) ||
          JSON.stringify(past.roadImport.routeInMakingRoadIds) !==
            JSON.stringify(current.roadImport.routeInMakingRoadIds)

        // Create a new snapshot only when something significant changed.
        const hasSignificantChange =
          segmentationChanged || individualChanged || importChanged

        return !hasSignificantChange
      },
    },
  ),
)

export const useLayerTemporalStore = useLayerStore.temporal

export * from "./types"
export * from "./constants"

// if (typeof window !== "undefined") {
//   ;(window as any).debugLayerStore = useLayerStore
// }

// Subscribe to segmentation state changes to recalculate preview segments after undo/redo
let previousSegmentationKey: string | null = null
let previousSelectedState: {
  targetRouteId: string | undefined
  type: string
  distanceKm: number | undefined
  cutPointsLength: number
  cutPointsKey: string
  isActive: boolean
} | null = null

useLayerStore.subscribe((state) => {
  // Create a stable representation instead of including the array directly
  // This prevents unnecessary subscription fires when cutPoints array reference changes
  const cutPointsKey = state.segmentation.cutPoints
    .map((cp) => cp.id)
    .sort()
    .join(",")

  const selectedState = {
    targetRouteId: state.segmentation.targetRoute?.id,
    type: state.segmentation.type,
    distanceKm: state.segmentation.distanceKm,
    cutPointsLength: state.segmentation.cutPoints.length,
    cutPointsKey, // Stable string representation of cutPoints
    isActive: state.segmentation.isActive,
  }

  // Only proceed if the selected state actually changed
  if (
    previousSelectedState &&
    previousSelectedState.targetRouteId === selectedState.targetRouteId &&
    previousSelectedState.type === selectedState.type &&
    previousSelectedState.distanceKm === selectedState.distanceKm &&
    previousSelectedState.cutPointsLength === selectedState.cutPointsLength &&
    previousSelectedState.cutPointsKey === selectedState.cutPointsKey &&
    previousSelectedState.isActive === selectedState.isActive
  ) {
    return // No change, skip processing
  }

  const seg = state.segmentation

  // Create a key that represents the segmentation state
  const currentKey =
    seg.isActive && seg.targetRoute
      ? `${seg.targetRoute.id}-${seg.type}-${seg.distanceKm || 0}-${seg.cutPoints.length}-${JSON.stringify(seg.cutPoints.map((cp) => cp.id))}`
      : null

  // If segmentation state changed (including from undo/redo), recalculate
  // Trigger recalculation when:
  // - Manual/intersections mode: has cut points
  // - Distance mode: has distanceKm set OR distanceKm is undefined (show full route)
  if (
    currentKey &&
    currentKey !== previousSegmentationKey &&
    seg.targetRoute &&
    (seg.cutPoints.length > 0 || seg.type === "distance")
  ) {
    // Use setTimeout to ensure state is fully restored before recalculation
    setTimeout(() => {
      const currentState = useLayerStore.getState()
      if (
        currentState.segmentation.isActive &&
        currentState.segmentation.targetRoute &&
        currentState.calculatePreviewSegments
      ) {
        currentState.calculatePreviewSegments()
      }
    }, 0)
  }

  previousSegmentationKey = currentKey
  previousSelectedState = selectedState
})
