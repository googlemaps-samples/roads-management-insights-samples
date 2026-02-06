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

import { SyncStatus } from "../types"
import { useLayerStore } from "./layer-store"

// Types for the project workspace
export interface Project {
  id: string
  name: string
  boundaryGeoJson: any // GeoJSON boundary
  bigQueryColumn: {
    googleCloudProjectId: string
    googleCloudProjectNumber: string
    subscriptionId?: string
  }
  datasetName?: string
  viewstate?: Viewport
  mapSnapshot?: string // Base64-encoded map snapshot image
  createdAt: string
  updatedAt: string
}

export interface Route {
  id: string
  name: string
  projectId: string
  type:
    | "individual"
    | "arterial"
    | "highway"
    | "normal"
    | "uploaded"
    | "imported"
    | "drawn"
  source: "individual_drawing" | "polygon_selection"

  // Geographic data
  origin: { lat: number; lng: number }
  destination: { lat: number; lng: number }
  waypoints: { lat: number; lng: number }[]
  encodedPolyline: string
  distance: number // in km
  duration: number // in minutes

  // Status tracking
  sync_status?: "unsynced" | "validating" | "synced" | "invalid"
  route_status?:
    | "STATUS_RUNNING"
    | "STATUS_VALIDATING"
    | "STATUS_INVALID"
    | "STATUS_DELETING"
    | "STATUS_UNSPECIFIED"
  is_enabled?: boolean // For segment status updates
  createdAt: string
  updatedAt: string
  lastSyncedAt?: string

  // Route composition
  roads: Road[]
  segments?: RouteSegment[] // Child route segments from routes table
  isSegmented: boolean
  segmentCount: number
  segmentationType?: "manual" | "distance" | "intersections"

  // Visual properties
  color: string
  opacity: number
  strokeWidth: number
  // Categorization
  tag?: string | null
  // Original uploaded route data (if available)
  originalRouteGeoJson?: GeoJSON.Feature | GeoJSON.FeatureCollection
  // Match/similarity percentage (0-100) - how closely Google's route follows the uploaded route
  matchPercentage?: number
}

export interface Road {
  polyline: string
  id: string
  routeId: string
  name?: string
  linestringGeoJson: any // GeoJSON LineString
  segmentOrder: number
  distanceKm: number
  createdAt: string
  // Visibility toggle for segments
  is_selected?: boolean
  is_enabled?: boolean
}

export interface RouteSegment {
  uuid: string
  project_id: number
  route_name: string
  origin: string
  destination: string
  waypoints?: string | null
  center?: string | null
  route_type?: string | null
  length?: number | null
  parent_route_id?: string | null
  has_children: boolean
  is_segmented: boolean
  segmentation_type?: string | null
  segmentation_points?: string | null
  segmentation_config?: string | null
  sync_status: string
  is_enabled: boolean
  routes_status?: string | null // Add routes_status for segment status updates
  tag?: string | null
  encoded_polyline?: string | null
  segment_order?: number | null
  created_at?: string | null
  updated_at?: string | null
  deleted_at?: string | null
}

export interface Viewport {
  center: { lat: number; lng: number }
  zoom: number
}

export type MapMode =
  | "view"
  | "individual_drawing"
  | "individual_editing"
  | "polygon_drawing"
  | "lasso_selection"
  | "road_selection"
  | "route_editing"
  | "segmentation"
  | "upload_routes"
  | "editing_uploaded_route"

export type RightPanelType =
  | "route_ready"
  | "naming"
  | "segmentation"
  | "route_details"
  | null

interface ProjectWorkspaceStore {
  // === PROJECT CONTEXT ===
  projectId: string | null
  projectData: Project | null
  projectName: string | null

  // === ROUTES SECTION (Persistent) ===
  routes: Route[] // All routes in this project
  selectedRoute: Route | null // Currently selected route for right panel

  // === MAP MODE ===
  mapMode: MapMode
  mapType: "roadmap" | "hybrid"

  // === UI STATE ===
  panels: {
    left: { visible: boolean; collapsed: boolean }
    right: { visible: boolean }
  }
  leftPanelExpanded: boolean
  currentFolder: string | null // Current folder/tag being viewed in left panel
  routeToScrollTo: string | null // Route ID to scroll to in left panel
  routeSearchQuery: string | null // Search query to set when navigating to a route
  targetRouteId: string | null // Route ID to show first in ID-based pagination
  isSelectingRoute: boolean // Full-page loader state for route selection
  activePanel: "saved_routes" | "uploaded_routes" | null // Which panel is currently active
  rightPanelType: RightPanelType // Which right panel is currently active (only one at a time)
  selectedRoutePanelVisible: boolean // When SelectedRoutePanel is visible
  roadPriorityPanelOpen: boolean // When RoadPriorityPanel is open
  priorityFilterPanelExpanded: boolean // When PriorityFilterPanel is expanded
  routeNamingDialogOpen: boolean // When RouteNamingDialog is open
  pendingFile: File | null // Pending file for upload
  pendingFeatureCount: number // Feature count from pending file
  pendingProperties: string[] // Available properties from pending file

  // When true, render selected route's segments on map and hide parent line
  showSelectedRouteSegments: boolean

  // Toggle visibility of individual drawing markers on the map
  showIndividualMarkers: boolean

  // Dynamic Island height for layout calculations
  dynamicIslandHeight: number

  // Pending mode switch when there are unsaved uploaded routes
  pendingModeSwitch: {
    from: string
    to: string
    returnToMode?: string // Optional: mode to switch to after clearing (for same-mode button clicks)
  } | null

  // Pending upload clear when there are existing uploaded routes
  pendingUploadClear: boolean

  // Pending route selection when there are unsaved changes
  pendingRouteSelection: string | "close" | null // Route ID to select, "close" to close panel/collapse, or null for no pending action

  // === VIEWPORT PERSISTENCE ===
  viewport: Viewport | null

  // === ACTIONS ===

  // Project Management
  setProject: (projectId: string, projectData: Project) => void
  setProjectData: (project: Project) => void
  setRoutes: (routes: Route[]) => void
  clearProject: () => void

  // Route Management
  addRoute: (route: Route) => void
  updateRoute: (routeId: string, updates: Partial<Route>) => void
  removeRoute: (routeId: string) => void
  selectRoute: (routeId: string | null) => void
  setSelectedRoute: (routeId: string | null) => void
  clearRoutes: () => void
  loadRouteForEditing: (
    route: Route,
    loadRoutePoints: (route: Route) => void,
    setRouteUUID: (uuid: string | null) => void,
    clearPoints: () => void,
  ) => void
  exitEditMode: () => void

  // Map Mode Management
  setMapMode: (mode: MapMode) => void
  setPendingModeSwitch: (
    pending: {
      from: string
      to: string
      returnToMode?: string
    } | null,
  ) => void
  setPendingUploadClear: (pending: boolean) => void
  setPendingRouteSelection: (routeId: string | null) => void
  setMapType: (type: "roadmap" | "hybrid") => void
  toggleMapType: () => void

  // Panel Management
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  setLeftPanelCollapsed: (collapsed: boolean) => void
  setLeftPanelExpanded: (expanded: boolean) => void
  setLeftPanelVisible: (visible: boolean) => void
  setRightPanelVisible: (visible: boolean) => void
  setShowSelectedRouteSegments: (show: boolean) => void
  setCurrentFolder: (folder: string | null) => void
  scrollToRoute: (routeId: string | null) => void
  setRouteSearchQuery: (query: string | null) => void
  setTargetRouteId: (routeId: string | null) => void
  setIsSelectingRoute: (isSelecting: boolean) => void
  setActivePanel: (panel: "saved_routes" | "uploaded_routes" | null) => void
  setSelectedRoutePanelVisible: (visible: boolean) => void
  setRoadPriorityPanelOpen: (open: boolean) => void
  setPriorityFilterPanelExpanded: (expanded: boolean) => void
  setRouteNamingDialogOpen: (open: boolean) => void
  setPendingFile: (file: File | null) => void
  setPendingFeatureCount: (count: number) => void
  setPendingProperties: (properties: string[]) => void
  setShowIndividualMarkers: (show: boolean) => void
  setDynamicIslandHeight: (height: number) => void
  setRightPanelType: (type: RightPanelType) => void

  // Viewport Management
  saveViewport: (viewport: Viewport) => void
  restoreViewport: () => void

  // Reset
  reset: () => void
}

export const useProjectWorkspaceStore = create<ProjectWorkspaceStore>()(
  persist(
    (set, get) => ({
      // Initial state
      projectId: null,
      projectData: null,
      projectName: null,
      routes: [],
      selectedRoute: null,
      mapMode: "view",
      mapType: "roadmap",
      panels: {
        left: { visible: true, collapsed: false },
        right: { visible: false },
      },
      leftPanelExpanded: false,
      currentFolder: null,
      routeToScrollTo: null,
      routeSearchQuery: null,
      targetRouteId: null,
      isSelectingRoute: false,
      activePanel: null,
      rightPanelType: null,
      selectedRoutePanelVisible: false,
      roadPriorityPanelOpen: false,
      priorityFilterPanelExpanded: true,
      routeNamingDialogOpen: false,
      pendingFile: null,
      pendingFeatureCount: 0,
      pendingProperties: [],
      viewport: null,
      showSelectedRouteSegments: false,
      showIndividualMarkers: true,
      dynamicIslandHeight: 0,
      pendingModeSwitch: null,
      pendingUploadClear: false,
      pendingRouteSelection: null,

      // Project Management
      setProject: (projectId: string, projectData: Project) => {
        set({
          projectId,
          projectData,
          projectName: projectData.name,
          selectedRoute: null,
          mapMode: "view",
        })
      },

      setProjectData: (project) => {
        set({
          projectData: project,
          projectName: project.name,
        })
      },

      setRoutes: (routes) => {
        set((state) => {
          // Update routes from query data
          // Also update selectedRoute if it exists and was updated
          const updatedSelectedRoute =
            state.selectedRoute &&
            routes.find((r) => r.id === state.selectedRoute?.id)
              ? routes.find((r) => r.id === state.selectedRoute?.id) || null
              : state.selectedRoute

          return {
            routes,
            selectedRoute: updatedSelectedRoute,
          }
        })
      },

      clearProject: () => {
        set({
          projectId: null,
          projectData: null,
          projectName: null,
          routes: [],
          selectedRoute: null,
          mapMode: "view",
        })
      },

      // Route Management
      addRoute: (route) => {
        set((state) => ({
          routes: [...state.routes, route],
        }))
      },

      updateRoute: (routeId, updates) => {
        console.log("🔄 [updateRoute] Called:", {
          routeId,
          updates: {
            ...updates,
            segments: updates.segments?.map((s: any) => ({
              uuid: s.uuid,
              is_enabled: s.is_enabled,
            })),
          },
          currentState: {
            routesCount: get().routes.length,
            selectedRouteId: get().selectedRoute?.id,
            currentRouteSegments: get()
              .routes.find((r) => r.id === routeId)
              ?.segments?.map((s: any) => ({
                uuid: s.uuid,
                is_enabled: s.is_enabled,
              })),
            currentSelectedRouteSegments: get().selectedRoute?.segments?.map(
              (s: any) => ({
                uuid: s.uuid,
                is_enabled: s.is_enabled,
              }),
            ),
          },
        })
        set((state) => {
          const updatedRoutes = state.routes.map((route) => {
            if (route.id === routeId) {
              // Ensure nested arrays get new references
              const newRoute = { ...route }
              if (updates.segments) {
                newRoute.segments = [...updates.segments] // New array reference
              }
              if (updates.roads) {
                newRoute.roads = [...updates.roads] // New array reference
              }
              const result = { ...newRoute, ...updates }
              console.log("🔄 [updateRoute] Updated route:", {
                routeId: result.id,
                segments: result.segments?.map((s: any) => ({
                  uuid: s.uuid,
                  is_enabled: s.is_enabled,
                })),
                isNewReference: result !== route,
                segmentsIsNewReference: result.segments !== route.segments,
              })
              return result
            }
            return route
          })
          // Also update selectedRoute if it's the same route
          const updatedSelectedRoute =
            state.selectedRoute?.id === routeId
              ? (() => {
                  const newSelectedRoute = { ...state.selectedRoute }
                  if (updates.segments) {
                    newSelectedRoute.segments = [...updates.segments]
                  }
                  if (updates.roads) {
                    newSelectedRoute.roads = [...updates.roads]
                  }
                  const result = { ...newSelectedRoute, ...updates }
                  console.log("🔄 [updateRoute] Updated selectedRoute:", {
                    routeId: result.id,
                    segments: result.segments?.map((s: any) => ({
                      uuid: s.uuid,
                      is_enabled: s.is_enabled,
                    })),
                    isNewReference: result !== state.selectedRoute,
                    segmentsIsNewReference:
                      result.segments !== state.selectedRoute?.segments,
                  })
                  return result
                })()
              : state.selectedRoute
          return {
            routes: updatedRoutes,
            selectedRoute: updatedSelectedRoute,
          }
        })
      },

      removeRoute: (routeId) => {
        set((state) => ({
          routes: state.routes.filter((route) => route.id !== routeId),
          selectedRoute:
            state.selectedRoute?.id === routeId ? null : state.selectedRoute,
        }))
      },

      setSelectedRoute: (routeId) => {
        const route = routeId
          ? get().routes.find((r) => r.id === routeId) || null
          : null
        set({ selectedRoute: route })
      },

      selectRoute: (routeId) => {
        if (!routeId) {
          set({
            selectedRoute: null,
            routeSearchQuery: null, // Clear search query when route is deselected
            panels: {
              ...get().panels,
              right: { ...get().panels.right, visible: false },
            },
          })
          return
        }

        // Find route from metadata list - always get the latest from routes array
        // This ensures we get the most up-to-date status even if route was updated via WebSocket
        const routeMetadata = get().routes.find((r) => r.id === routeId)
        if (!routeMetadata) {
          console.warn("Route not found in metadata:", routeId)
          return
        }

        // Create a fresh copy to ensure React re-renders when status changes
        // Set the route from metadata (full data will be loaded by component using useRoute)
        set({
          selectedRoute: { ...routeMetadata },
          panels: {
            ...get().panels,
            right: { ...get().panels.right, visible: true },
          },
        })
      },

      clearRoutes: () => {
        set({
          routes: [],
          selectedRoute: null,
        })
      },

      loadRouteForEditing: (
        route: Route,
        loadRoutePoints: (route: Route) => void,
        setRouteUUID: (uuid: string | null) => void,
        clearPoints: () => void,
      ) => {
        // Import layer store to access routeGeneration state
        const { clearRouteGenerationKey } = useLayerStore.getState()

        // Clear any existing route UUID first to ensure clean state
        setRouteUUID(null)

        // Clear any existing points
        clearPoints()

        // Clear the last generated route key to force API call when route is loaded
        clearRouteGenerationKey()

        // Load the route points into the individual drawing state
        loadRoutePoints(route)

        // Set the route UUID so we update the existing route instead of creating new one
        setRouteUUID(route.id)

        // Switch to individual drawing mode (will only update if different)
        set({ mapMode: "individual_drawing" })
      },

      exitEditMode: () => {
        // Import layer store to access its actions
        const { clearPoints, setRouteUUID } = useLayerStore.getState()

        // Clear the individual route state
        clearPoints()
        setRouteUUID(null)

        // Clear search query when exiting edit mode
        set({ mapMode: "view", routeSearchQuery: null })
      },

      // Map Mode Management
      setMapMode: (mode) => {
        const currentMode = get().mapMode

        // Only proceed if mode actually changed
        if (currentMode !== mode) {
          // Check if we're in road_selection mode and have progress
          const {
            roadImport,
            clearRoadImport,
            clearAllDrawing,
            exitSelectionMode,
          } = useLayerStore.getState()

          const hasProgress =
            currentMode === "road_selection" &&
            roadImport &&
            (roadImport.panelRoutes.length > 0 ||
              (roadImport.lassoFilteredRoadIds &&
                roadImport.lassoFilteredRoadIds.length > 0))

          if (hasProgress) {
            // Set pending mode switch to trigger confirmation dialog
            useLayerStore.getState().setPendingModeSwitch({
              from: currentMode,
              to: mode,
            })
            return // Don't switch yet, wait for confirmation
          }

          // Check if there are unsaved uploaded routes
          const { uploadedRoutes } = useLayerStore.getState()
          // Don't check for unsaved changes when switching TO editing_uploaded_route (selecting a route)
          // This is expected behavior - selecting a route shouldn't trigger unsaved changes dialog
          const isSwitchingToEditingRoute = mode === "editing_uploaded_route"
          // IMPORTANT: Don't show dialog when switching from editing_uploaded_route to view
          // This happens when closing SelectedRoutePanel, which should always close silently
          const isClosingSelectedRoutePanel =
            currentMode === "editing_uploaded_route" && mode === "view"
          const hasUploadedRoutes =
            uploadedRoutes.routes.length > 0 &&
            // Only check if we're switching away from upload_routes or editing_uploaded_route modes
            // or to a mode that clears routes
            // But exclude cases where we're selecting a route (switching TO editing_uploaded_route)
            // And exclude cases where we're closing SelectedRoutePanel (editing_uploaded_route -> view)
            !isSwitchingToEditingRoute &&
            !isClosingSelectedRoutePanel &&
            (currentMode === "upload_routes" ||
              currentMode === "editing_uploaded_route" ||
              mode === "individual_drawing" ||
              mode === "polygon_drawing" ||
              mode === "lasso_selection")

          if (hasUploadedRoutes) {
            // Set pending mode switch to trigger confirmation dialog
            set({ pendingModeSwitch: { from: currentMode, to: mode } })
            return // Don't switch yet, wait for confirmation
          }

          // Check if there are unsaved drawn route points
          const { individualRoute, editingSavedRouteId, hasUnsavedChanges } =
            useLayerStore.getState()
          const hasUnsavedDrawnRoute =
            currentMode === "individual_drawing" &&
            individualRoute.points.length > 0 &&
            mode !== "individual_drawing"

          // Check if we're editing a saved route with unsaved changes
          const hasUnsavedSavedRouteChanges =
            currentMode === "individual_drawing" &&
            mode !== "individual_drawing" &&
            editingSavedRouteId !== null &&
            hasUnsavedChanges(editingSavedRouteId)

          if (hasUnsavedDrawnRoute || hasUnsavedSavedRouteChanges) {
            // Set pending mode switch to trigger confirmation dialog
            set({ pendingModeSwitch: { from: currentMode, to: mode } })
            return // Don't switch yet, wait for confirmation
          }

          // Check if there are unsaved polygon drawing points
          const { polygonDrawing } = useLayerStore.getState()
          const hasUnsavedPolygon =
            currentMode === "polygon_drawing" &&
            polygonDrawing.points.length > 0 &&
            mode !== "polygon_drawing"

          if (hasUnsavedPolygon) {
            // Set pending mode switch to trigger confirmation dialog
            set({ pendingModeSwitch: { from: currentMode, to: mode } })
            return // Don't switch yet, wait for confirmation
          }

          // Clear all drawing states when switching modes
          clearAllDrawing()

          // Only clear temporal history when switching between HIGH-LEVEL modes
          // (view, individual_drawing, road_selection, etc.)
          // Do NOT clear when switching selection modes WITHIN road_selection
          // (single/lasso/multi-select are sub-modes, not high-level modes)

          useLayerStore.temporal.getState().clear()

          // Clear road import state if exiting road_selection mode
          if (currentMode === "road_selection") {
            clearRoadImport()
          }

          // clearing the selected route when switching modes
          set({ selectedRoute: null })

          // clearing the selection when switching modes
          exitSelectionMode()

          set({ mapMode: mode })
        }
      },

      setPendingModeSwitch: (pending) => {
        set({ pendingModeSwitch: pending })
      },

      setPendingUploadClear: (pending) => {
        set({ pendingUploadClear: pending })
      },

      setPendingRouteSelection: (routeId: string | null) => {
        set({ pendingRouteSelection: routeId })
      },

      setMapType: (type) => {
        set({ mapType: type })
      },

      toggleMapType: () => {
        set((state) => ({
          mapType: state.mapType === "roadmap" ? "hybrid" : "roadmap",
        }))
      },

      // Panel Management
      toggleLeftPanel: () => {
        set((state) => ({
          panels: {
            ...state.panels,
            left: { ...state.panels.left, visible: !state.panels.left.visible },
          },
        }))
      },

      toggleRightPanel: () => {
        set((state) => ({
          panels: {
            ...state.panels,
            right: {
              ...state.panels.right,
              visible: !state.panels.right.visible,
            },
          },
        }))
      },

      setLeftPanelCollapsed: (collapsed) => {
        set((state) => ({
          panels: {
            ...state.panels,
            left: { ...state.panels.left, collapsed },
          },
        }))
      },

      setLeftPanelExpanded: (expanded) => {
        set({ leftPanelExpanded: expanded })
      },

      setLeftPanelVisible: (visible) => {
        set((state) => ({
          panels: {
            ...state.panels,
            left: { ...state.panels.left, visible },
          },
        }))
      },

      setRightPanelVisible: (visible) => {
        set((state) => ({
          panels: {
            ...state.panels,
            right: { ...state.panels.right, visible },
          },
        }))
      },

      setShowSelectedRouteSegments: (show) => {
        set({ showSelectedRouteSegments: show })
      },

      setCurrentFolder: (folder) => {
        set({ currentFolder: folder })
      },

      scrollToRoute: (routeId) => {
        set({ routeToScrollTo: routeId })
      },

      setRouteSearchQuery: (query) => {
        set({ routeSearchQuery: query })
      },

      setTargetRouteId: (routeId) => {
        set({ targetRouteId: routeId })
      },

      setIsSelectingRoute: (isSelecting) => {
        set({ isSelectingRoute: isSelecting })
      },

      setActivePanel: (panel) => {
        set({ activePanel: panel })
      },

      setSelectedRoutePanelVisible: (visible) => {
        set({ selectedRoutePanelVisible: visible })
      },

      setRoadPriorityPanelOpen: (open) => {
        set({ roadPriorityPanelOpen: open })
      },

      setPriorityFilterPanelExpanded: (expanded) => {
        set({ priorityFilterPanelExpanded: expanded })
      },

      setRouteNamingDialogOpen: (open) => {
        set({ routeNamingDialogOpen: open })
      },

      setPendingFile: (file) => {
        set({ pendingFile: file })
      },

      setPendingFeatureCount: (count) => {
        set({ pendingFeatureCount: count })
      },

      setPendingProperties: (properties) => {
        set({ pendingProperties: properties })
      },

      setShowIndividualMarkers: (show) => {
        set({ showIndividualMarkers: show })
      },
      setDynamicIslandHeight: (height) => {
        set({ dynamicIslandHeight: height })
      },
      setRightPanelType: (type) => {
        set({ rightPanelType: type })
      },

      // Viewport Management
      saveViewport: (viewport) => {
        set({ viewport })
      },

      restoreViewport: () => {
        // No-op for now - viewport will be managed by the map component
      },

      // Reset
      reset: () => {
        set({
          projectId: null,
          projectData: null,
          projectName: null,
          routes: [],
          selectedRoute: null,
          mapMode: "view",
          panels: {
            left: { visible: true, collapsed: false },
            right: { visible: false },
          },
          viewport: null,
          showSelectedRouteSegments: false,
          showIndividualMarkers: true,
          dynamicIslandHeight: 0,
        })
      },
    }),
    {
      name: "project-workspace-store",
      partialize: (state) => ({
        // Only persist UI state, not project data
        panels: state.panels,
        viewport: state.viewport,
      }),
    },
  ),
)

// Add AFTER the last closing parenthesis, at the very end
// if (typeof window !== "undefined") {
//   ;(window as any).debugWorkspaceStore = useProjectWorkspaceStore
// }
