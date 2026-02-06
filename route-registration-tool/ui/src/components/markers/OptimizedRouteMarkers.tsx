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

import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  useMap,
} from "@vis.gl/react-google-maps"
import React, { useCallback, useState } from "react"

import { PRIMARY_RED_GOOGLE } from "../../constants/colors"
import { googleRoutesApi } from "../../data/api/google-routes-api"
import { useLayerStore } from "../../stores/layer-store"
import { useMessageStore } from "../../stores/message-store"
import { useProjectWorkspaceStore } from "../../stores/project-workspace-store"
import { isPointInBoundary } from "../../utils/boundary-validation"
import { decodePolylineToGeoJSON } from "../../utils/polyline-decoder"
import { calculateRouteSimilarity } from "../../utils/route-similarity"
import { toast } from "../../utils/toast"
import WaypointMarker from "./WaypointMarker"

// Common size for circular markers (origin and end base)
const CIRCULAR_MARKER_SIZE = 20

/**
 * Custom origin marker with white outline and dark ring
 */
const OriginMarker: React.FC<{ scale?: number }> = ({ scale = 1 }) => {
  const size = CIRCULAR_MARKER_SIZE * scale

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* White outer outline */}
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        stroke="white"
        strokeWidth="1"
      />
      {/* Dark ring with white center */}
      <circle
        cx="16"
        cy="16"
        r="10"
        fill="white"
        stroke="#2f302f"
        strokeWidth="6"
      />
    </svg>
  )
}

/**
 * Custom red map pin marker with circular target base
 */
export const RedPinMarker: React.FC<{ scale?: number }> = ({ scale = 1 }) => {
  const size = 60 * scale // Increased from 40 to 60
  const pinHeight = size * 0.75

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: pinHeight,
      }}
    >
      {/* Red pin shape - tip at bottom (coordinate point) */}
      <svg
        width={size * 0.75}
        height={pinHeight}
        viewBox="0 0 48 72"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: "absolute",
          bottom: 0, // Pin tip at the coordinate
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        {/* Outer pin shape */}
        <path
          d="
      M24 0
      C13 0 4 9 4 20
      C4 34 17 48 22.5 67
      C22.8 68 23.3 72 24 72
      C24.7 72 25.2 68 25.5 67
      C31 48 44 34 44 20
      C44 9 35 0 24 0Z
    "
          fill={PRIMARY_RED_GOOGLE}
          stroke="#b11313"
          strokeWidth="1"
        />

        {/* Inner circle */}
        <circle cx="24" cy="20" r="8" fill="#b11313" />
      </svg>
    </div>
  )
}

/**
 * Single Route Markers - Renders draggable start/end markers for one route
 */
interface SingleRouteMarkersProps {
  routeId: string
  routeIndex: number
  routeName: string
  startMarker: { lat: number; lng: number }
  endMarker: { lat: number; lng: number }
  onRegenerateRoute: (routeId: string) => Promise<void>
}

const SingleRouteMarkers: React.FC<SingleRouteMarkersProps> = ({
  routeId,
  routeIndex,
  routeName,
  startMarker,
  endMarker,
  onRegenerateRoute,
}) => {
  const updateOptimizedRouteMarker = useLayerStore(
    (state) => state.updateOptimizedRouteMarker,
  )
  const setDraggingMarker = useLayerStore((state) => state.setDraggingMarker)
  const updateWaypoint = useLayerStore((state) => state.updateWaypoint)
  const setMarkerDragEndTime = useLayerStore(
    (state) => state.setMarkerDragEndTime,
  )
  const snappedRoads = useLayerStore((state) => state.snappedRoads)

  // Get waypoints for this route
  const routeMarkers = snappedRoads.routeMarkers.find(
    (m) => m.routeId === routeId,
  )
  const waypoints = routeMarkers?.waypoints || []

  const handleWaypointDragEnd = useCallback(
    (waypointId: string, position: { lat: number; lng: number }) => {
      // Validate waypoint is within jurisdiction boundary
      const projectData = useProjectWorkspaceStore.getState().projectData
      const boundary = projectData?.boundaryGeoJson
      if (
        boundary &&
        !isPointInBoundary(position.lat, position.lng, boundary)
      ) {
        toast.error("Waypoint must be within the jurisdiction boundary")
        return // Prevent the move
      }

      // Clear boundary-related error messages when waypoint is moved successfully
      const { dismissMessagesByPattern } = useMessageStore.getState()
      dismissMessagesByPattern(
        /jurisdiction boundary|outside.*boundary/i,
        "error",
      )

      // Update waypoint in temporary editing state
      updateWaypoint(routeId, waypointId, position)

      // Record timestamp to prevent spurious map clicks
      const timestamp = Date.now()
      setMarkerDragEndTime(timestamp)
      console.log("✅ Set markerDragEndTime to:", timestamp)

      // Generate preview roads if we're in edit mode
      const store = useLayerStore.getState()
      const editingState = store.getEditingState(routeId)
      if (editingState) {
        // Defer route regeneration to avoid blocking the pointerup event handler
        // This prevents "Violation: 'pointerup' handler took Xms" warnings
        setTimeout(() => {
          // Generate preview roads from temporary markers
          onRegenerateRoute(routeId).catch((error) => {
            console.error("Failed to generate preview roads:", error)
          })
        }, 0)
      }
    },
    [routeId, updateWaypoint, onRegenerateRoute, setMarkerDragEndTime],
  )
  const [draggedMarker, setDraggedMarker] = useState<
    `${string}-start` | `${string}-end` | null
  >(null)

  const handleMarkerDragStart = (type: "start" | "end") => {
    console.log(`🖱️ Started dragging ${type} marker for route ${routeId}`)
    setDraggedMarker(`${routeId}-${type}`)
    setDraggingMarker(true)
  }

  const handleMarkerDrag = (
    type: "start" | "end",
    event: google.maps.MapMouseEvent,
  ) => {
    if (!event.latLng) return

    const newPosition = {
      lat: event.latLng.lat(),
      lng: event.latLng.lng(),
    }

    updateOptimizedRouteMarker(routeId, type, newPosition)
  }

  const handleMarkerDragEnd = (
    type: "start" | "end",
    event: google.maps.MapMouseEvent,
  ) => {
    if (!event.latLng) return

    console.log(`✋ Finished dragging ${type} marker for route ${routeId}`)
    setDraggedMarker(null)
    setDraggingMarker(false)

    // Record timestamp to prevent spurious map clicks
    const timestamp = Date.now()
    setMarkerDragEndTime(timestamp)
    console.log("✅ Set markerDragEndTime to:", timestamp)

    const newPosition = {
      lat: event.latLng.lat(),
      lng: event.latLng.lng(),
    }

    // Validate marker is within jurisdiction boundary
    const projectData = useProjectWorkspaceStore.getState().projectData
    const boundary = projectData?.boundaryGeoJson
    if (
      boundary &&
      !isPointInBoundary(newPosition.lat, newPosition.lng, boundary)
    ) {
      toast.error(
        `${type === "start" ? "Origin" : "Destination"} marker must be within the jurisdiction boundary`,
      )
      return // Prevent the move
    }

    // Clear boundary-related error messages when marker is moved successfully
    const { dismissMessagesByPattern } = useMessageStore.getState()
    dismissMessagesByPattern(
      /jurisdiction boundary|outside.*boundary/i,
      "error",
    )

    // Update the marker position in temporary editing state
    updateOptimizedRouteMarker(routeId, type, newPosition)

    // Generate preview roads if we're in edit mode
    // Check if there's an editing state (route is being edited)
    const store = useLayerStore.getState()
    const editingState = store.getEditingState(routeId)
    if (editingState) {
      // Defer route regeneration to avoid blocking the pointerup event handler
      // This prevents "Violation: 'pointerup' handler took Xms" warnings
      setTimeout(() => {
        // Generate preview roads from temporary markers
        onRegenerateRoute(routeId).catch((error) => {
          console.error("Failed to generate preview roads:", error)
        })
      }, 0)
    }
  }

  const isStartDragging = draggedMarker === `${routeId}-start`
  const isEndDragging = draggedMarker === `${routeId}-end`

  const routeNumber = routeIndex + 1

  return (
    <>
      {/* Start Marker - Origin marker */}
      <AdvancedMarker
        position={startMarker}
        draggable={true}
        anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
        onDragStart={() => handleMarkerDragStart("start")}
        onDrag={(e) => handleMarkerDrag("start", e)}
        onDragEnd={(e) => handleMarkerDragEnd("start", e)}
        title={`Start Point - ${routeName} (Route ${routeNumber})\nDrag to change`}
      >
        <div
          style={{
            transform: `scale(${isStartDragging ? 1.2 : 1})`,
            transition: "transform 0.2s ease",
            cursor: "grab",
          }}
        >
          <OriginMarker scale={isStartDragging ? 1.2 : 1} />
        </div>
      </AdvancedMarker>

      {/* End Marker - Red pin with target base */}
      <AdvancedMarker
        position={endMarker}
        draggable={true}
        anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}
        onDragStart={() => handleMarkerDragStart("end")}
        onDrag={(e) => handleMarkerDrag("end", e)}
        onDragEnd={(e) => handleMarkerDragEnd("end", e)}
        title={`End Point - ${routeName} (Route ${routeNumber})\nDrag to change`}
      >
        <div
          style={{
            transform: `scale(${isEndDragging ? 1.2 : 1})`,
            transition: "transform 0.2s ease",
            cursor: "grab",
          }}
        >
          <RedPinMarker />
        </div>
      </AdvancedMarker>

      {/* Waypoint Markers */}
      {waypoints.map((waypoint) => (
        <WaypointMarker
          key={waypoint.id}
          waypoint={waypoint}
          routeId={routeId}
          onDragEnd={handleWaypointDragEnd}
        />
      ))}
    </>
  )
}

/**
 * OptimizedRouteMarkers - Renders markers for the selected route only
 */
export const OptimizedRouteMarkers: React.FC = () => {
  const map = useMap()
  const snappedRoads = useLayerStore((state) => state.snappedRoads)
  const uploadedRoutes = useLayerStore((state) => state.uploadedRoutes)
  const addSnappedRoads = useLayerStore((state) => state.addSnappedRoads)
  const removeSnappedRoadsForRoute = useLayerStore(
    (state) => state.removeSnappedRoadsForRoute,
  )
  const addPreviewRoads = useLayerStore((state) => state.addPreviewRoads)
  const removePreviewRoadsForRoute = useLayerStore(
    (state) => state.removePreviewRoadsForRoute,
  )
  const setSnappedRoadsLoading = useLayerStore(
    (state) => state.setSnappedRoadsLoading,
  )
  const selectedUploadedRouteId = useLayerStore(
    (state) => state.selectedUploadedRouteId,
  )
  const getEditingState = useLayerStore((state) => state.getEditingState)

  const [regeneratingRouteId, setRegeneratingRouteId] = useState<string | null>(
    null,
  )

  const regenerateOptimizedRoute = useCallback(
    async (routeId: string) => {
      // Use the store's get function to get the latest state at call time
      // This ensures we have the most recent waypoint updates even if the callback
      // was created with stale data in its closure
      const store = useLayerStore.getState()

      // Check if we're in edit mode - use temporary markers if available
      const editingState = getEditingState(routeId)
      const markers =
        editingState?.temporaryMarkers ||
        store.snappedRoads.routeMarkers.find((m) => m.routeId === routeId)

      if (!markers) {
        console.warn("No markers found for route:", routeId)
        return
      }

      try {
        setRegeneratingRouteId(routeId)
        setSnappedRoadsLoading(true)

        console.log("🔄 Regenerating optimized route with new markers:", {
          routeId,
          start: markers.startMarker,
          end: markers.endMarker,
          waypoints: markers.waypoints,
        })

        // Build waypoints array if they exist
        const waypoints =
          markers.waypoints.length > 0
            ? markers.waypoints
                .sort((a, b) => a.order - b.order)
                .map((wp) => ({
                  lat: wp.position.lat,
                  lng: wp.position.lng,
                }))
            : []

        // Call Google Routes API using consolidated API
        const apiResponse = await googleRoutesApi.generateRoute(
          markers.startMarker,
          markers.endMarker,
          waypoints,
        )

        if (!apiResponse.success || !apiResponse.data) {
          throw new Error(apiResponse.message || "Failed to generate route")
        }

        const { encodedPolyline, distance, duration } = apiResponse.data
        const distanceKm = distance.toFixed(2)
        const durationMinutes = duration.toFixed(0)

        console.log(
          `✅ Regenerated optimized route for ${routeId}: ${distanceKm}km, ${durationMinutes}min`,
        )

        // Decode the polyline to GeoJSON
        const decodedGeometry = decodePolylineToGeoJSON(encodedPolyline)

        // Create a feature for the optimized route
        const routeFeature: GeoJSON.Feature = {
          type: "Feature",
          geometry: decodedGeometry,
          properties: {
            id: `${routeId}-optimized`,
            name: "Optimized Route",
            source: "google_routes_api",
            distance: distanceKm,
            duration: durationMinutes,
            traffic_aware: true,
            encodedPolyline: encodedPolyline,
          },
        }

        // Validate route is within boundary
        const projectStore = useProjectWorkspaceStore.getState()
        const boundary = projectStore.projectData?.boundaryGeoJson
        if (boundary) {
          // Extract coordinates from the route
          const coordinates: [number, number][] = []
          if (decodedGeometry.type === "LineString") {
            // LineString coordinates are Position[] which is number[][]
            decodedGeometry.coordinates.forEach((coord) => {
              if (Array.isArray(coord) && coord.length >= 2) {
                coordinates.push([coord[0] as number, coord[1] as number])
              }
            })
          } else if (decodedGeometry.type === "MultiLineString") {
            // MultiLineString coordinates are Position[][]
            decodedGeometry.coordinates.forEach((line) => {
              if (Array.isArray(line)) {
                line.forEach((coord) => {
                  if (Array.isArray(coord) && coord.length >= 2) {
                    coordinates.push([coord[0] as number, coord[1] as number])
                  }
                })
              }
            })
          }

          // Optimize boundary validation by sampling coordinates instead of checking all
          // For routes with many coordinates, check every Nth coordinate plus start/end
          // This significantly speeds up validation while still catching boundary violations
          const MAX_SAMPLES = 50 // Maximum number of coordinates to check
          const sampleStep = Math.max(
            1,
            Math.floor(coordinates.length / MAX_SAMPLES),
          )
          const samplesToCheck: [number, number][] = []

          // Always check first and last coordinates
          if (coordinates.length > 0) {
            samplesToCheck.push(coordinates[0])
            if (coordinates.length > 1) {
              samplesToCheck.push(coordinates[coordinates.length - 1])
            }
          }

          // Sample intermediate coordinates
          for (
            let i = sampleStep;
            i < coordinates.length - 1;
            i += sampleStep
          ) {
            samplesToCheck.push(coordinates[i])
          }

          // Check if sampled coordinates are within the boundary
          const allWithinBoundary = samplesToCheck.every(([lng, lat]) =>
            isPointInBoundary(lat, lng, boundary),
          )

          if (!allWithinBoundary) {
            // Remove any existing preview roads since validation failed
            const editingState = getEditingState(routeId)
            if (editingState) {
              removePreviewRoadsForRoute(routeId)
            }
            toast.error("Route is outside the jurisdiction boundary")
            return
          }
        }

        // Check if we're in edit mode - if so, add to preview roads instead
        const editingState = getEditingState(routeId)
        if (editingState) {
          // Remove old preview roads and add new one as preview
          removePreviewRoadsForRoute(routeId)
          addPreviewRoads(routeId, [routeFeature])
          console.log("🎉 Preview route generated successfully!")

          // Calculate and update match percentage for uploaded routes
          const projectStore = useProjectWorkspaceStore.getState()
          const route = projectStore.routes.find((r) => r.id === routeId)

          if (
            route &&
            route.type === "uploaded" &&
            route.originalRouteGeoJson
          ) {
            try {
              // Calculate match percentage using the newly generated route geometry
              if (decodedGeometry.type === "LineString") {
                const matchPercentage = calculateRouteSimilarity(
                  route.originalRouteGeoJson,
                  decodedGeometry,
                )

                // Ensure match percentage is between 0 and 100
                const clampedMatchPercentage = Math.max(
                  0,
                  Math.min(100, matchPercentage),
                )

                // Update the route's match percentage in the store
                projectStore.updateRoute(routeId, {
                  matchPercentage: clampedMatchPercentage,
                })
              }
            } catch (error) {
              console.error(
                `❌ Error calculating match percentage for route ${routeId}:`,
                error,
              )
            }
          }
        } else {
          // Remove old snapped roads and add new one
          removeSnappedRoadsForRoute(routeId)
          addSnappedRoads(routeId, [routeFeature])
          console.log("🎉 Route regenerated successfully!")
        }
      } catch (error) {
        console.error("❌ Failed to regenerate optimized route:", error)
      } finally {
        setRegeneratingRouteId(null)
        setSnappedRoadsLoading(false)
      }
    },
    [
      setSnappedRoadsLoading,
      removeSnappedRoadsForRoute,
      addSnappedRoads,
      addPreviewRoads,
      removePreviewRoadsForRoute,
      getEditingState,
    ],
  )

  // Check if waypoint markers layer is visible (default to true if not set)
  const layerVisibility = useLayerStore((state) => state.layerVisibility)
  const areMarkersVisible = layerVisibility["waypoint-markers"] !== false

  // Don't render if no markers are set or if markers are hidden
  if (snappedRoads.routeMarkers.length === 0 || !areMarkersVisible) {
    return null
  }

  // Filter markers to only show the selected route
  const markersToRender = selectedUploadedRouteId
    ? snappedRoads.routeMarkers.filter(
        (m) => m.routeId === selectedUploadedRouteId,
      )
    : []

  return (
    <>
      {/* Render markers only for the selected route */}
      {markersToRender.map((markers, index) => {
        // Find the uploaded route to get its name
        const uploadedRoute = uploadedRoutes.routes.find(
          (r) => r.id === markers.routeId,
        )
        const routeName = uploadedRoute?.name || `Route ${index + 1}`

        // Use temporary markers if route is being edited
        const editingState = getEditingState(markers.routeId)
        const displayMarkers = editingState?.temporaryMarkers || markers

        return (
          <SingleRouteMarkers
            key={markers.routeId}
            routeId={markers.routeId}
            routeIndex={index}
            routeName={routeName}
            startMarker={displayMarkers.startMarker}
            endMarker={displayMarkers.endMarker}
            onRegenerateRoute={regenerateOptimizedRoute}
          />
        )
      })}

      {/* Loading indicator when regenerating */}
      {regeneratingRouteId && map && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg z-[1001]">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-primary-600 border-t-transparent rounded-full" />
            <span className="text-sm font-medium text-gray-700">
              Regenerating route {regeneratingRouteId}...
            </span>
          </div>
        </div>
      )}
    </>
  )
}

export default OptimizedRouteMarkers
