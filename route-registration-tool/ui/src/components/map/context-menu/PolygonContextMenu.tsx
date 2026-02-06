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

// ui/src/components/map/context-menu/PolygonContextMenu.tsx
import React, { useEffect, useRef, useState } from "react"

import { useDeletePolygon } from "../../../hooks/use-api"
import { copyToClipboard, formatRelativeDate } from "../../../utils/clipboard"
import ConfirmationDialog from "../../common/ConfirmationDialog"
import DragHandle from "./DragHandle"
import MenuButton from "./MenuButton"
import { useDraggableMenu } from "./useDraggableMenu"

interface PolygonContextMenuProps {
  x: number
  y: number
  polygon: any
  onClose: () => void
}

const PolygonContextMenu: React.FC<PolygonContextMenuProps> = ({
  x,
  y,
  polygon,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const deletePolygonMutation = useDeletePolygon()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Drag functionality
  const { position, isDragging, handleMouseDown } = useDraggableMenu({
    initialX: x,
    initialY: y,
  })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if dragging
      if (isDragging) return

      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [onClose, isDragging])

  const handleDelete = () => {
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    console.log("🗑️ Deleting polygon:", polygon.id)
    deletePolygonMutation.mutate(polygon.id, {
      onSuccess: () => {
        console.log("✅ Polygon deleted successfully")
        setDeleteDialogOpen(false)
        onClose()
      },
      onError: (error: Error) => {
        console.error("❌ Failed to delete polygon:", error)
        alert(`Failed to delete polygon: ${error.message}`)
        setDeleteDialogOpen(false)
        onClose()
      },
    })
  }

  const handleViewDetails = () => {
    console.log("View details:", polygon)
    const created = polygon.created_at
      ? formatRelativeDate(polygon.created_at)
      : "Unknown"
    const updated = polygon.updated_at
      ? formatRelativeDate(polygon.updated_at)
      : "Unknown"

    alert(
      `Polygon Details:\nID: ${polygon.id}\nProject ID: ${polygon.project_id || "N/A"}\nCreated: ${created}\nLast Updated: ${updated}`,
    )
    onClose()
  }

  const handleCopyId = async () => {
    const success = await copyToClipboard(String(polygon.id), "Polygon ID")
    if (success) {
      console.log("✅ Polygon ID copied successfully")
    }
    onClose()
  }

  const handleZoomTo = () => {
    console.log("Zoom to polygon:", polygon)
    // Add your zoom logic here (calculate bounds from boundary_geojson)
    onClose()
  }

  const handleEdit = () => {
    console.log("Edit polygon:", polygon)
    // Add your edit logic here
    onClose()
  }

  const handleDeleteWithRoads = () => {
    console.log("Delete polygon with roads , to be implemented later:", polygon)
    // Add your delete logic here
    onClose()
  }

  return (
    <div
      ref={menuRef}
      data-draggable-menu
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        backgroundColor: "white",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 10000,
        minWidth: "180px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #e0e0e0",
          backgroundColor: "#fafafa",
          position: "relative",
        }}
      >
        <DragHandle onMouseDown={handleMouseDown} isDragging={isDragging} />
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#333" }}>
          Polygon #{polygon.id}
        </div>
        <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
          Created:{" "}
          {polygon.created_at
            ? formatRelativeDate(polygon.created_at)
            : "Unknown"}
        </div>
      </div>

      {/* Menu Items */}
      <div style={{ padding: "2px 0" }}>
        <MenuButton label="Copy Polygon ID" onClick={handleCopyId} />
        <div
          style={{ height: "1px", backgroundColor: "#e0e0e0", margin: "3px 0" }}
        />
        <MenuButton label="Delete Polygon" onClick={handleDelete} danger />
        <MenuButton
          label="Delete Polygon with Roads"
          onClick={handleDeleteWithRoads}
          danger
        />
      </div>
      <ConfirmationDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false)
          onClose()
        }}
        onConfirm={confirmDelete}
        title="Delete Polygon"
        message={`Delete polygon #${polygon.id}? This will soft delete the polygon and its associated routes and roads.`}
        confirmText="Delete"
        isLoading={deletePolygonMutation.isPending}
      />
    </div>
  )
}

export default PolygonContextMenu
