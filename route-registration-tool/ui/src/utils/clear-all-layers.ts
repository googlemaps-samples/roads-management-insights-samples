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

import { useLayerStore } from "../stores"
import { useProjectWorkspaceStore } from "../stores/project-workspace-store"

/**
 * Clears all layer store state and project workspace state.
 * This should be called when navigating away from a project (e.g., to dashboard)
 * or when switching between projects.
 */
export const clearAllLayers = () => {
  console.log("🧹 Clearing all layers")
  const layerStore = useLayerStore.getState()
  const projectStore = useProjectWorkspaceStore.getState()

  // Get uploaded routes BEFORE clearing them (so we can discard their changes)
  const uploadedRoutes = layerStore.uploadedRoutes.routes

  // Clear all editing states and preview roads for each uploaded route
  uploadedRoutes.forEach((route) => {
    layerStore.discardRouteChanges(route.id)
  })

  // Clear uploaded routes
  layerStore.clearUploadedRoutes()

  // Clear snapped roads completely - reset all snapped roads state in one operation
  useLayerStore.setState({
    snappedRoads: {
      roads: [],
      isVisible: layerStore.snappedRoads.isVisible, // Preserve visibility setting
      isLoading: false,
      routeMarkers: [],
      isDraggingMarker: false,
      hoveredRouteId: null,
      previewRoads: [],
      editingStates: {},
    },
  })

  // Clear all optimized route markers
  layerStore.clearAllOptimizedRouteMarkers()

  // Clear all drawing states (includes individual route, polygon, lasso, and segmentation)
  layerStore.clearAllDrawing()

  // Clear road import state (imported roads, panel routes, etc.)
  layerStore.clearRoadImport()

  // Clear selected uploaded route
  layerStore.setSelectedUploadedRouteId(null)

  // Clear editing saved route ID
  layerStore.setEditingSavedRouteId(null)

  // Clear waypoint adding mode
  layerStore.setAddingWaypointMode(null)

  // Clear route UUID
  layerStore.setRouteUUID(null)

  // Clear points
  layerStore.clearPoints()

  // Clear project workspace state
  projectStore.setLeftPanelExpanded(false)
  projectStore.setActivePanel(null)
  projectStore.setRouteNamingDialogOpen(false)
  projectStore.setRoadPriorityPanelOpen(false)
  projectStore.setSelectedRoute(null)
  projectStore.setMapMode("view")
  projectStore.setCurrentFolder(null)
  projectStore.clearProject()

  // Refresh tile timestamps to force tile refetch when switching projects
  layerStore.refreshRoutesTilesTimestamp()
  layerStore.refreshRoadsTilesTimestamp()
  console.log("🧹 Cleared all layers")
}
