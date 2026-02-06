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

import { Edit } from "@mui/icons-material"
import { Box, Divider, IconButton, Typography } from "@mui/material"
import React, { useState } from "react"

import { useDeleteRoute, useUpdateRoute } from "../../hooks/use-api"
import { useLayerStore } from "../../stores"
import { type MapMode, useProjectWorkspaceStore } from "../../stores"
import { getColorsForMapType } from "../../stores/layer-store/utils/color-utils"
import { formatDistance, useDistanceUnit } from "../../utils/distance-utils"
import { calculateRouteLengthFromPolyline } from "../../utils/polyline-decoder"
import { toast } from "../../utils/toast"
import { useResponsiveTypography } from "../../utils/typography-utils"
import Button from "../common/Button"
import ConfirmationDialog from "../common/ConfirmationDialog"
import RenameDialog from "../common/RenameDialog"
import RightPanel from "./RightPanel"

interface RouteDetailsPanelProps {}

const RouteDetailsPanel: React.FC<RouteDetailsPanelProps> = () => {
  const selectedRoute = useProjectWorkspaceStore((state) => state.selectedRoute)
  const selectRoute = useProjectWorkspaceStore((state) => state.selectRoute)
  const panels = useProjectWorkspaceStore((state) => state.panels)
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const mapType = useProjectWorkspaceStore((state) => state.mapType)
  const routeUUID = useLayerStore((state) => state.individualRoute.routeUUID)
  const segmentation = useLayerStore((state) => state.segmentation)
  const rightPanelType = useProjectWorkspaceStore(
    (state) => state.rightPanelType,
  )
  const setRightPanelType = useProjectWorkspaceStore(
    (state) => state.setRightPanelType,
  )
  const dynamicIslandHeight = useProjectWorkspaceStore(
    (state) => state.dynamicIslandHeight,
  )
  const distanceUnit = useDistanceUnit()
  const colors = getColorsForMapType(mapType)
  const typo = useResponsiveTypography()
  // Store functions
  const { loadRouteForEditing, updateRoute, removeRoute } =
    useProjectWorkspaceStore()
  const { loadRoutePoints, setRouteUUID, clearPoints } = useLayerStore()

  // Hooks
  const updateRouteMutation = useUpdateRoute()
  const deleteRouteMutation = useDeleteRoute()

  // Calculate route length from encoded polyline if available
  // This ensures we always show the calculated value, which is more accurate
  const calculatedRouteLength = React.useMemo(() => {
    if (!selectedRoute?.encodedPolyline) {
      return null
    }
    return calculateRouteLengthFromPolyline(selectedRoute.encodedPolyline)
  }, [selectedRoute?.encodedPolyline])

  // Use calculated route length if available (more accurate), otherwise fall back to selectedRoute.distance
  const displayDistance = calculatedRouteLength ?? selectedRoute?.distance ?? 0

  // State for rename dialog
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Close panel when entering edit mode for a NEW route (not when editing existing route)
  // Only deselect if routeUUID is null AND we're transitioning INTO individual_drawing mode
  // (which means we're creating a new route, not switching between route modifications)
  const prevMapModeRef = React.useRef<MapMode | null>(null)
  React.useEffect(() => {
    const wasInDrawingMode = prevMapModeRef.current === "individual_drawing"
    const isNowInDrawingMode = mapMode === "individual_drawing"

    // Update ref for next render
    prevMapModeRef.current = mapMode

    // Only deselect if:
    // 1. We're in individual_drawing mode
    // 2. A route is selected
    // 3. routeUUID is null (meaning new route, not editing existing)
    // 4. We're transitioning INTO drawing mode (not already in it)
    if (
      isNowInDrawingMode &&
      selectedRoute !== null &&
      routeUUID === null &&
      !wasInDrawingMode // Only deselect when entering drawing mode for the first time
    ) {
      selectRoute(null)
    }
  }, [mapMode, selectedRoute, selectRoute, routeUUID])

  // Set rightPanelType when route is selected
  // Only set to "route_details" if no other panel type is active
  // Also handle "route_ready", "segmentation", and "naming" cases - clear them and set to "route_details" when selecting a route
  // BUT: Don't change these if we're in individual_drawing mode (route modification flow)
  React.useEffect(() => {
    if (selectedRoute !== null) {
      // Don't change rightPanelType if we're in individual_drawing mode
      // This allows RouteReadyStage, SegmentationStage, and NamingStage to show during route modification
      if (mapMode === "individual_drawing") {
        return
      }

      // If rightPanelType is "route_ready", "segmentation", or "naming", clear it and set to "route_details"
      // This handles the case when selecting a route after modifying another route
      if (
        rightPanelType === "route_ready" ||
        rightPanelType === "segmentation" ||
        rightPanelType === "naming"
      ) {
        setRightPanelType("route_details")
      } else if (rightPanelType !== "route_details") {
        setRightPanelType("route_details")
      }
    } else if (selectedRoute === null && rightPanelType === "route_details") {
      setRightPanelType(null)
    }
  }, [selectedRoute, rightPanelType, setRightPanelType, mapMode])

  // Hide panel when in individual_drawing mode (editing existing or creating new route) or when segmentation is active
  const isInIndividualDrawingMode = mapMode === "individual_drawing"
  const isSegmentationActive =
    mapMode === "segmentation" || segmentation.isActive
  const isVisible =
    panels.right.visible &&
    selectedRoute !== null &&
    !isInIndividualDrawingMode &&
    !isSegmentationActive &&
    rightPanelType === "route_details"

  if (!isVisible || !selectedRoute) {
    return null
  }

  const handleClose = () => {
    // Dispatch custom event to close context menu if it's open
    const closeContextMenuEvent = new CustomEvent("closeContextMenu")
    window.dispatchEvent(closeContextMenuEvent)

    selectRoute(null)
    setRightPanelType(null)
  }

  const handleRename = () => {
    if (!selectedRoute) return
    setRenameDialogOpen(true)
  }

  const handleRenameSave = async (newName: string) => {
    if (!selectedRoute) return

    try {
      const updatedRoute = await updateRouteMutation.mutateAsync({
        routeId: selectedRoute.id,
        updates: { name: newName },
      })

      if (updatedRoute) {
        updateRoute(selectedRoute.id, { name: newName })
      }

      setRenameDialogOpen(false)
    } catch (error) {
      console.error("❌ Failed to update route name:", error)
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update route name"
      toast.error(errorMessage)
      throw error // Re-throw to prevent dialog from closing
    }
  }

  const confirmDelete = () => {
    if (!selectedRoute) return

    console.log("🗑️ Deleting route:", selectedRoute.name)
    deleteRouteMutation.mutate(selectedRoute.id, {
      onSuccess: () => {
        console.log("✅ Route deleted successfully")
        removeRoute(selectedRoute.id)
        handleClose()
      },
      onError: (error: Error) => {
        console.error("❌ Failed to delete route:", error)
        alert(`Failed to delete route: ${error.message}`)
      },
    })
    setDeleteDialogOpen(false)
  }

  // Convert route_status to sync_status for color mapping
  const routeStatusToSyncStatus = (
    status?: "STATUS_RUNNING" | "STATUS_VALIDATING" | "STATUS_INVALID",
  ): "synced" | "validating" | "invalid" | "unsynced" => {
    switch (status) {
      case "STATUS_RUNNING":
        return "synced"
      case "STATUS_VALIDATING":
        return "validating"
      case "STATUS_INVALID":
        return "invalid"
      default:
        return "unsynced"
    }
  }

  // Convert RGBA array to CSS color for text
  const rgbaToCss = ([r, g, b]: [number, number, number, number]): string =>
    `rgb(${r}, ${g}, ${b})`

  const getRouteStatusTextColor = (
    status?: "STATUS_RUNNING" | "STATUS_VALIDATING" | "STATUS_INVALID",
  ) => {
    const syncStatus = routeStatusToSyncStatus(status)
    const routeColor = colors.routeStatusColors[syncStatus]
    return rgbaToCss(routeColor)
  }

  const getRouteStatusLabel = (
    status?: "STATUS_RUNNING" | "STATUS_VALIDATING" | "STATUS_INVALID",
  ) => {
    switch (status) {
      case "STATUS_RUNNING":
        return "Running"
      case "STATUS_VALIDATING":
        return "Validating"
      case "STATUS_INVALID":
        return "Invalid"
      default:
        return "Unsynced"
    }
  }

  return (
    <RightPanel
      dynamicIslandHeight={dynamicIslandHeight}
      title={
        <Typography
          component="div"
          noWrap
          title={selectedRoute.name || "Unnamed Route"}
          className=" font-medium text-gray-900 leading-[1.2] max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap"
          sx={{
            fontFamily: '"Google Sans", sans-serif',
            fontWeight: 500,
            paddingRight: 1,
            fontSize: "18px",
          }}
        >
          {selectedRoute.name || "Unnamed Route"}
        </Typography>
      }
      headerContent={
        <IconButton
          size="small"
          onClick={handleRename}
          disabled={renameDialogOpen}
          sx={{
            color: "#5f6368",
            "&:hover": {
              backgroundColor: "#f1f3f4",
            },
          }}
          title="Rename route"
        >
          <Edit sx={{ fontSize: 16 }} />
        </IconButton>
      }
      onClose={handleClose}
    >
      <Box
        sx={{
          p: 1.5,
          px: 2.5,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {/* Route Info */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
          }}
        >
          {/* Distance */}
          {(selectedRoute.distance !== undefined ||
            calculatedRouteLength !== null) && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography
                sx={{
                  fontSize: typo.body.small,
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 500,
                  color: "#5f6368",
                }}
              >
                Distance
              </Typography>
              <Typography
                sx={{
                  fontSize: typo.body.small,
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 500,
                  color: "#202124",
                }}
              >
                {formatDistance(displayDistance, distanceUnit)}
              </Typography>
            </Box>
          )}

          {/* Type */}
          {selectedRoute.type && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography
                sx={{
                  fontSize: typo.body.small,
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 500,
                  color: "#5f6368",
                }}
              >
                Type
              </Typography>
              <Typography
                sx={{
                  fontSize: typo.body.small,
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 600,
                  color:
                    selectedRoute.type === "uploaded"
                      ? "#f57c00" // Orange for uploaded
                      : "#1976d2", // Blue for drawn
                }}
              >
                {selectedRoute.type.charAt(0).toUpperCase() +
                  selectedRoute.type.slice(1)}
              </Typography>
            </Box>
          )}

          {/* Tag/Folder */}
          {selectedRoute.tag && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography
                sx={{
                  fontSize: typo.body.small,
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 500,
                  color: "#5f6368",
                }}
              >
                Folder Name
              </Typography>
              <Typography
                title={selectedRoute.tag}
                sx={{
                  fontSize: typo.body.small,
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 500,
                  color: "#202124",
                  textAlign: "right",
                  maxWidth: "calc(100% - 120px)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {selectedRoute.tag}
              </Typography>
            </Box>
          )}

          {/* Sync Status - Only show for routes without segments */}
          {selectedRoute.sync_status && !selectedRoute.isSegmented && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography
                sx={{
                  fontSize: typo.body.small,
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 500,
                  color: "#5f6368",
                }}
              >
                Sync Status
              </Typography>
              <Typography
                sx={{
                  fontSize: typo.body.small,
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 600,
                  color: getRouteStatusTextColor(selectedRoute.route_status),
                }}
              >
                {getRouteStatusLabel(selectedRoute.route_status)}
              </Typography>
            </Box>
          )}

          {/* Segmented */}
          {selectedRoute.isSegmented && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography
                sx={{
                  fontSize: typo.body.small,
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 500,
                  color: "#5f6368",
                }}
              >
                Segments
              </Typography>
              <Typography
                sx={{
                  fontSize: typo.body.small,
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 500,
                  color: "#202124",
                }}
              >
                {selectedRoute.segmentCount || 0} segments
              </Typography>
            </Box>
          )}

          {/* Match Percentage (for uploaded routes) */}
          {selectedRoute.matchPercentage !== undefined &&
            selectedRoute.matchPercentage !== null && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Typography
                  sx={{
                    fontSize: typo.body.small,
                    fontFamily: '"Google Sans", sans-serif',
                    fontWeight: 500,
                    color: "#5f6368",
                  }}
                >
                  Match
                </Typography>
                <Typography
                  sx={{
                    fontSize: typo.body.small,
                    fontFamily: '"Google Sans", sans-serif',
                    fontWeight: 600,
                    color:
                      selectedRoute.matchPercentage >= 80
                        ? "#2e7d32" // Green for high match
                        : selectedRoute.matchPercentage >= 60
                          ? "#e65100" // Orange for medium match
                          : "#c62828", // Red for low match
                  }}
                >
                  {Math.round(selectedRoute.matchPercentage)}%
                </Typography>
              </Box>
            )}
        </Box>
      </Box>
      <Divider />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {/* Actions */}
        <Box
          sx={{
            p: 1.5,
            px: "20px",
            display: "flex",
            gap: 1,
          }}
        >
          <Button
            variant="outlined"
            size="small"
            fullWidth
            onClick={() => setDeleteDialogOpen(true)}
            sx={{
              py: 0.75,
              fontSize: typo.body.small,
              minHeight: "32px",
              textTransform: "none",
            }}
          >
            Delete
          </Button>
          <Button
            variant="contained"
            size="small"
            fullWidth
            onClick={() => {
              const closeContextMenuEvent = new CustomEvent("closeContextMenu")
              window.dispatchEvent(closeContextMenuEvent)

              loadRouteForEditing(
                selectedRoute,
                loadRoutePoints,
                setRouteUUID,
                clearPoints,
              )
              setRightPanelType(null)
            }}
            sx={{
              py: 0.75,
              fontSize: typo.body.small,
              minHeight: "32px",
              textTransform: "none",
            }}
          >
            Modify
          </Button>
        </Box>
      </Box>
      {/* Rename Dialog */}
      <RenameDialog
        open={renameDialogOpen}
        currentName={selectedRoute?.name || ""}
        onClose={() => setRenameDialogOpen(false)}
        onSave={handleRenameSave}
        title="Rename Route"
        label="Route Name"
        isLoading={updateRouteMutation.isPending}
        formId="rename-route-details-form"
      />
      {/* Delete Confirmation Modal */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Route"
        message="Are you sure you want to delete this route? This action cannot be undone."
        confirmText="Delete"
        isLoading={deleteRouteMutation.isPending}
      />
    </RightPanel>
  )
}

export default RouteDetailsPanel
