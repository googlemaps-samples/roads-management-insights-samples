import {
  Check,
  Close,
  Edit,
  ExpandMore,
  HighlightAlt,
  CropFree as Polygon,
  Redo,
  Route as RouteIcon,
  Sync,
  Undo,
  UploadFile,
} from "@mui/icons-material"
import {
  Box,
  CircularProgress,
  Collapse,
  IconButton,
  Button as MuiButton,
  Popover,
  Tooltip,
} from "@mui/material"
import React, { useCallback, useMemo } from "react"

import { PRIMARY_BLUE, PRIMARY_BLUE_DARK } from "../../constants/colors"
import { apiClient } from "../../data/api-client"
import {
  useFileUploadHandlers,
  useMapModeHandlers,
  usePolygonHandlers,
  useRoutesSummary,
  useSyncProject,
  useTemporalStore,
} from "../../hooks"
import { useLayerStore, useProjectWorkspaceStore } from "../../stores"
import { useMessageStore } from "../../stores/message-store"
import { useUserPreferencesStore } from "../../stores/user-preferences-store"
import { toast } from "../../utils/toast"
import Button from "../common/Button"
import FullPageLoader from "../common/FullPageLoader"
import RoadPriorityPanel from "./RoadPriorityPanel"
import RouteNamingDialog from "./RouteNamingDialog"

interface MapControlsProps {
  className?: string
  style?: React.CSSProperties
}

const MapControls: React.FC<MapControlsProps> = ({ className, style }) => {
  const { projectData, projectId } = useProjectWorkspaceStore()

  const syncProjectMutation = useSyncProject()

  // Custom hooks for different functionalities
  const { mapMode, handleModeChange } = useMapModeHandlers()
  const { undo, redo, canUndo, canRedo } = useTemporalStore()

  // Fetch routes summary for sync diff display
  const { data: routesSummary } = useRoutesSummary(projectId || undefined)

  // Road selection state for road_selection mode
  const roadImport = useLayerStore((state) => state.roadImport)
  const setSelectionMode = useLayerStore((state) => state.setSelectionMode)
  const clearLassoDrawing = useLayerStore((state) => state.clearLassoDrawing)
  const clearLassoFilteredRoads = useLayerStore(
    (state) => state.clearLassoFilteredRoads,
  )
  const clearRouteInMaking = useLayerStore((state) => state.clearRouteInMaking)
  const saveRouteInMaking = useLayerStore((state) => state.saveRouteInMaking)
  // Check if we have actual uploaded routes (not just display-only visualization routes)
  const uploadedRoutes = useLayerStore((state) => state.uploadedRoutes)
  const hasActualUploadedRoutes = React.useMemo(() => {
    if (uploadedRoutes.routes.length === 0) return false
    // Check if all routes are display-only (e.g., "(Original)" routes for visualization)
    // If not all routes are display-only, we have actual uploaded routes
    const allRoutesAreDisplayOnly = uploadedRoutes.routes.every((route) =>
      route.name.includes("(Original)"),
    )
    return !allRoutesAreDisplayOnly
  }, [uploadedRoutes.routes])
  const [isSyncing, setIsSyncing] = React.useState(false)
  const {
    fileInputRef,
    pendingFeatureCount,
    pendingProperties,
    routeNamingDialogOpen,
    handleUploadRoute,
    handleFileUploadChange,
    handleRouteNamingConfirm,
    handleRouteNamingCancel,
  } = useFileUploadHandlers()
  const {
    isIngesting,
    priorityDialogOpen,
    handlePolygonDone,
    handleLassoDone,
    handlePriorityConfirm,
    handlePriorityCancel,
  } = usePolygonHandlers()

  // Get polygon and lasso drawing state for event listeners
  const polygonDrawing = useLayerStore((state) => state.polygonDrawing)
  const lassoDrawing = useLayerStore((state) => state.lassoDrawing)

  // Listen for custom events to complete drawing
  React.useEffect(() => {
    const handleCompletePolygon = () => {
      handlePolygonDone()
    }

    const handleCompleteLasso = () => {
      handleLassoDone()
    }

    window.addEventListener("complete-polygon-drawing", handleCompletePolygon)
    window.addEventListener("complete-lasso-selection", handleCompleteLasso)

    return () => {
      window.removeEventListener(
        "complete-polygon-drawing",
        handleCompletePolygon,
      )
      window.removeEventListener(
        "complete-lasso-selection",
        handleCompleteLasso,
      )
    }
  }, [polygonDrawing, lassoDrawing, handlePolygonDone, handleLassoDone])

  // Route options category expanded state (default to false - collapsed by default)
  const [routeOptionsExpanded, setRouteOptionsExpanded] = React.useState(false)

  // Ref for route options container to detect outside clicks
  const routeOptionsRef = React.useRef<HTMLDivElement>(null)

  // Ref for merge roads button to anchor the popover
  const mergeRoadsButtonRef = React.useRef<HTMLButtonElement>(null)

  // Close route options when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        routeOptionsRef.current &&
        !routeOptionsRef.current.contains(event.target as Node) &&
        routeOptionsExpanded
      ) {
        setRouteOptionsExpanded(false)
      }
    }

    if (routeOptionsExpanded) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [routeOptionsExpanded])
  // Check if undo/redo should be disabled (upload routes modes don't support undo/redo)
  const isUndoRedoDisabled =
    mapMode === "upload_routes" || mapMode === "editing_uploaded_route"

  // Undo/Redo handlers
  const handleUndo = () => {
    if (canUndo && !isUndoRedoDisabled) {
      console.log("🔄 Undo action triggered")
      undo()
    }
  }

  const handleRedo = () => {
    if (canRedo && !isUndoRedoDisabled) {
      console.log("🔄 Redo action triggered")
      redo()
    }
  }

  // Global keyboard shortcuts for undo/redo
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is typing into inputs/textareas/contentEditable
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return
      }

      const isModifier = e.ctrlKey || e.metaKey
      if (!isModifier) return

      const key = e.key.toLowerCase()

      // Undo: Ctrl/Cmd + Z (without Shift)
      if (key === "z" && !e.shiftKey) {
        // Disable undo in upload routes modes
        if (
          mapMode === "upload_routes" ||
          mapMode === "editing_uploaded_route"
        ) {
          return
        }
        e.preventDefault()
        if (canUndo) {
          console.log("⌨️ Undo Triggered")
          undo()
        }
        return
      }

      // Redo: Ctrl/Cmd + Y, or Ctrl/Cmd + Shift + Z
      if (key === "y" || (key === "z" && e.shiftKey)) {
        // Disable redo in upload routes modes
        if (
          mapMode === "upload_routes" ||
          mapMode === "editing_uploaded_route"
        ) {
          return
        }
        e.preventDefault()
        if (canRedo) {
          console.log("⌨️ Redo Triggered")
          redo()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [undo, redo, canUndo, canRedo, mapMode])

  // Wrapper for handleModeChange to close route options
  const handleModeChangeWithClose = (
    mode:
      | "view"
      | "individual_drawing"
      | "polygon_drawing"
      | "upload_routes"
      | "lasso_selection",
  ) => {
    // Clear global undo/redo history when switching high-level modes
    // to avoid cross-mode undo behaviour.
    useLayerStore.temporal.getState().clear()

    handleModeChange(mode, () => setRouteOptionsExpanded(false))
  }

  // Wrapper for handleUploadRoute to close route options
  const handleUploadRouteWithClose = () => {
    handleUploadRoute(() => setRouteOptionsExpanded(false))
  }

  // Handlers for road_selection mode
  const isRoadSelectionMode = mapMode === "road_selection"
  const isLassoMode = roadImport?.selectionMode === "lasso"
  const isSingleMode = roadImport?.selectionMode === "single"
  const isMultiSelectMode = roadImport?.selectionMode === "multi-select"

  const handleSelectionModeSwitch = (
    newMode: "single" | "lasso" | "multi-select",
  ) => {
    setSelectionMode(newMode)
    if (newMode === "lasso") {
      useLayerStore.getState().startLassoDrawing()
    } else {
      clearLassoDrawing()
      clearLassoFilteredRoads()
    }
    // Clear multi-select temp selection when switching to non-multi-select mode
    if (newMode !== "multi-select") {
      useLayerStore.getState().clearMultiSelectTemp()
    }
  }

  // Reusable function to delete roads from database when exiting import roads flow mode
  const deletePolygonRoads = useCallback(async () => {
    const projectId = useProjectWorkspaceStore.getState().projectId
    if (projectId) {
      try {
        await apiClient.delete(`/polygon/delete/${projectId}`)
        console.log("✅ Roads deleted successfully on exit")
      } catch (error) {
        console.error("❌ Failed to delete roads on exit:", error)
        // Don't block the exit if deletion fails, but log the error
        toast.error("Failed to delete roads", {
          description:
            error instanceof Error
              ? error.message
              : "Could not delete roads from database",
        })
      }
    }
  }, [])

  // Track previous mode to detect transitions
  const previousModeRef = React.useRef<typeof mapMode>(mapMode)

  // Call delete API whenever we exit road_selection mode (when switching modes)
  React.useEffect(() => {
    // Check if we're transitioning from road_selection to any other mode
    if (
      previousModeRef.current === "road_selection" &&
      mapMode !== "road_selection"
    ) {
      deletePolygonRoads()
    }

    // Update the ref for the next render
    previousModeRef.current = mapMode
  }, [mapMode, deletePolygonRoads])

  const handleExitRoadSelection = async () => {
    // Delete all roads from database when exiting import roads mode
    await deletePolygonRoads()
    handleModeChange("view")
  }

  // Single selection icon component
  const SingleSelectionIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="m13.775 22l-3.625-7.8L6 20V2l14 11h-7.1l3.6 7.725z" />
    </svg>
  )

  const handleGlobalSync = async () => {
    // Get project data from store
    const { projectData } = useProjectWorkspaceStore.getState()

    // Validate project data exists
    if (!projectData) {
      toast.error("Project data not available")
      return
    }

    // Extract db_project_id and project_number
    const db_project_id = parseInt(projectData.id)
    const project_number = projectData.bigQueryColumn?.googleCloudProjectNumber

    // Validate both values exist
    if (!project_number) {
      toast.error(
        "GCP project number not configured. Please configure your GCP credentials.",
      )
      return
    }

    if (isNaN(db_project_id)) {
      toast.error("Invalid project ID")
      return
    }

    const gcp_project_id = projectData.bigQueryColumn?.googleCloudProjectId
    console.log("gcp_project_id", gcp_project_id)

    if (!gcp_project_id) {
      toast.error(
        "GCP project ID not configured. Please configure your GCP credentials.",
      )
      return
    }

    const dataset_name = projectData.datasetName

    if (!dataset_name) {
      toast.error(
        "Dataset name not configured. Please configure your dataset name.",
      )
      return
    }

    setIsSyncing(true)
    try {
      await syncProjectMutation.mutateAsync({
        db_project_id,
        project_number,
        gcp_project_id,
        dataset_name,
      })
      // Toast is handled in the hook's onSuccess
    } catch {
      // Toast is handled in the hook's onError
    } finally {
      setIsSyncing(false)
    }
  }

  // Get routeUUID to check if we're editing an existing route
  const routeUUID = useLayerStore((state) => state.individualRoute.routeUUID)

  // Determine button text, icon, and styling based on active mode
  const addRoutesButtonConfig = useMemo(() => {
    // Show as active when:
    // 1. mapMode is upload_routes (actively uploading or file dialog is open)
    // 2. RouteNamingDialog is open (part of upload flow)
    // 3. We have actual uploaded routes (not just display-only visualization routes)
    if (
      mapMode === "upload_routes" ||
      routeNamingDialogOpen ||
      hasActualUploadedRoutes
    ) {
      return {
        text: "From File (GeoJSON)",
        icon: <UploadFile sx={{ fontSize: 18 }} />,
        className:
          "bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200",
        isActive: true,
      }
    }
    // Only show as active if drawing a NEW route (routeUUID is null)
    // If routeUUID exists, we're editing an existing route, so don't show as active
    if (mapMode === "individual_drawing" && routeUUID === null) {
      return {
        text: "Draw Route",
        icon: <Edit sx={{ fontSize: 18 }} />,
        className:
          "bg-blue-50 border-blue-100 border border-solid text-blue-700 hover:bg-blue-100",
        isActive: true,
      }
    }
    if (mapMode === "polygon_drawing") {
      return {
        text: "Import Roads",
        icon: isIngesting ? (
          <CircularProgress
            size={18}
            sx={{
              color: "inherit",
            }}
          />
        ) : (
          <Polygon sx={{ fontSize: 18 }} />
        ),
        className:
          "bg-green-50 border-green-100 border border-solid text-green-700 hover:bg-green-100",
        isActive: true,
      }
    }
    if (mapMode === "road_selection") {
      return {
        text: "Import Roads",
        icon: <Polygon sx={{ fontSize: 18 }} />,
        className:
          "bg-green-50 border-green-100 border border-solid text-green-700 hover:bg-green-100",
        isActive: true,
      }
    }
    return {
      text: "Add Routes",
      icon: null,
      className: "bg-white text-gray-700 hover:bg-gray-50",
      isActive: false,
    }
  }, [
    mapMode,
    isIngesting,
    routeUUID,
    hasActualUploadedRoutes,
    routeNamingDialogOpen,
  ])

  return (
    <>
      {/* Full-page loader for sync operations */}
      <FullPageLoader
        open={isSyncing || syncProjectMutation.isPending}
        message="Syncing routes, please wait..."
      />
      {/* Hidden file input for route upload - accepts only GDAL-supported geospatial formats */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson,.json,.kml,.kmz,.gpx,.zip"
        onChange={handleFileUploadChange}
        style={{ display: "none" }}
      />

      <Box
        className={`absolute top-20 left-1/2 flex flex-col gap-2 z-[1001] items-center ${className}`}
        style={{
          transform: "translateX(-50%)",
          ...style,
        }}
      >
        {/* Single Row - All Controls */}
        <Box className="flex flex-col items-center gap-2">
          {/* Main Controls Row - All in one horizontal line with unified background */}
          <Box
            className="flex flex-nowrap items-center relative"
            sx={{
              backgroundColor: "white",
              borderRadius: "50px",
              padding: "5px",
              boxShadow:
                "0 4px 12px 0 rgba(0,0,0,0.15), 0 2px 6px 0 rgba(0,0,0,0.1)",
              gap: "8px",
              whiteSpace: "nowrap",
              overflow: "visible",
              width: "max-content",
              "& > *": {
                flexShrink: 0,
              },
            }}
          >
            {/* Route Options Category */}
            <Box className="relative" ref={routeOptionsRef}>
              <Button
                onClick={() => setRouteOptionsExpanded(!routeOptionsExpanded)}
                startIcon={addRoutesButtonConfig.icon}
                endIcon={
                  <ExpandMore
                    sx={{
                      transform: routeOptionsExpanded
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      transition: "transform 0.3s ease",
                    }}
                  />
                }
                variant="text"
                disabled={mapMode === "polygon_drawing" && isIngesting}
                className={`rounded-full font-semibold transition-all duration-200 px-4 py-2.5 text-sm capitalize ${addRoutesButtonConfig.className}`}
                sx={{
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  textTransform: "none",
                  whiteSpace: "nowrap",
                  // Don't override backgroundColor when active - let Tailwind classes handle it
                  backgroundColor: addRoutesButtonConfig.isActive
                    ? undefined
                    : "transparent",
                  // Don't override border when active - let Tailwind classes handle it
                  border: addRoutesButtonConfig.isActive ? undefined : "none",
                  boxShadow: "none",
                  "&:hover": {
                    // Don't override backgroundColor when active - let Tailwind classes handle it
                    backgroundColor: addRoutesButtonConfig.isActive
                      ? undefined
                      : "rgba(0,0,0,0.05)",
                    boxShadow: "none",
                  },
                  "&.Mui-disabled": {
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    color: "rgba(16, 185, 129, 0.7)",
                  },
                }}
              >
                {addRoutesButtonConfig.text}
              </Button>

              {/* Route Options - All three buttons vertically aligned */}
              <Box
                sx={{
                  position: "absolute",
                  top: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  marginTop: "4px",
                  zIndex: 1001,
                }}
              >
                <Collapse in={routeOptionsExpanded}>
                  <Box
                    className="flex flex-col"
                    sx={{
                      backgroundColor: "white",
                      borderRadius: "16px",
                      boxShadow:
                        "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                      border: "1px solid rgba(0, 0, 0, 0.1)",
                      overflow: "hidden",
                      minWidth: "180px",
                    }}
                  >
                    {/* Upload Routes Button - Orange accent when active */}
                    <Tooltip
                      title="Upload routes from GeoJSON file"
                      arrow
                      placement="right"
                    >
                      <Button
                        onClick={handleUploadRouteWithClose}
                        startIcon={<UploadFile sx={{ fontSize: 18 }} />}
                        variant="text"
                        fullWidth
                        className={`font-medium transition-all duration-150 px-4 py-2.5 text-sm capitalize justify-start ${
                          mapMode === "upload_routes" ||
                          routeNamingDialogOpen ||
                          hasActualUploadedRoutes
                            ? "bg-orange-50 text-orange-700 hover:bg-orange-100"
                            : "bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                        sx={{
                          borderRadius: 0,
                          fontWeight: 500,
                          fontSize: "0.875rem",
                          whiteSpace: "nowrap",
                          textTransform: "none",
                          borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
                          "&:last-of-type": {
                            borderBottom: "none",
                          },
                        }}
                      >
                        From File (GeoJSON)
                      </Button>
                    </Tooltip>
                    {/* Draw Route Button - Blue accent when active - CENTER */}
                    <Tooltip
                      title="Draw a custom route on the map, adjust it, segment it and save it"
                      arrow
                      placement="right"
                    >
                      <Button
                        onClick={() =>
                          handleModeChangeWithClose("individual_drawing")
                        }
                        startIcon={<Edit sx={{ fontSize: 18 }} />}
                        variant="text"
                        fullWidth
                        className={`font-medium transition-all duration-150 px-4 py-2.5 text-sm capitalize justify-start ${
                          mapMode === "individual_drawing" && routeUUID === null
                            ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            : "bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                        sx={{
                          borderRadius: 0,
                          fontWeight: 500,
                          fontSize: "0.875rem",
                          whiteSpace: "nowrap",
                          textTransform: "none",
                          borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
                          "&:last-of-type": {
                            borderBottom: "none",
                          },
                        }}
                      >
                        Draw Route
                      </Button>
                    </Tooltip>
                    {/* Import Roads Button - Green accent when active */}
                    <Tooltip
                      title="Import all roads (or of some priority) inside a polygon boundary"
                      arrow
                      placement="right"
                    >
                      <Button
                        onClick={() =>
                          handleModeChangeWithClose("polygon_drawing")
                        }
                        startIcon={
                          isIngesting ? (
                            <CircularProgress
                              size={18}
                              sx={{
                                color: "inherit",
                              }}
                            />
                          ) : (
                            <Polygon sx={{ fontSize: 18 }} />
                          )
                        }
                        variant="text"
                        fullWidth
                        disabled={mapMode === "polygon_drawing" && isIngesting}
                        className={`font-medium transition-all duration-150 px-4 py-2.5 text-sm capitalize justify-start ${
                          mapMode === "polygon_drawing"
                            ? "bg-green-50 text-green-700 hover:bg-green-100"
                            : "bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                        sx={{
                          borderRadius: 0,
                          fontWeight: 500,
                          fontSize: "0.875rem",
                          whiteSpace: "nowrap",
                          textTransform: "none",
                          borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
                          "&:last-of-type": {
                            borderBottom: "none",
                          },
                        }}
                      >
                        Import Roads
                      </Button>
                    </Tooltip>
                  </Box>
                </Collapse>
              </Box>
            </Box>
            {/* Conditional rendering based on mode */}
            {isRoadSelectionMode ? (
              <>
                {/* Separator */}
                <Box
                  className="w-px h-8"
                  sx={{ backgroundColor: "rgba(0,0,0,0.12)" }}
                />

                {/* Single Selection Button */}
                <Tooltip title="Single Selection" placement="bottom" arrow>
                  <IconButton
                    onClick={() => handleSelectionModeSwitch("single")}
                    size="small"
                    className="transition-all duration-200"
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      backgroundColor: isSingleMode
                        ? PRIMARY_BLUE
                        : "transparent",
                      color: isSingleMode ? "#ffffff" : "#757575",
                      "&:hover": {
                        backgroundColor: isSingleMode
                          ? PRIMARY_BLUE_DARK
                          : "rgba(0,0,0,0.04)",
                      },
                    }}
                  >
                    <SingleSelectionIcon />
                  </IconButton>
                </Tooltip>

                {/* Lasso Selection Button */}
                <Tooltip title="Lasso Selection" placement="bottom" arrow>
                  <IconButton
                    onClick={() => handleSelectionModeSwitch("lasso")}
                    size="small"
                    className="transition-all duration-200"
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      backgroundColor: isLassoMode
                        ? PRIMARY_BLUE
                        : "transparent",
                      color: isLassoMode ? "#ffffff" : "#757575",
                      "&:hover": {
                        backgroundColor: isLassoMode
                          ? PRIMARY_BLUE_DARK
                          : "rgba(0,0,0,0.04)",
                      },
                    }}
                  >
                    <HighlightAlt className="w-5 h-5" />
                  </IconButton>
                </Tooltip>

                {/* Multi-select Button */}
                <Tooltip title="Merge Roads" placement="bottom" arrow>
                  <IconButton
                    ref={mergeRoadsButtonRef}
                    onClick={() => handleSelectionModeSwitch("multi-select")}
                    size="small"
                    className="transition-all duration-200"
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      backgroundColor: isMultiSelectMode
                        ? PRIMARY_BLUE
                        : "transparent",
                      color: isMultiSelectMode ? "#ffffff" : "#757575",
                      "&:hover": {
                        backgroundColor: isMultiSelectMode
                          ? PRIMARY_BLUE_DARK
                          : "rgba(0,0,0,0.04)",
                      },
                    }}
                  >
                    <RouteIcon className="w-5 h-5" />
                  </IconButton>
                </Tooltip>

                {/* Multi-select Control Popover - Show when in multi-select mode and routeInMaking has roads */}
                <Popover
                  open={
                    isMultiSelectMode &&
                    !!roadImport.routeInMaking &&
                    roadImport.routeInMakingRoadIds.length > 0
                  }
                  anchorEl={mergeRoadsButtonRef.current}
                  anchorOrigin={{
                    vertical: "bottom",
                    horizontal: "center",
                  }}
                  transformOrigin={{
                    vertical: "top",
                    horizontal: "center",
                  }}
                  disableRestoreFocus
                  disableEnforceFocus
                  disableAutoFocus
                  disablePortal={false}
                  slotProps={{
                    root: {
                      style: { pointerEvents: "none" },
                    },
                    paper: {
                      style: { pointerEvents: "auto" },
                      onMouseDown: (e: React.MouseEvent) => {
                        e.stopPropagation()
                      },
                    },
                  }}
                  sx={{
                    mt: 0.5,
                    "& .MuiBackdrop-root": {
                      backgroundColor: "transparent",
                      pointerEvents: "none",
                    },
                    "& .MuiPaper-root": {
                      borderRadius: "9999px",
                      boxShadow:
                        "0 8px 16px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08)",
                      border: "none",
                      overflow: "visible",
                      background: "transparent",
                      pointerEvents: "auto",
                    },
                  }}
                >
                  <Box
                    sx={{
                      position: "relative",
                      backgroundColor: "#ffffff",
                      borderRadius: "9999px",
                      boxShadow:
                        "0 8px 16px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08)",
                      "&::before": {
                        content: '""',
                        position: "absolute",
                        top: "-6px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 0,
                        height: 0,
                        borderLeft: "6px solid transparent",
                        borderRight: "6px solid transparent",
                        borderBottom: "6px solid #ffffff",
                        filter: "drop-shadow(0 -2px 4px rgba(0, 0, 0, 0.1))",
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        px: 1,
                        py: 0.5,
                        backgroundColor: "#ffffff",
                        borderRadius: "9999px",
                      }}
                    >
                      {/* Cancel Button */}
                      <Tooltip title="Cancel" placement="top" arrow>
                        <IconButton
                          onClick={clearRouteInMaking}
                          size="small"
                          className="transition-all duration-200"
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            color: "#757575",
                            backgroundColor: "transparent",
                            "&:hover": {
                              backgroundColor: "rgba(0,0,0,0.04)",
                            },
                          }}
                        >
                          <Close sx={{ fontSize: 20 }} />
                        </IconButton>
                      </Tooltip>

                      {/* Save Route Button with Road Count */}
                      <Tooltip title="Merge roads" placement="top" arrow>
                        <MuiButton
                          onClick={saveRouteInMaking}
                          variant="contained"
                          startIcon={
                            <Check sx={{ fontSize: 20, fontWeight: 600 }} />
                          }
                          className="transition-all duration-200"
                          sx={{
                            height: 40,
                            borderRadius: "9999px",
                            backgroundColor: PRIMARY_BLUE,
                            color: "#ffffff",
                            px: 2.5,
                            py: 0,
                            textTransform: "none",
                            fontSize: "14px",
                            fontWeight: 600,
                            fontFamily: '"Google Sans", sans-serif',
                            whiteSpace: "nowrap",
                            boxShadow:
                              "0 2px 4px rgba(9, 87, 208, 0.2), 0 1px 2px rgba(9, 87, 208, 0.15)",
                            "&:hover": {
                              backgroundColor: PRIMARY_BLUE_DARK,
                              boxShadow:
                                "0 4px 8px rgba(9, 87, 208, 0.3), 0 2px 4px rgba(9, 87, 208, 0.2)",
                              transform: "translateY(-1px)",
                            },
                            "&:active": {
                              transform: "translateY(0)",
                              boxShadow: "0 1px 2px rgba(9, 87, 208, 0.2)",
                            },
                            "& .MuiButton-startIcon": {
                              marginRight: 1,
                              marginLeft: 0,
                              "& > *:nth-of-type(1)": {
                                fontSize: "20px",
                              },
                            },
                          }}
                        >
                          Merge {roadImport.routeInMakingRoadIds?.length || 0}{" "}
                          road
                          {(roadImport.routeInMakingRoadIds?.length || 0) !== 1
                            ? "s"
                            : ""}
                        </MuiButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </Popover>

                {/* Exit Button - Only show when NOT in multi-select mode with roads selected */}
                {!(
                  isMultiSelectMode &&
                  roadImport.routeInMaking &&
                  roadImport.routeInMakingRoadIds.length > 0
                ) && (
                  <>
                    {/* Separator */}
                    <Box
                      className="w-px h-8"
                      sx={{ backgroundColor: "rgba(0,0,0,0.12)" }}
                    />

                    {/* Exit Button */}
                    <Tooltip
                      title="Exit Import Roads Mode"
                      placement="bottom"
                      arrow
                    >
                      <IconButton
                        onClick={handleExitRoadSelection}
                        size="small"
                        className="text-gray-600 hover:bg-gray-100 transition-all duration-200"
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                        }}
                      >
                        <Close sx={{ fontSize: 20 }} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Separator */}
                <Box
                  className="w-px h-8"
                  sx={{ backgroundColor: "rgba(0,0,0,0.12)" }}
                />
                {/* Sync Button - With text and diff */}
                <Tooltip
                  title={
                    routesSummary
                      ? `Sync all routes to Roads Management Insights. ${routesSummary.added} route${routesSummary.added !== 1 ? "s" : ""} will be added, ${routesSummary.deleted} route${routesSummary.deleted !== 1 ? "s" : ""} will be deleted.`
                      : "Sync all routes to Roads Management Insights"
                  }
                  arrow
                >
                  <Button
                    onClick={handleGlobalSync}
                    disabled={isSyncing}
                    startIcon={
                      <Sync
                        sx={{
                          fontSize: 18,
                          animation: isSyncing
                            ? "spin 1s linear infinite"
                            : "none",
                          "@keyframes spin": {
                            "0%": { transform: "rotate(0deg)" },
                            "100%": { transform: "rotate(360deg)" },
                          },
                        }}
                      />
                    }
                    variant="text"
                    className="rounded-full font-semibold transition-all duration-200 px-4 py-2.5 min-w-[120px] text-sm capitalize text-gray-700 hover:bg-gray-50 active:scale-100"
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      whiteSpace: "nowrap",
                      backgroundColor: "transparent",
                      border: "none",
                      boxShadow: "none",
                      "&:hover": {
                        backgroundColor: "rgba(0,0,0,0.05)",
                        boxShadow: "none",
                      },
                      "&.Mui-disabled": {
                        backgroundColor: "transparent",
                        color: "rgba(0,0,0,0.38)",
                      },
                    }}
                  >
                    Sync Routes
                    {routesSummary &&
                      (routesSummary.added > 0 ||
                        routesSummary.deleted > 0) && (
                        <span className="ml-2 text-sm font-medium">
                          (
                          {routesSummary.added > 0 && (
                            <span className="text-green-600">
                              +{routesSummary.added}
                            </span>
                          )}
                          {routesSummary.added > 0 &&
                            routesSummary.deleted > 0 && <span>/</span>}
                          {routesSummary.deleted > 0 && (
                            <span className="text-red-600">
                              -{routesSummary.deleted}
                            </span>
                          )}
                          )
                        </span>
                      )}
                  </Button>
                </Tooltip>
              </>
            )}
            {/* Undo/Redo Group - Only show when not in import modes */}
            <>
              {/* Separator */}
              <Box
                className="w-px h-8"
                sx={{ backgroundColor: "rgba(0,0,0,0.12)" }}
              />

              {/* Undo/Redo Group - Combined pill container */}
              <Box
                className="flex items-center rounded-full overflow-hidden"
                sx={{
                  backgroundColor: "transparent",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                <Tooltip title="Undo (Ctrl+Z)" arrow>
                  <IconButton
                    size="small"
                    onClick={handleUndo}
                    disabled={!canUndo || isUndoRedoDisabled}
                    className="rounded-none rounded-l-full w-10 h-10 flex items-center justify-center transition-all duration-150"
                    sx={{
                      color:
                        canUndo && !isUndoRedoDisabled
                          ? "rgba(0,0,0,0.87)"
                          : "rgba(0,0,0,0.26)",
                      fontSize: "10px",
                      backgroundColor: "transparent",
                      "&:hover": {
                        backgroundColor:
                          canUndo && !isUndoRedoDisabled
                            ? "rgba(0,0,0,0.05)"
                            : "transparent",
                      },
                      "&.Mui-disabled": {
                        color: "rgba(0,0,0,0.26)",
                        opacity: 0.5,
                      },
                    }}
                  >
                    <Undo fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Box
                  className="w-px h-7"
                  sx={{ backgroundColor: "rgba(0,0,0,0.12)" }}
                />
                <Tooltip title="Redo (Ctrl+Y)" arrow>
                  <IconButton
                    size="small"
                    onClick={handleRedo}
                    disabled={!canRedo || isUndoRedoDisabled}
                    className="rounded-none rounded-r-full w-10 h-10 flex items-center justify-center transition-all duration-150"
                    sx={{
                      color:
                        canRedo && !isUndoRedoDisabled
                          ? "rgba(0,0,0,0.87)"
                          : "rgba(0,0,0,0.26)",
                      backgroundColor: "transparent",
                      "&:hover": {
                        backgroundColor:
                          canRedo && !isUndoRedoDisabled
                            ? "rgba(0,0,0,0.05)"
                            : "transparent",
                      },
                      "&.Mui-disabled": {
                        color: "rgba(0,0,0,0.26)",
                        opacity: 0.5,
                      },
                    }}
                  >
                    <Redo fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </>
          </Box>
        </Box>
      </Box>

      {/* Road Priority Dialog */}
      {mapMode === "polygon_drawing" && (
        <RoadPriorityPanel
          open={priorityDialogOpen}
          onClose={handlePriorityCancel}
          onConfirm={handlePriorityConfirm}
          isIngesting={isIngesting}
        />
      )}

      {/* Route Naming Dialog */}
      <RouteNamingDialog
        open={routeNamingDialogOpen}
        onClose={handleRouteNamingCancel}
        onConfirm={handleRouteNamingConfirm}
        featureCount={pendingFeatureCount}
        availableProperties={pendingProperties}
      />
    </>
  )
}

export default MapControls
