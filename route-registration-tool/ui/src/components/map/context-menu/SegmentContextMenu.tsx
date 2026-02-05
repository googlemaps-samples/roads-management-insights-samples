// ui/src/components/map/context-menu/SegmentContextMenu.tsx
import { ContentCopy, Info, ZoomIn } from "@mui/icons-material"
import React, { useEffect } from "react"

import { copyToClipboard } from "../../../utils/clipboard"
import ContextMenu, { ContextMenuItem } from "../../common/ContextMenu"

interface SegmentContextMenuProps {
  x: number
  y: number
  segment: any
  onClose: () => void
}

const SegmentContextMenu: React.FC<SegmentContextMenuProps> = ({
  x,
  y,
  segment,
  onClose,
}) => {

  const handleViewDetails = () => {
    console.log("View details:", segment)
    const distance = segment.distance
      ? `${segment.distance.toFixed(2)} km`
      : "N/A"
    const order = segment.segmentOrder || "Unknown"

    alert(
      `Segment Details:\nSegment Order: ${order}\nID: ${segment.id}\nDistance: ${distance}`,
    )
    onClose()
  }

  const handleCopyId = async () => {
    const success = await copyToClipboard(String(segment.id), "Segment ID")
    if (success) {
      console.log("✅ Segment ID copied successfully")
    }
    onClose()
  }

  const handleZoomTo = () => {
    console.log("Zoom to segment:", segment)
    // Add your zoom logic here
    onClose()
  }

  const getSegmentColor = () => {
    const colors = [
      "🟠", // Orange
      "🟢", // Green
      "🔵", // Blue
      "🟣", // Purple
      "🟡", // Yellow
      "🔴", // Red
      "🟤", // Brown
      "🔷", // Cyan
      "🟠", // Deep Orange
      "🟣", // Deep Purple
    ]
    const order = segment.segmentOrder || 0
    return colors[order % colors.length]
  }

  // Build menu items (no need for dividers - ContextMenu handles them automatically)
  const menuItems: ContextMenuItem[] = [
    {
      id: "view-details",
      label: "View Details",
      icon: <Info sx={{ fontSize: 16 }} />,
      onClick: handleViewDetails,
    },
    {
      id: "copy-id",
      label: "Copy Segment ID",
      icon: <ContentCopy sx={{ fontSize: 16 }} />,
      onClick: handleCopyId,
    },
    {
      id: "zoom-to",
      label: "Zoom to Segment",
      icon: <ZoomIn sx={{ fontSize: 16 }} />,
      onClick: handleZoomTo,
    },
  ]

  return (
    <ContextMenu
      x={x}
      y={y}
      onClose={onClose}
      draggable={true}
      width={200}
      header={{
        title: `${getSegmentColor()} Segment ${segment.segmentOrder || "?"}`,
        subtitle: segment.distance
          ? `Distance: ${segment.distance.toFixed(2)} km`
          : "Segmentation preview",
      }}
      items={menuItems}
    />
  )
}

export default SegmentContextMenu
