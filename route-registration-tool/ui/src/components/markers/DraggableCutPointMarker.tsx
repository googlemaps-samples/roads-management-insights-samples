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

// ui/src/components/markers/DraggableCutPointMarker.tsx
import { Delete } from "@mui/icons-material"
import { Box, IconButton } from "@mui/material"
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
} from "@vis.gl/react-google-maps"
import { useCallback } from "react"

import { PRIMARY_RED, PRIMARY_RED_LIGHT } from "../../constants/colors"
import { CutPoint } from "../../types/route"
import ScissorMarker from "./ScissorMarker"

interface DraggableCutPointMarkerProps {
  point: CutPoint
  onDragStart: (pointId: string, position: { lat: number; lng: number }) => void
  onDragEnd: (pointId: string, position: { lat: number; lng: number }) => void
  onDelete: (pointId: string) => void
  isSnapped?: boolean
  isDragging?: boolean
}

const DraggableCutPointMarker: React.FC<DraggableCutPointMarkerProps> = ({
  point,
  onDragStart,
  onDragEnd,
  onDelete,
  isSnapped: _isSnapped,
  isDragging: _isDragging,
}) => {
  // const [isDraggingLocal, setIsDraggingLocal] = useState(false)

  // const handleDragStart = useCallback(
  //   (_event: any) => {
  //     const position = {
  //       lat: point.coordinates.lat,
  //       lng: point.coordinates.lng,
  //     }
  //     setIsDraggingLocal(true)
  //     onDragStart(point.id, position)
  //   },
  //   [point.id, point.coordinates.lat, point.coordinates.lng, onDragStart],
  // )

  // const handleDragEnd = useCallback(
  //   (event: any) => {
  //     if (!isDraggingLocal) return

  //     const position = {
  //       lat: event.latLng.lat(),
  //       lng: event.latLng.lng(),
  //     }

  //     setIsDraggingLocal(false)
  //     onDragEnd(point.id, position)
  //   },
  //   [point.id, onDragEnd, isDraggingLocal],
  // )

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDelete(point.id)
    },
    [point.id, onDelete],
  )

  return (
    <AdvancedMarker
      position={{ lat: point.coordinates.lat, lng: point.coordinates.lng }}
      draggable={false}
      anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
    >
      <Box
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="hidden">
          <ScissorMarker />
        </div>
        {/* Delete button positioned as overlay on the marker */}
        <IconButton
          size="small"
          onClick={handleDeleteClick}
          onMouseDown={(e) => e.stopPropagation()}
          sx={{
            position: "absolute",
            top: -8,
            right: -8,
            backgroundColor: "#ffffff",
            color: PRIMARY_RED,
            width: 20,
            height: 20,
            padding: 0,
            minWidth: 20,
            boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
            border: "1px solid #ffcdd2",
            zIndex: 1000,
            "&:hover": {
              backgroundColor: PRIMARY_RED_LIGHT,
              color: "#c62828",
              transform: "scale(1.1)",
            },
            transition: "all 0.2s ease",
          }}
          title="Delete cut point"
        >
          <Delete sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
    </AdvancedMarker>
  )
}

export default DraggableCutPointMarker
