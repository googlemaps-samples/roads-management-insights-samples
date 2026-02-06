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
