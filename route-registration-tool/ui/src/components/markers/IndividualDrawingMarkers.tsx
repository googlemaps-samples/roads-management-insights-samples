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

// ui/src/components/markers/IndividualDrawingMarkers.tsx
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
} from "@vis.gl/react-google-maps"
import { useCallback } from "react"

import { useLayerStore, useProjectWorkspaceStore } from "../../stores"
import { isPointInBoundary } from "../../utils/boundary-validation"
import { toast } from "../../utils/toast"
import { RedPinMarker } from "./OptimizedRouteMarkers"

const CIRCULAR_MARKER_SIZE = 20

const IndividualDrawingMarkers: React.FC = () => {
  const individualRoute = useLayerStore((state) => state.individualRoute)
  const movePoint = useLayerStore((state) => state.movePoint)
  const setMarkerDragEndTime = useLayerStore(
    (state) => state.setMarkerDragEndTime,
  )
  const { showIndividualMarkers } = useProjectWorkspaceStore()
  const layerVisibility = useLayerStore((state) => state.layerVisibility)
  
  // Check if waypoint markers layer is visible (default to true if not set)
  const areMarkersVisible = layerVisibility["waypoint-markers"] !== false

  const handleDragEnd = useCallback(
    (pointId: string, newLat: number, newLng: number) => {
      // Only allow dragging if interactions are enabled
      if (!showIndividualMarkers) {
        return
      }

      console.log("🎯 Marker drag ended:", {
        pointId,
        newLat,
        newLng,
        timestamp: Date.now(),
      })

      // Validate point is within jurisdiction boundary
      const projectData = useProjectWorkspaceStore.getState().projectData
      const boundary = projectData?.boundaryGeoJson
      if (boundary && !isPointInBoundary(newLat, newLng, boundary)) {
        toast.error("Point must be within the jurisdiction boundary")
        return // Prevent the move
      }

      movePoint(pointId, { lat: newLat, lng: newLng })
      // Record timestamp to prevent spurious map clicks
      const timestamp = Date.now()
      setMarkerDragEndTime(timestamp)
      console.log("✅ Set markerDragEndTime to:", timestamp)
    },
    [movePoint, setMarkerDragEndTime, showIndividualMarkers],
  )

  // Always show markers if points exist, but interactions are controlled by showIndividualMarkers
  // Also respect layer visibility toggle
  if (individualRoute.points.length === 0 || !areMarkersVisible) return null

  const size = CIRCULAR_MARKER_SIZE

  return (
    <>
      {individualRoute.points.map((point, index) => {
        const isFirst = index === 0
        const isLast = index === individualRoute.points.length - 1
        const pointType = isFirst
          ? "origin"
          : isLast
            ? "destination"
            : "waypoint"

        return (
          <AdvancedMarker
            key={point.id}
            position={{
              lat: point.coordinates.lat,
              lng: point.coordinates.lng,
            }}
            // only do this anchor point if not destination
            anchorPoint={
              pointType === "destination"
                ? AdvancedMarkerAnchorPoint.BOTTOM
                : AdvancedMarkerAnchorPoint.CENTER
            }
            draggable={showIndividualMarkers}
            onDragEnd={(e) => {
              const lat = e.latLng?.lat()
              const lng = e.latLng?.lng()
              if (lat !== undefined && lng !== undefined) {
                handleDragEnd(point.id, lat, lng)
              }
            }}
          >
            {pointType === "origin" ? (
              <div
                className={`rounded-full p-1 ${
                  showIndividualMarkers ? "cursor-grab" : "cursor-default"
                }`}
              >
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
              </div>
            ) : pointType === "destination" ? (
              <div
                style={{
                  transition: "transform 0.2s ease",
                  cursor: showIndividualMarkers ? "grab" : "default",
                }}
              >
                <RedPinMarker />
              </div>
            ) : (
              // Waypoint: numbered badge
              <div
                className={`w-7 h-7 rounded-full bg-[#2196F3] text-white text-xs font-semibold flex items-center justify-center shadow-md border-2 border-white ${
                  showIndividualMarkers ? "cursor-grab" : "cursor-default"
                }`}
              >
                {index}
              </div>
            )}
          </AdvancedMarker>
        )
      })}
    </>
  )
}

export default IndividualDrawingMarkers
