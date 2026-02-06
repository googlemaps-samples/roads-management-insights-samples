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

import { TerraDraw } from "terra-draw"

import { RoadPriority } from "../../constants/road-priorities"
import { ImportedRoadsCollection } from "../../types/imported-road"
import { CutPoint, Road, SegmentationSnapshot } from "../../types/route"
import { Road as ProjectRoad, Route } from "../project-workspace-store"

export interface RoutePoint {
  id: string
  coordinates: { lat: number; lng: number }
}

export interface IndividualRouteState {
  points: RoutePoint[]
  isGenerating: boolean
  generatedRoute: Route | null
  currentRouteId: string | null
  routeUUID: string | null
  originalRouteName: string | null
  originalRouteTag: string | null
  originalRouteIsSegmented: boolean
  validationError: string | null
}

export interface PolygonDrawingState {
  isDrawing: boolean
  points: [number, number][]
  completedPolygon: GeoJSON.Polygon | null
  selectedRoads: ProjectRoad[] // For "lasso_selection" mode
  confirmed: boolean // Whether user has confirmed the polygon (clicked Done)
}

export interface SegmentationState {
  targetRoute: Route | null
  cutPoints: CutPoint[]
  type: "distance" | "manual" | "intersections"
  distanceKm?: number
  isActive: boolean
  previewSegments: Road[]
  selectedSegmentIds: Set<string>
  hoveredSegmentId: string | null
  isCalculating: boolean
  error?: string
  snapToRoute: boolean
  snapPrecision: number
  isDragging: boolean
  dragStartPosition?: { lat: number; lng: number }
  snapshots: SegmentationSnapshot[]
  calculatedRouteLengthKm?: number // Calculated from decoded polyline coordinates
  calculatedDistanceKm?: number // Last distanceKm that was successfully calculated
}

export interface DeckGLLayer {
  id: string
  layer: any
  visible: boolean
}

export interface RouteGenerationState {
  isGenerating: boolean
  lastGeneratedRouteKey: string
  routeUUID: string | null
}

export interface RoadsNetworkState {
  roads: ProjectRoad[]
  isLoading: boolean
  error?: string
}

export interface RoadSelectionState {
  mode: "none" | "stretch" | "multi-select"
  selectedRoadIds: number[]
  highlightedRoads: ProjectRoad[]
  validationStatus: "idle" | "validating" | "valid" | "invalid"
  validationResult: any | null
  isValidating: boolean
  error: string | null
  isPreview: boolean
}

export interface UploadedRoute {
  id: string
  name: string
  type: "geojson" | "polyline"
  data: GeoJSON.Feature | GeoJSON.FeatureCollection
  color?: [number, number, number, number]
  uploadedAt: Date
  originalRouteId?: string
}

export interface UploadedRoutesState {
  routes: UploadedRoute[]
  isVisible: boolean
  focusRouteIds: string[]
}

export interface SnappedRoad {
  id: string
  uploadedRouteId: string
  feature: GeoJSON.Feature
}

export interface Waypoint {
  id: string
  position: { lat: number; lng: number }
  order: number
}

export interface RouteMarkers {
  routeId: string
  startMarker: { lat: number; lng: number }
  endMarker: { lat: number; lng: number }
  waypoints: Waypoint[]
}

export interface RouteEditingState {
  routeId: string
  temporaryMarkers: RouteMarkers
  originalMarkers: RouteMarkers // Store original markers to restore on discard
}

export interface SnappedRoadsState {
  roads: SnappedRoad[]
  isVisible: boolean
  isLoading: boolean
  // Markers for each route (multiple routes can have markers simultaneously)
  routeMarkers: RouteMarkers[]
  isDraggingMarker: boolean
  hoveredRouteId: string | null // Route ID being hovered in the panel
  // Preview roads for temporary editing (not saved yet)
  previewRoads: SnappedRoad[] // Temporary preview routes for routes being edited
  // Editing state for routes being edited (temporary markers before saving)
  editingStates: Record<string, RouteEditingState> // Keyed by routeId
}

export interface PanelRoute {
  id: string // Temporary UUID
  name: string // Editable, extracted from road name property
  roadIds: string[] // Which roads are part of this route
  geometry: GeoJSON.LineString // Combined geometry
  priority?: string
  distance: number // km
}

export interface RoadImportState {
  // Imported data from API (unified type)
  importedRoads: ImportedRoadsCollection | null
  importedPolygon: GeoJSON.Polygon | null

  // Selection state - selected roads are immediately added to panel (orange)
  panelRoutes: PanelRoute[] // Orange - selected and in panel

  // Hover state (purple)
  hoveredRoadId: string | null

  // Selection mode within road_selection
  selectionMode: "single" | "lasso" | "multi-select" | null

  // Mode switching confirmation
  pendingModeSwitch: {
    from: string
    to: string
    returnToMode?: string
  } | null

  // Lasso mode temporary state
  lassoFilteredRoadIds: string[] | null // Roads inside lasso polygon (green temp)
  lassoSelectedPriorities: string[] | null // Selected priorities for filtering

  // Multi-select mode temporary state
  multiSelectTempSelection: string[] // Roads in temporary selection (highlighted but not in panel)
  multiSelectValidationResult: any | null // Continuity validation result
  multiSelectValidating: boolean // Validation loading state

  // Multi-select continuous path state
  routeInMaking: ImportedRoadsCollection["features"][0] | null // Current continuous route being built
  routeInMakingRoadIds: string[] // Ordered array of road IDs in routeInMaking
}

export interface LayerStore {
  layerVisibility: Record<string, boolean>
  layerOrder: string[]
  individualRoute: IndividualRouteState
  polygonDrawing: PolygonDrawingState
  lassoDrawing: PolygonDrawingState
  segmentation: SegmentationState
  roadsNetwork: RoadsNetworkState
  roadSelection: RoadSelectionState
  roadImport: RoadImportState
  uploadedRoutes: UploadedRoutesState
  snappedRoads: SnappedRoadsState
  selectedUploadedRouteId: string | null
  isAddingWaypoint: boolean
  waypointAddingRouteId: string | null
  isAddingIndividualWaypoint: boolean
  setAddingIndividualWaypointMode: (isAdding: boolean) => void
  cancelAddingIndividualWaypoint: () => void
  selectedRouteHoveredSegmentId: string | null
  selectedRouteHovered: boolean
  selectedRoadPriorities: RoadPriority[]
  setSelectedRoadPriorities: (priorities: RoadPriority[]) => void
  toggleRoadPriorityFilter: (priority: RoadPriority) => void
  resetRoadPriorityFilters: () => void
  hoveredFeature: {
    layerId: string
    polyline: number[][] | null
    geometry: any
  } | null
  markerDragEndTime: number
  routeGeneration: RouteGenerationState
  savedPolygons: any[]
  roadsTilesTimestamp: number
  routesTilesTimestamp: number
  refreshRoutesTilesTimestamp: () => void
  refreshRoadsTilesTimestamp: () => void
  routesTileCache: Map<string, GeoJSON.FeatureCollection>
  refreshTrigger: number
  setRefreshTrigger: () => void
  updateRouteTilesFromWebSocket: (routeId: string) => void
  currentZoom: number | undefined
  showTileLayerArrows: boolean
  setCurrentZoom: (zoom: number | undefined) => void
  drawingCompletionMenuPosition: { lat: number; lng: number } | null
  showDrawingCompletionMenu: (lat: number, lng: number) => void
  hideDrawingCompletionMenu: () => void
  terraDrawUndo?: () => void
  terraDrawRedo?: () => void
  terraDrawFinish?: () => void
  terraDrawInstance: TerraDraw | null
  setTerraDrawInstance: (instance: TerraDraw | null) => void
  addPoint: (point: RoutePoint) => void
  movePoint: (
    pointId: string,
    coordinates: { lat: number; lng: number },
  ) => void
  removePoint: (pointId: string) => void
  reorderPoints: (activeId: string, overId: string) => void
  swapStartEnd: () => void
  clearPoints: () => void
  setGenerating: (isGenerating: boolean) => void
  setGeneratedRoute: (route: Route | null) => void
  setCurrentRouteId: (routeId: string | null) => void
  setRouteUUID: (uuid: string | null) => void
  setIndividualRouteError: (error: string | null) => void
  loadRoutePoints: (route: Route) => void
  clearRouteGenerationKey: () => void
  generateRoute: (params: {
    points: RoutePoint[]
    projectId: string
    generateRouteMutation: any
    saveRouteMutation: any
    setGenerating: (isGenerating: boolean) => void
    setGeneratedRoute: (route: Route | null) => void
    setRouteUUID: (uuid: string | null) => void
  }) => void
  startPolygonDrawing: () => void
  addPolygonPoint: (point: [number, number]) => void
  completePolygon: () => void
  clearPolygon: () => void
  finishPolygonDrawing: () => void
  isPolygonComplete: () => boolean
  syncPolygonPointsFromTerraDraw: (points: [number, number][]) => void
  isNearStartPoint: boolean
  setIsNearStartPoint: (isNear: boolean) => void
  startSegmentation: (
    route: Route,
    type: "distance" | "manual" | "intersections",
  ) => void
  addCutPoint: (point: CutPoint) => void
  removeCutPoint: (pointId: string) => void
  updateCutPoint: (
    pointId: string,
    coordinates: { lat: number; lng: number },
  ) => void
  clearCutPoints: () => void
  stopSegmentation: () => void
  setDistanceKm: (distanceKm: number) => void
  calculatePreviewSegments: () => void
  clearPreviewSegments: () => void
  toggleSegmentSelection: (segmentId: string) => void
  selectAllSegments: () => void
  deselectAllSegments: () => void
  setHoveredSegmentId: (segmentId: string | null) => void
  setSelectedRouteHoveredSegmentId: (segmentId: string | null) => void
  setSelectedRouteHovered: (hovered: boolean) => void
  setHoveredFeature: (
    feature: {
      layerId: string
      polyline: number[][] | null
      geometry: any
    } | null,
  ) => void
  setMarkerDragEndTime: (time: number) => void
  applySegmentation: (segmentationData: {
    type: "manual" | "distance" | "intersections"
    cutPoints?: number[][]
    distanceKm?: number
    segments: any[]
  }) => Promise<void>
  fetchIntersectionsAndCreateSegments: () => Promise<void>
  switchToManualMode: () => void
  switchToDistanceMode: () => void
  setSnapToRoute: (enabled: boolean) => void
  setSnapPrecision: (precision: number) => void
  startDragging: (
    pointId: string,
    position: { lat: number; lng: number },
  ) => void
  updateDragging: (
    pointId: string,
    position: { lat: number; lng: number },
  ) => void
  endDragging: (pointId: string, position: { lat: number; lng: number }) => void
  createSnapshot: (description?: string) => void
  restoreSnapshot: (snapshotId: string) => void
  getSnapshots: () => SegmentationSnapshot[]
  loadExistingCutPoints: (cutPointsData: {
    cutPoints: Array<{ id: string; coordinates: { lat: number; lng: number } }>
    segmentationType: "manual" | "distance" | "intersections"
    distanceKm?: number
  }) => void
  setRoadsNetwork: (roads: ProjectRoad[]) => void
  setRoadsLoading: (isLoading: boolean) => void
  setRoadsError: (error: string | undefined) => void
  clearRoadsNetwork: () => void
  startStretchMode: (
    roads: ProjectRoad[],
    options?: {
      isPreview?: boolean
    },
  ) => void
  startMultiSelectMode: (initialRoad: ProjectRoad) => void
  addRoadToSelection: (road: ProjectRoad) => void
  removeRoadFromSelection: (roadId: number) => void
  clearRoadSelection: () => void
  setValidationResult: (result: any) => void
  setValidationStatus: (
    status: "idle" | "validating" | "valid" | "invalid",
  ) => void
  setIsValidating: (isValidating: boolean) => void
  setRoadSelectionError: (error: string | null) => void
  exitSelectionMode: () => void
  addUploadedRoute: (route: UploadedRoute) => void
  updateUploadedRoute: (
    routeId: string,
    updates: Partial<UploadedRoute>,
  ) => void
  removeUploadedRoute: (routeId: string) => void
  clearUploadedRoutes: () => void
  setUploadedRoutesVisibility: (visible: boolean) => void
  focusOnUploadedRoutes: (routeIds: string[]) => void
  clearUploadedRouteFocus: () => void
  addSnappedRoads: (uploadedRouteId: string, roads: GeoJSON.Feature[]) => void
  removeSnappedRoadsForRoute: (uploadedRouteId: string) => void
  clearSnappedRoads: () => void
  addPreviewRoads: (uploadedRouteId: string, roads: GeoJSON.Feature[]) => void
  removePreviewRoadsForRoute: (uploadedRouteId: string) => void
  setSnappedRoadsVisibility: (visible: boolean) => void
  setSnappedRoadsLoading: (isLoading: boolean) => void
  setOptimizedRouteMarkers: (
    routeId: string,
    startMarker: { lat: number; lng: number },
    endMarker: { lat: number; lng: number },
  ) => void
  updateOptimizedRouteMarker: (
    routeId: string,
    type: "start" | "end",
    position: { lat: number; lng: number },
  ) => void
  removeOptimizedRouteMarkers: (routeId: string) => void
  clearAllOptimizedRouteMarkers: () => void
  setDraggingMarker: (isDragging: boolean) => void
  setHoveredRouteId: (routeId: string | null) => void
  setSelectedUploadedRouteId: (routeId: string | null) => void
  addWaypoint: (routeId: string, position: { lat: number; lng: number }) => void
  removeWaypoint: (routeId: string, waypointId: string) => void
  updateWaypoint: (
    routeId: string,
    waypointId: string,
    position: { lat: number; lng: number },
  ) => void
  moveWaypointUp: (routeId: string, waypointId: string) => void
  moveWaypointDown: (routeId: string, waypointId: string) => void
  moveOriginDown: (routeId: string) => void
  moveDestinationUp: (routeId: string) => void
  setAddingWaypointMode: (routeId: string | null) => void
  cancelAddingWaypoint: () => void
  swapRouteStartEnd: (routeId: string) => void
  hasUnsavedChanges: (routeId: string) => boolean
  initializeRouteEditing: (routeId: string) => void
  getEditingState: (routeId: string) => RouteEditingState | null
  saveRouteChanges: (routeId: string) => void
  discardRouteChanges: (routeId: string) => void
  editingSavedRouteId: string | null
  setEditingSavedRouteId: (routeId: string | null) => void
  clearIndividualRoute: () => void
  clearPolygonDrawing: () => void
  startLassoDrawing: () => void
  setLassoPoints: (points: [number, number][]) => void
  finishLassoDrawing: () => void
  setLassoSelectedRoads: (roads: ProjectRoad[]) => void
  confirmLassoDrawing: () => void
  clearLassoDrawing: () => void
  isLassoComplete: () => boolean
  clearSegmentation: () => void
  clearAllDrawing: () => void
  setImportedRoads: (
    featureCollection: ImportedRoadsCollection,
    polygon: GeoJSON.Polygon,
  ) => void
  toggleSelectedRoad: (roadId: string) => void // Toggle selection - immediately adds/removes from panel
  removeRouteFromPanel: (routeId: string, isPureImportedRoad?: boolean) => void
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
  toggleLayerVisibility: (layerId: string) => void
  setLayerVisibility: (layerId: string, visible: boolean) => void
  moveLayerUp: (layerId: string) => void
  moveLayerDown: (layerId: string) => void
  reorderLayers: (layerIds: string[]) => void
}
