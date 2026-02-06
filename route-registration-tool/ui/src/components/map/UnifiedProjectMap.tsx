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

// ui/src/components/map/UnifiedProjectMap.tsx
import { GoogleMapsOverlay } from "@deck.gl/google-maps"
import { useQuery } from "@tanstack/react-query"
import {
  APIProvider,
  Map,
  RenderingType,
  useMap,
} from "@vis.gl/react-google-maps"
import React, { useCallback, useEffect, useRef, useState } from "react"

import { MapNavigationSetter } from "../../contexts/map-navigation-context"
import { routesApi } from "../../data/api"
import {
  // useApplySegmentation,
  queryKeys,
  useFileUploadHandlers,
  useLayerManagement,
  useRouteGeneration,
  useStretchRoad,
} from "../../hooks"
import { useDeckLayers } from "../../hooks/use-deck-layers"
import { usePolygonHandlers } from "../../hooks/use-polygon-handlers"
import { useMapEvents } from "../../hooks/useMapEvents"
import { Route, useLayerStore, useProjectWorkspaceStore } from "../../stores"
import { PanelRoute } from "../../stores/layer-store/types"
import { ImportedRoadFeature } from "../../types/imported-road"
import { calculateGeoJsonBounds } from "../../utils/geojson-bounds"
import { getRouteEndpoints } from "../../utils/multi-select-route"
import { generateStretchRouteName } from "../../utils/route-naming"
import { toast } from "../../utils/toast"
import ModeSwitchDialog from "../common/ModeSwitchDialog"
import UnsavedRoutesDialog from "../common/UnsavedRoutesDialog"
import {
  IndividualDrawingMarkers,
  OptimizedRouteMarkers,
  SearchMarker,
  SegmentationMarkers,
} from "../markers"
import LassoSelectionPanel from "../project-workspace/LassoSelectionPanel"
import LegendsPanel from "../project-workspace/LegendsPanel"
import RoadSelectionPanel from "../project-workspace/RoadSelectionPanel"
import { MapInstanceExposer } from "./MapInstanceExposer"
import TerraDrawWrapper from "./TerraDrawWrapper"
import {
  DrawingCompletionMenu,
  FeatureSelectionMenu,
  PolygonContextMenu,
  RoadContextMenu,
  RouteContextMenu,
  SegmentContextMenu,
  useContextMenu,
} from "./context-menu"
import PriorityFilterPanel from "./controls/PriorityFilterPanel"
import SelectionToolbar from "./controls/SelectionToolbar"
import { DeckGLOverlay, RouteLoadingIndicator } from "./overlays"

interface UnifiedProjectMapProps {
  projectId: string
  apiKey: string
  mapId?: string
  style?: React.CSSProperties
  className?: string
}

// Component that loads route data (using regular query for better error handling)
// This is needed when routes are selected from the panel (not from map tiles)
const RouteDataLoader: React.FC<{
  routeId: string
  onRouteLoaded: (route: Route) => void
}> = ({ routeId, onRouteLoaded }) => {
  const { data: fullRoute, error } = useQuery({
    queryKey: queryKeys.route(routeId),
    queryFn: async () => {
      const response = await routesApi.getById(routeId)
      // Handle "Route not found" case gracefully
      if (!response.success && response.message === "Route not found") {
        console.warn("Route not found:", routeId)
        return null
      }
      if (!response.success) {
        throw new Error(response.message)
      }
      if (!response.data) {
        throw new Error("Route data is null")
      }
      return response.data
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: false, // Don't retry on 404 errors
  })

  // Handle errors (log but don't crash)
  React.useEffect(() => {
    if (error) {
      console.error("Error loading route:", routeId, error)
      // Don't throw - let the component handle the missing route gracefully
    }
  }, [error, routeId])

  // Update state when route is loaded (only if route exists)
  React.useEffect(() => {
    if (fullRoute) {
      onRouteLoaded(fullRoute)
    }
  }, [fullRoute, onRouteLoaded])

  return null // This component doesn't render anything
}

// Component to handle map type changes
const MapTypeController: React.FC = () => {
  const map = useMap()
  const mapType = useProjectWorkspaceStore((state) => state.mapType)

  useEffect(() => {
    if (!map) return

    // Change map type using Google Maps API
    try {
      const googleMap = map as unknown as google.maps.Map
      if (googleMap && typeof googleMap.setMapTypeId === "function") {
        googleMap.setMapTypeId(mapType as google.maps.MapTypeId)
      }
    } catch (error) {
      console.warn("Failed to set map type:", error)
    }
  }, [map, mapType])

  return null
}

// Component to handle focusing on uploaded routes
const MapFocusController: React.FC = () => {
  const map = useMap()
  const uploadedRoutes = useLayerStore((state) => state.uploadedRoutes)
  const snappedRoads = useLayerStore((state) => state.snappedRoads)
  const clearUploadedRouteFocus = useLayerStore(
    (state) => state.clearUploadedRouteFocus,
  )

  useEffect(() => {
    if (!map || uploadedRoutes.focusRouteIds.length === 0) return

    console.log("🎯 Focusing on uploaded routes:", uploadedRoutes.focusRouteIds)

    // Find all routes to focus on
    const routesToFocus = uploadedRoutes.routes.filter((r) =>
      uploadedRoutes.focusRouteIds.includes(r.id),
    )

    if (routesToFocus.length === 0) {
      console.warn(
        "No routes found for focusing:",
        uploadedRoutes.focusRouteIds,
      )
      clearUploadedRouteFocus()
      return
    }

    // Combine all features from all routes into a single FeatureCollection
    const allFeatures: GeoJSON.Feature[] = []

    // Add uploaded route features
    routesToFocus.forEach((route) => {
      if (route.data.type === "FeatureCollection") {
        allFeatures.push(...route.data.features)
      } else {
        // Single feature, add it directly
        allFeatures.push(route.data as GeoJSON.Feature)
      }
    })

    // Add optimized/snapped road features for the focused routes
    uploadedRoutes.focusRouteIds.forEach((routeId) => {
      const optimizedRoads = snappedRoads.roads.filter(
        (road) => road.uploadedRouteId === routeId,
      )
      optimizedRoads.forEach((road) => {
        allFeatures.push(road.feature)
      })
    })

    const combinedFeatureCollection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: allFeatures,
    }

    const bounds = calculateGeoJsonBounds(combinedFeatureCollection)

    if (!bounds) {
      console.warn(
        "Could not calculate bounds for routes:",
        uploadedRoutes.focusRouteIds,
      )
      clearUploadedRouteFocus()
      return
    }

    const [minLng, minLat, maxLng, maxLat] = bounds

    // Create Google Maps LatLngBounds
    const googleBounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(minLat, minLng),
      new google.maps.LatLng(maxLat, maxLng),
    )

    // Fit bounds with padding
    map.fitBounds(googleBounds, {
      top: 100,
      right: 100,
      bottom: 100,
      left: 100,
    })

    console.log("✅ Map focused on uploaded routes and optimized roads")

    // Clear the focus trigger after a short delay
    setTimeout(() => {
      clearUploadedRouteFocus()
    }, 500)
  }, [
    map,
    uploadedRoutes.focusRouteIds,
    uploadedRoutes.routes,
    snappedRoads.roads,
    clearUploadedRouteFocus,
  ])

  return null
}

// Component to provide zoom level getter for context menu and update store
const ZoomGetter: React.FC<{
  onZoomGetterReady: (getter: () => number | undefined) => void
}> = ({ onZoomGetterReady }) => {
  const map = useMap("main-map")
  const setCurrentZoom = useLayerStore((state) => state.setCurrentZoom)

  useEffect(() => {
    if (map) {
      const getZoom = () => {
        try {
          return map.getZoom()
        } catch {
          return undefined
        }
      }
      onZoomGetterReady(getZoom)

      // Update store when zoom changes
      const updateZoom = () => {
        const zoom = getZoom()
        setCurrentZoom(zoom)
      }

      // Set initial zoom
      updateZoom()

      // Listen to zoom changes
      const listener = map.addListener("zoom_changed", updateZoom)

      return () => {
        if (listener) {
          google.maps.event.removeListener(listener)
        }
      }
    }
  }, [map, onZoomGetterReady, setCurrentZoom])

  return null
}

// Component to render DrawingCompletionMenu at the correct screen position
const DrawingCompletionMenuRenderer: React.FC = () => {
  const map = useMap("main-map")
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const setMapMode = useProjectWorkspaceStore((state) => state.setMapMode)
  const drawingCompletionMenuPosition = useLayerStore(
    (state) => state.drawingCompletionMenuPosition,
  )
  const hideDrawingCompletionMenu = useLayerStore(
    (state) => state.hideDrawingCompletionMenu,
  )
  const clearAllDrawing = useLayerStore((state) => state.clearAllDrawing)
  const confirmLassoDrawing = useLayerStore(
    (state) => state.confirmLassoDrawing,
  )
  const { handleLassoDone, handlePolygonDone, isIngesting } =
    usePolygonHandlers()
  const clearLassoFilteredRoads = useLayerStore(
    (state) => state.clearLassoFilteredRoads,
  )

  // Get polygon points from store
  const polygonDrawing = useLayerStore((state) => state.polygonDrawing)
  const lassoDrawing = useLayerStore((state) => state.lassoDrawing)

  // Get points based on mode
  const polygonPoints =
    mapMode === "polygon_drawing" ? polygonDrawing.points : lassoDrawing.points

  const [screenPosition, setScreenPosition] = useState<{
    x: number
    y: number
  } | null>(null)
  const overlayRef = useRef<google.maps.OverlayView | null>(null)

  // Local state to track when polygon processing starts (before API call begins)
  const [isProcessingPolygon, setIsProcessingPolygon] = useState(false)

  useEffect(() => {
    if (map && drawingCompletionMenuPosition && polygonPoints.length > 0) {
      try {
        const googleMap = map as unknown as google.maps.Map

        // Create overlay only if it doesn't exist
        if (!overlayRef.current) {
          const overlay = new google.maps.OverlayView()
          overlay.onAdd = function () {}
          overlay.draw = function () {
            const proj = this.getProjection()
            if (
              proj &&
              drawingCompletionMenuPosition &&
              polygonPoints.length > 0
            ) {
              // Convert all polygon points to screen coordinates
              const screenPoints = polygonPoints
                .map((point) => {
                  const [lng, lat] = point
                  const latLng = new google.maps.LatLng(lat, lng)
                  const pixel = proj.fromLatLngToContainerPixel(latLng)
                  return pixel ? { x: pixel.x, y: pixel.y, lat, lng } : null
                })
                .filter(
                  (
                    p,
                  ): p is { x: number; y: number; lat: number; lng: number } =>
                    p !== null,
                )

              if (screenPoints.length === 0) {
                // Fallback to original position
                const latLng = new google.maps.LatLng(
                  drawingCompletionMenuPosition.lat,
                  drawingCompletionMenuPosition.lng,
                )
                const pixel = proj.fromLatLngToContainerPixel(latLng)
                if (pixel) {
                  const mapDiv = googleMap.getDiv()
                  const bounds = mapDiv.getBoundingClientRect()
                  setScreenPosition({
                    x: pixel.x + bounds.left,
                    y: pixel.y + bounds.top,
                  })
                }
                return
              }

              // Get map container bounds to determine screen center
              const mapDiv = googleMap.getDiv()
              const mapBounds = mapDiv.getBoundingClientRect()
              const screenCenterX = mapBounds.width / 2

              // Calculate average x position to determine which side polygon is on
              const avgX =
                screenPoints.reduce((sum, p) => sum + p.x, 0) /
                screenPoints.length
              const isOnRightSide = avgX > screenCenterX

              // Choose appropriate point: right side -> leftmost, left side -> rightmost
              const targetPoint = isOnRightSide
                ? screenPoints.reduce(
                    (min, p) => (p.x < min.x ? p : min),
                    screenPoints[0],
                  )
                : screenPoints.reduce(
                    (max, p) => (p.x > max.x ? p : max),
                    screenPoints[0],
                  )

              // Convert back to screen position with map container offset
              setScreenPosition({
                x: targetPoint.x + mapBounds.left,
                y: targetPoint.y + mapBounds.top,
              })
            }
          }
          overlay.setMap(googleMap)
          overlayRef.current = overlay
        } else {
          // Trigger redraw on existing overlay
          overlayRef.current.draw()
        }

        return () => {
          if (overlayRef.current) {
            try {
              overlayRef.current.setMap(null)
            } catch (e) {
              // Ignore errors during cleanup
            }
            overlayRef.current = null
          }
        }
      } catch (error) {
        console.error("Failed to convert lat/lng to screen position:", error)
      }
    } else {
      setScreenPosition(null)
      // Clean up overlay when menu is hidden
      if (overlayRef.current) {
        try {
          overlayRef.current.setMap(null)
        } catch (e) {
          // Ignore errors during cleanup
        }
        overlayRef.current = null
      }
    }
  }, [map, drawingCompletionMenuPosition, polygonPoints, mapMode])

  const handleContinue = async () => {
    // For road_selection mode with lasso, handle directly
    if (mapMode === "road_selection") {
      // Confirm the lasso drawing first (this enables the API call)
      confirmLassoDrawing()
      handleLassoDone()
      hideDrawingCompletionMenu()
    } else if (mapMode === "polygon_drawing") {
      // Fix Bug 1 & 2: Set processing state immediately and await the async call
      console.log(
        "🔍 handleContinue: polygon_drawing mode, calling handlePolygonDone",
      )
      setIsProcessingPolygon(true)
      try {
        await handlePolygonDone() // Await to ensure it completes
        console.log("✅ handlePolygonDone completed successfully")
        // Note: isProcessingPolygon will be reset when isIngesting becomes false
        // (handled in useEffect below)
      } catch (error) {
        console.error("❌ Failed to process polygon:", error)
        setIsProcessingPolygon(false) // Reset on error
        // Menu will stay open, user can retry
      }
      // Menu will close when API completes (handled in handlePriorityConfirm)
    } else {
      // For lasso_selection mode, confirm lasso if in lasso mode
      const isLassoMode = mapMode === "lasso_selection"
      if (isLassoMode) {
        confirmLassoDrawing()
      }
      // Dispatch custom event that MapControls will listen to
      window.dispatchEvent(new CustomEvent("complete-lasso-selection"))
    }
  }

  const handleCancel = () => {
    clearAllDrawing()
    hideDrawingCompletionMenu()
    clearLassoFilteredRoads()
    if (mapMode !== "road_selection") {
      setMapMode("view")
    }
  }

  const handleRetry = () => {
    clearAllDrawing() // Clear the drawing
    hideDrawingCompletionMenu() // Hide the menu
    // DON'T change mapMode - stay in drawing mode
  }

  // Combine isIngesting and isProcessingPolygon to show loading state
  const isLoading = isIngesting || isProcessingPolygon

  // Reset processing state when API completes or menu closes
  // IMPORTANT: This useEffect must be BEFORE the early return to follow Rules of Hooks
  useEffect(() => {
    if (isProcessingPolygon) {
      // If menu is closed, reset processing state
      if (!drawingCompletionMenuPosition) {
        setIsProcessingPolygon(false)
      }
      // If API completed (isIngesting was true, now false), reset after a short delay
      // to allow menu close animation
      else if (!isIngesting) {
        // Check if we were ingesting before (API just completed)
        const timer = setTimeout(() => {
          setIsProcessingPolygon(false)
        }, 100)
        return () => clearTimeout(timer)
      }
    }
  }, [isIngesting, isProcessingPolygon, drawingCompletionMenuPosition])

  if (!drawingCompletionMenuPosition || !screenPosition) {
    return null
  }

  return (
    <DrawingCompletionMenu
      x={screenPosition.x}
      y={screenPosition.y}
      mode={
        mapMode === "polygon_drawing" ? "polygon_drawing" : "lasso_selection"
      }
      onContinue={handleContinue}
      onCancel={handleCancel}
      onRetry={handleRetry}
      onClose={hideDrawingCompletionMenu}
      isIngesting={isLoading}
    />
  )
}

// Main Map Component
const UnifiedProjectMap: React.FC<UnifiedProjectMapProps> = ({
  projectId,
  apiKey,
  mapId = "73a66895f21ab8d1af4c7933",
  className,
  style,
}) => {
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const routes = useProjectWorkspaceStore((state) => state.routes)
  const projectData = useProjectWorkspaceStore((state) => state.projectData)
  const pendingModeSwitch = useProjectWorkspaceStore(
    (state) => state.pendingModeSwitch,
  )
  const pendingUploadClear = useProjectWorkspaceStore(
    (state) => state.pendingUploadClear,
  )
  const { handleClearUploadedRoutesAndUpload } = useFileUploadHandlers()
  const roadImport = useLayerStore((state) => state.roadImport)
  const uploadedRoutes = useLayerStore((state) => state.uploadedRoutes)
  const individualRoute = useLayerStore((state) => state.individualRoute)
  const polygonDrawing = useLayerStore((state) => state.polygonDrawing)
  const toggleSelectedRoad = useLayerStore((state) => state.toggleSelectedRoad)
  const initializeRouteInMaking = useLayerStore(
    (state) => state.initializeRouteInMaking,
  )
  const selectedRoadPriorities = useLayerStore(
    (state) => state.selectedRoadPriorities,
  )
  const stretchRoadMutation = useStretchRoad()

  // Handler for stretching a road
  const handleStretchRoad = useCallback(
    async (roadId: string) => {
      if (!projectId) {
        toast.error("Project ID not available")
        return
      }

      // Get selected road priorities from store
      const priorityList =
        selectedRoadPriorities.length > 0 ? selectedRoadPriorities : []

      if (priorityList.length === 0) {
        toast.error("Please select at least one road priority")
        return
      }

      try {
        const roadIdNum = parseInt(roadId)
        if (isNaN(roadIdNum)) {
          toast.error("Invalid road ID")
          return
        }

        const result = await stretchRoadMutation.mutateAsync({
          roadId: roadIdNum,
          projectId,
          priorityList,
        })

        // Convert stretched roads to PanelRoute format
        const stretchedRoads = result.stretched_roads || []
        if (stretchedRoads.length === 0) {
          toast.error("No stretched roads returned")
          return
        }

        // Combine all stretched roads into a single route
        // Get the first road's name for naming
        const firstRoadName =
          stretchedRoads[0]?.name || `Road ${stretchedRoads[0]?.id || ""}`

        // Combine all linestrings into one
        const allCoordinates: number[][] = []
        const allRoadIds: string[] = []
        let totalDistance = 0

        stretchedRoads.forEach((road: any, index: number) => {
          let linestringGeoJson = road.linestringGeoJson
          if (!linestringGeoJson && road.polyline) {
            linestringGeoJson =
              typeof road.polyline === "string"
                ? JSON.parse(road.polyline)
                : road.polyline
          }

          if (linestringGeoJson && linestringGeoJson.coordinates) {
            const coords = linestringGeoJson.coordinates
            if (index === 0) {
              allCoordinates.push(...coords)
            } else {
              // Skip first coordinate to avoid duplication
              allCoordinates.push(...coords.slice(1))
            }
            allRoadIds.push(road.id?.toString() || "")
            totalDistance += road.length || road.distanceKm || 0
          }
        })

        if (allCoordinates.length < 2) {
          toast.error("Invalid stretched road geometry")
          return
        }

        // Create a single new stretched road feature (s1) representing the combined route
        // This is a NEW road feature, not the individual roads
        const stretchedRoadId = `stretch-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`
        const combinedGeometry: GeoJSON.LineString = {
          type: "LineString",
          coordinates: allCoordinates,
        }

        // Calculate start and end points from the combined geometry
        const endpoints = getRouteEndpoints({
          type: "Feature",
          geometry: combinedGeometry,
          properties: {},
        })

        // Create the new stretched road feature
        const stretchedRoadFeature: ImportedRoadFeature = {
          type: "Feature",
          geometry: combinedGeometry,
          properties: {
            road_id: stretchedRoadId,
            name: generateStretchRouteName(firstRoadName),
            length: totalDistance || result.total_length || 0,
            priority: (stretchedRoads[0] as any)?.priority,
            start_point: endpoints.start_point,
            end_point: endpoints.end_point,
            isStretched: true,
          },
        }

        // Create PanelRoute - roadIds contains the new stretched road ID so it can be highlighted
        const combinedRoute: PanelRoute = {
          id: `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: generateStretchRouteName(firstRoadName),
          roadIds: [stretchedRoadId], // Reference the new stretched road feature (s1)
          geometry: combinedGeometry,
          priority: (stretchedRoads[0] as any)?.priority,
          distance: totalDistance || result.total_length || 0,
        }

        // Add the single new stretched road feature to importedRoads
        useLayerStore.setState((state) => {
          const currentImportedRoads = state.roadImport.importedRoads

          // Add the new stretched road feature to importedRoads
          const updatedImportedRoads = currentImportedRoads
            ? {
                ...currentImportedRoads,
                features: [
                  ...currentImportedRoads.features,
                  stretchedRoadFeature,
                ],
              }
            : null

          return {
            roadImport: {
              ...state.roadImport,
              panelRoutes: [...state.roadImport.panelRoutes, combinedRoute],
              importedRoads: updatedImportedRoads,
            },
          }
        })

        toast.success(`Stretched route added (${stretchedRoads.length} roads)`)
      } catch (error) {
        console.error("❌ Failed to stretch road:", error)
        toast.error(
          `Failed to stretch road: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
      }
    },
    [projectId, stretchRoadMutation, selectedRoadPriorities],
  )

  // Get viewstate from project data, fallback to default
  const defaultCenter = projectData?.viewstate?.center || {
    lat: 28.44642679009841,
    lng: 77.03122792287415,
  }
  const defaultZoom = projectData?.viewstate?.zoom || 17
  const segmentation = useLayerStore((state) => state.segmentation)
  const roadSelection = useLayerStore((state) => state.roadSelection)

  const deckLayers = useDeckLayers(projectId || "")

  // ✅ Route generation hook
  useRouteGeneration(projectId)

  // ✅ Layer management hook for LegendsPanel
  const {
    visibleLayers: legendVisibleLayers,
    savedRoutesLegend,
    importedRoadsLegend,
    segmentsLegend,
    getLayerName,
    getLayerColor,
    getBaseLayerId,
    toggleLayerVisibility,
  } = useLayerManagement(projectId || "")

  // ✅ Ref to access the DeckGL overlay instance
  const deckOverlayRef = useRef<GoogleMapsOverlay | null>(null)

  // ✅ Get zoom level getter function
  const getZoomRef = useRef<(() => number | undefined) | null>(null)

  // ✅ Context menu hook
  const { contextMenu, closeContextMenu, selectFeature } = useContextMenu({
    deckOverlayRef,
    mapElementId: "main-map",
    mapMode,
    getZoom: () => getZoomRef.current?.() ?? undefined,
  })

  // Listen for custom event to close context menu (e.g., when RouteDetailsPanel closes)
  React.useEffect(() => {
    const handleCloseContextMenu = () => {
      if (contextMenu) {
        closeContextMenu()
      }
    }

    window.addEventListener("closeContextMenu", handleCloseContextMenu)

    return () => {
      window.removeEventListener("closeContextMenu", handleCloseContextMenu)
    }
  }, [contextMenu, closeContextMenu])

  // ✅ Map events hook
  const { handleMapClick } = useMapEvents(mapMode)

  // ✅ Route data loading for routes selected from panel
  // Routes clicked from map tiles use tile data (no API call needed)
  // Routes selected from panel need API call if not in store
  const selectedRoute = useProjectWorkspaceStore((state) => state.selectedRoute)
  const selectedRouteId = selectedRoute?.id

  // Memoize the callback to avoid recreating RouteDataLoader
  const handleRouteLoaded = useCallback(
    (route: Route) => {
      console.log("✅ Route loaded:", route.id, {
        hasPolyline: !!route.encodedPolyline,
        hasRoads: !!route.roads?.length,
      })

      // Update the route in store with the fetched data (especially geometry)
      const { updateRoute, addRoute, selectRoute } =
        useProjectWorkspaceStore.getState()
      const existingRoute = useProjectWorkspaceStore
        .getState()
        .routes.find((r) => r.id === route.id)

      if (existingRoute) {
        // Update existing route with full data including geometry
        updateRoute(route.id, route)
        // Ensure it's still selected after update
        if (
          useProjectWorkspaceStore.getState().selectedRoute?.id === route.id
        ) {
          selectRoute(route.id)
        }
      } else {
        addRoute(route)
        // Select it if it's the currently selected route
        if (selectedRouteId === route.id) {
          selectRoute(route.id)
        }
      }
    },
    [selectedRouteId],
  )

  // Get visible layers from our deck hook - no need to memoize
  const visibleLayers = deckLayers

  // Track previous layers to only log when they actually change
  const prevLayersRef = useRef<string>("")
  useEffect(() => {
    // Compare layers by their IDs to detect actual changes
    const currentLayerIds = deckLayers.map((layer) => layer.id).join(",")
    const prevLayerIds = prevLayersRef.current

    // Only log if layers actually changed (by IDs)
    if (prevLayerIds !== currentLayerIds) {
      console.log("�� Map layers updated:", {
        totalLayers: deckLayers.length,
        visibleLayers: visibleLayers.length,
        mapMode,
        segmentationActive: segmentation.isActive,
        layers: deckLayers,
      })
      prevLayersRef.current = currentLayerIds
    }
  }, [deckLayers, visibleLayers.length, mapMode, segmentation.isActive])

  return (
    <APIProvider apiKey={apiKey} region="IN" libraries={["places"]}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        /* DeckGL Tooltip Styling - target all possible tooltip containers */
        div[class*="tooltip"],
        .deckgl-tooltip,
        .deck-tooltip {
          background: rgba(255, 255, 255, 0.95) !important;
          color: #1f2937 !important;
          font-size: 13px !important;
          padding: 10px 14px !important;
          border-radius: 12px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05) !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          font-weight: 500 !important;
          line-height: 1.5 !important;
          max-width: 280px !important;
          white-space: pre-line !important;
          border: none !important;
        }
      `}</style>
      <div className={className} style={style}>
        <RouteLoadingIndicator />
        {/* Route data loading (when selected from panel) */}
        {selectedRouteId && (
          <RouteDataLoader
            routeId={selectedRouteId}
            onRouteLoaded={handleRouteLoaded}
          />
        )}
        <Map
          id="main-map"
          mapTypeId={"hybrid"}
          mapId={mapId}
          renderingType={RenderingType.RASTER}
          colorScheme={"LIGHT"}
          style={{ width: "100%", height: "100%" }}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          zoomControl={false}
          defaultCenter={defaultCenter}
          defaultZoom={defaultZoom}
          scaleControl={false}
          restriction={{
            latLngBounds: {
              north: 85,
              south: -85,
              west: -180,
              east: 180,
            },
            strictBounds: true,
          }}
          clickableIcons={false}
          onClick={(e) => {
            // Don't handle clicks in polygon_drawing mode - Terra Draw handles them
            if (mapMode !== "polygon_drawing") {
              handleMapClick(
                e.detail.latLng?.lat || 0,
                e.detail.latLng?.lng || 0,
              )
            } else {
              console.log(
                "🎯 Click in polygon mode - Terra Draw should handle this",
              )
            }
          }}
        >
          {/* ✅ Expose map instance for snapshot utility */}
          <MapInstanceExposer />

          {/* ✅ Map Type Controller - syncs map type with store */}
          <MapTypeController />

          {/* ✅ Map Focus Controller for uploaded routes */}
          <MapFocusController />
          {/* ✅ Zoom Getter for context menu */}
          <ZoomGetter
            onZoomGetterReady={(getter) => {
              getZoomRef.current = getter
            }}
          />
          {/* ✅ Map Navigation Setter - sets up navigation function from inside Map */}
          <MapNavigationSetter mapId="main-map" />
          <MapNavigationSetter mapId="main-map" />

          {/* ✅ DeckGL Overlay with layers */}
          <DeckGLOverlay
            layers={visibleLayers}
            overlayRef={deckOverlayRef}
            projectId={projectId}
          />

          {/* ✅ Terra Draw Wrapper - must be inside Map component */}
          <TerraDrawWrapper mapId="main-map" />
          <LassoSelectionPanel />

          {/* ✅ Drawing Annotations - shows instructions during polygon drawing */}
          {/* <DrawingAnnotations /> */}

          {/* ✅ Conditional Markers based on map mode */}
          {mapMode === "individual_drawing" && <IndividualDrawingMarkers />}
          {/* PolygonDrawingMarkers removed - Terra Draw handles visualization */}
          {/* Show cut point markers when segmentation is active (manual or intersections mode) */}
          {segmentation.isActive &&
            (segmentation.type === "manual" ||
              segmentation.type === "intersections") && <SegmentationMarkers />}

          {/* ✅ Optimized Route Markers (always visible when editing) */}
          <OptimizedRouteMarkers />

          {/* ✅ Search Marker - temporary marker when searching coordinates */}
          <SearchMarker />
        </Map>

        {/* ✅ Drawing Completion Menu */}
        <DrawingCompletionMenuRenderer />

        {/* ✅ Context Menu System */}
        {contextMenu && (
          <>
            {/* Stage 1: Feature Selection (when multiple features picked) */}
            {contextMenu.stage === "feature-selection" && (
              <FeatureSelectionMenu
                x={contextMenu.x}
                y={contextMenu.y}
                features={contextMenu.features!}
                onSelectFeature={selectFeature}
                onClose={closeContextMenu}
                mapMode={mapMode}
                panelRoutes={roadImport.panelRoutes}
                onToggleRoad={(roadId) => toggleSelectedRoad(roadId)}
                onStretchRoad={handleStretchRoad}
                onInitializeRouteInMaking={initializeRouteInMaking}
              />
            )}

            {/* Stage 2: Feature-Specific Context Menus */}
            {contextMenu.stage === "feature-menu" &&
              contextMenu.selectedFeature &&
              (() => {
                const { layerId, object, polyline } =
                  contextMenu.selectedFeature

                // Normalize layer ID to handle versioned/timestamped IDs (e.g., "roads-network-tile-v2" or "roads-network-tile-t1234567890" -> "roads-network-tile")
                // Also normalize imported-roads-* layers to "imported-roads"
                const normalizeLayerId = (id: string) => {
                  // Normalize imported-roads-* layers to "imported-roads"
                  if (id?.startsWith("imported-roads-")) {
                    return "imported-roads"
                  }
                  // Remove version/timestamp suffix pattern: -v{number} or -t{number}
                  return id.replace(/-[vt]\d+$/, "")
                }
                const normalizedLayerId = normalizeLayerId(layerId)

                // Show appropriate context menu based on layer
                switch (normalizedLayerId) {
                  case "roads-network-tile":
                  case "roads-network":
                  case "imported-roads":
                    // In road_selection mode, show FeatureSelectionMenu for imported roads (supports stretch via right-click)
                    if (mapMode === "road_selection") {
                      // Check if this is an imported road
                      const normalizedId = normalizeLayerId(layerId)
                      const isImportedRoad = normalizedId === "imported-roads"

                      if (isImportedRoad) {
                        return (
                          <FeatureSelectionMenu
                            x={contextMenu.x}
                            y={contextMenu.y}
                            features={[contextMenu.selectedFeature]}
                            onSelectFeature={selectFeature}
                            onClose={closeContextMenu}
                            mapMode={mapMode}
                            panelRoutes={roadImport.panelRoutes}
                            onToggleRoad={(roadId) =>
                              toggleSelectedRoad(roadId)
                            }
                            onStretchRoad={handleStretchRoad}
                            onInitializeRouteInMaking={initializeRouteInMaking}
                          />
                        )
                      }
                    }
                    return (
                      <RoadContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        road={{ ...object, polyline }}
                        projectId={projectId}
                        onClose={closeContextMenu}
                      />
                    )

                  case "saved-routes-tile":
                  case "saved-routes": {
                    // Prefer uuid property, fallback to id, then object.id
                    const routeId =
                      object.properties?.uuid ||
                      object.properties?.id ||
                      object.id

                    // ✅ 1. Try to find in store (already loaded routes)
                    let fullRoute = routes.find((r) => r.id === routeId)

                    // ✅ 2. If not in store, create from tile properties (no API calls)
                    if (!fullRoute) {
                      const props = object.properties || object

                      // Helper function to parse JSON string or return object/array
                      const parseJsonOrValue = <T,>(
                        value: any,
                        fallback: T,
                      ): T => {
                        if (!value) return fallback
                        if (typeof value === "string") {
                          try {
                            return JSON.parse(value) as T
                          } catch {
                            return fallback
                          }
                        }
                        return value as T
                      }

                      // Helper to normalize coordinates from [lng, lat] to { lat, lng }
                      const normalizeCoordinate = (
                        coord: any,
                      ): { lat: number; lng: number } => {
                        if (!coord) return { lat: 0, lng: 0 }

                        // If it's already in { lat, lng } format
                        if (
                          typeof coord === "object" &&
                          "lat" in coord &&
                          "lng" in coord
                        ) {
                          return { lat: coord.lat, lng: coord.lng }
                        }

                        // If it's in [lng, lat] array format
                        if (Array.isArray(coord) && coord.length >= 2) {
                          return { lat: coord[1], lng: coord[0] }
                        }

                        return { lat: 0, lng: 0 }
                      }

                      // Parse origin, destination, and waypoints from JSON strings
                      const originRaw = parseJsonOrValue(props.origin, null)
                      const destinationRaw = parseJsonOrValue(
                        props.destination,
                        null,
                      )
                      const waypointsRaw = parseJsonOrValue(props.waypoints, [])

                      // Normalize coordinates
                      const origin = normalizeCoordinate(originRaw)
                      const destination = normalizeCoordinate(destinationRaw)

                      // Normalize waypoints - handle both [lng, lat] arrays and { lat, lng } objects
                      const waypoints = Array.isArray(waypointsRaw)
                        ? waypointsRaw.map((wp) => normalizeCoordinate(wp))
                        : []

                      fullRoute = {
                        id: routeId,
                        name: props.name || `Route ${routeId}`,
                        projectId: props.project_id || projectId,
                        type: props.type || "normal",
                        source: props.source || "individual_drawing",
                        origin,
                        destination,
                        waypoints,
                        encodedPolyline: props.encoded_polyline || "",
                        distance: props.distance || props.length || 0,
                        duration: props.duration || 0,
                        status: props.status || props.sync_status || "unsynced",
                        createdAt: props.created_at || new Date().toISOString(),
                        updatedAt: props.updated_at || new Date().toISOString(),
                        roads: [],
                        isSegmented: props.is_segmented || false,
                        segmentCount: props.segment_count || 0,
                        color: props.color || props.stroke || "#2196F3",
                        opacity: props.opacity || props["stroke-opacity"] || 1,
                        tag: props.tag || "",
                      } as any
                    }

                    if (!fullRoute) return null

                    return (
                      <RouteContextMenu
                        key={`route-menu-${fullRoute.id}-${contextMenu.x}-${contextMenu.y}`}
                        x={contextMenu.x}
                        y={contextMenu.y}
                        route={fullRoute}
                        onClose={closeContextMenu}
                      />
                    )
                  }

                  case "saved-polygons":
                    return (
                      <PolygonContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        polygon={object}
                        onClose={closeContextMenu}
                      />
                    )

                  case "preview-segments":
                    return (
                      <SegmentContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        segment={object}
                        onClose={closeContextMenu}
                      />
                    )

                  default:
                    console.warn(`Unknown layer type: ${layerId}`)
                    return null
                }
              })()}
          </>
        )}

        <LegendsPanel
          visibleLayers={legendVisibleLayers}
          savedRoutesLegend={savedRoutesLegend}
          importedRoadsLegend={importedRoadsLegend}
          segmentsLegend={segmentsLegend}
          getLayerName={getLayerName}
          getLayerColor={getLayerColor}
          getBaseLayerId={getBaseLayerId}
          toggleLayerVisibility={toggleLayerVisibility}
        />

        {/* ✅ Road Selection Panel (right side) */}
        <RoadSelectionPanel />

        {/* ✅ Priority Filter Panel (top-left, only in road_selection mode) */}
        <PriorityFilterPanel />

        {/* ✅ Mode Switch Dialog */}
        {roadImport.pendingModeSwitch && (
          <ModeSwitchDialog
            open={!!roadImport.pendingModeSwitch}
            fromMode={roadImport.pendingModeSwitch.from}
            toMode={roadImport.pendingModeSwitch.to}
            onConfirm={() => {
              const { clearRoadImport, setPendingModeSwitch } =
                useLayerStore.getState()
              const { clearAllDrawing, exitSelectionMode } =
                useLayerStore.getState()
              const { setMapMode } = useProjectWorkspaceStore.getState()
              const pending = roadImport.pendingModeSwitch
              if (pending) {
                clearRoadImport()
                clearAllDrawing()
                exitSelectionMode()
                setPendingModeSwitch(null)
                setMapMode(pending.to as any)

                // If switching to upload_routes mode, trigger file input after a short delay
                // to ensure the mode switch has completed and DOM has updated
                if (pending.to === "upload_routes") {
                  setTimeout(() => {
                    // Find the file input element (it's in MapControls component)
                    // We use querySelector to find the hidden file input with geojson accept
                    const fileInput = document.querySelector<HTMLInputElement>(
                      'input[type="file"][accept*="geojson"]',
                    )
                    if (fileInput) {
                      // Set up cancellation handler to reset mode if user cancels file dialog
                      const handleWindowFocus = () => {
                        setTimeout(() => {
                          // Check if no file was selected (user cancelled)
                          if (fileInput && !fileInput.files?.length) {
                            // User canceled the file dialog, reset to view mode
                            const { setMapMode } =
                              useProjectWorkspaceStore.getState()
                            setMapMode("view")
                          }
                          // Remove the event listener after checking
                          window.removeEventListener("focus", handleWindowFocus)
                        }, 100)
                      }

                      // Add focus listener to detect when dialog closes
                      window.addEventListener("focus", handleWindowFocus, {
                        once: true,
                      })

                      fileInput.click()
                    } else {
                      // If not found immediately, try again after a longer delay
                      // (in case MapControls hasn't rendered yet)
                      setTimeout(() => {
                        const retryFileInput =
                          document.querySelector<HTMLInputElement>(
                            'input[type="file"][accept*="geojson"]',
                          )
                        if (retryFileInput) {
                          // Set up cancellation handler for retry
                          const handleWindowFocus = () => {
                            setTimeout(() => {
                              // Check if no file was selected (user cancelled)
                              if (
                                retryFileInput &&
                                !retryFileInput.files?.length
                              ) {
                                // User canceled the file dialog, reset to view mode
                                const { setMapMode } =
                                  useProjectWorkspaceStore.getState()
                                setMapMode("view")
                              }
                              // Remove the event listener after checking
                              window.removeEventListener(
                                "focus",
                                handleWindowFocus,
                              )
                            }, 100)
                          }

                          // Add focus listener to detect when dialog closes
                          window.addEventListener("focus", handleWindowFocus, {
                            once: true,
                          })

                          retryFileInput.click()
                        }
                      }, 200)
                    }
                  }, 150)
                }
              }
            }}
            onCancel={() => {
              useLayerStore.getState().setPendingModeSwitch(null)
            }}
          />
        )}

        {/* ✅ Unsaved Routes Dialog */}
        {pendingModeSwitch &&
          (() => {
            // Determine what type of unsaved data we have
            const { editingSavedRouteId, hasUnsavedChanges } =
              useLayerStore.getState()
            const hasUnsavedUploadedRoutes =
              uploadedRoutes.routes.length > 0 &&
              (pendingModeSwitch.from === "upload_routes" ||
                pendingModeSwitch.to === "individual_drawing" ||
                pendingModeSwitch.to === "polygon_drawing" ||
                pendingModeSwitch.to === "lasso_selection")
            const hasUnsavedDrawnRoute =
              pendingModeSwitch.from === "individual_drawing" &&
              individualRoute.points.length > 0 &&
              editingSavedRouteId === null // Only count as drawn route if not editing a saved route
            const hasUnsavedSavedRouteChanges =
              pendingModeSwitch.from === "individual_drawing" &&
              editingSavedRouteId !== null &&
              hasUnsavedChanges(editingSavedRouteId)
            const hasUnsavedPolygon =
              pendingModeSwitch.from === "polygon_drawing" &&
              polygonDrawing.points.length > 0

            const dialogType = hasUnsavedUploadedRoutes
              ? "uploaded_routes"
              : hasUnsavedSavedRouteChanges
                ? "uploaded_routes" // Use uploaded_routes type for saved route modifications
                : hasUnsavedDrawnRoute
                  ? "drawn_route"
                  : hasUnsavedPolygon
                    ? "polygon_drawing"
                    : "uploaded_routes" // fallback

            return (
              <UnsavedRoutesDialog
                open={!!pendingModeSwitch}
                type={dialogType}
                routeCount={
                  hasUnsavedSavedRouteChanges
                    ? 1 // Show 1 route when editing a saved route
                    : uploadedRoutes.routes.length
                }
                pointCount={
                  hasUnsavedDrawnRoute
                    ? individualRoute.points.length
                    : hasUnsavedPolygon
                      ? polygonDrawing.points.length
                      : 0
                }
                onConfirm={() => {
                  const {
                    clearUploadedRoutes,
                    clearSnappedRoads,
                    clearAllOptimizedRouteMarkers,
                    setSelectedUploadedRouteId,
                    clearPoints,
                    clearIndividualRoute,
                    clearPolygonDrawing,
                    discardRouteChanges,
                  } = useLayerStore.getState()
                  const { setMapMode, setPendingModeSwitch } =
                    useProjectWorkspaceStore.getState()
                  const { clearAllDrawing, exitSelectionMode } =
                    useLayerStore.getState()

                  const pending = pendingModeSwitch
                  if (pending) {
                    // Clear uploaded routes and related state if applicable
                    if (hasUnsavedUploadedRoutes) {
                      clearUploadedRoutes()
                      clearSnappedRoads()
                      clearAllOptimizedRouteMarkers()
                      setSelectedUploadedRouteId(null)
                    }

                    // Discard unsaved changes to saved route if applicable
                    if (hasUnsavedSavedRouteChanges && editingSavedRouteId) {
                      discardRouteChanges(editingSavedRouteId)
                    }

                    // Clear drawn route and related state if applicable
                    if (hasUnsavedDrawnRoute) {
                      clearPoints()
                      clearIndividualRoute()
                    }

                    // Clear polygon drawing and related state if applicable
                    if (hasUnsavedPolygon) {
                      clearPolygonDrawing()
                    }

                    clearAllDrawing()
                    // Clear selected route when starting a new drawing
                    const { setSelectedRoute } =
                      useProjectWorkspaceStore.getState()
                    setSelectedRoute(null)
                    exitSelectionMode()

                    // Clear pending mode switch and switch mode
                    const returnToMode = pending.returnToMode
                    setPendingModeSwitch(null)

                    // If returnToMode is set, switch to that mode instead of the "to" mode
                    // This handles the case where user clicks same mode button and wants to stay in that mode
                    if (returnToMode) {
                      setMapMode(returnToMode as any)
                    } else {
                      setMapMode(pending.to as any)
                    }

                    // If switching to upload_routes mode, trigger file input after a short delay
                    // to ensure the mode switch has completed and DOM has updated
                    if (pending.to === "upload_routes") {
                      setTimeout(() => {
                        // Find the file input element (it's in MapControls component)
                        // We use querySelector to find the hidden file input with geojson accept
                        const fileInput =
                          document.querySelector<HTMLInputElement>(
                            'input[type="file"][accept*="geojson"]',
                          )
                        if (fileInput) {
                          // Set up cancellation handler to reset mode if user cancels file dialog
                          const handleWindowFocus = () => {
                            setTimeout(() => {
                              // Check if no file was selected (user cancelled)
                              if (fileInput && !fileInput.files?.length) {
                                // User canceled the file dialog, reset to view mode
                                const { setMapMode } =
                                  useProjectWorkspaceStore.getState()
                                setMapMode("view")
                              }
                              // Remove the event listener after checking
                              window.removeEventListener(
                                "focus",
                                handleWindowFocus,
                              )
                            }, 100)
                          }

                          // Add focus listener to detect when dialog closes
                          window.addEventListener("focus", handleWindowFocus, {
                            once: true,
                          })

                          fileInput.click()
                        } else {
                          // If not found immediately, try again after a longer delay
                          // (in case MapControls hasn't rendered yet)
                          setTimeout(() => {
                            const retryFileInput =
                              document.querySelector<HTMLInputElement>(
                                'input[type="file"][accept*="geojson"]',
                              )
                            if (retryFileInput) {
                              // Set up cancellation handler for retry
                              const handleWindowFocus = () => {
                                setTimeout(() => {
                                  // Check if no file was selected (user cancelled)
                                  if (
                                    retryFileInput &&
                                    !retryFileInput.files?.length
                                  ) {
                                    // User canceled the file dialog, reset to view mode
                                    const { setMapMode } =
                                      useProjectWorkspaceStore.getState()
                                    setMapMode("view")
                                  }
                                  // Remove the event listener after checking
                                  window.removeEventListener(
                                    "focus",
                                    handleWindowFocus,
                                  )
                                }, 100)
                              }

                              // Add focus listener to detect when dialog closes
                              window.addEventListener(
                                "focus",
                                handleWindowFocus,
                                {
                                  once: true,
                                },
                              )

                              retryFileInput.click()
                            }
                          }, 200)
                        }
                      }, 150)
                    }
                  }
                }}
                onCancel={() => {
                  useProjectWorkspaceStore.getState().setPendingModeSwitch(null)
                }}
              />
            )
          })()}

        {/* ✅ Upload Clear Confirmation Dialog */}
        {pendingUploadClear && (
          <ModeSwitchDialog
            open={pendingUploadClear}
            fromMode="upload_routes"
            toMode="upload_routes"
            title="Clear Uploaded Routes"
            message="You have uploaded routes. If you continue, all uploaded routes and their changes will be lost."
            confirmButtonText="Continue"
            onConfirm={handleClearUploadedRoutesAndUpload}
            onCancel={() => {
              useProjectWorkspaceStore.getState().setPendingUploadClear(false)
            }}
          />
        )}

        {/* ✅ Selection Toolbar (for stretch and multi-select modes) */}
        {mapMode === "view" &&
          roadSelection.mode !== "none" &&
          roadSelection.highlightedRoads.length > 0 &&
          !roadSelection.isPreview && (
            <SelectionToolbar projectId={projectId} />
          )}
      </div>
    </APIProvider>
  )
}

export default UnifiedProjectMap
