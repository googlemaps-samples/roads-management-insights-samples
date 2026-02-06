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

// ui/src/hooks/useMapEvents.ts
import { useCallback } from "react"

import { useLayerStore } from "../stores"
import { useProjectWorkspaceStore } from "../stores/project-workspace-store"
import { CutPoint } from "../types/route"
import { isPointInBoundary } from "../utils/boundary-validation"
import { regenerateRouteWithWaypoints } from "../utils/route-regeneration"
import { toast } from "../utils/toast"

export const useMapEvents = (mapMode: string) => {
  const addPoint = useLayerStore((state) => state.addPoint)
  const addPolygonPoint = useLayerStore((state) => state.addPolygonPoint)
  const addCutPoint = useLayerStore((state) => state.addCutPoint)
  const segmentation = useLayerStore((state) => state.segmentation)
  const markerDragEndTime = useLayerStore((state) => state.markerDragEndTime)
  const isAddingWaypoint = useLayerStore((state) => state.isAddingWaypoint)
  const waypointAddingRouteId = useLayerStore(
    (state) => state.waypointAddingRouteId,
  )
  const isAddingIndividualWaypoint = useLayerStore(
    (state) => state.isAddingIndividualWaypoint,
  )
  const addWaypoint = useLayerStore((state) => state.addWaypoint)
  const cancelAddingWaypoint = useLayerStore(
    (state) => state.cancelAddingWaypoint,
  )
  const removeSnappedRoadsForRoute = useLayerStore(
    (state) => state.removeSnappedRoadsForRoute,
  )
  const addSnappedRoads = useLayerStore((state) => state.addSnappedRoads)

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      if (lat === undefined || lng === undefined) return

      // 🔒 Prevent clicks immediately after marker drag
      const currentTime = Date.now()
      const timeSinceMarkerDrag = currentTime - markerDragEndTime
      console.log("⏱️ Click timing check:", {
        currentTime,
        markerDragEndTime,
        timeSinceMarkerDrag,
      })
      if (timeSinceMarkerDrag < 500) {
        // 500ms grace period to catch drag-end clicks
        console.log("🚫 Ignoring map click - marker was just dragged")
        return
      }

      console.log("Map clicked:", {
        lat,
        lng,
        mapMode,
        isAddingWaypoint,
        waypointAddingRouteId,
      })

      // Check if we're in waypoint adding mode
      if (isAddingWaypoint && waypointAddingRouteId) {
        // Check waypoint limit (25 max)
        const MAX_WAYPOINTS = 25
        const store = useLayerStore.getState()
        const getEditingState = store.getEditingState
        const editingState = getEditingState(waypointAddingRouteId)
        const routeMarkers =
          editingState?.temporaryMarkers ||
          store.snappedRoads.routeMarkers.find(
            (m) => m.routeId === waypointAddingRouteId,
          )

        // Check if limit is reached
        if (routeMarkers && routeMarkers.waypoints.length >= MAX_WAYPOINTS) {
          console.warn(`⚠️ Maximum ${MAX_WAYPOINTS} waypoints allowed`)
          toast.error(`Maximum ${MAX_WAYPOINTS} waypoints allowed per route`)
          return
        }

        // Add the waypoint to temporary editing state
        addWaypoint(waypointAddingRouteId, { lat, lng })

        // Regenerate route immediately with the new waypoint
        // Get the updated markers after waypoint is added (Zustand updates are synchronous)
        const updatedStore = useLayerStore.getState()
        const updatedEditingState = updatedStore.getEditingState(
          waypointAddingRouteId,
        )
        const updatedRouteMarkers =
          updatedEditingState?.temporaryMarkers ||
          updatedStore.snappedRoads.routeMarkers.find(
            (m) => m.routeId === waypointAddingRouteId,
          )

        // Check if we've reached the max waypoints limit after adding
        if (
          updatedRouteMarkers &&
          updatedRouteMarkers.waypoints.length >= MAX_WAYPOINTS
        ) {
          // Automatically cancel waypoint adding mode when limit is reached
          cancelAddingWaypoint()
          toast.success(
            `Maximum ${MAX_WAYPOINTS} waypoints reached. Click "Add Waypoints" to continue adding.`,
          )
        }

        if (updatedRouteMarkers) {
          // Check if we're in edit mode - use preview roads if editing
          const isEditing = updatedEditingState !== null
          const removePreviewRoadsForRoute =
            useLayerStore.getState().removePreviewRoadsForRoute
          const addPreviewRoads = useLayerStore.getState().addPreviewRoads

          // Get boundary for validation
          const projectStore = useProjectWorkspaceStore.getState()
          const boundary = projectStore.projectData?.boundaryGeoJson

          if (isEditing) {
            // In edit mode, use preview roads
            regenerateRouteWithWaypoints({
              routeId: waypointAddingRouteId,
              markers: updatedRouteMarkers,
              removeSnappedRoadsForRoute: removePreviewRoadsForRoute,
              addSnappedRoads: addPreviewRoads,
              boundary,
            }).catch((error) => {
              console.error(
                "❌ Failed to regenerate route after adding waypoint:",
                error,
              )
              // Show error toast if it's a boundary validation error
              if (
                error instanceof Error &&
                error.message.includes("boundary")
              ) {
                toast.error(error.message)
              }
            })
          } else {
            // Not in edit mode, use regular snapped roads
            regenerateRouteWithWaypoints({
              routeId: waypointAddingRouteId,
              markers: updatedRouteMarkers,
              removeSnappedRoadsForRoute,
              addSnappedRoads,
              boundary,
            }).catch((error) => {
              console.error(
                "❌ Failed to regenerate route after adding waypoint:",
                error,
              )
              // Show error toast if it's a boundary validation error
              if (
                error instanceof Error &&
                error.message.includes("boundary")
              ) {
                toast.error(error.message)
              }
            })
          }
        }

        return
      }

      // Priority: Check segmentation mode first (especially manual segmentation)
      // This prevents individual_drawing from intercepting segmentation clicks
      if (
        segmentation.isActive &&
        segmentation.targetRoute &&
        segmentation.type === "manual"
      ) {
        const cutPointId = `cut_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`
        const cutPoint: CutPoint = {
          id: cutPointId,
          routeId: segmentation.targetRoute.id,
          cutOrder: segmentation.cutPoints.length + 1,
          coordinates: { lat, lng },
          distanceFromStart: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        console.log("Adding manual cut point:", cutPoint)
        addCutPoint(cutPoint)
        return // Don't process other modes
      }

      switch (mapMode) {
        case "individual_drawing": {
          // Prevent adding points after the "points" stage by checking if interactions are enabled
          const projectWorkspaceState = useProjectWorkspaceStore.getState()
          if (!projectWorkspaceState.showIndividualMarkers) {
            console.log(
              "🚫 Ignoring map click - interactions disabled (not in points stage)",
            )
            return
          }

          const individualRoute = useLayerStore.getState().individualRoute
          const currentPointsCount = individualRoute.points.length

          // Allow first 2 points (origin and destination) without waypoint mode
          if (currentPointsCount < 2) {
            // Check 27-point limit (origin + 25 waypoints + destination)
            const MAX_TOTAL_POINTS = 27
            if (currentPointsCount >= MAX_TOTAL_POINTS) {
              console.warn(`⚠️ Maximum ${MAX_TOTAL_POINTS} points allowed`)
              toast.error(
                `Maximum ${MAX_TOTAL_POINTS} points allowed (origin + 25 waypoints + destination)`,
              )
              return
            }

            // Validate point is within jurisdiction boundary
            const boundary = projectWorkspaceState.projectData?.boundaryGeoJson
            if (boundary && !isPointInBoundary(lat, lng, boundary)) {
              toast.error("Point must be within the jurisdiction boundary")
              return
            }

            const pointId = `point_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`
            const newPoint = {
              id: pointId,
              coordinates: { lat, lng },
            }
            console.log("Adding individual drawing point:", newPoint)
            addPoint(newPoint)
            break
          }

          // After 2 points, only allow adding if in waypoint-adding mode
          if (!isAddingIndividualWaypoint) {
            console.log(
              "🚫 Ignoring map click - not in waypoint-adding mode. Click 'Add Waypoint' button first.",
            )
            return
          }

          // Check 27-point limit (origin + 25 waypoints + destination)
          const MAX_TOTAL_POINTS = 27
          if (currentPointsCount >= MAX_TOTAL_POINTS) {
            console.warn(`⚠️ Maximum ${MAX_TOTAL_POINTS} points allowed`)
            toast.error(
              `Maximum ${MAX_TOTAL_POINTS} points allowed (origin + 25 waypoints + destination)`,
            )
            return
          }

          // Validate point is within jurisdiction boundary
          const boundary = projectWorkspaceState.projectData?.boundaryGeoJson
          if (boundary && !isPointInBoundary(lat, lng, boundary)) {
            toast.error("Point must be within the jurisdiction boundary")
            return
          }

          const pointId = `point_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`
          const newPoint = {
            id: pointId,
            coordinates: { lat, lng },
          }
          console.log("Adding individual drawing waypoint:", newPoint)
          addPoint(newPoint)
          break
        }
        case "polygon_drawing":
          // Terra Draw handles polygon drawing, skip manual click handling
          break
        case "segmentation":
          // Already handled above, but keep for other segmentation types if needed
          break
      }
    },
    [
      mapMode,
      addPoint,
      addPolygonPoint,
      addCutPoint,
      segmentation.isActive,
      segmentation.type,
      segmentation.targetRoute,
      markerDragEndTime,
      isAddingWaypoint,
      waypointAddingRouteId,
      isAddingIndividualWaypoint,
      addWaypoint,
      cancelAddingWaypoint,
      removeSnappedRoadsForRoute,
      addSnappedRoads,
    ],
  )

  return {
    handleMapClick,
  }
}
