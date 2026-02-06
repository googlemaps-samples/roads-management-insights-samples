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

import { useState } from "react"

import { RoadPriority } from "../constants/road-priorities"
import { useProjectWorkspaceStore } from "../stores"
import { useLayerStore } from "../stores/layer-store"
import { ALL_ROAD_PRIORITIES } from "../stores/layer-store/constants"
import { filterRoadsByPolygon } from "../stores/layer-store/utils/road-filtering"
import {
  ImportedRoadFeature,
  ImportedRoadsCollection,
} from "../types/imported-road"
import { isPointInBoundary } from "../utils/boundary-validation"
import { toast } from "../utils/toast"
import { useIngestPolygon } from "./use-api"

/**
 * Hook for handling polygon and lasso drawing completion
 */
export const usePolygonHandlers = () => {
  const setMapMode = useProjectWorkspaceStore((state) => state.setMapMode)
  const setLeftPanelExpanded = useProjectWorkspaceStore(
    (state) => state.setLeftPanelExpanded,
  )
  const setRoadPriorityPanelOpen = useProjectWorkspaceStore(
    (state) => state.setRoadPriorityPanelOpen,
  )

  const finishPolygonDrawing = useLayerStore(
    (state) => state.finishPolygonDrawing,
  )
  const isLassoComplete = useLayerStore((state) => state.isLassoComplete)
  const lassoDrawing = useLayerStore((state) => state.lassoDrawing)
  const finishLassoDrawing = useLayerStore((state) => state.finishLassoDrawing)
  const clearLassoDrawing = useLayerStore((state) => state.clearLassoDrawing)
  const clearAllDrawing = useLayerStore((state) => state.clearAllDrawing)
  const terraDrawFinish = useLayerStore((state) => state.terraDrawFinish)
  const setImportedRoads = useLayerStore((state) => state.setImportedRoads)
  const roadImport = useLayerStore((state) => state.roadImport)
  const setLassoFilteredRoads = useLayerStore(
    (state) => state.setLassoFilteredRoads,
  )

  const ingestPolygonMutation = useIngestPolygon()

  // Road priority dialog state
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false)
  const [pendingPolygonData, setPendingPolygonData] = useState<{
    projectId: number
    polygonName: string
    coordinates: [number, number][] // [lng, lat] format
  } | null>(null)

  const handlePolygonDone = async () => {
    // Fix Bug 1: Read fresh state directly from store to avoid stale closures
    const currentPolygonDrawing = useLayerStore.getState().polygonDrawing
    const isComplete = currentPolygonDrawing.points.length >= 3

    console.log("🔍 handlePolygonDone called", {
      pointsCount: currentPolygonDrawing.points.length,
      isComplete,
      isDrawing: currentPolygonDrawing.isDrawing,
    })

    if (isComplete) {
      console.log("✅ Completing polygon drawing")

      try {
        // Get the current project ID from the workspace store
        const { projectData } = useProjectWorkspaceStore.getState()
        if (!projectData) {
          toast.error("No project data available")
          // Close menu and throw error to reset processing state
          useLayerStore.getState().hideDrawingCompletionMenu()
          throw new Error("No project data available")
        }

        // Create the polygon geometry (ensure ring is closed)
        // Use fresh state from store, not closure
        const ring = currentPolygonDrawing.points
        const isClosed =
          ring.length > 0 &&
          ring[0][0] === ring[ring.length - 1][0] &&
          ring[0][1] === ring[ring.length - 1][1]
        const closedRing = isClosed ? ring : [...ring, ring[0]]

        // Validate all points are within boundary before proceeding
        const boundary = projectData?.boundaryGeoJson
        if (boundary) {
          const allPointsValid = ring.every((point) => {
            // Points are in [lng, lat] format, convert to [lat, lng] for validation
            const [lng, lat] = point
            return isPointInBoundary(lat, lng, boundary)
          })
          if (!allPointsValid) {
            toast.error(
              "All polygon points must be within the jurisdiction boundary. Please adjust the polygon.",
            )
            // Close menu and throw error to reset processing state
            useLayerStore.getState().hideDrawingCompletionMenu()
            throw new Error("Polygon points outside boundary")
          }
        }

        // First complete the polygon in the store (only after validation passes)
        finishPolygonDrawing()

        // Store polygon data and immediately call API with all priorities
        const polygonData = {
          projectId: parseInt(projectData.id),
          polygonName: `Polygon ${Date.now()}`,
          coordinates: closedRing, // Store raw coordinates for later transformation
        }
        setPendingPolygonData(polygonData)

        // Fix: Pass polygonData directly instead of relying on state update
        await handlePriorityConfirm(
          [...ALL_ROAD_PRIORITIES] as RoadPriority[],
          polygonData, // Pass directly to avoid state timing issue
        )
      } catch (error) {
        console.error("❌ Failed to prepare polygon:", error)
        const errorMsg =
          error instanceof Error ? error.message : "Failed to prepare polygon"
        toast.error(errorMsg)
        // Close menu on error so user can retry
        useLayerStore.getState().hideDrawingCompletionMenu()
        // Re-throw to allow handleContinue to catch and reset processing state
        throw error
      }
    } else {
      console.warn("⚠️ Polygon not complete yet", {
        points: currentPolygonDrawing.points.length,
      })
      toast.error(
        "Polygon is not complete. Please ensure you have at least 3 points.",
      )
      // Close menu on validation error
      useLayerStore.getState().hideDrawingCompletionMenu()
      // Throw error to reset processing state in handleContinue
      throw new Error("Polygon not complete")
    }
  }

  const handleLassoDone = () => {
    if (isLassoComplete()) {
      console.log("✅ Completing lasso selection", {
        points: lassoDrawing.points.length,
        isDrawing: lassoDrawing.isDrawing,
      })

      // Finish terra draw if available
      if (terraDrawFinish) {
        terraDrawFinish()
      }

      // Check if we're in road_selection mode with lasso selection
      const currentMapMode = useProjectWorkspaceStore.getState().mapMode
      if (
        currentMapMode === "road_selection" &&
        roadImport.selectionMode === "lasso"
      ) {
        // Finish lasso drawing first to mark polygon as completed
        if (lassoDrawing.points.length > 0) {
          finishLassoDrawing()
          // Get fresh state after finishLassoDrawing to ensure completedPolygon is set
          // Use setTimeout to allow state update to propagate
          setTimeout(() => {
            handleLassoDoneForRoadSelection()
          }, 0)
        } else {
          console.warn(
            "❌ Cannot finish lasso: no points in lassoDrawing",
            lassoDrawing,
          )
        }
      } else {
        // Original lasso selection flow (for non-road-selection mode)
        if (lassoDrawing.points.length > 0) {
          finishLassoDrawing()
          // Explicitly expand the lasso selection panel after completing the selection
          // Use setTimeout to ensure state update has propagated
          setTimeout(() => {
            setLeftPanelExpanded(true)
          }, 100)
        }

        // Dispatch Enter key event to trigger road selection
        window.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" }))
      }
    }
  }

  const handleLassoDoneForRoadSelection = () => {
    // Get fresh state to ensure we have the latest completedPolygon
    const currentLassoDrawing = useLayerStore.getState().lassoDrawing
    const currentRoadImport = useLayerStore.getState().roadImport

    if (
      !currentLassoDrawing.completedPolygon ||
      !currentRoadImport.importedRoads
    ) {
      console.warn("❌ Missing polygon or imported roads for lasso selection", {
        hasCompletedPolygon: !!currentLassoDrawing.completedPolygon,
        hasImportedRoads: !!currentRoadImport.importedRoads,
        lassoPoints: currentLassoDrawing.points.length,
      })
      return
    }

    // Fix Bug 3: Filter by priority FIRST (only visible roads), then by polygon
    // Get selected priorities from roads network store (what user sees on map)
    const selectedRoadPriorities = useLayerStore.getState()
      .selectedRoadPriorities as RoadPriority[]

    // First, filter imported roads by selected priorities (only visible roads)
    let visibleRoads = currentRoadImport.importedRoads
    if (
      selectedRoadPriorities &&
      selectedRoadPriorities.length > 0 &&
      selectedRoadPriorities.length < ALL_ROAD_PRIORITIES.length
    ) {
      // Only filter if not all priorities are selected
      const visibleFeatures = currentRoadImport.importedRoads.features.filter(
        (feature: ImportedRoadFeature) => {
          const roadPriority = feature.properties?.priority as
            | RoadPriority
            | undefined
          return roadPriority && selectedRoadPriorities.includes(roadPriority)
        },
      )
      visibleRoads = {
        ...currentRoadImport.importedRoads,
        features: visibleFeatures,
      }
    }

    // Now filter visible roads by polygon (only roads inside lasso that are visible)
    const roadIdsInPolygon = filterRoadsByPolygon(
      visibleRoads,
      currentLassoDrawing.completedPolygon,
    )

    // Set filtered roads as temporary green state (not yet in panel)
    if (roadIdsInPolygon.length > 0) {
      setLassoFilteredRoads(roadIdsInPolygon)

      // Automatically add filtered roads to panel
      // Since Zustand updates are synchronous, we can call this directly
      useLayerStore.getState().addLassoFilteredRoadsToPanel()

      // Clear the lasso drawing polygon after roads are added
      clearLassoDrawing()
    } else {
      // If no roads found, clear the lasso drawing and show a message
      toast.info("No roads found in the selected area")
      clearLassoDrawing()
      // Also clear TerraDraw visual representation if available
      const terraDrawInstance = useLayerStore.getState().terraDrawInstance
      if (terraDrawInstance) {
        try {
          terraDrawInstance.clear()
        } catch (error) {
          console.warn("Failed to clear TerraDraw:", error)
        }
      }
    }
  }

  const handlePriorityConfirm = async (
    priorities: RoadPriority[],
    polygonDataOverride?: {
      projectId: number
      polygonName: string
      coordinates: [number, number][]
    },
  ) => {
    // Use override if provided, otherwise fall back to state
    const dataToUse = polygonDataOverride || pendingPolygonData
    if (!dataToUse) {
      console.warn("⚠️ No polygon data available for ingestion")
      return
    }

    // Show toast for importing roads
    // const toastId = toast.loading("Importing roads...")

    try {
      // Transform coordinates from [lng, lat] to {latitude, longitude} format
      const coordinates = dataToUse.coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }))

      // Call the API to ingest the polygon with priorities
      const result = await ingestPolygonMutation.mutateAsync({
        project_id: dataToUse.projectId,
        polygon_name: dataToUse.polygonName,
        priority_type: priorities,
        geometry: {
          coordinates,
        },
      })

      console.log("✅ Polygon ingested successfully:", result)

      // Dismiss loading toast
      // toast.dismiss(toastId)

      const roads_skipped = result.roads_skipped || 0
      const total_roads = result.total_roads || 0
      const roads_of_required_priority = result.roads_of_required_priority || 0

      // Check if no roads were found (before processing GeoJSON)
      if (roads_of_required_priority === 0 && total_roads === 0) {
        // Clear TerraDraw polygon if it exists
        const terraDrawInstance = useLayerStore.getState().terraDrawInstance
        if (terraDrawInstance) {
          try {
            terraDrawInstance.clear()
          } catch (error) {
            console.error("Error clearing TerraDraw polygon:", error)
          }
        }

        // Clear the polygon drawing state
        clearAllDrawing()
        setPendingPolygonData(null)
        setPriorityDialogOpen(false)
        setRoadPriorityPanelOpen(false)

        // Show message that no roads were found
        toast.info(
          "No roads were found in the selected area. Please try a different location.",
        )

        // Close the drawing completion menu
        // Stay in polygon_drawing mode so user can try again
        useLayerStore.getState().hideDrawingCompletionMenu()
        return
      }

      // Show success message with highlighted important information
      const mainMessage = `${roads_of_required_priority} road${roads_of_required_priority !== 1 ? "s" : ""} ingested successfully`

      let description: string | undefined
      if (roads_skipped > 0) {
        // Priority filter was applied - some roads were filtered out
        description = `${roads_skipped} road${roads_skipped !== 1 ? "s" : ""} filtered out by priority from ${total_roads} total`
      } else if (total_roads > roads_of_required_priority) {
        // Edge case: if somehow total differs but no skipped
        description = `Out of ${total_roads} total road${total_roads !== 1 ? "s" : ""}`
      }

      toast.success(mainMessage, { description })

      // Extract GeoJSON feature collection from result
      if (result.geojson_feature_collection) {
        // Separate polygon feature from road features
        const features = result.geojson_feature_collection.features || []
        const polygonFeature = features.find(
          (f) => f.geometry.type === "Polygon",
        )
        const roadFeatures = features.filter(
          (f) => f.geometry.type === "LineString",
        ) as ImportedRoadFeature[]

        if (polygonFeature && polygonFeature.geometry.type === "Polygon") {
          // Check if no roads were found
          if (roadFeatures.length === 0) {
            // Clear TerraDraw polygon if it exists
            const terraDrawInstance = useLayerStore.getState().terraDrawInstance
            if (terraDrawInstance) {
              try {
                terraDrawInstance.clear()
              } catch (error) {
                console.error("Error clearing TerraDraw polygon:", error)
              }
            }

            // Clear the polygon drawing state
            clearAllDrawing()
            setPendingPolygonData(null)
            setPriorityDialogOpen(false)
            setRoadPriorityPanelOpen(false)

            // Show message that no roads were found
            toast.info(
              "No roads were found in the selected area. Please try a different location.",
            )

            // Close the drawing completion menu
            // Stay in polygon_drawing mode so user can try again
            useLayerStore.getState().hideDrawingCompletionMenu()
            return
          }

          // Store imported roads and polygon
          setImportedRoads(
            {
              type: "FeatureCollection",
              features: roadFeatures,
            } as ImportedRoadsCollection,
            polygonFeature.geometry,
          )

          // Clear the polygon drawing state (but keep the polygon visible via importedPolygon)
          clearAllDrawing()
          setPendingPolygonData(null)

          // Clear pending data and switch to road_selection mode
          setPendingPolygonData(null)
          setPriorityDialogOpen(false)
          setRoadPriorityPanelOpen(false)

          // Switch to road_selection mode instead of view
          setMapMode("road_selection")
          // Set default selection mode to "single"
          useLayerStore.getState().setSelectionMode("single")
          // Close the drawing completion menu
          useLayerStore.getState().hideDrawingCompletionMenu()
        } else {
          console.error("❌ Polygon feature not found in GeoJSON response")
          toast.error("Failed to extract polygon from response")
          // Fallback to view mode
          clearAllDrawing()
          setPendingPolygonData(null)
          setMapMode("view")
          // Close the drawing completion menu
          useLayerStore.getState().hideDrawingCompletionMenu()
        }
      } else {
        console.error("❌ GeoJSON feature collection not found in response")
        toast.error("Invalid response format")
        // Fallback to view mode
        clearAllDrawing()
        setPendingPolygonData(null)
        setMapMode("view")
        // Close the drawing completion menu
        useLayerStore.getState().hideDrawingCompletionMenu()
      }
    } catch (error) {
      // Dismiss loading toast on error
      // toast.dismiss(toastId)
      console.error("❌ Failed to ingest polygon:", error)
      const errorMsg =
        error instanceof Error ? error.message : "Failed to ingest polygon"

      // Clear TerraDraw polygon if it exists (for all errors)
      const terraDrawInstance = useLayerStore.getState().terraDrawInstance
      if (terraDrawInstance) {
        try {
          terraDrawInstance.clear()
        } catch (clearError) {
          console.error("Error clearing TerraDraw polygon:", clearError)
        }
      }

      // Clear the polygon drawing state (for all errors)
      clearAllDrawing()
      setPendingPolygonData(null)
      setPriorityDialogOpen(false)
      setRoadPriorityPanelOpen(false)

      // Check if the error is about no roads found
      const isNoRoadsError =
        errorMsg.toLowerCase().includes("no roads found") ||
        errorMsg.toLowerCase().includes("no roads found within")

      if (isNoRoadsError) {
        // Show info message instead of error
        toast.info(
          "No roads were found in the selected area. Please try a different location.",
        )
        // Stay in polygon_drawing mode so user can try again
      } else {
        // For other errors, show error toast
        toast.error(errorMsg)
      }

      // Close the drawing completion menu on error
      useLayerStore.getState().hideDrawingCompletionMenu()
    }
  }

  const handlePriorityCancel = () => {
    setPriorityDialogOpen(false)
    setRoadPriorityPanelOpen(false)
    setPendingPolygonData(null)
    // Stay in polygon mode if user cancels
  }

  return {
    isPolygonComplete: () => {
      const currentPolygonDrawing = useLayerStore.getState().polygonDrawing
      return currentPolygonDrawing.points.length >= 3
    },
    isLassoComplete: isLassoComplete(),
    isIngesting: ingestPolygonMutation.isPending,
    priorityDialogOpen,
    handlePolygonDone,
    handleLassoDone,
    handlePriorityConfirm,
    handlePriorityCancel,
  }
}
