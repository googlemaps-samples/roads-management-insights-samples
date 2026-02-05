// ui/src/components/markers/SegmentationMarkers.tsx
import { useCallback } from "react"

import { useLayerStore } from "../../stores"
import DraggableCutPointMarker from "./DraggableCutPointMarker"

const SegmentationMarkers: React.FC = () => {
  const segmentation = useLayerStore((state) => state.segmentation)
  const startDragging = useLayerStore((state) => state.startDragging)
  const endDragging = useLayerStore((state) => state.endDragging)
  const removeCutPoint = useLayerStore((state) => state.removeCutPoint)

  const handleDragStart = useCallback(
    (pointId: string, position: { lat: number; lng: number }) => {
      console.log("🔍 Drag started for cut point:", pointId, position)
      startDragging(pointId, position)
    },
    [startDragging],
  )

  const handleDragEnd = useCallback(
    (pointId: string, position: { lat: number; lng: number }) => {
      console.log("🔍 Drag ended for cut point:", pointId, position)
      endDragging(pointId, position)
    },
    [endDragging],
  )

  const handleDelete = useCallback(
    (pointId: string) => {
      removeCutPoint(pointId)
    },
    [removeCutPoint],
  )

  if (segmentation.cutPoints.length === 0) return null

  return (
    <>
      {segmentation.cutPoints.map((point) => (
        <DraggableCutPointMarker
          key={point.id}
          point={point}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDelete={handleDelete}
          isSnapped={point.isSnapped}
          isDragging={point.isDragging}
        />
      ))}
    </>
  )
}

export default SegmentationMarkers
