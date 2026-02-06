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

import Close from "@mui/icons-material/Close"
import {
  Box,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
} from "@mui/material"
import React from "react"

import { ROAD_PRIORITIES, RoadPriority } from "../../constants/road-priorities"
import Button from "../common/Button"
import RoadPrioritySelector from "../common/RoadPrioritySelector"

interface RoadPriorityPanelProps {
  open: boolean
  onClose: () => void
  onConfirm: (priorities: RoadPriority[]) => void
  initialSelection?: RoadPriority[]
  className?: string
  isIngesting?: boolean
}

const RoadPriorityPanel: React.FC<RoadPriorityPanelProps> = ({
  open,
  onClose,
  onConfirm,
  initialSelection,
  isIngesting = false,
}) => {
  const [selected, setSelected] = React.useState<RoadPriority[]>([])
  const [expandedCategories, setExpandedCategories] = React.useState<
    Record<string, boolean>
  >({})
  const [wasIngesting, setWasIngesting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      // Pre-select all priorities if no initial selection is provided
      const allPriorities = ROAD_PRIORITIES.map((p) => p.value)
      setSelected(initialSelection ?? allPriorities)
      // Keep all categories collapsed by default
      setExpandedCategories({})
      setWasIngesting(false)
    } else {
      // Reset when panel closes
      setSelected([])
      setExpandedCategories({})
      setWasIngesting(false)
    }
  }, [open, initialSelection])

  // Track when ingestion completes to ensure panel closes
  React.useEffect(() => {
    if (isIngesting) {
      setWasIngesting(true)
    } else if (wasIngesting && !isIngesting && open) {
      // Ingestion just completed - close the panel
      // The hook should already close it, but this ensures it closes
      onClose()
      setWasIngesting(false)
    }
  }, [isIngesting, wasIngesting, open, onClose])

  const handleConfirm = () => {
    if (selected.length === 0 || isIngesting) return
    onConfirm(selected)
    // Don't close the panel or clear selection - the hook will handle closing after ingestion completes
  }

  const handleClose = () => {
    // Prevent closing while ingesting
    if (isIngesting) return
    onClose()
  }

  if (!open) return null

  return (
    <Box
      className="fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white flex"
      sx={{
        width: "360px",
        fontFamily: "'Google Sans', 'Roboto', sans-serif",
        zIndex: 1000,
      }}
    >
      <Box
        className="h-full flex flex-col border-r border-gray-200 bg-white"
        sx={{
          width: "360px",
          boxShadow:
            "0 4px 16px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1)",
          position: "relative",
          zIndex: 1000,
        }}
      >
        {/* Header Section - Fixed Height */}
        <Box
          className="px-4 pt-3 pb-3 border-b border-gray-200 bg-white"
          sx={{
            flexShrink: 0,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <Typography
                variant="h6"
                className="text-gray-900 font-medium"
                style={{ fontSize: "15px", fontWeight: 500 }}
              >
                Road Priorities
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem", lineHeight: 1.2 }}
              >
                Filter roads when importing.
              </Typography>
            </div>
            <IconButton
              size="small"
              onClick={handleClose}
              disabled={isIngesting}
            >
              <Close fontSize="small" />
            </IconButton>
          </div>
        </Box>

        {/* Road Priorities Selector - At the top */}
        <Box
          className="flex-1 overflow-auto pretty-scrollbar px-4 py-3 border-b border-gray-200 bg-white"
          sx={{
            flexShrink: 0,
            minHeight: 0,
          }}
        >
          <RoadPrioritySelector
            selectedPriorities={selected}
            onSelectionChange={setSelected}
            expandedCategories={expandedCategories}
            onExpandedCategoriesChange={setExpandedCategories}
          />
        </Box>

        {/* Footer */}
        <Box
          className="px-4 py-4 border-t border-gray-200 bg-white"
          sx={{
            flexShrink: 0,
            minHeight: "48px",
            position: "relative",
            zIndex: 1001,
          }}
        >
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              fullWidth
              onClick={handleClose}
              disabled={isIngesting}
              size="small"
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              fullWidth
              onClick={handleConfirm}
              disabled={selected.length === 0 || isIngesting}
              size="small"
              startIcon={
                isIngesting ? (
                  <CircularProgress
                    size={16}
                    sx={{
                      color: "inherit",
                    }}
                  />
                ) : null
              }
              sx={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {isIngesting
                ? "Importing roads..."
                : `Confirm (${selected.length})`}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}

export default RoadPriorityPanel
