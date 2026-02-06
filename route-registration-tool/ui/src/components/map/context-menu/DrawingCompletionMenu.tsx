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

// ui/src/components/map/context-menu/DrawingCompletionMenu.tsx
import { Check, Close, Refresh } from "@mui/icons-material"
import { CircularProgress, IconButton } from "@mui/material"
import React from "react"

import { useDraggableMenu } from "./useDraggableMenu"

interface DrawingCompletionMenuProps {
  x: number
  y: number
  mode: "polygon_drawing" | "lasso_selection"
  onContinue: () => void
  onCancel: () => void
  onRetry: () => void
  onClose: () => void
  isIngesting?: boolean
}

const DrawingCompletionMenu: React.FC<DrawingCompletionMenuProps> = ({
  x,
  y,
  onContinue,
  onCancel,
  onRetry,
  onClose,
  isIngesting = false,
}) => {
  // Drag functionality
  const { position } = useDraggableMenu({
    initialX: x,
    initialY: y,
  })

  return (
    <div
      data-draggable-menu
      className="fixed bg-white rounded-full z-[10000]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        minWidth: "240px",
        boxShadow: "0 4px 12px 0 rgba(0,0,0,0.15), 0 2px 6px 0 rgba(0,0,0,0.1)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-0.5">
          <span className="text-sm font-medium text-gray-700">
            Complete Polygon?
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-1 items-center gap-0.5 ml-2">
          {/* Cancel - Exit mode */}
          <IconButton
            onClick={() => {
              onCancel()
              onClose()
            }}
            size="small"
            title="Cancel and exit"
            sx={{
              color: "#6b7280",
              "&:hover": {
                backgroundColor: "#f3f4f6",
                color: "#374151",
              },
            }}
          >
            <Close sx={{ fontSize: 18 }} />
          </IconButton>

          {/* Retry - Draw again */}
          <IconButton
            onClick={() => {
              onRetry()
            }}
            size="small"
            title="Draw again"
            sx={{
              color: "#6b7280",
              "&:hover": {
                backgroundColor: "#f3f4f6",
                color: "#374151",
              },
            }}
          >
            <Refresh sx={{ fontSize: 18 }} />
          </IconButton>

          {/* Done - Confirm */}
          <IconButton
            onClick={() => {
              onContinue()
              // Never close here - let it close when API completes (handled in handlePriorityConfirm)
              // The menu will stay open and show loading spinner until API response
            }}
            size="small"
            title="Confirm and continue"
            disabled={isIngesting}
            sx={{
              color: "#6b7280",
              "&:hover": {
                backgroundColor: "#f3f4f6",
                color: "#374151",
              },
              "&:disabled": {
                color: "#9ca3af",
              },
            }}
          >
            {isIngesting ? (
              <CircularProgress size={14} sx={{ color: "#6b7280" }} />
            ) : (
              <Check sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </div>
      </div>
    </div>
  )
}

export default DrawingCompletionMenu
