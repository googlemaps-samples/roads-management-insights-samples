// ui/src/components/map/context-menu/DragHandle.tsx
import { DragIndicator } from "@mui/icons-material"
import OpenWithIcon from "@mui/icons-material/OpenWith"
import React from "react"

interface DragHandleProps {
  onMouseDown: (e: React.MouseEvent) => void
  isDragging?: boolean
  style?: React.CSSProperties
}

const DragHandle: React.FC<DragHandleProps> = ({
  onMouseDown,
  isDragging = false,
  style,
}) => {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        top: "8px",
        right: "8px",
        cursor: isDragging ? "grabbing" : "grab",
        padding: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#999",
        transition: "color 0.15s",
        zIndex: 1,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.color = "#666"
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragging) {
          e.currentTarget.style.color = "#999"
        }
      }}
    >
      <OpenWithIcon fontSize="small" />
    </div>
  )
}

export default DragHandle
