import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
} from "@vis.gl/react-google-maps"
import React, { useCallback, useState } from "react"

import { Waypoint } from "../../stores/layer-store"
import { useMessageStore } from "../../stores/message-store"
import { useProjectWorkspaceStore } from "../../stores/project-workspace-store"
import { isPointInBoundary } from "../../utils/boundary-validation"
import { toast } from "../../utils/toast"

interface WaypointMarkerProps {
  waypoint: Waypoint
  routeId: string
  onDragEnd: (
    waypointId: string,
    position: { lat: number; lng: number },
  ) => void
}

export const WaypointMarker: React.FC<WaypointMarkerProps> = ({
  waypoint,
  routeId,
  onDragEnd,
}) => {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragStart = useCallback(() => {
    setIsDragging(true)
  }, [])

  const handleDragEnd = useCallback(
    (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return
      setIsDragging(false)

      const newPosition = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
      }

      // Validate waypoint is within jurisdiction boundary
      const projectData = useProjectWorkspaceStore.getState().projectData
      const boundary = projectData?.boundaryGeoJson
      if (
        boundary &&
        !isPointInBoundary(newPosition.lat, newPosition.lng, boundary)
      ) {
        toast.error("Waypoint must be within the jurisdiction boundary")
        return // Prevent the move
      }

      // Clear boundary-related error messages when waypoint is moved successfully
      const { dismissMessagesByPattern } = useMessageStore.getState()
      dismissMessagesByPattern(/jurisdiction boundary|outside.*boundary/i, "error")

      onDragEnd(waypoint.id, newPosition)
    },
    [waypoint.id, onDragEnd],
  )

  return (
    <AdvancedMarker
      position={waypoint.position}
      draggable={true}
      anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={`Waypoint ${waypoint.order + 1} - Drag to move`}
    >
      <div
        style={{
          transform: `scale(${isDragging ? 1.2 : 1})`,
          transition: "transform 0.2s ease",
          cursor: "grab",
        }}
      >
        <div className="w-7 h-7 rounded-full bg-[#2196F3] text-white text-xs font-semibold flex items-center justify-center shadow-md border-2 border-white">
          {waypoint.order + 1}
        </div>
      </div>
    </AdvancedMarker>
  )
}

export default WaypointMarker
