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

import {
  Add,
  ArrowBack,
  CheckBox,
  CheckBoxOutlineBlank,
  Close,
  ContentCut,
  Delete,
  DriveFileRenameOutlineSharp,
  Error as ErrorIcon,
  ExpandLess,
  ExpandMore,
  Folder,
  Home,
  InfoOutlined,
  MoreVert,
  Route,
  Sync,
  Upload,
} from "@mui/icons-material"
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove"
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline"
import EditLocationAltIcon from "@mui/icons-material/EditLocationAlt"
import {
  Autocomplete,
  Box,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material"
import { useVirtualizer } from "@tanstack/react-virtual"
import React, { useEffect, useMemo, useState } from "react"
import { useInView } from "react-intersection-observer"

import ContextMenu, {
  ContextMenuItem,
} from "../../components/common/ContextMenu"
import FloatingSheet from "../../components/common/FloatingSheet"
import SearchBar from "../../components/common/SearchBar"
import UnsavedRoutesDialog from "../../components/common/UnsavedRoutesDialog"
import { PRIMARY_BLUE, PRIMARY_RED_LIGHT } from "../../constants/colors"
import { useMapNavigation } from "../../contexts/map-navigation-context"
import { useUnsavedChangesNavigation } from "../../contexts/unsaved-changes-context"
import { routesApi } from "../../data/api/routes-api"
import {
  useBatchDeleteRoutes,
  useBatchMoveRoutes,
  useDeleteRoute,
  useDeleteTag,
  useFileUploadHandlers,
  useInfiniteRoutes,
  useInfiniteRoutesById,
  useMoveTag,
  useRenameTag,
  useRouteTags,
  useSegmentTag,
  useSelectRoute,
  useStretchTag,
  useSyncFolder,
  useSyncRoute,
  useToggleRouteEnabled,
  useUnifiedSearch,
  useUpdateRoute,
} from "../../hooks"
import { useDebouncedValue } from "../../hooks/use-debounced-value"
import { useRouteSelection } from "../../hooks/use-route-selection"
import {
  useLayerStore,
  useMessageStore,
  useProjectWorkspaceStore,
} from "../../stores"
import { getColorsForMapType } from "../../stores/layer-store/utils/color-utils"
import type {
  RouteSegment,
  Route as RouteType,
} from "../../stores/project-workspace-store"
import { formatDistance, useDistanceUnit } from "../../utils/distance-utils"
import {
  calculateRouteLengthFromPolyline,
  decodePolylineToGeoJSON,
} from "../../utils/polyline-decoder"
import { toast } from "../../utils/toast"
import {
  pxToMuiSpacing,
  useResponsiveTypography,
} from "../../utils/typography-utils"
import Button from "../common/Button"
import ConfirmationDialog from "../common/ConfirmationDialog"
import FullPageLoader from "../common/FullPageLoader"
import Modal from "../common/Modal"
import RenameDialog from "../common/RenameDialog"
import RouteFilter from "./RouteFilter"
import RouteTypeFilter from "./RouteTypeFilter"
import SyncStatusButton, { SyncStatus } from "./SyncStatusButton"

interface RoutesPanelProps {
  className?: string
  style?: React.CSSProperties
}

// Component for rendering segments list with virtualization support
interface SegmentsListProps {
  segments: RouteSegment[]
  routeId: string
  isSelected: boolean
  multiSelectEnabled: boolean
  selectedRoute: any
  routesStore: any[]
  onNavigateToSegment: (segment: RouteSegment, e: React.MouseEvent) => void
  onHoverSegment: (segmentId: string | null) => void
  onSyncSegment: (segmentId: string) => void
  onRenameSegment: (segmentId: string, parentRouteId: string) => void
  syncingRouteId: string | null
  projectId: string | null
  toggleRouteMutation: any
  distanceUnit: "km" | "miles"
  searchQuery?: string
}

const SegmentsList: React.FC<SegmentsListProps> = ({
  segments,
  routeId,
  isSelected,
  multiSelectEnabled,
  selectedRoute,
  routesStore,
  onNavigateToSegment,
  onHoverSegment,
  onSyncSegment,
  onRenameSegment,
  syncingRouteId,
  projectId,
  toggleRouteMutation,
  distanceUnit,
  searchQuery,
}) => {
  const typo = useResponsiveTypography()

  // Subscribe to hovered segment ID from map hover
  const selectedRouteHoveredSegmentId = useLayerStore(
    (state) => state.selectedRouteHoveredSegmentId,
  )

  const sortedSegments = React.useMemo(
    () =>
      [...segments].sort(
        (a, b) => (a.segment_order || 0) - (b.segment_order || 0),
      ),
    [segments],
  )

  const shouldVirtualize = sortedSegments.length > 100
  const listParentRef = React.useRef<HTMLDivElement>(null)

  // Ref for storing segment element refs for scrolling
  const segmentRefs = React.useRef<Map<string, HTMLDivElement>>(new Map())

  // Ref to track if hover came from panel (to prevent auto-scroll on panel hover)
  const hoverSourceRef = React.useRef<"panel" | "map" | null>(null)

  const virtualizer = useVirtualizer({
    count: sortedSegments.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 72, // Approximate segment card height
    overscan: 5,
    enabled: shouldVirtualize,
  })

  const currentRouteToUse = React.useMemo(
    () =>
      selectedRoute?.id === routeId
        ? selectedRoute
        : routesStore.find((r: any) => r.id === routeId) || null,
    [selectedRoute, routeId, routesStore],
  )

  // Wrapper for onHoverSegment that tracks source as "panel"
  const handlePanelHover = React.useCallback(
    (segmentId: string | null) => {
      // Mark that this hover came from panel before updating state
      hoverSourceRef.current = "panel"
      onHoverSegment(segmentId)
      // Reset the ref after state update completes
      // Use requestAnimationFrame to ensure state update happens first
      requestAnimationFrame(() => {
        setTimeout(() => {
          hoverSourceRef.current = null
        }, 50)
      })
    },
    [onHoverSegment],
  )

  // Effect to scroll to and highlight hovered segment from map only
  // Don't scroll when hover comes from panel (tracked via hoverSourceRef)
  React.useEffect(() => {
    // Skip scrolling if hover came from panel
    if (hoverSourceRef.current === "panel") {
      // Reset ref for next check (in case map hover happens next)
      hoverSourceRef.current = null
      return
    }

    // Check if the hovered segment belongs to this route's segments
    const hoveredSegmentBelongsToThisRoute = sortedSegments.some(
      (s) => s.uuid === selectedRouteHoveredSegmentId,
    )

    // Only scroll if hover came from map (ref is not "panel")
    if (
      selectedRouteHoveredSegmentId &&
      hoveredSegmentBelongsToThisRoute &&
      !multiSelectEnabled
    ) {
      if (shouldVirtualize) {
        const segmentIndex = sortedSegments.findIndex(
          (s) => s.uuid === selectedRouteHoveredSegmentId,
        )

        if (segmentIndex >= 0) {
          // Scroll to the segment using virtualizer
          virtualizer.scrollToIndex(segmentIndex, {
            align: "center",
            behavior: "smooth",
          })
        }
      } else {
        // For non-virtualized list, find and scroll to element
        // scrollIntoView will find the nearest scrollable ancestor automatically
        const element = segmentRefs.current.get(selectedRouteHoveredSegmentId)
        if (element) {
          // Use scrollIntoView with options to find nearest scrollable parent
          element.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          })
        }
      }
    }
  }, [
    selectedRouteHoveredSegmentId,
    shouldVirtualize,
    sortedSegments,
    virtualizer,
    multiSelectEnabled,
  ])

  const renderSegment = React.useCallback(
    (segment: RouteSegment, segmentIndex: number) => {
      const currentSegment =
        currentRouteToUse?.segments?.find(
          (s: any) => s.uuid === segment.uuid,
        ) || segment

      // Check if this segment is hovered from map
      // Don't require isSelected - just check if the segment ID matches
      const isHoveredFromMap =
        selectedRouteHoveredSegmentId === segment.uuid && !multiSelectEnabled

      return (
        <Box
          key={segment.uuid}
          ref={(el: HTMLDivElement | null) => {
            if (el) {
              segmentRefs.current.set(segment.uuid, el)
            } else {
              segmentRefs.current.delete(segment.uuid)
            }
          }}
          sx={{
            position: "relative",
            zIndex: 1,
            marginBottom: "4px",
            marginLeft: "8px",
            marginRight: "-16px",
            borderRadius: "1rem",
            backgroundColor: !multiSelectEnabled
              ? isHoveredFromMap
                ? "#bbdefb" // Blue highlight when hovered from map
                : isSelected
                  ? "#FAFAFA"
                  : "#ffffff"
              : "#ffffff",
            border: isHoveredFromMap
              ? "2px solid #2196f3" // Blue border when hovered from map
              : "1px solid #e0e0e0",
            boxShadow: isHoveredFromMap
              ? "0 2px 8px rgba(33, 150, 243, 0.3)" // Enhanced shadow when hovered
              : "0 1px 2px rgba(0, 0, 0, 0.05)",
            transition: "all 0.15s ease-in-out",
            "&:hover": {
              backgroundColor:
                isSelected && !multiSelectEnabled ? "#bbdefb" : "#FAFAFA",
              borderColor: "#d0d0d0",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
            },
          }}
        >
          {isSelected && !multiSelectEnabled && (
            <Box
              sx={{
                position: "absolute",
                left: "-12px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "12px",
                height: "3px",
                backgroundColor: "#bdbdbd",
                zIndex: 0,
              }}
            />
          )}
          <ListItem disablePadding sx={{ width: "100%" }}>
            <ListItemButton
              sx={{
                padding: "6px 12px",
                borderRadius: "1rem",
                minHeight: 44,
                width: "100%",
                backgroundColor: "transparent",
                cursor: "pointer",
                "&:hover": {
                  backgroundColor: "transparent",
                },
              }}
              onClick={(e) => onNavigateToSegment(currentSegment, e)}
              onMouseEnter={() => handlePanelHover(segment.uuid)}
              onMouseLeave={() => handlePanelHover(null)}
            >
              <ListItemIcon
                sx={{
                  minWidth: 36,
                  width: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  alignSelf: "flex-start",
                  marginTop: "10px",
                }}
              >
                <Checkbox
                  checked={currentSegment.is_enabled !== false}
                  onChange={async (e) => {
                    e.stopPropagation()
                    const currentChecked = currentSegment.is_enabled !== false
                    const newValue = !currentChecked

                    try {
                      await toggleRouteMutation.mutateAsync({
                        routeId: segment.uuid,
                        parentRouteId: routeId,
                        isEnabled: newValue,
                        projectId: projectId || undefined,
                      })
                    } catch (error) {
                      console.error(
                        "❌ [Checkbox] Failed to toggle segment enabled:",
                        error,
                      )
                    }
                  }}
                  size="small"
                  sx={{
                    color: "#757575",
                    padding: "0px",
                    margin: "0px",
                    "&.Mui-checked": {
                      color: "#1976d2",
                    },
                    "&:hover": {
                      backgroundColor: "rgba(25, 118, 210, 0.04)",
                    },
                  }}
                  icon={<CheckBoxOutlineBlank sx={{ fontSize: 18 }} />}
                  checkedIcon={<CheckBox sx={{ fontSize: 18 }} />}
                />
              </ListItemIcon>
              <Box
                className="flex items-center flex-1"
                sx={{
                  minWidth: 0,
                  marginLeft: "4px",
                }}
              >
                <ListItemText
                  sx={{
                    margin: 0,
                    padding: 0,
                    flex: 1,
                    minWidth: 0,
                    "& .MuiListItemText-primary": {
                      marginBottom: "2px",
                    },
                    "& .MuiListItemText-secondary": {
                      marginTop: 0,
                    },
                  }}
                  primary={
                    <Typography
                      variant="body2"
                      title={
                        currentSegment.route_name ||
                        `Segment ${segmentIndex + 1}`
                      }
                      sx={{
                        fontSize: typo.body.small,
                        fontWeight: 500,
                        lineHeight: 1.4,
                        color:
                          currentSegment.is_enabled === false
                            ? "#9e9e9e"
                            : "#212121",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {(() => {
                        const segmentName =
                          currentSegment.route_name ||
                          `Segment ${segmentIndex + 1}`
                        if (!searchQuery?.trim()) {
                          return segmentName
                        }
                        const searchLower = searchQuery.toLowerCase()
                        const textLower = segmentName.toLowerCase()
                        const index = textLower.indexOf(searchLower)
                        if (index === -1) {
                          return segmentName
                        }
                        const beforeMatch = segmentName.substring(0, index)
                        const match = segmentName.substring(
                          index,
                          index + searchQuery.length,
                        )
                        const afterMatch = segmentName.substring(
                          index + searchQuery.length,
                        )
                        return (
                          <>
                            {beforeMatch}
                            <mark
                              style={{
                                backgroundColor: "#FFEB3B",
                                color: "#212121",
                                padding: "0 2px",
                                borderRadius: "2px",
                              }}
                            >
                              {match}
                            </mark>
                            {afterMatch}
                          </>
                        )
                      })()}
                    </Typography>
                  }
                  secondary={
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: typo.body.xxsmall,
                        lineHeight: 1.3,
                        marginTop: "1px",
                        color:
                          currentSegment.is_enabled === false
                            ? "#bdbdbd"
                            : "#757575",
                      }}
                    >
                      {formatDistance(currentSegment.length || 0, distanceUnit)}
                    </Typography>
                  }
                />
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0,
                  }}
                >
                  <SyncStatusButton
                    status={
                      (currentSegment.sync_status as SyncStatus) || "unsynced"
                    }
                    disabled={false}
                    onClick={() => onSyncSegment(currentSegment.uuid)}
                    isLoading={syncingRouteId === currentSegment.uuid}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRenameSegment(currentSegment.uuid, routeId)
                    }}
                    sx={{
                      minWidth: 32,
                      minHeight: 32,
                      padding: "4px",
                      color: "#757575",
                      transition: "all 0.15s ease-in-out",
                      "&:hover": {
                        backgroundColor: "#e3f2fd",
                        color: "#1976d2",
                      },
                    }}
                    title="Rename segment"
                  >
                    <DriveFileRenameOutlineIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Box>
              </Box>
            </ListItemButton>
          </ListItem>
        </Box>
      )
    },
    [
      currentRouteToUse,
      isSelected,
      multiSelectEnabled,
      routeId,
      onNavigateToSegment,
      onHoverSegment,
      onSyncSegment,
      onRenameSegment,
      syncingRouteId,
      projectId,
      toggleRouteMutation,
      distanceUnit,
      selectedRouteHoveredSegmentId, // Include in dependencies
      searchQuery, // Include searchQuery in dependencies
    ],
  )

  if (shouldVirtualize) {
    return (
      <Box
        ref={listParentRef}
        className="pretty-scrollbar"
        sx={{
          maxHeight: "400px",
          overflowY: "auto",
          overflowX: "hidden",
          pr: 3, // Increased padding to create space between scrollbar and sync/rename buttons
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const segment = sortedSegments[virtualItem.index]
            return (
              <div
                key={segment.uuid}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {renderSegment(segment, virtualItem.index)}
              </div>
            )
          })}
        </div>
      </Box>
    )
  }

  // Non-virtualized rendering for <= 100 segments
  return (
    <Box>
      {sortedSegments.map((segment, segmentIndex) =>
        renderSegment(segment, segmentIndex),
      )}
    </Box>
  )
}

const RoutesPanel: React.FC<RoutesPanelProps> = () => {
  const { navigateWithCheck } = useUnsavedChangesNavigation()
  const typo = useResponsiveTypography()
  const setSelectedRoutePanelVisible = useProjectWorkspaceStore(
    (state) => state.setSelectedRoutePanelVisible,
  )
  const distanceUnit = useDistanceUnit()
  const {
    selectedRoute,
    selectRoute: selectRouteSync,
    projectId,
    loadRouteForEditing,
    removeRoute,
    setMapMode,
    showSelectedRouteSegments,
    setShowSelectedRouteSegments,
    setLeftPanelExpanded,
    leftPanelExpanded,
    mapMode,
    mapType,
    currentFolder: currentFolderFromStore,
    setCurrentFolder,
    scrollToRoute,
    routeToScrollTo,
    routeSearchQuery,
    setRouteSearchQuery,
    targetRouteId,
    setTargetRouteId,
    isSelectingRoute: isSelectingRouteFromStore,
    setIsSelectingRoute: setIsSelectingRouteInStore,
    setActivePanel,
    roadPriorityPanelOpen,
    exitEditMode,
    pendingRouteSelection,
    setPendingRouteSelection,
  } = useProjectWorkspaceStore()
  // Subscribe to routes updates to ensure re-renders when routes change
  const routesStore = useProjectWorkspaceStore((state) => state.routes)
  const setSelectedRouteHoveredSegmentId = useLayerStore(
    (state) => state.setSelectedRouteHoveredSegmentId,
  )
  const loadRoutePoints = useLayerStore((state) => state.loadRoutePoints)
  const setRouteUUID = useLayerStore((state) => state.setRouteUUID)
  const clearPoints = useLayerStore((state) => state.clearPoints)
  const setEditingSavedRouteId = useLayerStore(
    (state) => state.setEditingSavedRouteId,
  )
  const routeUUID = useLayerStore((state) => state.individualRoute.routeUUID)
  const editingSavedRouteId = useLayerStore(
    (state) => state.editingSavedRouteId,
  )
  const hasUnsavedChanges = useLayerStore((state) => state.hasUnsavedChanges)
  const discardRouteChanges = useLayerStore(
    (state) => state.discardRouteChanges,
  )

  // Helper function to check for unsaved changes when editing a saved route
  const checkUnsavedChangesForSavedRoute = React.useCallback(() => {
    // Check if we're in individual_drawing mode and editing a saved route
    const isEditingSavedRoute =
      mapMode === "individual_drawing" &&
      selectedRoute !== null &&
      selectedRoute.id !== undefined

    if (!isEditingSavedRoute) {
      return false
    }

    // Get current state to check for unsaved changes
    const { individualRoute, snappedRoads } = useLayerStore.getState()

    // Check for unsaved changes:
    // 1. Preview roads exist (route has been regenerated with changes)
    // 2. Route has been regenerated (encodedPolyline changed)
    // 3. Editing state has changes (for uploaded routes)
    const hasPreviewRoads = snappedRoads.previewRoads.length > 0
    const hasRouteBeenRegenerated =
      individualRoute.generatedRoute !== null &&
      selectedRoute !== null &&
      individualRoute.generatedRoute.encodedPolyline !==
        selectedRoute.encodedPolyline

    // Check editing state changes (for uploaded routes or if editing state was initialized)
    // IMPORTANT: Exclude editingSavedRouteId if it's for an uploaded route
    // Uploaded routes are handled separately in UploadedRoutesPanel and should not trigger this dialog
    const layerStore = useLayerStore.getState()
    const isEditingSavedRouteIdAnUploadedRoute =
      editingSavedRouteId !== null &&
      layerStore.uploadedRoutes.routes.some((r) => r.id === editingSavedRouteId)

    const routeIdToCheck =
      // Only use editingSavedRouteId if it's NOT an uploaded route
      (!isEditingSavedRouteIdAnUploadedRoute && editingSavedRouteId) ||
      routeUUID ||
      selectedRoute?.id ||
      null
    const hasEditingStateChanges =
      routeIdToCheck !== null && hasUnsavedChanges(routeIdToCheck)

    return hasPreviewRoads || hasRouteBeenRegenerated || hasEditingStateChanges
  }, [
    mapMode,
    selectedRoute,
    editingSavedRouteId,
    routeUUID,
    hasUnsavedChanges,
  ])

  // Cancel any selected or modifying route when navigating out of folder
  // Returns true if navigation should proceed, false if it should be blocked
  const cancelRouteSelectionAndModification = React.useCallback(() => {
    // Check for unsaved changes before proceeding
    if (checkUnsavedChangesForSavedRoute()) {
      // Set pending route selection to "close" (collapsing/navigating back)
      setPendingRouteSelection("close")
      return false // Block navigation
    }

    // Discard any unsaved changes for saved routes being edited
    if (editingSavedRouteId && hasUnsavedChanges(editingSavedRouteId)) {
      discardRouteChanges(editingSavedRouteId)
    }

    // Clear selected route
    selectRouteSync(null)

    // Clear search query when navigating out of folder (not when just deselecting route)
    setRouteSearchQuery(null)
    setSearchQuery("")

    // Exit edit mode if in editing mode or if a route is being modified
    // (routeUUID is set when loadRouteForEditing is called)
    if (
      mapMode === "route_editing" ||
      mapMode === "individual_editing" ||
      mapMode === "individual_drawing" ||
      mapMode === "editing_uploaded_route" ||
      routeUUID !== null
    ) {
      exitEditMode()
    }

    // Clear editing saved route ID
    setEditingSavedRouteId(null)

    // Clear hovered segment
    setSelectedRouteHoveredSegmentId(null)

    return true // Allow navigation
  }, [
    checkUnsavedChangesForSavedRoute,
    editingSavedRouteId,
    hasUnsavedChanges,
    discardRouteChanges,
    selectRouteSync,
    mapMode,
    routeUUID,
    exitEditMode,
    setEditingSavedRouteId,
    setPendingRouteSelection,
    setSelectedRouteHoveredSegmentId,
    setRouteSearchQuery,
  ])
  const toggleRouteMutation = useToggleRouteEnabled()
  const deleteRouteMutation = useDeleteRoute()
  const batchDeleteMutation = useBatchDeleteRoutes(projectId || undefined)
  const batchMoveMutation = useBatchMoveRoutes(projectId || undefined)
  const { selectRouteWithNavigation: selectRouteCore } = useRouteSelection()
  const selectRoute = useSelectRoute()
  const { navigateToGeometry } = useMapNavigation()
  const { setRightPanelType } = useProjectWorkspaceStore()
  const { addMessage, dismissMessage } = useMessageStore()

  // Tag batch operation mutations
  const renameTagMutation = useRenameTag()
  const moveTagMutation = useMoveTag()
  const deleteTagMutation = useDeleteTag()
  const segmentTagMutation = useSegmentTag()
  const stretchTagMutation = useStretchTag()
  const syncFolderMutation = useSyncFolder()
  const syncRouteMutation = useSyncRoute()
  const updateRouteMutation = useUpdateRoute()

  // Sync state
  const [isSyncingFolder, setIsSyncingFolder] = useState(false)
  const [syncingRouteId, setSyncingRouteId] = useState<string | null>(null)

  // Use store state for route selection loader
  const isSelectingRoute = isSelectingRouteFromStore
  const setIsSelectingRoute = setIsSelectingRouteInStore

  const lassoDrawing = useLayerStore((state) => state.lassoDrawing)
  const polygonDrawing = useLayerStore((state) => state.polygonDrawing)

  const { fileInputRef, handleUploadRoute, handleFileUploadChange } =
    useFileUploadHandlers()

  // Panel expansion/contraction is now only controlled by user clicking the toggle button
  // No auto-close effects - user has full control

  // Get route tags with counts instead of all routes
  const { data: tagsData, isLoading: isLoadingTags } = useRouteTags(
    projectId || "",
  )

  // Use store state as source of truth instead of local state
  const expanded = leftPanelExpanded
  const [searchQuery, setSearchQuery] = useState("")

  // Sync search query from store when routeSearchQuery is set
  useEffect(() => {
    if (routeSearchQuery !== null) {
      setSearchQuery(routeSearchQuery)
      setRouteSearchQuery(null) // Clear after applying
    }
  }, [routeSearchQuery, setRouteSearchQuery])

  const currentFolder = currentFolderFromStore

  // Prevent spacebar from triggering navigation when inside a folder
  useEffect(() => {
    if (currentFolder === null) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only prevent spacebar if we're inside a folder
      if (e.key === " " || e.key === "Spacebar") {
        // Allow spacebar in input fields and textareas
        const target = e.target as HTMLElement
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable
        ) {
          return
        }

        // Prevent spacebar from triggering the back button click
        if (backButtonRef.current && backButtonRef.current.contains(target)) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true) // Use capture phase
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [currentFolder])
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(
    new Set(),
  )
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null)
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false)
  const [sortBy, setSortBy] = useState<
    "name" | "distance" | "created_at" | "match_percentage"
  >("created_at")
  const [routeTypeFilter, setRouteTypeFilter] = useState<
    Set<"imported" | "drawn" | "uploaded">
  >(new Set())
  const [folderVisibility, setFolderVisibility] = useState<
    Map<string, boolean>
  >(new Map())

  const [folderMenuAnchor, setFolderMenuAnchor] = useState<{
    element: HTMLElement
    folderTag: string
  } | null>(null)
  const [folderMenuPosition, setFolderMenuPosition] = useState<{
    x: number
    y: number
    folderTag: string
  } | null>(null)
  const [routeMenuPosition, setRouteMenuPosition] = useState<{
    x: number
    y: number
    routeId: string
  } | null>(null)
  const [showLoader, setShowLoader] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [singleDeleteDialogOpen, setSingleDeleteDialogOpen] = useState(false)
  const [routeToDelete, setRouteToDelete] = useState<string | null>(null)
  const [folderDeleteDialogOpen, setFolderDeleteDialogOpen] = useState(false)
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  // Tag operation dialog states
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameDialogTag, setRenameDialogTag] = useState<string>("")

  // Folder move dialog states
  const [folderMoveDialogOpen, setFolderMoveDialogOpen] = useState(false)
  const [folderMoveDialogTag, setFolderMoveDialogTag] = useState<string>("")
  const [folderMoveSelectedTag, setFolderMoveSelectedTag] = useState<
    string | null
  >(null)
  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false)
  const [segmentDialogTag, setSegmentDialogTag] = useState<string>("")
  const [segmentDistance, setSegmentDistance] = useState<string>("1")
  const [segmentMethod, setSegmentMethod] = useState<"distance" | "auto">(
    "distance",
  )
  const [newTagName, setNewTagName] = useState("")

  // Route rename dialog states
  const [routeRenameDialogOpen, setRouteRenameDialogOpen] = useState(false)
  const [routeRenameRouteId, setRouteRenameRouteId] = useState<string | null>(
    null,
  )

  // Segment rename dialog states
  const [segmentRenameDialogOpen, setSegmentRenameDialogOpen] = useState(false)
  const [segmentRenameSegmentId, setSegmentRenameSegmentId] = useState<
    string | null
  >(null)
  const [segmentRenameParentRouteId, setSegmentRenameParentRouteId] = useState<
    string | null
  >(null)

  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: "success" | "error"
  }>({ open: false, message: "", severity: "success" })
  // Track which routes have their uploaded route visible (routeId -> uploadedRouteId)
  const [visibleUploadedRoutes, setVisibleUploadedRoutes] = useState<
    Map<string, string>
  >(new Map())

  // Refs for scrolling to routes
  const routeRefs = React.useRef<Map<string, HTMLElement>>(new Map())
  const routesScrollContainerRef = React.useRef<HTMLDivElement>(null)
  const scrollAttemptsRef = React.useRef<number>(0)
  const maxScrollAttempts = 10 // Maximum number of pages to load when searching for a route
  const backButtonRef = React.useRef<HTMLButtonElement>(null)
  const foldersScrollContainerRef = React.useRef<HTMLDivElement>(null)

  // Debounce search query (500ms)
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 500)

  // Trim search queries for actual use (trimmed versions)
  const trimmedSearchQuery = searchQuery.trim()
  const trimmedDebouncedSearchQuery = debouncedSearchQuery.trim()

  // zundoDebugger()

  // Use unified search when there's a search query (searches both routes and segments)
  // Use ID-based pagination when targetRouteId is set
  // Otherwise use normal pagination
  const hasSearchQuery = trimmedDebouncedSearchQuery.length > 0
  const useUnifiedSearchQuery =
    hasSearchQuery && currentFolder !== null && !targetRouteId

  const unifiedSearchQuery = useUnifiedSearch(
    projectId || "",
    trimmedDebouncedSearchQuery,
    currentFolder,
    currentFolder !== null && routeTypeFilter.size > 0
      ? Array.from(routeTypeFilter)
      : undefined,
  )

  const normalInfiniteQuery = useInfiniteRoutes(
    projectId || "",
    currentFolder !== null && !targetRouteId && !useUnifiedSearchQuery
      ? trimmedDebouncedSearchQuery
      : "", // Only use search query if not using unified search
    currentFolder,
    currentFolder !== null ? sortBy : undefined,
    currentFolder !== null && routeTypeFilter.size > 0
      ? Array.from(routeTypeFilter)
      : undefined,
  )

  const idBasedInfiniteQuery = useInfiniteRoutesById(
    projectId || "",
    currentFolder,
    targetRouteId,
    currentFolder !== null ? sortBy : undefined,
    currentFolder !== null && routeTypeFilter.size > 0
      ? Array.from(routeTypeFilter)
      : undefined,
  )

  // Select which query to use based on targetRouteId and search query
  const activeQuery = targetRouteId
    ? idBasedInfiniteQuery
    : useUnifiedSearchQuery
      ? unifiedSearchQuery
      : normalInfiniteQuery

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingRoutes,
    error: routesError,
  } = activeQuery

  // Intersection observer for infinite scroll
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
  })

  // Extract segments from unified search for rendering
  const searchSegments = useMemo(() => {
    if (!useUnifiedSearchQuery || !infiniteData) return []
    return infiniteData.pages.flatMap((page: any) => {
      if ("items" in page) {
        return page.items
          .filter((item: any) => item.type === "segment" && item.segment)
          .map((item: any) => ({
            segment: item.segment,
            parentRoute: item.parent_route,
          }))
      }
      return []
    })
  }, [infiniteData, useUnifiedSearchQuery])

  // Group segments by parent route and convert parent routes to Route format
  const parentRoutesWithSegments = useMemo(() => {
    if (!useUnifiedSearchQuery || searchSegments.length === 0) return []

    // Group segments by parent route UUID
    // CRITICAL: Use segment.parent_route_id as the authoritative parent UUID
    // After segmentation, segments have parent_route_id pointing to the NEW UUID,
    // while parentRoute.uuid from cached search results might be stale
    const grouped = new Map<
      string,
      { parentRoute: RouteSegment; segments: RouteSegment[] }
    >()

    searchSegments.forEach(({ segment, parentRoute }) => {
      // Use segment's parent_route_id (which points to the NEW UUID after segmentation)
      // instead of parentRoute.uuid (which might be stale from cache)
      const parentRouteId = segment.parent_route_id || parentRoute?.uuid
      if (!parentRouteId) return

      if (!grouped.has(parentRouteId)) {
        grouped.set(parentRouteId, {
          parentRoute,
          segments: [],
        })
      }

      grouped.get(parentRouteId)!.segments.push(segment)
    })

    // Convert to array and transform parent routes to Route format
    return Array.from(grouped.values())
      .map(({ parentRoute, segments }) => {
        // Use the first segment's parent_route_id as the authoritative parent UUID
        // This ensures we use the NEW UUID after segmentation
        const authoritativeParentId =
          segments[0]?.parent_route_id || parentRoute?.uuid
        if (!authoritativeParentId) {
          // Fallback - should not happen, but handle gracefully
          return null
        }

        // CRITICAL: Check Zustand store using the authoritative parent ID
        // This ensures we use the updated route name after segmentation
        const storeRoute = routesStore.find(
          (r) => r.id === authoritativeParentId,
        )

        // Use store route name if available (most up-to-date), otherwise fall back to parentRoute.route_name
        const routeName =
          storeRoute?.name || parentRoute.route_name || "Unnamed Route"

        // Parse coordinates
        let origin, destination, waypoints
        try {
          origin = parentRoute.origin
            ? typeof parentRoute.origin === "string"
              ? JSON.parse(parentRoute.origin)
              : parentRoute.origin
            : { lat: 0, lng: 0 }
          destination = parentRoute.destination
            ? typeof parentRoute.destination === "string"
              ? JSON.parse(parentRoute.destination)
              : parentRoute.destination
            : { lat: 1, lng: 1 }
          waypoints = parentRoute.waypoints
            ? typeof parentRoute.waypoints === "string"
              ? JSON.parse(parentRoute.waypoints || "[]")
              : parentRoute.waypoints
            : []
        } catch {
          origin = { lat: 0, lng: 0 }
          destination = { lat: 1, lng: 1 }
          waypoints = []
        }

        // Transform coordinates to {lat, lng} format if needed
        const transformCoords = (coords: any) => {
          if (
            coords &&
            typeof coords === "object" &&
            "lat" in coords &&
            "lng" in coords
          ) {
            return { lat: coords.lat, lng: coords.lng }
          }
          if (Array.isArray(coords) && coords.length >= 2) {
            return { lat: coords[1], lng: coords[0] }
          }
          return { lat: 0, lng: 0 }
        }

        // Create Route-like object from parent route metadata
        // Use store route data if available for most up-to-date information
        const route: RouteType = {
          id: authoritativeParentId, // Use authoritative parent ID (NEW UUID after segmentation)
          name: routeName, // Use the route name from store if available
          projectId: parentRoute.project_id.toString(),
          type: (parentRoute.route_type as any) || "individual",
          source: "individual_drawing",
          origin: transformCoords(origin),
          destination: transformCoords(destination),
          waypoints: waypoints.map(transformCoords),
          encodedPolyline: parentRoute.encoded_polyline || "",
          distance: parentRoute.length || 0,
          duration: Math.floor((parentRoute.length || 0) * 2),
          sync_status: (parentRoute.sync_status as any) || "unsynced",
          createdAt: parentRoute.created_at || new Date().toISOString(),
          updatedAt:
            parentRoute.updated_at ||
            parentRoute.created_at ||
            new Date().toISOString(),
          roads: [],
          isSegmented: true,
          segmentCount: segments.length,
          segments: segments,
          color: "#2196F3",
          opacity: 0.8,
          strokeWidth: 3,
          tag: parentRoute.tag ?? null,
        }

        // If store route exists, merge in any additional updated fields
        if (storeRoute) {
          route.name = storeRoute.name // Ensure name is from store
          route.tag = storeRoute.tag ?? parentRoute.tag ?? null
          route.updatedAt = storeRoute.updatedAt
          route.distance = storeRoute.distance ?? parentRoute.length ?? 0
          route.encodedPolyline =
            storeRoute.encodedPolyline || parentRoute.encoded_polyline || ""
          // Merge any other fields that might have been updated
        }

        return { route, segments }
      })
      .filter(
        (item): item is { route: RouteType; segments: RouteSegment[] } =>
          item !== null,
      ) // Filter out null values
  }, [
    searchSegments,
    useUnifiedSearchQuery,
    trimmedDebouncedSearchQuery,
    routesStore,
  ]) // Add routesStore to dependencies to ensure recalculation when store updates

  // Flatten infinite query pages into single array
  // For unified search, extract routes from items
  // For normal search, use routes directly
  const routes = useMemo(() => {
    if (currentFolder === null) {
      // In folder view, use routes from Zustand store to calculate tags
      const result = routesStore
      console.log(
        "📋 [LeftFloatingPanel] Routes useMemo recalculated (folder view):",
        {
          routesCount: result.length,
          routes: result.map((r) => ({
            id: r.id,
            segmentsCount: r.segments?.length || 0,
            segments: r.segments?.map((s) => ({
              uuid: s.uuid,
              is_enabled: s.is_enabled,
            })),
          })),
        },
      )
      return result
    }
    // In routes view, use infinite scroll data
    if (useUnifiedSearchQuery && infiniteData) {
      // Extract routes from unified search items
      const routeItems = infiniteData.pages.flatMap((page: any) => {
        if ("items" in page) {
          return page.items
            .filter((item: any) => item.type === "route" && item.route)
            .map((item: any) => item.route)
        }
        return []
      })

      // CRITICAL: Merge store data to get latest route names after renaming
      const mergedRouteItems = routeItems.map((route: RouteType) => {
        const storeRoute = routesStore.find((r) => r.id === route.id)
        if (storeRoute) {
          // Use store route data for most up-to-date information (especially name)
          return {
            ...route,
            name: storeRoute.name, // Use store name (updated after rename)
            tag: storeRoute.tag ?? route.tag,
            updatedAt: storeRoute.updatedAt,
          }
        }
        return route
      })

      // Add parent routes with segments (avoid duplicates)
      const routeIds = new Set(mergedRouteItems.map((r: RouteType) => r.id))
      const parentRoutes = parentRoutesWithSegments
        .filter(({ route }) => !routeIds.has(route.id))
        .map(({ route }) => route)

      return [...mergedRouteItems, ...parentRoutes]
    }
    // Normal route search
    if (infiniteData) {
      const routesFromCache = infiniteData.pages.flatMap((page: any) => {
        if ("routes" in page) {
          return page.routes
        }
        return []
      })

      // CRITICAL: Merge store data to get latest route names after renaming
      return routesFromCache.map((route: RouteType) => {
        const storeRoute = routesStore.find((r) => r.id === route.id)
        if (storeRoute) {
          // Use store route data for most up-to-date information (especially name)
          return {
            ...route,
            name: storeRoute.name, // Use store name (updated after rename)
            tag: storeRoute.tag ?? route.tag,
            updatedAt: storeRoute.updatedAt,
          }
        }
        return route
      })
    }
    return []
  }, [
    infiniteData,
    currentFolder,
    routesStore,
    useUnifiedSearchQuery,
    parentRoutesWithSegments,
  ])

  // Check if current folder has any uploaded routes (routes with match_percentage or type === "uploaded")
  const hasUploadedRoutes = useMemo(() => {
    if (currentFolder === null) return false
    // Check routes from infinite scroll data
    return routes.some(
      (route) =>
        route.type === "uploaded" ||
        (route.matchPercentage !== undefined && route.matchPercentage !== null),
    )
  }, [currentFolder, routes])

  // Trigger fetch when sentinel comes into view
  useEffect(() => {
    if (
      inView &&
      hasNextPage &&
      !isFetchingNextPage &&
      currentFolder !== null
    ) {
      console.log("🔄 Fetching next page of routes...")
      fetchNextPage()
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage, currentFolder])

  // Show loader with minimum display time so it's visible
  useEffect(() => {
    if (isFetchingNextPage) {
      setShowLoader(true)
      // Keep loader visible for at least 300ms
      const timer = setTimeout(() => {
        if (!isFetchingNextPage) {
          setShowLoader(false)
        }
      }, 300)
      return () => clearTimeout(timer)
    } else {
      // Delay hiding to ensure smooth transition
      const timer = setTimeout(() => {
        setShowLoader(false)
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [isFetchingNextPage])

  // Reset filter and sorting when entering or leaving a folder
  useEffect(() => {
    setRouteTypeFilter(new Set())
    setSortBy("created_at")
  }, [currentFolder])

  // Auto-navigate back to folder view when current folder has no routes
  // Only navigate back if both search query and debounced search query are empty
  // AND no route type filters are active
  // (meaning no routes exist, not just filtered out, and search has fully cleared)
  // IMPORTANT: Wait for debounced search query to settle to avoid navigating during typing
  useEffect(() => {
    // Don't navigate if user is actively typing (searchQuery exists but debounced hasn't updated yet)
    // Only navigate if both are empty (user has finished typing/cleared search)
    const hasActiveFilters =
      searchQuery.trim() ||
      debouncedSearchQuery.trim() ||
      routeTypeFilter.size > 0

    // Also check if we're currently loading (which happens when search query changes)
    // Don't navigate during loading as routes might be filtered out temporarily
    const isSearching = searchQuery.trim() !== debouncedSearchQuery.trim()

    if (
      currentFolder !== null &&
      !isLoadingRoutes &&
      !isFetchingNextPage &&
      routes.length === 0 &&
      !routesError &&
      !hasActiveFilters && // Only navigate back if no filters are active
      !isSearching // Don't navigate while user is typing (searchQuery differs from debounced)
    ) {
      // Add a delay to prevent immediate navigation after user interaction
      // This gives time for debounced values to settle and prevents navigation
      // when user is typing (even if searchQuery is currently empty)
      const timeoutId = setTimeout(() => {
        // Re-check conditions after delay to ensure nothing changed
        const stillHasActiveFilters =
          searchQuery.trim() ||
          debouncedSearchQuery.trim() ||
          routeTypeFilter.size > 0
        const stillSearching =
          searchQuery.trim() !== debouncedSearchQuery.trim()

        // Check if search input is focused - don't navigate if user is interacting with search
        const searchInputFocused =
          document.activeElement instanceof HTMLInputElement &&
          document.activeElement.type === "text"

        if (
          currentFolder !== null &&
          !stillHasActiveFilters &&
          !stillSearching &&
          routes.length === 0 &&
          !searchInputFocused // Don't navigate if search field is focused
        ) {
          // All routes in this folder have been deleted, navigate back to folder view
          // Cancel any selected or modifying route
          cancelRouteSelectionAndModification()
          setCurrentFolder(null)
          setSearchQuery("")
          setMultiSelectEnabled(false)
        }
      }, 700) // Wait 700ms (longer than debounce delay of 500ms) to ensure debounced value has settled

      return () => clearTimeout(timeoutId)
    }
  }, [
    currentFolder,
    isLoadingRoutes,
    isFetchingNextPage,
    routes.length,
    routesError,
    searchQuery,
    debouncedSearchQuery,
    routeTypeFilter,
    setCurrentFolder,
    cancelRouteSelectionAndModification,
  ])

  // Handle scrolling to a route when routeToScrollTo is set
  useEffect(() => {
    if (!routeToScrollTo || !projectId) {
      // Reset attempts when routeToScrollTo is cleared
      scrollAttemptsRef.current = 0
      return
    }

    // First, try to find the route in the current routes list
    let route = routes.find((r) => r.id === routeToScrollTo)

    // If not found in routes list, check the store (for routes that might be selected but not in current view)
    if (!route) {
      route = routesStore.find((r) => r.id === routeToScrollTo)
    }

    // If route is still not found, we need to fetch it to get its tag
    // This handles the case where the route is not yet loaded (infinite scroll)
    if (!route) {
      // Reset attempts when fetching route
      scrollAttemptsRef.current = 0

      // Fetch the route directly to get its tag
      routesApi
        .getById(routeToScrollTo)
        .then((response) => {
          if (response.success && response.data) {
            const fetchedRoute = response.data
            // Keep "" and "Untagged" as separate - use tag value as-is
            const routeFolder = fetchedRoute.tag ?? ""

            // Navigate to the correct folder
            if (currentFolder !== routeFolder) {
              setCurrentFolder(routeFolder)
              setSearchQuery("")
            }

            // The route will be found in the next render after folder loads
            // We'll handle scrolling in the next effect run
          } else {
            // Route not found, clear the scroll request
            scrollToRoute(null)
            scrollAttemptsRef.current = 0
          }
        })
        .catch((error) => {
          console.error("Failed to fetch route for scrolling:", error)
          scrollToRoute(null)
          scrollAttemptsRef.current = 0
        })
      return
    }

    // Get the route's folder/tag - keep "" and "Untagged" as separate
    const routeFolder = route.tag ?? ""

    // If we're not in the correct folder, navigate to it first
    if (currentFolder !== routeFolder) {
      scrollAttemptsRef.current = 0 // Reset attempts when changing folders
      setCurrentFolder(routeFolder)
      setSearchQuery("")
      // Don't try to scroll immediately - wait for folder to load
      // The effect will run again once the folder loads and routes are available
      return
    } else {
      // We're already in the correct folder
      const routeElement = routeRefs.current.get(routeToScrollTo)
      if (routeElement && routesScrollContainerRef.current) {
        // Route found! Scroll to it
        setTimeout(() => {
          routeElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          })
          scrollToRoute(null) // Clear the scroll request
          scrollAttemptsRef.current = 0
        }, 100)
      } else {
        // Element not found yet - might be in a later page (infinite scroll)
        // First, check if route is in the data (might not be rendered yet)
        const routeInData = routes.find((r) => r.id === routeToScrollTo)
        if (routeInData) {
          // Route is in data but not yet rendered - wait a bit for DOM to update
          console.log("📍 Route found in data, waiting for DOM render...")
          const waitForRenderTimeout = setTimeout(() => {
            const routeElement = routeRefs.current.get(routeToScrollTo)
            if (routeElement && routesScrollContainerRef.current) {
              routeElement.scrollIntoView({
                behavior: "smooth",
                block: "center",
              })
              scrollToRoute(null)
              scrollAttemptsRef.current = 0
            }
          }, 200)
          return () => clearTimeout(waitForRenderTimeout)
        }

        // Route not in data - need to load more pages
        // Wait for initial load to complete before loading more pages
        if (isLoadingRoutes) {
          console.log("⏳ Waiting for initial folder load to complete...")
          return
        }

        // Keep loading pages until we find it (with a limit to prevent infinite loops)
        if (
          hasNextPage &&
          !isFetchingNextPage &&
          currentFolder !== null &&
          scrollAttemptsRef.current < maxScrollAttempts
        ) {
          scrollAttemptsRef.current += 1
          console.log(
            `🔄 Route not found in current pages (${routes.length} routes loaded), loading next page... (attempt ${scrollAttemptsRef.current}/${maxScrollAttempts})`,
          )
          fetchNextPage()
          // The effect will run again after the page loads and routes updates
        } else if (
          !hasNextPage ||
          scrollAttemptsRef.current >= maxScrollAttempts
        ) {
          // No more pages to load or max attempts reached
          console.warn(
            `Route not found after ${scrollAttemptsRef.current} attempts (checked ${routes.length} routes):`,
            routeToScrollTo,
          )
          scrollToRoute(null)
          scrollAttemptsRef.current = 0
        }
        // If isFetchingNextPage is true, wait for it to complete and the effect will run again
      }
    }
  }, [
    routeToScrollTo,
    routes,
    routesStore,
    currentFolder,
    setCurrentFolder,
    scrollToRoute,
    projectId,
    hasNextPage,
    isFetchingNextPage,
    isLoadingRoutes,
    fetchNextPage,
    maxScrollAttempts,
    infiniteData, // Add infiniteData to dependencies so effect re-runs when pages update
  ])

  // Separate effect to handle scrolling after a page fetch completes or folder loads
  // This ensures we check for the route after the data has actually updated
  useEffect(() => {
    if (!routeToScrollTo || currentFolder === null) return

    // Wait for initial load to complete
    if (isLoadingRoutes || isFetchingNextPage) {
      return
    }

    // Check if route is now in the routes list
    const route = routes.find((r) => r.id === routeToScrollTo)
    if (route) {
      // Route found in data! Now check if it's rendered in DOM
      const routeElement = routeRefs.current.get(routeToScrollTo)
      if (routeElement && routesScrollContainerRef.current) {
        console.log("✅ Route found after page load, scrolling to it")
        setTimeout(() => {
          routeElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          })
          scrollToRoute(null) // Clear the scroll request
          scrollAttemptsRef.current = 0
        }, 150) // Small delay to ensure DOM is updated
      } else {
        // Route is in data but not yet rendered - wait a bit more
        const retryTimeout = setTimeout(() => {
          const retryElement = routeRefs.current.get(routeToScrollTo)
          if (retryElement && routesScrollContainerRef.current) {
            retryElement.scrollIntoView({
              behavior: "smooth",
              block: "center",
            })
            scrollToRoute(null)
            scrollAttemptsRef.current = 0
          }
        }, 300)
        return () => clearTimeout(retryTimeout)
      }
    }
  }, [
    routeToScrollTo,
    routes,
    currentFolder,
    isLoadingRoutes,
    isFetchingNextPage,
    scrollToRoute,
    infiniteData, // Re-check when infiniteData updates (new page loaded)
  ])

  // Detect when the route being renamed is deleted and close rename dialog
  React.useEffect(() => {
    // Only check if we're renaming a route (routeRenameRouteId exists)
    if (!routeRenameRouteId) return

    // Check if the route still exists in the store
    const routeExists =
      selectedRoute?.id === routeRenameRouteId ||
      routesStore.some((r) => r.id === routeRenameRouteId) ||
      routes.some((r) => r.id === routeRenameRouteId)

    // If route doesn't exist, it was deleted - close the rename dialog
    if (!routeExists) {
      console.log("⚠️ Route being renamed was deleted, closing rename dialog")
      setRouteRenameDialogOpen(false)
      setRouteRenameRouteId(null)
    }
  }, [routeRenameRouteId, routesStore, routes, selectedRoute])

  // Collapse segments when route is deselected (e.g., from RouteDetailsPanel)
  // BUT: Don't collapse if we're in the middle of selecting a route
  // We use a ref to track if we're currently selecting a route to avoid race conditions
  const isSelectingRouteRef = React.useRef(false)
  const prevSelectedRouteRef = React.useRef(selectedRoute)
  // Track if route selection is coming from LeftFloatingPanel itself
  const isSelectionFromPanelRef = React.useRef(false)

  useEffect(() => {
    // Only collapse if selectedRoute is null AND expandedRouteId is not null
    // AND we're not currently in the process of selecting a route
    if (
      selectedRoute === null &&
      expandedRouteId !== null &&
      !isSelectingRouteRef.current
    ) {
      setExpandedRouteId(null)
      setShowSelectedRouteSegments(false)
    }

    // Collapse segments if the selected route no longer has segments
    if (
      selectedRoute !== null &&
      expandedRouteId === selectedRoute.id &&
      (!selectedRoute.isSegmented ||
        !selectedRoute.segments ||
        selectedRoute.segments.length === 0)
    ) {
      setExpandedRouteId(null)
      setShowSelectedRouteSegments(false)
    }

    // Hide all uploaded routes when route is deselected (transition from non-null to null)
    if (
      prevSelectedRouteRef.current !== null &&
      selectedRoute === null &&
      !isSelectingRouteRef.current
    ) {
      const { removeUploadedRoute } = useLayerStore.getState()
      // Get current visible uploaded routes from state to avoid stale closure
      setVisibleUploadedRoutes((prev) => {
        const currentVisibleRoutes = Array.from(prev.entries())
        currentVisibleRoutes.forEach(([, uploadedRouteId]) => {
          if (uploadedRouteId) {
            removeUploadedRoute(uploadedRouteId)
          }
        })
        // Return empty map to clear all visible uploaded routes
        return new Map()
      })
    }

    // Update ref for next render
    prevSelectedRouteRef.current = selectedRoute
  }, [selectedRoute, expandedRouteId, setShowSelectedRouteSegments])

  // Track previous selected route ID for this effect
  const prevSelectedRouteIdRef = React.useRef<string | null>(null)

  // Unified route selection function with loader and navigation
  // Wraps the shared selectRouteCore with panel-specific logic
  const selectRouteWithNavigation = React.useCallback(
    async (routeId: string, source: "map" | "panel" = "panel") => {
      console.log("📋 [LeftPanel.selectRouteWithNavigation] START:", {
        routeId,
        source,
      })
      try {
        // Call the shared route selection logic
        await selectRouteCore(routeId, {
          source,
          onAfterSelect: (selectedRouteId) => {
            console.log(
              "📋 [LeftPanel.selectRouteWithNavigation] onAfterSelect:",
              {
                selectedRouteId,
              },
            )
            // Panel-specific logic after selection
            setExpandedRouteId(selectedRouteId)

            // Mark selection source for panel selections
            if (source === "panel") {
              isSelectionFromPanelRef.current = true
              setTimeout(() => {
                isSelectionFromPanelRef.current = false
              }, 300)
            }
          },
        })
        console.log("📋 [LeftPanel.selectRouteWithNavigation] SUCCESS")
      } catch (error) {
        console.log("📋 [LeftPanel.selectRouteWithNavigation] ERROR:", error)
        // Error is already handled by selectRouteCore
        // Just re-throw to maintain error flow
        throw error
      }
    },
    [selectRouteCore, setExpandedRouteId],
  )

  // Ref to track if we're currently processing an external selection to prevent infinite loops
  const isProcessingExternalSelectionRef = React.useRef<string | null>(null)

  // When a route is selected from outside LeftFloatingPanel, show it in the panel by setting search
  useEffect(() => {
    // CRITICAL: Always update the ref to track the current state, even when deselected
    // This ensures that re-selecting the same route after deselection will trigger the effect
    const currentRouteId = selectedRoute?.id || null
    const routeIdChanged = prevSelectedRouteIdRef.current !== currentRouteId
    const isFromOutside = !isSelectionFromPanelRef.current

    // Update the ref immediately to track current state
    // This must happen before the condition check to ensure proper state tracking
    prevSelectedRouteIdRef.current = currentRouteId

    // CRITICAL FIX: Check if loader is already showing, which indicates map selection
    // This handles edge cases where isSelectionFromPanelRef might not be accurate
    const isLoaderShowing = useProjectWorkspaceStore.getState().isSelectingRoute
    const isLikelyFromMap = isLoaderShowing && !isSelectionFromPanelRef.current

    // Apply if:
    // 1. A route is selected (not null)
    // 2. Selection didn't come from LeftFloatingPanel itself (or loader is showing indicating map selection)
    // 3. Route changed (not just a re-render) - this is the key condition to prevent infinite loops
    // 4. We're not already processing this specific route selection (prevents re-triggering)
    if (
      selectedRoute &&
      (isFromOutside || isLikelyFromMap) &&
      routeIdChanged &&
      isProcessingExternalSelectionRef.current !== selectedRoute.id
    ) {
      console.log(
        "📍 Route selected from outside panel (map), using unified selection:",
        selectedRoute.id,
        selectedRoute.name,
        { routeIdChanged, isFromOutside, isLikelyFromMap, isLoaderShowing },
      )

      // Mark that we're processing this specific route to prevent re-triggering
      isProcessingExternalSelectionRef.current = selectedRoute.id

      // Ensure loader is shown (might already be shown from RouteContextMenu or handleRouteClick)
      // but ensure it's visible for all map selections
      setIsSelectingRoute(true)

      // Use unified selection function which handles loader, navigation, and ID-based pagination
      selectRouteWithNavigation(selectedRoute.id, "map")
        .then(() => {
          // Reset the flag after selection completes (with a small delay to ensure state updates are done)
          setTimeout(() => {
            isProcessingExternalSelectionRef.current = null
          }, 100)
        })
        .catch((error) => {
          console.error("Error in selectRouteWithNavigation:", error)
          // Reset the flag even on error
          isProcessingExternalSelectionRef.current = null
        })
    } else if (!selectedRoute) {
      // Reset flag when route is deselected
      isProcessingExternalSelectionRef.current = null
    }
    // NOTE: We intentionally do NOT include isSelectingRoute in dependencies to prevent infinite loops
    // The effect should only run when selectedRoute changes, not when isSelectingRoute changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute?.id])

  // Auto-cleanup: Clear targetRouteId when route is deselected
  useEffect(() => {
    if (!selectedRoute && targetRouteId) {
      console.log("📍 Route deselected, clearing targetRouteId")
      setTargetRouteId(null)
    }
  }, [selectedRoute, targetRouteId, setTargetRouteId])

  const handleToggle = () => {
    // Don't allow opening if lasso selection is active, RoadPriorityPanel is open, PriorityFilterPanel is open, or polygon drawing is complete
    if (
      mapMode === "lasso_selection" ||
      lassoDrawing.completedPolygon ||
      roadPriorityPanelOpen ||
      mapMode === "road_selection" ||
      polygonDrawing.completedPolygon
    ) {
      return
    }
    const newExpanded = !expanded
    setLeftPanelExpanded(newExpanded)
    setActivePanel(newExpanded ? "saved_routes" : null)
  }

  const handleRouteClick = async (routeId: string, e?: React.MouseEvent) => {
    // If clicking on checkbox, icon button, or menu, don't toggle expansion
    if (
      e?.target instanceof HTMLElement &&
      (e.target.closest(".MuiCheckbox-root") ||
        e.target.closest(".MuiIconButton-root") ||
        e.target.closest(".MuiMenu-root"))
    ) {
      return
    }

    // Check for unsaved changes when editing a saved route
    const isCurrentlySelected = selectedRoute?.id === routeId
    const isSwitchingToDifferentRoute =
      !isCurrentlySelected && routeId !== routeUUID
    const isCollapsingRoute = expandedRouteId === routeId || isCurrentlySelected

    // Check if we're in individual_drawing mode and editing a saved route
    // For saved routes being edited, we check:
    // 1. We're in individual_drawing mode
    // 2. selectedRoute exists (a route is selected) - this indicates we're editing an existing route
    // 3. We're not creating a new route (routeUUID would be null for new routes, but selectedRoute exists for saved routes)
    const isEditingSavedRoute =
      mapMode === "individual_drawing" &&
      selectedRoute !== null &&
      selectedRoute.id !== undefined // Has an ID means it's a saved route, not a new one

    // Get current state to check for unsaved changes
    const { individualRoute, snappedRoads, segmentation } =
      useLayerStore.getState()

    // Check for unsaved changes:
    // 1. Preview roads exist (route has been regenerated with changes)
    // 2. Route has been regenerated (encodedPolyline changed)
    // 3. Editing state has changes (for uploaded routes)
    // 4. Segmentation state exists (cut points or preview segments) - indicates route has been modified
    const hasPreviewRoads = snappedRoads.previewRoads.length > 0
    const hasRouteBeenRegenerated =
      individualRoute.generatedRoute !== null &&
      selectedRoute !== null &&
      individualRoute.generatedRoute.encodedPolyline !==
        selectedRoute.encodedPolyline

    // Check for segmentation state (cut points or preview segments)
    // This indicates the route has been modified and segmentation is in progress
    const hasSegmentationState =
      segmentation.cutPoints.length > 0 ||
      segmentation.previewSegments.length > 0

    // Check editing state changes (for uploaded routes or if editing state was initialized)
    // IMPORTANT: Exclude editingSavedRouteId if it's for an uploaded route
    // Uploaded routes are handled separately in UploadedRoutesPanel and should not trigger this dialog
    const layerStore = useLayerStore.getState()
    const isEditingSavedRouteIdAnUploadedRoute =
      editingSavedRouteId !== null &&
      layerStore.uploadedRoutes.routes.some((r) => r.id === editingSavedRouteId)

    const routeIdToCheck =
      // Only use editingSavedRouteId if it's NOT an uploaded route
      (!isEditingSavedRouteIdAnUploadedRoute && editingSavedRouteId) ||
      routeUUID ||
      selectedRoute?.id ||
      null
    const hasEditingStateChanges =
      routeIdToCheck !== null && hasUnsavedChanges(routeIdToCheck)

    const hasUnsavedRouteChanges =
      isEditingSavedRoute &&
      (hasPreviewRoads ||
        hasRouteBeenRegenerated ||
        hasEditingStateChanges ||
        hasSegmentationState)

    // Check if we're editing a saved route with unsaved changes
    // IMPORTANT: Don't show dialog if editingSavedRouteId is for an uploaded route
    if (
      isEditingSavedRoute &&
      !isEditingSavedRouteIdAnUploadedRoute &&
      hasUnsavedRouteChanges &&
      (isSwitchingToDifferentRoute || isCollapsingRoute)
    ) {
      // Set pending route selection to show confirmation dialog
      setPendingRouteSelection(isCollapsingRoute ? "close" : routeId)
      return
    }

    // Toggle route expansion - only one route can be expanded at a time
    // Also check if route is currently selected (for routes with no segments where expandedRouteId might be cleared by useEffect)
    if (expandedRouteId === routeId || isCurrentlySelected) {
      // Collapsing the currently expanded/selected route (DON'T navigate or show loader)
      // Check rightPanelType first to handle naming stage properly
      const currentRightPanelType =
        useProjectWorkspaceStore.getState().rightPanelType

      // Exit edit mode if we're currently editing this route OR if we're in naming stage
      // This ensures RouteDetailsPanel can show properly when reselecting the route
      if (
        mapMode === "individual_drawing" &&
        (currentRightPanelType === "naming" ||
          (routeUUID && routeUUID === routeId))
      ) {
        exitEditMode()
      }
      // Stop segmentation if it's active (clears segmentation.isActive)
      // This ensures RouteDetailsPanel can show properly when reselecting the route
      const { stopSegmentation, segmentation } = useLayerStore.getState()
      if (segmentation.isActive) {
        stopSegmentation()
      }
      // Clear rightPanelType if it's "route_ready", "segmentation", or "naming"
      // This ensures RouteDetailsPanel can open properly when reselecting the route
      if (
        currentRightPanelType === "route_ready" ||
        currentRightPanelType === "segmentation" ||
        currentRightPanelType === "naming"
      ) {
        setRightPanelType(null)
      }
      // Hide uploaded route if it's visible for this route
      if (visibleUploadedRoutes.has(routeId)) {
        const uploadedRouteId = visibleUploadedRoutes.get(routeId)
        if (uploadedRouteId) {
          const { removeUploadedRoute } = useLayerStore.getState()
          removeUploadedRoute(uploadedRouteId)
          setVisibleUploadedRoutes((prev) => {
            const newMap = new Map(prev)
            newMap.delete(routeId)
            return newMap
          })
        }
      }
      setExpandedRouteId(null)
      selectRouteSync(null)
      setShowSelectedRouteSegments(false)
      // Clear targetRouteId when deselecting
      setTargetRouteId(null)
      // Don't clear search query when route is collapsed - user might want to keep their search
    } else {
      // Expanding a new route (collapses the previous one automatically)
      // Use unified selection function with loader and navigation
      await selectRouteWithNavigation(routeId, "panel")

      // Handle additional cleanup that was in the old code
      // Stop segmentation if it's active (regardless of mode) to ensure RouteDetailsPanel can show
      const { stopSegmentation, segmentation } = useLayerStore.getState()
      if (segmentation.isActive) {
        stopSegmentation()
      }
      // Clear rightPanelType if it's "route_ready", "segmentation", or "naming"
      // This ensures RouteDetailsPanel can open properly when selecting a route
      const currentRightPanelType =
        useProjectWorkspaceStore.getState().rightPanelType
      if (
        currentRightPanelType === "route_ready" ||
        currentRightPanelType === "segmentation" ||
        currentRightPanelType === "naming"
      ) {
        setRightPanelType(null)
      }
      // Exit edit mode if we're in individual_drawing mode (either creating new route or editing different route)
      if (mapMode === "individual_drawing") {
        // Only exit if we're not editing this specific route (routeUUID is null or different route)
        if (!routeUUID || routeUUID !== routeId) {
          exitEditMode()
        }
      }
      // Hide uploaded routes for other routes when selecting a new route
      const { removeUploadedRoute } = useLayerStore.getState()
      const currentVisibleRoutes = Array.from(visibleUploadedRoutes.entries())
      currentVisibleRoutes.forEach(([otherRouteId, uploadedRouteId]) => {
        // Only hide uploaded routes for routes other than the one being selected
        if (otherRouteId !== routeId && uploadedRouteId) {
          removeUploadedRoute(uploadedRouteId)
        }
      })
      // Update visibleUploadedRoutes to only keep the selected route (if it has one)
      setVisibleUploadedRoutes((prev) => {
        const newMap = new Map()
        // Only keep the entry for the route being selected if it exists
        if (prev.has(routeId)) {
          const uploadedRouteId = prev.get(routeId)
          if (uploadedRouteId) {
            newMap.set(routeId, uploadedRouteId)
          }
        }
        return newMap
      })
    }
  }

  const handleFolderMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    folderTag: string,
  ) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()

    // Menu dimensions (approximate)
    const menuWidth = 160
    const menuHeight = 175 // Approximate height for 5 items + padding
    const padding = 5

    // Calculate available space
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Calculate horizontal position
    // Try to position to the right first
    let x = rect.right + padding
    // If not enough space to the right, position to the left
    if (x + menuWidth > viewportWidth) {
      x = rect.left - menuWidth - padding
      // If still not enough space, position at the right edge of viewport
      if (x < 0) {
        x = viewportWidth - menuWidth - padding
      }
    }

    // Calculate vertical position
    // Try to position below first
    let y = rect.top
    // If not enough space below, position above
    if (y + menuHeight > viewportHeight) {
      y = rect.bottom - menuHeight
      // If still not enough space, position at the bottom edge of viewport
      if (y < 0) {
        y = viewportHeight - menuHeight - padding
      }
    }

    setFolderMenuPosition({
      x,
      y,
      folderTag,
    })
    setFolderMenuAnchor({ element: event.currentTarget, folderTag })
  }

  const handleRouteMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    routeId: string,
  ) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()

    // Menu dimensions (approximate)
    const menuWidth = 160
    const menuHeight = 90 // Approximate height for 3 items + padding
    const padding = 0

    // Calculate available space
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Calculate horizontal position
    // Try to position to the right first
    let x = rect.right + padding
    // If not enough space to the right, position to the left
    if (x + menuWidth > viewportWidth) {
      x = rect.left - menuWidth - padding
      // If still not enough space, position at the right edge of viewport
      if (x < 0) {
        x = viewportWidth - menuWidth - padding
      }
    }

    // Calculate vertical position
    // Try to position below first
    let y = rect.bottom + padding - 25
    // If not enough space below, position above
    if (y + menuHeight > viewportHeight) {
      y = rect.top - menuHeight - padding
      // If still not enough space, position at the bottom edge of viewport
      if (y < 0) {
        y = viewportHeight - menuHeight - padding
      }
    }

    setRouteMenuPosition({
      x,
      y,
      routeId,
    })
  }

  const handleFolderMenuClose = () => {
    setFolderMenuPosition(null)
    setFolderMenuAnchor(null)
  }

  // Close menus on scroll
  useEffect(() => {
    const handleScroll = () => {
      // Close folder menu if open
      if (folderMenuPosition) {
        handleFolderMenuClose()
      }
      // Close route menu if open
      if (routeMenuPosition) {
        setRouteMenuPosition(null)
      }
    }

    // Get scroll containers
    const foldersContainer = foldersScrollContainerRef.current
    const routesContainer = routesScrollContainerRef.current

    // Add scroll listeners to both containers
    if (foldersContainer) {
      foldersContainer.addEventListener("scroll", handleScroll, {
        passive: true,
      })
    }
    if (routesContainer) {
      routesContainer.addEventListener("scroll", handleScroll, {
        passive: true,
      })
    }

    // Also listen to window scroll (for any other scroll events)
    window.addEventListener("scroll", handleScroll, {
      passive: true,
      capture: true,
    })

    return () => {
      if (foldersContainer) {
        foldersContainer.removeEventListener("scroll", handleScroll)
      }
      if (routesContainer) {
        routesContainer.removeEventListener("scroll", handleScroll)
      }
      window.removeEventListener("scroll", handleScroll, { capture: true })
    }
  }, [folderMenuPosition, routeMenuPosition])

  // Tag batch operation handlers
  const handleFolderRename = (folderTag: string) => {
    setRenameDialogTag(folderTag)
    setRenameDialogOpen(true)
    handleFolderMenuClose()
  }

  const handleFolderMove = (folderTag: string) => {
    setFolderMoveDialogTag(folderTag)
    setFolderMoveSelectedTag(null)
    setFolderMoveDialogOpen(true)
    handleFolderMenuClose()
  }

  const handleFolderRenameSave = async (newName: string) => {
    if (!projectId) return

    try {
      // Keep "" and "Untagged" as separate - use tag values as-is
      const oldTag = renameDialogTag
      const newTag = newName

      await renameTagMutation.mutateAsync({
        dbProjectId: parseInt(projectId, 10),
        tag: oldTag,
        newTag: newTag,
      })

      toast.success("Folder renamed successfully")
      setRenameDialogOpen(false)
      setRenameDialogTag("")
    } catch (err) {
      const error = err as Error
      const errorMessage = error?.message || "Failed to rename folder"
      toast.error(errorMessage)
      throw error // Re-throw to prevent dialog from closing
    }
  }

  const handleFolderMoveDialogSubmit = async () => {
    if (!projectId || !folderMoveSelectedTag) return

    try {
      // Keep "" and "Untagged" as separate - use tag values as-is
      const oldTag = folderMoveDialogTag
      const newTag = folderMoveSelectedTag

      await moveTagMutation.mutateAsync({
        dbProjectId: parseInt(projectId, 10),
        tag: oldTag,
        newTag: newTag,
      })
      const tagDisplay = getTagDisplayName(folderMoveSelectedTag)
      toast.success(`Successfully moved all routes to '${tagDisplay}'`)
      setFolderMoveDialogOpen(false)
      setFolderMoveSelectedTag(null)
    } catch (err) {
      const error = err as Error
      const errorMessage = error?.message || "Failed to move routes"
      // For move operations, show toast for all errors
      toast.error(errorMessage)
    }
  }

  const handleFolderDelete = (folderTag: string) => {
    handleFolderMenuClose()
    setFolderToDelete(folderTag)
    setFolderDeleteDialogOpen(true)
  }

  const confirmFolderDelete = async () => {
    if (!projectId || folderToDelete === null) return

    try {
      // Keep "" and "Untagged" as separate - use tag value as-is
      await deleteTagMutation.mutateAsync({
        dbProjectId: parseInt(projectId, 10),
        tag: folderToDelete,
      })
      useProjectWorkspaceStore.setState({ selectedRoute: null })
      setShowSelectedRouteSegments(false)
      setExpandedRouteId(null)
      setSelectedRoutePanelVisible(false)
      toast.success("Folder deleted successfully")
      setFolderDeleteDialogOpen(false)
      setFolderToDelete(null)
    } catch (err) {
      const error = err as Error
      toast.error(error?.message || "Failed to delete folder")
    }
  }

  const handleFolderSegmentation = (folderTag: string) => {
    setSegmentDialogTag(folderTag)
    setSegmentDistance("1")
    setSegmentMethod("distance")
    setSegmentDialogOpen(true)
    handleFolderMenuClose()
  }

  const handleSegmentDialogSubmit = async () => {
    if (!projectId || !segmentDistance.trim()) return

    const distanceKm = parseFloat(segmentDistance)
    if (isNaN(distanceKm) || distanceKm <= 0) {
      toast.error("Please enter a valid distance")
      return
    }

    try {
      const result = await segmentTagMutation.mutateAsync({
        dbProjectId: parseInt(projectId, 10),
        tag: segmentDialogTag,
        distanceKm,
      })
      toast.success(result.detail || "Routes segmented successfully")

      setSegmentDialogOpen(false)
      setSegmentDistance("1")
    } catch (err) {
      const error = err as Error
      toast.error(error?.message || "Failed to segment routes")
    }
  }

  const handleFolderStretch = async (folderTag: string) => {
    if (!projectId) return

    handleFolderMenuClose()

    try {
      const result = await stretchTagMutation.mutateAsync({
        dbProjectId: parseInt(projectId, 10),
        tag: folderTag,
      })
      const stretchedCount = result?.stretched_routes ?? 0
      const nonStretchedCount = result?.non_stretched_routes ?? 0
      toast.success(
        `Stretched ${stretchedCount} route${stretchedCount !== 1 ? "s" : ""} successfully. ${nonStretchedCount} route${nonStretchedCount !== 1 ? "s" : ""} ${nonStretchedCount === 1 ? "was" : "were"} not stretched.`,
      )
    } catch (err) {
      const error = err as Error
      toast.error(error?.message || "Failed to stretch routes")
    }
  }

  const handleFolderSync = async (folderTag: string) => {
    const { projectData } = useProjectWorkspaceStore.getState()

    if (!projectId || !projectData) {
      toast.error("Project data not available")
      return
    }

    const db_project_id = parseInt(projectId, 10)
    const project_number = projectData.bigQueryColumn?.googleCloudProjectNumber
    const gcp_project_id = projectData.bigQueryColumn?.googleCloudProjectId
    const dataset_name = projectData.datasetName

    if (!project_number || !gcp_project_id) {
      toast.error(
        "GCP project configuration not available. Please configure your GCP credentials.",
      )
      return
    }

    if (!dataset_name) {
      toast.error(
        "Dataset name not configured. Please configure your dataset name.",
      )
      return
    }

    handleFolderMenuClose()
    setIsSyncingFolder(true)

    try {
      await syncFolderMutation.mutateAsync({
        db_project_id,
        project_number,
        gcp_project_id,
        dataset_name,
        tag: folderTag,
      })
      // Toast is handled in the hook's onSuccess
    } catch (error) {
      // Toast is handled in the hook's onError
    } finally {
      setIsSyncingFolder(false)
    }
  }

  const handleDeleteRoute = (routeId: string) => {
    setRouteToDelete(routeId)
    setSingleDeleteDialogOpen(true)
  }

  const handleRouteRename = (routeId: string) => {
    const route = routes.find((r) => r.id === routeId)
    if (!route) return

    setRouteRenameRouteId(routeId)
    setRouteRenameDialogOpen(true)
    setRouteMenuPosition(null)
  }

  const handleRouteRenameSave = async (newName: string) => {
    if (!routeRenameRouteId) return

    try {
      const updatedRoute = await updateRouteMutation.mutateAsync({
        routeId: routeRenameRouteId,
        updates: { name: newName },
      })

      if (updatedRoute) {
        // Update route in store
        const { updateRoute } = useProjectWorkspaceStore.getState()
        updateRoute(routeRenameRouteId, { name: newName })

        // If this route is being edited, update originalRouteName in layer store
        const layerStore = useLayerStore.getState()
        if (
          layerStore.individualRoute.routeUUID === routeRenameRouteId &&
          layerStore.individualRoute.originalRouteName
        ) {
          useLayerStore.setState({
            individualRoute: {
              ...layerStore.individualRoute,
              originalRouteName: newName,
            },
          })
        }
      }

      toast.success("Route renamed successfully")
      setRouteRenameDialogOpen(false)
      setRouteRenameRouteId(null)
    } catch (err) {
      const error = err as Error
      throw error // Let RouteRenameDialog handle the error display
    }
  }

  const handleSegmentRename = (segmentId: string, parentRouteId: string) => {
    setSegmentRenameSegmentId(segmentId)
    setSegmentRenameParentRouteId(parentRouteId)
    setSegmentRenameDialogOpen(true)
  }

  const handleSegmentRenameSave = async (newName: string) => {
    if (!segmentRenameSegmentId || !segmentRenameParentRouteId) return

    try {
      const updatedSegment = await updateRouteMutation.mutateAsync({
        routeId: segmentRenameSegmentId,
        updates: { name: newName.trim() },
      })

      if (updatedSegment && segmentRenameParentRouteId) {
        // Update segment in parent route's segments array
        const { updateRoute } = useProjectWorkspaceStore.getState()
        const currentRoute =
          selectedRoute?.id === segmentRenameParentRouteId
            ? selectedRoute
            : routesStore.find((r) => r.id === segmentRenameParentRouteId)

        if (currentRoute?.segments) {
          const updatedSegments = currentRoute.segments.map((seg) =>
            seg.uuid === segmentRenameSegmentId
              ? { ...seg, route_name: newName.trim() }
              : seg,
          )
          updateRoute(segmentRenameParentRouteId, { segments: updatedSegments })
        }

        // Also update selectedRoute if it's the parent route
        if (selectedRoute?.id === segmentRenameParentRouteId) {
          const updatedSegments =
            selectedRoute.segments?.map((seg) =>
              seg.uuid === segmentRenameSegmentId
                ? { ...seg, route_name: newName.trim() }
                : seg,
            ) || []
          // Update the route in store which will update selectedRoute
          const { updateRoute } = useProjectWorkspaceStore.getState()
          updateRoute(segmentRenameParentRouteId, { segments: updatedSegments })
        }
      }

      toast.success("Segment renamed successfully")
      setSegmentRenameDialogOpen(false)
      setSegmentRenameSegmentId(null)
      setSegmentRenameParentRouteId(null)
    } catch (err) {
      const error = err as Error
      throw error // Let RenameDialog handle the error display
    }
  }

  const confirmSingleDelete = () => {
    if (!routeToDelete) return

    const routeId = routeToDelete
    // Clean up visible uploaded route if it exists
    const uploadedRouteId = visibleUploadedRoutes.get(routeId)
    if (uploadedRouteId) {
      const { removeUploadedRoute } = useLayerStore.getState()
      removeUploadedRoute(uploadedRouteId)
      setVisibleUploadedRoutes((prev) => {
        const newMap = new Map(prev)
        newMap.delete(routeId)
        return newMap
      })
    }

    deleteRouteMutation.mutate(routeId, {
      onSuccess: () => {
        removeRoute(routeId)
        // Clear selected route if the deleted route was selected
        if (selectedRoute?.id === routeId) {
          selectRouteSync(null)
          setShowSelectedRouteSegments(false)
          setExpandedRouteId(null)
        }
        // Also clear expanded state if the deleted route was expanded
        if (expandedRouteId === routeId) {
          setExpandedRouteId(null)
          setShowSelectedRouteSegments(false)
        }
        // Remove from multi-select if it was selected
        if (selectedRouteIds.has(routeId)) {
          setSelectedRouteIds((prev) => {
            const newSet = new Set(prev)
            newSet.delete(routeId)
            return newSet
          })
        }
      },
    })
    setSingleDeleteDialogOpen(false)
    setRouteToDelete(null)
  }

  const handleToggleUploadedRoute = async (routeId: string) => {
    try {
      const uploadedRouteId = visibleUploadedRoutes.get(routeId)
      const { addUploadedRoute, removeUploadedRoute } = useLayerStore.getState()

      if (uploadedRouteId) {
        // Hide: Remove the uploaded route
        removeUploadedRoute(uploadedRouteId)
        setVisibleUploadedRoutes((prev) => {
          const newMap = new Map(prev)
          newMap.delete(routeId)
          return newMap
        })
      } else {
        // Show: First, hide any previously visible uploaded routes (only one at a time)
        const currentVisibleRoutes = Array.from(visibleUploadedRoutes.entries())
        currentVisibleRoutes.forEach(([, prevUploadedRouteId]) => {
          removeUploadedRoute(prevUploadedRouteId)
        })
        setVisibleUploadedRoutes(new Map()) // Clear all previous entries

        // Now fetch and show the new route
        const response = await routesApi.getById(routeId)

        if (!response.success || !response.data) {
          toast.error("Failed to load route")
          return
        }

        const route = response.data

        // Check if this is an uploaded route
        if (route.type !== "uploaded") {
          // Check if this route was created from individual drawing (won't have original route)
          const isDrawnRoute = route.source === "individual_drawing"
          toast.error(
            isDrawnRoute
              ? "This route was drawn manually and doesn't have an original uploaded route"
              : "Original uploaded route is not available for this route. It may have been saved before this feature was added.",
          )
          return
        }

        // Try to use original uploaded route GeoJSON, fall back to encoded polyline if not available
        let routeGeoJson: GeoJSON.Feature | GeoJSON.FeatureCollection

        if (route.originalRouteGeoJson) {
          routeGeoJson = JSON.parse(JSON.stringify(route.originalRouteGeoJson))
        } else if (
          route.encodedPolyline &&
          route.encodedPolyline.trim().length > 0
        ) {
          // Fall back to encoded polyline if original route GeoJSON is not available
          const encodedPolyline = route.encodedPolyline.trim()
          let linestring: GeoJSON.LineString

          // Check if it's a JSON array format (coordinate pairs)
          try {
            const parsed = JSON.parse(encodedPolyline)
            if (
              Array.isArray(parsed) &&
              parsed.length > 0 &&
              Array.isArray(parsed[0]) &&
              parsed[0].length === 2
            ) {
              // It's a JSON array of coordinates, convert to GeoJSON LineString
              linestring = {
                type: "LineString",
                coordinates: parsed as [number, number][],
              }
            } else {
              // Not a coordinate array, decode as Google encoded polyline
              linestring = decodePolylineToGeoJSON(encodedPolyline)
            }
          } catch {
            // Not JSON, decode as Google encoded polyline
            linestring = decodePolylineToGeoJSON(encodedPolyline)
          }

          // Convert LineString to Feature
          routeGeoJson = {
            type: "Feature",
            geometry: linestring,
            properties: {},
          }
        } else {
          setSnackbar({
            open: true,
            message:
              "Original uploaded route data is not available for this route.",
            severity: "error",
          })
          return
        }

        const uploadedRouteId = `${routeId}-uploaded-${Date.now()}`

        const uploadedRoute = {
          id: uploadedRouteId,
          name: `${route.name} (Original)`,
          type: "geojson" as const,
          data: routeGeoJson,
          uploadedAt: new Date(),
          // Use the same color constant as the renderer and legend
          color: getColorsForMapType(mapType).uploadedRouteColor,
        }
        addUploadedRoute(uploadedRoute)
        setVisibleUploadedRoutes((prev) => {
          const newMap = new Map(prev)
          newMap.set(routeId, uploadedRouteId)
          return newMap
        })
      }
    } catch (error) {
      console.error("Failed to toggle uploaded route:", error)
      toast.error("Failed to toggle uploaded route")
    }
  }

  const handleNavigateToRoute = (
    route: (typeof routes)[0],
    e: React.MouseEvent,
  ) => {
    e.stopPropagation()
    console.log("🧭 Navigation icon clicked for route:", route.id, route.name)
    console.log("🧭 Navigation function available:", !!navigateToGeometry)
    console.log("🧭 Route has encodedPolyline:", !!route.encodedPolyline)
    console.log("🧭 Route has roads:", !!route.roads, route.roads?.length)

    if (!navigateToGeometry) {
      console.warn("Navigation function not available")
      return
    }

    // Prefer encodedPolyline if available
    if (route.encodedPolyline && route.encodedPolyline.trim().length > 0) {
      const encodedPolyline = route.encodedPolyline.trim()

      // Check if it's a JSON array format (coordinate pairs)
      try {
        const parsed = JSON.parse(encodedPolyline)
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          Array.isArray(parsed[0]) &&
          parsed[0].length === 2
        ) {
          const linestring: GeoJSON.LineString = {
            type: "LineString",
            coordinates: parsed as [number, number][],
          }
          navigateToGeometry({ linestring })
          return
        }
      } catch {
        // Not a JSON array, will treat as regular encoded polyline below
      }

      // Treat as regular encoded polyline (either parsing failed or wasn't an array)
      console.log("🧭 Navigating using encoded polyline string")
      navigateToGeometry({ encodedPolyline })
      return
    }

    console.warn("No geometry available for route:", route.id)
  }

  const handleNavigateToSegment = (
    segment: RouteSegment,
    e: React.MouseEvent,
  ) => {
    // Don't navigate if clicking on checkbox, rename button, or sync button
    const target = e.target as HTMLElement
    if (
      target.closest(".MuiCheckbox-root") ||
      target.closest('button[title="Rename segment"]') ||
      target.closest('button[aria-label*="Sync"]') ||
      target.closest(".MuiIconButton-root")
    ) {
      // Let the click event propagate to the button/checkbox handlers
      return
    }

    e.stopPropagation()
    console.log("🧭 Navigation clicked for segment:", segment.uuid)

    if (!navigateToGeometry) {
      console.warn("Navigation function not available")
      return
    }

    // Use encoded_polyline if available
    if (
      segment.encoded_polyline &&
      segment.encoded_polyline.trim().length > 0
    ) {
      const encodedPolyline = segment.encoded_polyline.trim()

      // Check if it's a JSON array format (coordinate pairs)
      try {
        const parsed = JSON.parse(encodedPolyline)
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          Array.isArray(parsed[0]) &&
          parsed[0].length === 2
        ) {
          const linestring: GeoJSON.LineString = {
            type: "LineString",
            coordinates: parsed as [number, number][],
          }
          navigateToGeometry({ linestring })
          return
        }
      } catch {
        // Not a JSON array, will treat as regular encoded polyline below
      }

      // Treat as regular encoded polyline (either parsing failed or wasn't an array)
      console.log("🧭 Navigating to segment using encoded polyline string")
      navigateToGeometry({ encodedPolyline })
      return
    }

    console.warn("No geometry available for segment:", segment.uuid)
  }

  // Helper function to get display name for a tag
  const getTagDisplayName = (tag: string): string => {
    if (tag === "") {
      return "(Unnamed)"
    }
    return tag
  }

  // Handle segment click from unified search - select parent route and expand to show segment
  const handleSearchSegmentClick = async (
    segment: RouteSegment,
    parentRouteId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation()
    console.log(
      "🔍 Segment clicked from search:",
      segment.uuid,
      "Parent:",
      parentRouteId,
    )

    // Select the parent route
    await selectRouteWithNavigation(parentRouteId, "panel")

    // Wait a bit for route to load, then expand and highlight segment
    setTimeout(() => {
      setExpandedRouteId(parentRouteId)
      setShowSelectedRouteSegments(true)
      // Highlight the segment
      setSelectedRouteHoveredSegmentId(segment.uuid)
      // Scroll will be handled by the SegmentsList component's useEffect
    }, 300)
  }

  // Filtered tags for folder view (client-side filtering from API data)
  // Keep "" and "Untagged" as separate folders
  const filteredTags = useMemo(() => {
    if (!tagsData) return []

    // Use tags directly from API - don't combine "Untagged" with empty string
    const allTags = [...tagsData.tags]

    return allTags
      .filter((tag) => {
        const displayName = getTagDisplayName(tag)
        return displayName
          .toLowerCase()
          .includes(trimmedSearchQuery.toLowerCase())
      })
      .sort((a, b) => {
        // Sort empty string first, then alphabetically
        if (a === "") return -1
        if (b === "") return 1
        return a.localeCompare(b)
      })
  }, [tagsData, trimmedSearchQuery])

  // All tags for folder count footer
  // Keep "" and "Untagged" as separate folders
  const tags = useMemo(() => {
    if (!tagsData) return []

    // Use tags directly from API - don't combine "Untagged" with empty string
    const allTags = [...tagsData.tags]

    return allTags.sort((a, b) => {
      // Sort empty string first, then alphabetically
      if (a === "") return -1
      if (b === "") return 1
      return a.localeCompare(b)
    })
  }, [tagsData])

  // Calculate total route count to determine if there are no routes at all
  const totalRouteCount = useMemo(() => {
    if (!tagsData) return 0
    return Object.values(tagsData.routeCounts).reduce(
      (sum, count) => sum + count,
      0,
    )
  }, [tagsData])

  const toggleRouteSelection = (routeId: string) => {
    const newSet = new Set(selectedRouteIds)
    if (newSet.has(routeId)) newSet.delete(routeId)
    else newSet.add(routeId)
    setSelectedRouteIds(newSet)
  }

  const deselectAll = () => {
    setSelectedRouteIds(new Set())
  }

  const selectAll = () => {
    if (currentFolder === null || routes.length === 0) return
    const allRouteIds = new Set(routes.map((r) => r.id))
    setSelectedRouteIds(allRouteIds)
  }

  const handleSelectAllToggle = () => {
    if (selectedRouteIds.size === routes.length) {
      deselectAll()
    } else {
      selectAll()
    }
  }

  const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) {
      return (err as Error).message
    }
    if (
      typeof err === "object" &&
      err !== null &&
      "message" in err &&
      typeof (err as Record<string, unknown>).message === "string"
    ) {
      return (err as Record<string, string>).message
    }
    return "An unknown error occurred"
  }

  const handleBatchDelete = () => {
    setDeleteDialogOpen(true)
  }

  const confirmBatchDelete = async () => {
    try {
      const routeIdsArray = Array.from(selectedRouteIds)
      await batchDeleteMutation.mutateAsync(routeIdsArray)

      // Clean up visible uploaded routes for deleted routes
      const { removeUploadedRoute } = useLayerStore.getState()
      routeIdsArray.forEach((routeId) => {
        const uploadedRouteId = visibleUploadedRoutes.get(routeId)
        if (uploadedRouteId) {
          removeUploadedRoute(uploadedRouteId)
        }
      })

      // Remove deleted routes from local state
      routeIdsArray.forEach((id) => removeRoute(id))

      // Clear visible uploaded routes mapping for deleted routes
      setVisibleUploadedRoutes((prev) => {
        const newMap = new Map(prev)
        routeIdsArray.forEach((routeId) => {
          newMap.delete(routeId)
        })
        return newMap
      })

      // Clear selected route if it was in the deleted batch
      if (selectedRoute && routeIdsArray.includes(selectedRoute.id)) {
        selectRouteSync(null)
        setShowSelectedRouteSegments(false)
        setExpandedRouteId(null)
      }
      // Also clear expanded state if the expanded route was deleted
      if (expandedRouteId && routeIdsArray.includes(expandedRouteId)) {
        setExpandedRouteId(null)
        setShowSelectedRouteSegments(false)
      }

      // Clear selection and exit batch mode
      setSelectedRouteIds(new Set())
      setMultiSelectEnabled(false)
      setDeleteDialogOpen(false)

      // Show success message
      toast.success(`Successfully deleted ${routeIdsArray.length} route(s)`)
    } catch (err: unknown) {
      setDeleteDialogOpen(false)
      toast.error(`Failed to delete routes: ${getErrorMessage(err)}`)
    }
  }

  const handleBatchMove = () => {
    setSelectedTag(null)
    setNewTagName("")
    setMoveDialogOpen(true)
  }

  const confirmBatchMove = async () => {
    try {
      const routeIdsArray = Array.from(selectedRouteIds)
      // Use newTagName if provided, otherwise use selectedTag
      // Keep "" and "Untagged" as separate - use tag values as-is
      const targetTag = newTagName.trim() || selectedTag || null

      await batchMoveMutation.mutateAsync({
        routeIds: routeIdsArray,
        tag: targetTag,
      })

      // Clear selection and exit batch mode
      setSelectedRouteIds(new Set())
      setMultiSelectEnabled(false)
      setMoveDialogOpen(false)
      setSelectedTag(null)
      setNewTagName("")

      // Show success message
      const tagDisplay = targetTag ? getTagDisplayName(targetTag) : "Untagged"
      toast.success(
        `Successfully moved ${routeIdsArray.length} route(s) to '${tagDisplay}'`,
      )
    } catch (err: unknown) {
      setMoveDialogOpen(false)
      toast.error(`Failed to move routes: ${getErrorMessage(err)}`)
    }
  }

  const getRouteDisplayName = (route: (typeof routes)[0]) => {
    return route.name || "Unnamed Route"
  }

  // Highlight search text in a string (like code editors)
  const highlightSearchText = (
    text: string,
    searchQuery: string,
  ): React.ReactNode => {
    if (!searchQuery.trim()) {
      return text
    }

    const searchLower = searchQuery.toLowerCase()
    const textLower = text.toLowerCase()
    const index = textLower.indexOf(searchLower)

    if (index === -1) {
      return text
    }

    const beforeMatch = text.substring(0, index)
    const match = text.substring(index, index + searchQuery.length)
    const afterMatch = text.substring(index + searchQuery.length)

    return (
      <>
        {beforeMatch}
        <mark
          style={{
            backgroundColor: "#FFEB3B",
            color: "#212121",
            padding: "0 2px",
            borderRadius: "2px",
          }}
        >
          {match}
        </mark>
        {afterMatch}
      </>
    )
  }

  // Handle individual route sync
  const handleRouteSync = async (routeId: string) => {
    const { projectData } = useProjectWorkspaceStore.getState()

    if (!projectId || !projectData) {
      toast.error("Project data not available")
      return
    }

    const db_project_id = parseInt(projectId, 10)
    const project_number = projectData.bigQueryColumn?.googleCloudProjectNumber
    const gcp_project_id = projectData.bigQueryColumn?.googleCloudProjectId
    const dataset_name = projectData.datasetName

    if (!project_number || !gcp_project_id) {
      toast.error(
        "GCP project configuration not available. Please configure your GCP credentials.",
      )
      return
    }

    if (!dataset_name) {
      toast.error(
        "Dataset name not configured. Please configure your dataset name.",
      )
      return
    }

    setSyncingRouteId(routeId)
    try {
      await syncRouteMutation.mutateAsync({
        db_project_id,
        project_number,
        gcp_project_id,
        dataset_name,
        uuid: routeId,
      })
      // Toast is handled in the hook's onSuccess
    } catch (error) {
      // Toast is handled in the hook's onError
    } finally {
      setSyncingRouteId(null)
    }
  }

  // Don't render if lasso selection is active, RoadPriorityPanel is open, PriorityFilterPanel is open, or polygon drawing is complete
  if (
    mapMode === "lasso_selection" ||
    lassoDrawing.completedPolygon ||
    roadPriorityPanelOpen ||
    mapMode === "road_selection" ||
    polygonDrawing.completedPolygon
  ) {
    return null
  }

  return (
    <>
      {/* Full-page loader for folder sync operations */}
      <FullPageLoader
        open={isSyncingFolder || syncFolderMutation.isPending}
        message="Syncing folder, please wait..."
      />

      {/* Hidden file input for route upload - accepts only GDAL-supported geospatial formats */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson,.json,.kml,.kmz,.gpx,.zip"
        onChange={handleFileUploadChange}
        style={{ display: "none" }}
      />

      <FloatingSheet
        isExpanded={expanded}
        onToggle={handleToggle}
        width={typo.leftPanelWidth}
      >
        {/* Header Section - Fixed Height */}
        <Box
          className="border-b border-gray-200 bg-[#FAFAFA]"
          sx={{
            px: pxToMuiSpacing(typo.spacing.panel.px),
            pt: pxToMuiSpacing(typo.spacing.panel.py),
            pb: pxToMuiSpacing(typo.spacing.panel.py),
            minHeight: 64,
          }}
        >
          {currentFolder !== null ? (
            <>
              {/* Breadcrumb Navigation */}
              <Box
                className="flex items-center gap-2 mb-3"
                sx={{ minWidth: 0 }}
              >
                <IconButton
                  ref={backButtonRef}
                  size="small"
                  onClick={() => {
                    // Cancel any selected or modifying route
                    // Only proceed with navigation if there are no unsaved changes
                    const shouldProceed = cancelRouteSelectionAndModification()
                    if (!shouldProceed) {
                      return // Dialog will be shown, don't navigate
                    }
                    setCurrentFolder(null)
                    setMultiSelectEnabled(false)
                    setSearchQuery("")
                  }}
                  onKeyDown={(e) => {
                    // Prevent spacebar from triggering navigation when inside a folder
                    // Allow Enter key for accessibility
                    if (e.key === " " || e.key === "Spacebar") {
                      e.preventDefault()
                      e.stopPropagation()
                    }
                  }}
                  sx={{
                    minWidth: 40,
                    minHeight: 40,
                    width: 40,
                    height: 40,
                    padding: 0,
                    color: "#757575",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    "&:hover": {
                      backgroundColor: "#f5f5f5",
                    },
                  }}
                >
                  <ArrowBack
                    sx={{
                      fontSize: 18,
                      display: "flex",
                      alignItems: "center",
                    }}
                  />
                </IconButton>

                <Typography
                  variant="body2"
                  className="font-semibold"
                  title={`Your Routes / ${getTagDisplayName(currentFolder || "")}`}
                  sx={{
                    fontSize: typo.body.medium,
                    lineHeight: 1.5,
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  Your Routes /{" "}
                  <span className="font-normal text-gray-900">
                    {getTagDisplayName(currentFolder || "")}
                  </span>
                </Typography>
                {(() => {
                  // Get total route count for current folder from tagsData
                  const totalCount = tagsData?.routeCounts[currentFolder] || 0
                  // Don't show route count when there are 0 routes or count is undefined/null
                  if (!totalCount || totalCount === 0) return null
                  return (
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: typo.body.xsmall,
                        color: "#757575",
                        fontWeight: 400,
                        fontFamily: '"Google Sans", sans-serif',
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {totalCount} {totalCount === 1 ? "route" : "routes"}
                    </Typography>
                  )
                })()}
              </Box>
              {/* Search Bar */}
              <Box>
                <SearchBar
                  placeholder="Search saved routes or segments..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                />
              </Box>
              {/* Selected Route Badge - shows when route is selected from map */}
              {targetRouteId && selectedRoute && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    padding: "6px 10px",
                    backgroundColor: "#e3f2fd",
                    borderRadius: "16px",
                    marginTop: 1.5,
                  }}
                  title={selectedRoute.name || "Unnamed Route"}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: "#1976d2",
                      flex: 1,
                      fontSize: typo.body.xsmall,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    Selected Route: {selectedRoute.name || "Unnamed Route"}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => {
                      // Clear selection and reset list
                      selectRouteSync(null)
                      setTargetRouteId(null)
                      setExpandedRouteId(null)
                      setShowSelectedRouteSegments(false)
                    }}
                    sx={{
                      padding: "2px",
                      minWidth: "24px",
                      width: "24px",
                      height: "24px",
                      color: "#1976d2",
                      flexShrink: 0,
                      "&:hover": {
                        backgroundColor: "#bbdefb",
                      },
                    }}
                    aria-label="Clear selected route"
                    title="Clear selected route"
                  >
                    <Close sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              )}
            </>
          ) : (
            <>
              {/* Folders View Header */}
              <Box className="flex items-center justify-between mb-3">
                <Typography
                  variant="h6"
                  className="text-gray-900 font-medium"
                  sx={{ fontSize: typo.body.medium, fontWeight: 500 }}
                >
                  Your Routes
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => navigateWithCheck("/dashboard")}
                  sx={{
                    minWidth: 40,
                    minHeight: 40,
                    width: 40,
                    height: 40,
                    padding: 0,
                    color: "#5f6368",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    "&:hover": {
                      backgroundColor: "#f5f5f5",
                      color: PRIMARY_BLUE,
                    },
                  }}
                  aria-label="Go to dashboard"
                  title="Go to dashboard"
                >
                  <Home
                    sx={{
                      fontSize: 20,
                      display: "flex",
                      alignItems: "center",
                    }}
                  />
                </IconButton>
              </Box>
              {/* Search Bar for Folders */}
              <Box>
                <SearchBar
                  placeholder="Search folders..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                />
              </Box>
            </>
          )}
        </Box>
        {/* Header Section with Batch Selection Controls - Fixed at top when in folder view */}
        {currentFolder !== null && (
          <Box
            className="border-b border-gray-200 bg-white"
            sx={{
              px: pxToMuiSpacing(typo.spacing.panel.px),
              pt: pxToMuiSpacing(typo.spacing.panel.py),
              pb: pxToMuiSpacing(typo.spacing.panel.py),
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  minWidth: 0,
                  flexShrink: 1,
                }}
              >
                {multiSelectEnabled && (
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: typo.body.xsmall,
                      color: "#757575",
                      fontWeight: 400,
                      fontFamily: '"Google Sans", sans-serif',
                      whiteSpace: "nowrap",
                    }}
                  >
                    0 selected
                  </Typography>
                )}
                {!multiSelectEnabled && (
                  <>
                    <RouteTypeFilter
                      routeTypes={routeTypeFilter}
                      onTypeChange={setRouteTypeFilter}
                    />
                    <RouteFilter
                      sortBy={sortBy}
                      onSortChange={(newSortBy) => {
                        setSortBy(
                          newSortBy as
                            | "name"
                            | "distance"
                            | "created_at"
                            | "match_percentage",
                        )
                      }}
                      apiSorting={true}
                      showMatchPercentage={hasUploadedRoutes}
                    />
                  </>
                )}
                {multiSelectEnabled && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Tooltip
                      title={`Move ${selectedRouteIds.size} selected route${selectedRouteIds.size !== 1 ? "s" : ""}`}
                    >
                      <IconButton
                        onClick={handleBatchMove}
                        disabled={
                          batchMoveMutation.isPending ||
                          selectedRouteIds.size === 0
                        }
                        sx={{
                          color: "#1976d2",
                          border: "1px solid #e0e0e0",
                          padding: "6px",
                          width: "32px",
                          height: "32px",
                          "&:hover": {
                            backgroundColor: "#e3f2fd",
                            color: "#1565c0",
                            borderColor: "#1976d2",
                          },
                          "&:disabled": {
                            borderColor: "#e0e0e0",
                            color: "#9e9e9e",
                          },
                        }}
                      >
                        {batchMoveMutation.isPending ? (
                          <CircularProgress size={18} />
                        ) : (
                          <DriveFileMoveIcon sx={{ fontSize: 18 }} />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip
                      title={`Delete ${selectedRouteIds.size} selected route${selectedRouteIds.size !== 1 ? "s" : ""}`}
                    >
                      <IconButton
                        onClick={handleBatchDelete}
                        disabled={
                          batchDeleteMutation.isPending ||
                          selectedRouteIds.size === 0
                        }
                        sx={{
                          color: "#1976d2",
                          border: "1px solid #e0e0e0",
                          padding: "6px",
                          width: "32px",
                          height: "32px",
                          "&:hover": {
                            backgroundColor: "#e3f2fd",
                            color: "#1565c0",
                            borderColor: "#1976d2",
                          },
                          "&:disabled": {
                            borderColor: "#e0e0e0",
                            color: "#9e9e9e",
                          },
                        }}
                      >
                        {batchDeleteMutation.isPending ? (
                          <CircularProgress size={18} />
                        ) : (
                          <Delete sx={{ fontSize: 18 }} />
                        )}
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexShrink: 0,
                }}
              >
                {routes.length > 0 && (
                  <>
                    {multiSelectEnabled ? (
                      <Button
                        variant="outlined"
                        onClick={
                          selectedRouteIds.size === routes.length
                            ? deselectAll
                            : selectAll
                        }
                        sx={{
                          fontSize: typo.body.xsmall,
                          textTransform: "none",
                          color: "#5f6368",
                          borderColor: "#d1d5db",
                          padding: `${pxToMuiSpacing(typo.spacing.button.py)}px ${pxToMuiSpacing(typo.spacing.button.px)}px`,
                          minWidth: "auto",
                          height: `${typo.button.height - 4}px`,
                          lineHeight: 1.2,
                          whiteSpace: "nowrap",
                          display: "none",
                          "&:hover": {
                            borderColor: "#1976d2",
                            backgroundColor: "#e3f2fd",
                          },
                        }}
                      >
                        {selectedRouteIds.size === routes.length
                          ? "Deselect All"
                          : "Select All"}
                      </Button>
                    ) : (
                      <Button
                        variant="outlined"
                        onClick={() => {
                          // Deselect the currently selected route when entering multi-select mode
                          if (selectedRoute) {
                            selectRouteSync(null)
                            setExpandedRouteId(null)
                            setShowSelectedRouteSegments(false)
                            // Hide uploaded route if it's visible for the selected route
                            if (visibleUploadedRoutes.has(selectedRoute.id)) {
                              const uploadedRouteId = visibleUploadedRoutes.get(
                                selectedRoute.id,
                              )
                              if (uploadedRouteId) {
                                const { removeUploadedRoute } =
                                  useLayerStore.getState()
                                removeUploadedRoute(uploadedRouteId)
                                setVisibleUploadedRoutes((prev) => {
                                  const newMap = new Map(prev)
                                  newMap.delete(selectedRoute.id)
                                  return newMap
                                })
                              }
                            }
                            // Exit edit mode if we're editing this route
                            if (
                              mapMode === "individual_drawing" &&
                              routeUUID &&
                              routeUUID === selectedRoute.id
                            ) {
                              exitEditMode()
                            }
                          }
                          setMultiSelectEnabled(true)
                        }}
                        sx={{
                          fontSize: typo.body.xsmall,
                          textTransform: "none",
                          color: "#5f6368",
                          borderColor: "#d1d5db",
                          padding: "6px 12px",
                          minWidth: "auto",
                          height: `${typo.button.height - 4}px`,
                          lineHeight: 1.2,
                          whiteSpace: "nowrap",
                          "&:hover": {
                            borderColor: "#1976d2",
                            backgroundColor: "#e3f2fd",
                          },
                        }}
                      >
                        Select
                      </Button>
                    )}
                    {multiSelectEnabled && (
                      <Button
                        variant="text"
                        onClick={() => {
                          setMultiSelectEnabled(false)
                          setSelectedRouteIds(new Set())
                        }}
                        sx={{
                          fontSize: typo.body.xsmall,
                          textTransform: "none",
                          color: "#757575",
                          padding: `${pxToMuiSpacing(typo.spacing.button.py)}px ${pxToMuiSpacing(typo.spacing.button.px)}px`,
                          minWidth: "auto",
                          height: `${typo.button.height - 4}px`,
                          lineHeight: 1.2,
                          whiteSpace: "nowrap",
                          "&:hover": {
                            backgroundColor: "#f5f5f5",
                          },
                        }}
                      >
                        Done
                      </Button>
                    )}
                  </>
                )}
              </Box>
            </Box>
          </Box>
        )}
        {/* Content */}
        <Box
          className="flex-1 flex flex-col"
          sx={{
            minHeight: 0, // Allows flex child to shrink below content size
            overflow: "hidden", // Prevent overflow on parent
          }}
        >
          {currentFolder === null ? (
            // Folders List
            <Box
              ref={foldersScrollContainerRef}
              className="flex-1 overflow-auto pretty-scrollbar"
              sx={{
                px: pxToMuiSpacing(typo.spacing.panel.px),
                minHeight: 0,
              }}
            >
              {isLoadingTags ? (
                <Box className="p-6 text-center">
                  <CircularProgress size={32} />
                  <Typography
                    variant="body2"
                    className="text-gray-500 mt-2"
                    style={{ fontSize: "14px" }}
                  >
                    Loading folders...
                  </Typography>
                </Box>
              ) : totalRouteCount === 0 ? (
                // Beautiful empty state when no routes exist
                <Box className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <Route
                    className="text-6xl mb-4 opacity-20"
                    sx={{ fontSize: 80 }}
                  />
                  <Typography
                    variant="h6"
                    className="text-gray-900 font-medium mb-2"
                    style={{ fontSize: "20px", fontWeight: 500 }}
                  >
                    No routes yet
                  </Typography>
                  <Typography
                    variant="body2"
                    className="text-gray-500 mb-6"
                    sx={{ fontSize: typo.body.small, maxWidth: "280px" }}
                  >
                    Get started by creating your first route
                  </Typography>
                  <Box className="flex flex-col gap-3 w-full max-w-[280px]">
                    <Button
                      variant="contained"
                      startIcon={<Add />}
                      onClick={() => setMapMode("individual_drawing")}
                      className="rounded-lg"
                      sx={{
                        textTransform: "none",
                        fontSize: typo.body.small,
                        fontWeight: 500,
                        padding: 1,
                        backgroundColor: "#1976d2",
                        "&:hover": {
                          backgroundColor: "#1565c0",
                        },
                      }}
                    >
                      Draw Route
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<Upload />}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleUploadRoute()
                      }}
                      className="rounded-lg"
                      sx={{
                        textTransform: "none",
                        fontSize: typo.body.small,
                        fontWeight: 500,
                        padding: 1,
                        borderColor: "#1976d2",
                        color: "#1976d2",
                        "&:hover": {
                          backgroundColor: "#e3f2fd",
                          borderColor: "#1565c0",
                        },
                      }}
                    >
                      From File (GeoJSON)
                    </Button>
                  </Box>
                </Box>
              ) : filteredTags.length === 0 ? (
                <Box className="p-6 text-center text-gray-500">
                  <Folder className="text-5xl mb-2 opacity-30" />
                  <Typography
                    variant="body2"
                    gutterBottom
                    sx={{ fontSize: typo.body.small }}
                  >
                    No folders found
                  </Typography>
                </Box>
              ) : (
                <List disablePadding className="!mx-0 !my-2">
                  {filteredTags.map((tag) => {
                    const routeCount = tagsData?.counts[tag] || 0
                    return (
                      <React.Fragment key={tag}>
                        <ListItem disablePadding>
                          <ListItemButton
                            onClick={() => {
                              // Keep "" and "Untagged" as separate - use tag value as-is
                              setCurrentFolder(tag)
                              setSearchQuery("")
                            }}
                            sx={{
                              minHeight: 44,
                              // padding: "6px 12px",
                              borderRadius: "1rem", // rounded-2xl
                              margin: "0px 0px",
                              marginBottom: "8px",
                              backgroundColor: "#ffffff",
                              border: "1px solid #e0e0e0",
                              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                              "&:hover": {
                                backgroundColor: "#f5f5f5",
                                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                              },
                            }}
                          >
                            <ListItemIcon
                              className="min-w-[25px]"
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-start",
                              }}
                            >
                              <Folder
                                sx={{
                                  fontSize: 18,
                                  color: "#757575",
                                  display: "flex",
                                  alignItems: "center",
                                }}
                              />
                            </ListItemIcon>
                            <ListItemText
                              primary={
                                <Typography
                                  variant="body2"
                                  className="font-medium text-gray-900"
                                  title={getTagDisplayName(tag)}
                                  sx={{
                                    fontSize: typo.body.small,
                                    fontWeight: 500,
                                    lineHeight: 1.3,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {getTagDisplayName(tag)}
                                </Typography>
                              }
                              sx={{
                                margin: 0,
                                flex: 1,
                                minWidth: 0,
                              }}
                            />
                            <Box className="flex items-center gap-1">
                              {routeCount > 0 && (
                                <Chip
                                  size="small"
                                  label={
                                    <span className="flex items-center gap-1">
                                      <span className="text-[11px] font-medium align-middle">
                                        {routeCount}
                                      </span>{" "}
                                      <span className="text-[11px] align-middle ">
                                        route{routeCount !== 1 ? "s" : ""}
                                      </span>
                                    </span>
                                  }
                                  sx={{
                                    backgroundColor: "#f5f5f5",
                                    color: "#757575",
                                    height: "18px",
                                    fontWeight: 400,
                                    "& .MuiChip-label": {
                                      padding: "0 6px",
                                      display: "flex",
                                      alignItems: "center",
                                    },
                                  }}
                                />
                              )}
                              {(() => {
                                const segmentCount =
                                  tagsData?.segmentCounts?.[tag] || 0
                                return segmentCount > 0 ? (
                                  <Chip
                                    size="small"
                                    label={
                                      <span className="flex items-center gap-1">
                                        <span className="text-[11px] font-medium align-middle">
                                          {segmentCount}
                                        </span>{" "}
                                        <span className="text-[11px] align-middle">
                                          segment{segmentCount !== 1 ? "s" : ""}
                                        </span>
                                      </span>
                                    }
                                    sx={{
                                      backgroundColor: "#f5f5f5",
                                      color: "#757575",
                                      height: "18px",
                                      fontWeight: 400,
                                      "& .MuiChip-label": {
                                        padding: "0 6px",
                                        display: "flex",
                                        alignItems: "center",
                                      },
                                    }}
                                  />
                                ) : null
                              })()}

                              <IconButton
                                size="small"
                                onClick={(e) => handleFolderMenuOpen(e, tag)}
                                sx={{
                                  minWidth: 32,
                                  minHeight: 32,
                                  padding: "0px",
                                  color: "#757575",
                                  "&:hover": {
                                    backgroundColor: "#f0f0f0",
                                  },
                                }}
                              >
                                <MoreVert sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Box>
                          </ListItemButton>
                        </ListItem>
                      </React.Fragment>
                    )
                  })}
                </List>
              )}
            </Box>
          ) : (
            // Routes inside folder
            <Box
              className="flex-1 flex flex-col"
              sx={{
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              {isLoadingRoutes ? (
                <List disablePadding className="px-4">
                  {[...Array(5)].map((_, index) => (
                    <React.Fragment key={`skeleton-${index}`}>
                      <ListItem disablePadding>
                        <Box
                          sx={{
                            width: "100%",
                            padding: "6px 12px",
                            margin: "2px 8px",
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                          }}
                        >
                          <Skeleton
                            variant="rectangular"
                            width={40}
                            height={40}
                            sx={{ borderRadius: "4px", flexShrink: 0 }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Skeleton
                              variant="text"
                              width="60%"
                              height={20}
                              sx={{ marginBottom: 1 }}
                            />
                            <Skeleton variant="text" width="40%" height={16} />
                          </Box>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              flexShrink: 0,
                            }}
                          >
                            <Skeleton
                              variant="rectangular"
                              width={60}
                              height={22}
                              sx={{ borderRadius: "11px" }}
                            />
                            <Skeleton
                              variant="circular"
                              width={32}
                              height={32}
                            />
                          </Box>
                        </Box>
                      </ListItem>
                      {index < 4 && (
                        <Divider
                          sx={{
                            marginLeft: 5,
                            marginRight: 1,
                            borderColor: "#e0e0e0",
                          }}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </List>
              ) : routesError ? (
                <Box className="p-6 text-center text-red-500">
                  <ErrorIcon className="text-5xl mb-2 opacity-30" />
                  <Typography
                    variant="body2"
                    gutterBottom
                    style={{ fontSize: "14px" }}
                  >
                    Error loading routes
                  </Typography>
                </Box>
              ) : !isLoadingRoutes &&
                !isFetchingNextPage &&
                routes.length === 0 &&
                (!useUnifiedSearchQuery || searchSegments.length === 0) &&
                !(trimmedSearchQuery !== trimmedDebouncedSearchQuery) ? (
                // Check if we're about to navigate back to folder list
                // If so, show loading state instead of empty state to prevent flash
                (() => {
                  const hasActiveFilters =
                    searchQuery.trim() ||
                    debouncedSearchQuery.trim() ||
                    routeTypeFilter.size > 0
                  const isSearching =
                    searchQuery.trim() !== debouncedSearchQuery.trim()
                  const shouldNavigateBack =
                    currentFolder !== null &&
                    !hasActiveFilters &&
                    !isSearching &&
                    routes.length === 0

                  // If we should navigate back, show loading state instead of empty state
                  if (shouldNavigateBack) {
                    return (
                      <Box className="flex flex-col items-center justify-center py-12 px-6 text-center">
                        <CircularProgress size={32} />
                        <Typography
                          variant="body2"
                          className="text-gray-500 mt-2"
                          style={{ fontSize: "14px" }}
                        >
                          Returning to folders...
                        </Typography>
                      </Box>
                    )
                  }

                  // Otherwise show normal empty state
                  return (
                    <Box className="flex flex-col items-center justify-center py-12 px-6 text-center">
                      <Route
                        className="text-5xl mb-4 opacity-20"
                        sx={{ fontSize: 64 }}
                      />
                      <Typography
                        variant="h6"
                        className="text-gray-900 font-medium mb-2"
                        style={{ fontSize: "18px", fontWeight: 500 }}
                      >
                        {trimmedDebouncedSearchQuery || routeTypeFilter.size > 0
                          ? "No routes found"
                          : "No routes in this folder"}
                      </Typography>
                      <Typography
                        variant="body2"
                        className="text-gray-500 mb-6"
                        style={{ fontSize: "14px", maxWidth: "280px" }}
                      >
                        {trimmedDebouncedSearchQuery
                          ? `No routes match "${trimmedDebouncedSearchQuery}"`
                          : routeTypeFilter.size > 0
                            ? `There are no routes with selected type${routeTypeFilter.size > 1 ? "s" : ""}. Try adjusting your filters.`
                            : "Create a new route or move existing routes here"}
                      </Typography>
                      {!trimmedDebouncedSearchQuery &&
                        routeTypeFilter.size === 0 && (
                          <Button
                            variant="contained"
                            startIcon={<Add />}
                            onClick={() => setMapMode("individual_drawing")}
                            className="rounded-lg"
                            sx={{
                              textTransform: "none",
                              fontSize: "14px",
                              fontWeight: 500,
                              padding: "10px 24px",
                              backgroundColor: "#1976d2",
                              "&:hover": {
                                backgroundColor: "#1565c0",
                              },
                            }}
                          >
                            Create New Route
                          </Button>
                        )}
                    </Box>
                  )
                })()
              ) : (
                <>
                  <Box
                    ref={routesScrollContainerRef}
                    className="flex-1 overflow-auto pretty-scrollbar"
                    sx={{
                      minHeight: 0,
                    }}
                  >
                    <List
                      disablePadding
                      className="!mx-0 !my-2"
                      sx={{ px: pxToMuiSpacing(typo.spacing.panel.px) }}
                    >
                      {routes.map((route, routeIndex) => {
                        const isSelected = selectedRoute?.id === route.id
                        const isRouteSelected = selectedRouteIds.has(route.id)
                        // Check if this is a parent route from search (has segments from parentRoutesWithSegments)
                        const isParentRouteFromSearch =
                          useUnifiedSearchQuery &&
                          parentRoutesWithSegments.some(
                            ({ route: parentRoute }) =>
                              parentRoute.id === route.id,
                          )
                        const isExpanded =
                          (isParentRouteFromSearch &&
                            route.segments &&
                            route.segments.length > 0) ||
                          (expandedRouteId === route.id &&
                            !multiSelectEnabled &&
                            showSelectedRouteSegments &&
                            (selectedRoute?.id === route.id
                              ? selectedRoute?.isSegmented &&
                                selectedRoute?.segments &&
                                selectedRoute.segments.length > 0
                              : route.isSegmented &&
                                route.segments &&
                                route.segments.length > 0))

                        // Calculate route length from encoded polyline if available
                        // This ensures we always show the calculated value, which is more accurate
                        const calculatedRouteLength = route.encodedPolyline
                          ? calculateRouteLengthFromPolyline(
                              route.encodedPolyline,
                            )
                          : null

                        // Use calculated route length if available (more accurate), otherwise fall back to route.distance
                        const displayDistance =
                          calculatedRouteLength ?? route.distance ?? 0

                        return (
                          <React.Fragment key={route.id}>
                            <ListItem
                              className="mb-1"
                              disablePadding
                              ref={(el) => {
                                if (el) {
                                  routeRefs.current.set(route.id, el)
                                } else {
                                  routeRefs.current.delete(route.id)
                                }
                              }}
                            >
                              <ListItemButton
                                selected={isSelected && !multiSelectEnabled}
                                onClick={async (e) => {
                                  if (multiSelectEnabled) {
                                    e.stopPropagation()
                                    toggleRouteSelection(route.id)
                                  } else {
                                    // Select route - navigation is handled by selectRouteWithNavigation
                                    // (only navigates when selecting, not when deselecting)
                                    await handleRouteClick(route.id, e)
                                  }
                                }}
                                sx={{
                                  minHeight: 44,
                                  padding: "6px 12px",
                                  borderRadius: "1rem", // rounded-2xl
                                  // margin: "4px 8px",
                                  marginBottom: isExpanded ? 0 : "4px", // No gap when expanded, 4px gap when collapsed
                                  position: "relative",
                                  zIndex: 10, // Ensure route card is above horizontal lines
                                  backgroundColor:
                                    multiSelectEnabled && isRouteSelected
                                      ? "#e3f2fd"
                                      : isSelected
                                        ? "#e3f2fd"
                                        : "#ffffff",
                                  borderLeft:
                                    multiSelectEnabled && isRouteSelected
                                      ? "3px solid #1b75d2"
                                      : isSelected
                                        ? "3px solid #1976d2"
                                        : "3px solid transparent",
                                  border: "1px solid #e0e0e0",
                                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                                  "&:hover": {
                                    backgroundColor:
                                      multiSelectEnabled && isRouteSelected
                                        ? "#e3f2fd"
                                        : "#f5f5f5",
                                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                                  },
                                  "&.Mui-selected": {
                                    backgroundColor: "#e3f2fd",
                                    "&:hover": {
                                      backgroundColor: "#bbdefb",
                                    },
                                  },
                                }}
                              >
                                {multiSelectEnabled && (
                                  <ListItemIcon
                                    className="min-w-[35px]"
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "flex-start",
                                    }}
                                  >
                                    <Checkbox
                                      checked={isRouteSelected}
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation()
                                        toggleRouteSelection(route.id)
                                      }}
                                      size="small"
                                      sx={{
                                        color: "#757575",
                                        padding: 0,
                                        display: "flex",
                                        alignItems: "center",
                                        "&.Mui-checked": {
                                          color: "#1976d2",
                                        },
                                      }}
                                      icon={
                                        <CheckBoxOutlineBlank
                                          sx={{
                                            fontSize: 20,
                                            display: "flex",
                                            alignItems: "center",
                                          }}
                                        />
                                      }
                                      checkedIcon={
                                        <CheckBox
                                          sx={{
                                            fontSize: 20,
                                            display: "flex",
                                            alignItems: "center",
                                          }}
                                        />
                                      }
                                    />
                                  </ListItemIcon>
                                )}

                                <ListItemText
                                  sx={{
                                    margin: 0,
                                    padding: 0,
                                    flex: 1,
                                    minWidth: 0,
                                    "& .MuiListItemText-primary": {
                                      marginBottom: "4px",
                                    },
                                    "& .MuiListItemText-secondary": {
                                      marginTop: 0,
                                    },
                                  }}
                                  primary={
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 1,
                                        minWidth: 0,
                                      }}
                                    >
                                      <Typography
                                        variant="body2"
                                        className="font-medium text-gray-900"
                                        title={getRouteDisplayName(route)}
                                        sx={{
                                          fontSize: typo.body.small,
                                          fontWeight: 500,
                                          lineHeight: 1.4,
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                          flex: 1,
                                          minWidth: 0,
                                          color:
                                            multiSelectEnabled &&
                                            isRouteSelected
                                              ? "#1976d2"
                                              : "#212121",
                                        }}
                                      >
                                        {useUnifiedSearchQuery &&
                                        trimmedDebouncedSearchQuery
                                          ? highlightSearchText(
                                              getRouteDisplayName(route),
                                              trimmedDebouncedSearchQuery,
                                            )
                                          : getRouteDisplayName(route)}
                                      </Typography>
                                      {!multiSelectEnabled && (
                                        <Box
                                          sx={{
                                            flexShrink: 0,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0,
                                          }}
                                        >
                                          {/* Expand/Collapse button for segmented routes - only visible when selected */}
                                          {isSelected &&
                                            (() => {
                                              // Use selectedRoute if available (more up-to-date), otherwise use route from list
                                              const routeToCheck =
                                                selectedRoute?.id === route.id
                                                  ? selectedRoute
                                                  : route
                                              return (
                                                routeToCheck.isSegmented &&
                                                routeToCheck.segments &&
                                                routeToCheck.segments.length > 0
                                              )
                                            })() && (
                                              <IconButton
                                                size="small"
                                                onClick={async (e) => {
                                                  e.stopPropagation()
                                                  if (isExpanded) {
                                                    // Collapse
                                                    setExpandedRouteId(null)
                                                    setShowSelectedRouteSegments(
                                                      false,
                                                    )
                                                  } else {
                                                    // Expand
                                                    // Mark that selection is coming from LeftFloatingPanel
                                                    isSelectionFromPanelRef.current =
                                                      true
                                                    // Optimistically set the selected route if not already selected
                                                    if (!isSelected) {
                                                      const routeFromList =
                                                        routes.find(
                                                          (r) =>
                                                            r.id === route.id,
                                                        )
                                                      if (routeFromList) {
                                                        const {
                                                          addRoute,
                                                          selectRoute:
                                                            selectRouteSync,
                                                        } =
                                                          useProjectWorkspaceStore.getState()
                                                        const existingRoute =
                                                          useProjectWorkspaceStore
                                                            .getState()
                                                            .routes.find(
                                                              (r) =>
                                                                r.id ===
                                                                route.id,
                                                            )
                                                        if (!existingRoute) {
                                                          addRoute(
                                                            routeFromList,
                                                          )
                                                        }
                                                        selectRouteSync(
                                                          route.id,
                                                        )
                                                      }
                                                      // Fetch full route data
                                                      try {
                                                        await selectRoute(
                                                          route.id,
                                                        )
                                                      } catch (error) {
                                                        console.error(
                                                          "Failed to fetch route:",
                                                          error,
                                                        )
                                                      } finally {
                                                        // Reset the panel selection flag after a delay
                                                        setTimeout(() => {
                                                          isSelectionFromPanelRef.current =
                                                            false
                                                        }, 300)
                                                      }
                                                    }
                                                    setExpandedRouteId(route.id)
                                                    const routeAfterSelection =
                                                      useProjectWorkspaceStore.getState()
                                                        .selectedRoute
                                                    if (
                                                      routeAfterSelection?.isSegmented &&
                                                      routeAfterSelection?.segments &&
                                                      routeAfterSelection
                                                        .segments.length > 0
                                                    ) {
                                                      setShowSelectedRouteSegments(
                                                        true,
                                                      )
                                                    }
                                                  }
                                                }}
                                                sx={{
                                                  minWidth: 32,
                                                  minHeight: 32,
                                                  padding: "4px",
                                                  color: "#757575",
                                                  "&:hover": {
                                                    backgroundColor: "#f0f0f0",
                                                  },
                                                }}
                                                title={
                                                  isExpanded
                                                    ? "Collapse segments"
                                                    : "Expand segments"
                                                }
                                              >
                                                {isExpanded ? (
                                                  <Tooltip title="Collapse segments">
                                                    <ExpandLess
                                                      sx={{ fontSize: 18 }}
                                                    />
                                                  </Tooltip>
                                                ) : (
                                                  <Tooltip title="Expand segments">
                                                    <ExpandMore
                                                      sx={{ fontSize: 18 }}
                                                    />
                                                  </Tooltip>
                                                )}
                                              </IconButton>
                                            )}
                                          {/* Sync Status Button */}
                                          {!route.isSegmented && (
                                            <SyncStatusButton
                                              status={(() => {
                                                // Use selectedRoute if available (more up-to-date), otherwise use route from list
                                                const routeToUse =
                                                  selectedRoute?.id === route.id
                                                    ? selectedRoute
                                                    : route
                                                return (
                                                  (routeToUse.sync_status as SyncStatus) ||
                                                  "unsynced"
                                                )
                                              })()}
                                              disabled={false}
                                              onClick={() =>
                                                handleRouteSync(route.id)
                                              }
                                              isLoading={
                                                syncingRouteId === route.id
                                              }
                                            />
                                          )}
                                          <IconButton
                                            size="small"
                                            onClick={(e) => {
                                              handleRouteMenuOpen(e, route.id)
                                            }}
                                            sx={{
                                              minWidth: 32,
                                              minHeight: 32,
                                              padding: "4px",
                                              color: "#757575",
                                              "&:hover": {
                                                backgroundColor: "#f0f0f0",
                                              },
                                            }}
                                          >
                                            <MoreVert sx={{ fontSize: 18 }} />
                                          </IconButton>
                                        </Box>
                                      )}
                                    </Box>
                                  }
                                  secondary={
                                    <Box
                                      sx={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 0.5,
                                        marginTop: "2px",
                                      }}
                                    >
                                      {/* Second line: Distance, Percentage match, and Route type/toggle */}
                                      <Box
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          gap: 0.5,
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <Box
                                          sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                            flexWrap: "wrap",
                                          }}
                                        >
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              fontSize: typo.body.xxsmall,
                                              fontWeight: 400,
                                              color: "#757575",
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            {formatDistance(
                                              displayDistance,
                                              distanceUnit,
                                            )}
                                          </Typography>
                                          {(() => {
                                            // Use selectedRoute if available (more up-to-date), otherwise use route from list
                                            const routeToCheck =
                                              selectedRoute?.id === route.id
                                                ? selectedRoute
                                                : route
                                            const segmentCount =
                                              routeToCheck.isSegmented &&
                                              routeToCheck.segments
                                                ? routeToCheck.segments.length
                                                : 0

                                            if (segmentCount > 0) {
                                              return (
                                                <>
                                                  <Typography
                                                    component="span"
                                                    sx={{
                                                      fontSize: "10px",
                                                      color: "#9e9e9e",
                                                      lineHeight: 1,
                                                      verticalAlign: "middle",
                                                      margin: "0 2px",
                                                    }}
                                                  >
                                                    •
                                                  </Typography>
                                                  <Chip
                                                    size="small"
                                                    label={
                                                      <span className="flex items-center gap-1">
                                                        <span
                                                          className="text-[11px] font-medium"
                                                          style={{
                                                            lineHeight: 1,
                                                            display:
                                                              "inline-flex",
                                                            alignItems:
                                                              "center",
                                                          }}
                                                        >
                                                          {segmentCount}
                                                        </span>
                                                        <span
                                                          className="text-[11px]"
                                                          style={{
                                                            lineHeight: 1,
                                                            display:
                                                              "inline-flex",
                                                            alignItems:
                                                              "center",
                                                          }}
                                                        >
                                                          segment
                                                          {segmentCount !== 1
                                                            ? "s"
                                                            : ""}
                                                        </span>
                                                      </span>
                                                    }
                                                    sx={{
                                                      backgroundColor:
                                                        "#f5f5f5",
                                                      color: "#757575",
                                                      height: "18px",
                                                      fontWeight: 400,
                                                      "& .MuiChip-label": {
                                                        padding: "0 6px",
                                                        display: "flex",
                                                        alignItems: "center",
                                                      },
                                                    }}
                                                  />
                                                </>
                                              )
                                            }
                                            return null
                                          })()}
                                          {route.matchPercentage !==
                                            undefined &&
                                            route.matchPercentage !== null && (
                                              <>
                                                <Typography
                                                  component="span"
                                                  sx={{
                                                    fontSize: typo.body.xxsmall,
                                                    color: "#9e9e9e",
                                                    lineHeight: 1,
                                                    verticalAlign: "middle",
                                                    margin: "0 2px",
                                                  }}
                                                >
                                                  •
                                                </Typography>
                                                <Tooltip title="Shows how closely saved route follows uploaded route">
                                                  <Chip
                                                    component="span"
                                                    label={`${Math.round(route.matchPercentage)}% match`}
                                                    size="small"
                                                    sx={{
                                                      height: "18px",
                                                      backgroundColor:
                                                        route.matchPercentage >=
                                                        80
                                                          ? "#e8f5e9"
                                                          : route.matchPercentage >=
                                                              60
                                                            ? "#fff3e0"
                                                            : PRIMARY_RED_LIGHT,
                                                      color:
                                                        route.matchPercentage >=
                                                        80
                                                          ? "#2e7d32"
                                                          : route.matchPercentage >=
                                                              60
                                                            ? "#e65100"
                                                            : "#c62828",
                                                      "& .MuiChip-label": {
                                                        padding: "0 6px",
                                                        fontSize:
                                                          typo.body.xxsmall,
                                                        fontWeight: 400,
                                                        lineHeight: "18px",
                                                      },
                                                      cursor: "help",
                                                      display: "inline-flex",
                                                      alignItems: "center",
                                                    }}
                                                  />
                                                </Tooltip>
                                              </>
                                            )}
                                        </Box>
                                        {/* Route type - always visible, toggle only when selected */}
                                        <Box
                                          sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                            position: "relative",
                                          }}
                                        >
                                          {/* Toggle - only show when route is selected and type is uploaded, on the left */}
                                          {selectedRoute?.id === route.id &&
                                            route.type === "uploaded" && (
                                              <Box
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleToggleUploadedRoute(
                                                    route.id,
                                                  )
                                                }}
                                                sx={{
                                                  display: "flex",
                                                  alignItems: "center",
                                                  cursor: "pointer",
                                                  userSelect: "none",
                                                  marginRight: "4px",
                                                }}
                                              >
                                                <Box
                                                  sx={{
                                                    width: 36,
                                                    height: 20,
                                                    borderRadius: "9999px",
                                                    backgroundColor:
                                                      visibleUploadedRoutes.has(
                                                        route.id,
                                                      )
                                                        ? "#1976d2"
                                                        : "#bdbdbd",
                                                    position: "relative",
                                                    transition:
                                                      "background-color 0.2s ease",
                                                    "&:hover": {
                                                      backgroundColor:
                                                        visibleUploadedRoutes.has(
                                                          route.id,
                                                        )
                                                          ? "#1565c0"
                                                          : "#9e9e9e",
                                                    },
                                                  }}
                                                >
                                                  <Box
                                                    sx={{
                                                      width: 16,
                                                      height: 16,
                                                      borderRadius: "50%",
                                                      backgroundColor:
                                                        "#ffffff",
                                                      position: "absolute",
                                                      top: 2,
                                                      left: visibleUploadedRoutes.has(
                                                        route.id,
                                                      )
                                                        ? 18
                                                        : 2,
                                                      transition:
                                                        "left 0.2s ease",
                                                      boxShadow:
                                                        "0 1px 3px rgba(0, 0, 0, 0.2)",
                                                    }}
                                                  />
                                                </Box>
                                              </Box>
                                            )}
                                          <Typography
                                            variant="caption"
                                            component="span"
                                            sx={{
                                              fontSize: typo.body.xxsmall,
                                              color: "#757575",
                                              fontWeight: 400,
                                              whiteSpace: "nowrap",
                                              fontStyle: "italic",
                                            }}
                                          >
                                            {route.type
                                              .charAt(0)
                                              .toUpperCase() +
                                              route.type.slice(1)}
                                          </Typography>
                                        </Box>
                                      </Box>
                                    </Box>
                                  }
                                />
                              </ListItemButton>
                            </ListItem>
                            {/* Expanded Segments */}
                            {isExpanded && (
                              <Box
                                sx={{
                                  position: "relative",
                                  margin: "0 8px 4px 8px",
                                  marginTop: 0, // No gap between route and segments
                                  backgroundColor: "transparent",
                                  borderRadius: "0 0 1rem 1rem", // rounded-2xl on bottom
                                  padding: "4px",
                                }}
                              >
                                {/* Vertical line extending from route - connects seamlessly with route item's left border */}
                                {isSelected && !multiSelectEnabled && (
                                  <Box
                                    sx={{
                                      position: "absolute",
                                      left: 0, // Aligns with container's left edge, which aligns with route item's left edge (both have 8px margin)
                                      top: "-20px", // Extend upward to connect with route item's border before rounded corner (4px gap + ~16px for border radius curve)
                                      bottom: 0,
                                      width: "3px",
                                      backgroundColor: "#bdbdbd",
                                      zIndex: 1,
                                    }}
                                  />
                                )}
                                <Box
                                  className="mr-4"
                                  sx={{
                                    position: "relative",
                                  }}
                                >
                                  {(() => {
                                    // Use selectedRoute if it's the same route, otherwise use route from list
                                    const routeToUse =
                                      selectedRoute?.id === route.id
                                        ? selectedRoute
                                        : route
                                    const segmentsToRender =
                                      routeToUse.segments || route.segments

                                    if (!segmentsToRender) return null

                                    return (
                                      <SegmentsList
                                        segments={segmentsToRender}
                                        routeId={route.id}
                                        isSelected={isSelected}
                                        multiSelectEnabled={multiSelectEnabled}
                                        selectedRoute={selectedRoute}
                                        routesStore={routesStore}
                                        onNavigateToSegment={
                                          handleNavigateToSegment
                                        }
                                        onHoverSegment={
                                          setSelectedRouteHoveredSegmentId
                                        }
                                        onSyncSegment={handleRouteSync}
                                        onRenameSegment={handleSegmentRename}
                                        syncingRouteId={syncingRouteId}
                                        projectId={projectId}
                                        toggleRouteMutation={
                                          toggleRouteMutation
                                        }
                                        distanceUnit={distanceUnit}
                                        searchQuery={
                                          useUnifiedSearchQuery
                                            ? trimmedDebouncedSearchQuery
                                            : undefined
                                        }
                                      />
                                    )
                                  })()}
                                </Box>
                              </Box>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </List>

                    {/* Infinite scroll loading indicator */}
                    {showLoader && (
                      <Box className="p-6 text-center bg-gray-50 border-t border-gray-200">
                        <CircularProgress size={32} thickness={4} />
                        <Typography
                          variant="caption"
                          className="text-gray-700 mt-3 block font-medium"
                          style={{ fontSize: "13px" }}
                        >
                          Loading more routes...
                        </Typography>
                      </Box>
                    )}

                    {/* Intersection observer sentinel */}
                    {hasNextPage && !isFetchingNextPage && (
                      <Box
                        ref={loadMoreRef}
                        className="h-8 flex items-center justify-center"
                      >
                        <Typography
                          variant="caption"
                          className="text-gray-400"
                          style={{ fontSize: "11px" }}
                        >
                          Scroll for more...
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* End of results indicator - Fixed at bottom */}
                  {!hasNextPage && routes.length > 0 && (
                    <Box
                      className="p-4 text-center border-t border-gray-100 flex-shrink-0"
                      sx={{
                        backgroundColor: "#ffffff",
                      }}
                    >
                      <Typography
                        variant="caption"
                        className="text-gray-500"
                        style={{ fontSize: "12px", fontWeight: 500 }}
                      >
                        ✓ All routes loaded
                      </Typography>
                    </Box>
                  )}
                </>
              )}
            </Box>
          )}
        </Box>
        {/* Footer - only show for folders view */}
        {currentFolder === null && (
          <Box
            className="border-t border-gray-200 bg-gray-50/50"
            sx={{
              px: pxToMuiSpacing(typo.spacing.panel.px),
              py: pxToMuiSpacing(typo.spacing.panel.py),
              flexShrink: 0,
              minHeight: "48px",
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontSize: typo.body.xsmall,
                color: "#757575",
                fontWeight: 400,
              }}
            >
              {tags.length} folder{tags.length !== 1 ? "s" : ""}
            </Typography>
          </Box>
        )}
      </FloatingSheet>

      {/* Folder Actions Menu */}
      {folderMenuPosition && (
        <ContextMenu
          className="py-1"
          x={folderMenuPosition.x}
          y={folderMenuPosition.y}
          onClose={handleFolderMenuClose}
          draggable={false}
          width={160}
          items={[
            {
              id: "rename",
              label: "Rename",
              icon: <DriveFileRenameOutlineSharp sx={{ fontSize: 16 }} />,
              onClick: () => handleFolderRename(folderMenuPosition.folderTag),
            },
            {
              id: "move",
              label: "Move All",
              icon: <DriveFileMoveIcon sx={{ fontSize: 16 }} />,
              onClick: () => handleFolderMove(folderMenuPosition.folderTag),
            },
            {
              id: "segment",
              label: "Segment All",
              icon: <ContentCut sx={{ fontSize: 16 }} />,
              onClick: () =>
                handleFolderSegmentation(folderMenuPosition.folderTag),
            },
            // {
            //   id: "stretch",
            //   label: "Stretch All",
            //   icon: <HeightIcon sx={{ fontSize: 16 }} />,
            //   onClick: () => handleFolderStretch(folderMenuPosition.folderTag),
            // },
            {
              id: "sync",
              label: "Sync Folder",
              icon: <Sync sx={{ fontSize: 16 }} />,
              onClick: () => handleFolderSync(folderMenuPosition.folderTag),
            },
            {
              id: "delete",
              label: "Delete All",
              icon: <Delete sx={{ fontSize: 16 }} />,
              onClick: () => handleFolderDelete(folderMenuPosition.folderTag),
            },
          ]}
        />
      )}

      {/* Route Actions Menu */}
      {routeMenuPosition && (
        <ContextMenu
          x={routeMenuPosition.x}
          y={routeMenuPosition.y}
          onClose={() => setRouteMenuPosition(null)}
          draggable={false}
          width={160}
          items={(() => {
            const route = routes.find((r) => r.id === routeMenuPosition.routeId)
            if (!route) return []

            const items: ContextMenuItem[] = [
              {
                id: "rename",
                label: "Rename",
                icon: <DriveFileRenameOutlineIcon sx={{ fontSize: 16 }} />,
                onClick: () => handleRouteRename(routeMenuPosition.routeId),
              },
              {
                id: "modify",
                label: "Modify",
                icon: <EditLocationAltIcon sx={{ fontSize: 16 }} />,
                onClick: async () => {
                  // Close menu immediately for better UX
                  setRouteMenuPosition(null)

                  // Mark that selection is coming from LeftFloatingPanel
                  isSelectionFromPanelRef.current = true
                  // Select and expand the route first
                  setExpandedRouteId(route.id)

                  // Show loading message while fetching route details
                  const loadingMessageId = addMessage(
                    "loading",
                    "Loading route details...",
                    {
                      description: "Fetching route data and segments",
                    },
                  )

                  try {
                    // Force fetch route from API to ensure we have latest data including segments
                    // This is important because routes in the list might not have segments loaded
                    const { addRoute, updateRoute } =
                      useProjectWorkspaceStore.getState()
                    let fetchedRoute = route // Default to route from list

                    try {
                      const response = await routesApi.getById(route.id)
                      if (response.success && response.data) {
                        // Update route in store with fresh data (including segments)
                        fetchedRoute = response.data

                        // Check if route already exists in store - use updateRoute to preserve segments
                        const existingRoute = routesStore.find(
                          (r) => r.id === route.id,
                        )
                        if (existingRoute) {
                          // Route exists - update it to ensure segments are included
                          updateRoute(route.id, fetchedRoute)
                        } else {
                          // Route doesn't exist - add it
                          addRoute(fetchedRoute)
                        }

                        // Explicitly update selectedRoute if it's already selected
                        // This ensures selectedRoute has segments before we call selectRoute
                        const currentState = useProjectWorkspaceStore.getState()
                        if (currentState.selectedRoute?.id === route.id) {
                          // If route is already selected, update selectedRoute directly
                          updateRoute(route.id, fetchedRoute)
                        }
                      }
                    } catch (error) {
                      console.error(
                        "Failed to fetch route for modification:",
                        error,
                      )
                      // Continue anyway with existing route data
                    }

                    // Now select the route (will use the updated data)
                    await selectRoute(route.id)

                    // Focus map view on the selected route
                    if (navigateToGeometry && fetchedRoute.encodedPolyline) {
                      try {
                        const encodedPolyline =
                          fetchedRoute.encodedPolyline.trim()
                        // Check if it's a JSON array format (coordinate pairs)
                        try {
                          const parsed = JSON.parse(encodedPolyline)
                          if (
                            Array.isArray(parsed) &&
                            parsed.length > 0 &&
                            Array.isArray(parsed[0]) &&
                            parsed[0].length === 2
                          ) {
                            const linestring: GeoJSON.LineString = {
                              type: "LineString",
                              coordinates: parsed as [number, number][],
                            }
                            navigateToGeometry({ linestring })
                          } else {
                            navigateToGeometry({ encodedPolyline })
                          }
                        } catch {
                          // Not a JSON array, treat as regular encoded polyline
                          navigateToGeometry({ encodedPolyline })
                        }
                      } catch (error) {
                        console.warn("Failed to focus map on route:", error)
                      }
                    }

                    // Wait for React to update the store and re-render
                    await new Promise((resolve) => setTimeout(resolve, 50))

                    // Check if route has segments using the fetched route data directly
                    // This is more reliable than checking the store which might not have updated yet
                    const routeHasSegments =
                      fetchedRoute.isSegmented &&
                      fetchedRoute.segments &&
                      fetchedRoute.segments.length > 0

                    if (routeHasSegments) {
                      // Set both flags together to ensure component re-renders
                      // Use React's startTransition to ensure state updates are batched correctly
                      setShowSelectedRouteSegments(true)
                      // Ensure expandedRouteId is set (it should already be, but ensure it's set)
                      setExpandedRouteId(route.id)
                      // Force a re-render by waiting a tick
                      await new Promise((resolve) => setTimeout(resolve, 0))
                    } else {
                      setShowSelectedRouteSegments(false)
                    }

                    // Clear right panel type to ensure no conflicting panels
                    setRightPanelType(null)

                    // If already in draw mode, set the new route UUID immediately to prevent deselection
                    // during the transition (RouteDetailsPanel useEffect checks routeUUID === null)
                    const currentMapMode =
                      useProjectWorkspaceStore.getState().mapMode
                    if (currentMapMode === "individual_drawing") {
                      // Set the new route UUID immediately to prevent the route from being deselected
                      // during the transition. loadRouteForEditing will handle clearing and resetting it.
                      setRouteUUID(fetchedRoute.id)
                      clearPoints()
                      // Small delay to ensure state is updated
                      await new Promise((resolve) => setTimeout(resolve, 10))
                    }

                    // Then load it for editing - use fetched route which has segments
                    loadRouteForEditing(
                      fetchedRoute,
                      loadRoutePoints,
                      setRouteUUID,
                      clearPoints,
                    )
                  } finally {
                    // Always dismiss loading message, even if there's an error
                    dismissMessage(loadingMessageId)
                    // Reset the panel selection flag after a delay
                    setTimeout(() => {
                      isSelectionFromPanelRef.current = false
                    }, 300)
                  }
                },
              },
            ]

            items.push({
              id: "delete",
              label: "Delete",
              icon: <Delete sx={{ fontSize: 16 }} />,
              onClick: () => {
                handleDeleteRoute(routeMenuPosition.routeId)
                setRouteMenuPosition(null)
              },
            })

            return items
          })()}
        />
      )}

      {/* Batch Delete Confirmation Dialog */}
      <Modal
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        title="Delete Routes"
        actions={
          <>
            <Button
              onClick={() => setDeleteDialogOpen(false)}
              variant="text"
              sx={{
                color: "#5f6368",
                "&:hover": {
                  backgroundColor: "rgba(95, 99, 104, 0.08)",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmBatchDelete}
              variant="contained"
              disabled={batchDeleteMutation.isPending}
            >
              {batchDeleteMutation.isPending ? (
                <CircularProgress size={20} />
              ) : (
                "Delete"
              )}
            </Button>
          </>
        }
      >
        <Typography variant="body2" className="text-gray-700">
          Are you sure you want to delete {selectedRouteIds.size} route(s)? This
          action cannot be undone.
        </Typography>
      </Modal>

      {/* Single Route Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={singleDeleteDialogOpen}
        onClose={() => {
          setSingleDeleteDialogOpen(false)
          setRouteToDelete(null)
        }}
        onConfirm={confirmSingleDelete}
        title="Delete Route"
        message="Are you sure you want to delete this route? This action cannot be undone."
        confirmText="Delete"
        isLoading={deleteRouteMutation.isPending}
      />

      {/* Folder Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={folderDeleteDialogOpen}
        onClose={() => {
          setFolderDeleteDialogOpen(false)
          setFolderToDelete(null)
        }}
        onConfirm={confirmFolderDelete}
        title="Delete Folder"
        message={`Are you sure you want to delete the folder "${getTagDisplayName(folderToDelete || "")}" and all its routes? This action cannot be undone.`}
        confirmText="Delete"
        isLoading={deleteTagMutation.isPending}
      />

      {/* Batch Move Dialog */}
      <Modal
        open={moveDialogOpen}
        onClose={() => setMoveDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        title="Move Routes"
        actions={
          <>
            <Button
              onClick={() => setMoveDialogOpen(false)}
              style={{ textTransform: "none" }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmBatchMove}
              variant="contained"
              disabled={
                batchMoveMutation.isPending ||
                (!selectedTag && !newTagName.trim())
              }
              style={{ textTransform: "none" }}
            >
              {batchMoveMutation.isPending ? (
                <CircularProgress size={20} />
              ) : (
                "Move"
              )}
            </Button>
          </>
        }
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1.5,
            backgroundColor: "#e3f2fd",
            borderLeft: "3px solid #1976d2",
            borderRadius: "4px",
            padding: "12px 16px",
            marginTop: "8px",
            marginBottom: "16px",
          }}
        >
          <InfoOutlined
            sx={{
              fontSize: 20,
              color: "#1976d2",
              flexShrink: 0,
            }}
          />
          <Typography
            variant="body2"
            sx={{
              fontSize: "13px",
              color: "#424242",
              lineHeight: 1.6,
              flex: 1,
            }}
          >
            <strong>Note:</strong> After moving routes, you must resync the
            destination folder to resume data fetching. Data fetching will be
            paused until resync is complete.
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{ fontSize: "14px", marginBottom: "16px" }}
        >
          Move {selectedRouteIds.size} route(s) to:
        </Typography>
        <Autocomplete
          options={(tags || []).filter((tag) => tag !== "")}
          value={selectedTag || newTagName || ""}
          onChange={(_, newValue) => {
            if (typeof newValue === "string") {
              // Check if it's an existing tag (excluding empty string)
              if (tags?.includes(newValue) && newValue !== "") {
                setSelectedTag(newValue)
                setNewTagName("")
              } else {
                // It's a new folder name
                setSelectedTag(null)
                setNewTagName(newValue)
              }
            } else {
              setSelectedTag(null)
              setNewTagName("")
            }
          }}
          onInputChange={(_, newInputValue) => {
            // When user types, update newTagName if it's not an existing tag (excluding empty string)
            if (
              newInputValue &&
              (!tags?.includes(newInputValue) || newInputValue === "")
            ) {
              setSelectedTag(null)
              setNewTagName(newInputValue)
            } else if (tags?.includes(newInputValue) && newInputValue !== "") {
              setSelectedTag(newInputValue)
              setNewTagName("")
            } else {
              setSelectedTag(null)
              setNewTagName("")
            }
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Select or create folder"
              placeholder="Choose a folder or type to create new..."
              size="small"
            />
          )}
          freeSolo
        />
      </Modal>

      {/* Rename Folder Dialog */}
      <RenameDialog
        open={renameDialogOpen}
        currentName={renameDialogTag || ""}
        onClose={() => {
          setRenameDialogOpen(false)
          setRenameDialogTag("")
        }}
        onSave={handleFolderRenameSave}
        title="Rename Folder"
        label="Folder Name"
        isLoading={renameTagMutation.isPending}
        formId="rename-folder-form"
        warningMessage="Note: After renaming this folder, you must resync it to resume data fetching. Data fetching will be paused until resync is complete."
      />

      {/* Folder Move Dialog */}
      <Modal
        open={folderMoveDialogOpen}
        onClose={() => {
          setFolderMoveDialogOpen(false)
          setFolderMoveSelectedTag(null)
        }}
        maxWidth="sm"
        fullWidth
        title="Move Folder"
        actions={
          <>
            <Button
              onClick={() => {
                setFolderMoveDialogOpen(false)
                setFolderMoveSelectedTag(null)
              }}
              style={{ textTransform: "none" }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFolderMoveDialogSubmit}
              variant="contained"
              disabled={renameTagMutation.isPending || !folderMoveSelectedTag}
              style={{ textTransform: "none" }}
            >
              {renameTagMutation.isPending ? (
                <CircularProgress size={20} />
              ) : (
                "Move"
              )}
            </Button>
          </>
        }
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1.5,
            backgroundColor: "#e3f2fd",
            borderLeft: "3px solid #1976d2",
            borderRadius: "4px",
            padding: "12px 16px",
            marginTop: "8px",
            marginBottom: "16px",
          }}
        >
          <InfoOutlined
            sx={{
              fontSize: 20,
              color: "#1976d2",
              flexShrink: 0,
            }}
          />
          <Typography
            variant="body2"
            sx={{
              fontSize: "13px",
              color: "#424242",
              lineHeight: 1.6,
              flex: 1,
            }}
          >
            <strong>Note:</strong> After moving all routes, you must resync the
            destination folder to resume data fetching. Data fetching will be
            paused until resync is complete.
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{ fontSize: "14px", marginBottom: "16px" }}
        >
          Move all routes from "{getTagDisplayName(folderMoveDialogTag || "")}"
          to:
        </Typography>
        <Autocomplete
          options={
            tags.filter((tag) => tag !== "" && tag !== folderMoveDialogTag) ||
            []
          }
          value={folderMoveSelectedTag || null}
          onChange={(_, newValue) => {
            setFolderMoveSelectedTag(newValue)
          }}
          getOptionDisabled={(option) => option === folderMoveDialogTag}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Select destination folder"
              placeholder="Choose a folder..."
              variant="standard"
            />
          )}
        />
      </Modal>

      {/* Segment Routes Dialog */}
      <Modal
        open={segmentDialogOpen}
        onClose={() => setSegmentDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        title="Segment Routes"
        actions={
          <>
            <Button
              onClick={() => setSegmentDialogOpen(false)}
              style={{ textTransform: "none" }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSegmentDialogSubmit}
              variant="contained"
              disabled={
                segmentTagMutation.isPending ||
                !segmentDistance.trim() ||
                parseFloat(segmentDistance) <= 0
              }
              style={{ textTransform: "none" }}
            >
              {segmentTagMutation.isPending ? (
                <CircularProgress size={20} />
              ) : (
                "Segment"
              )}
            </Button>
          </>
        }
      >
        <TextField
          label="Distance (km)"
          type="number"
          value={segmentDistance}
          onChange={(e) => setSegmentDistance(e.target.value)}
          fullWidth
          variant="standard"
          disabled={segmentMethod !== "distance"}
          inputProps={{
            min: 0.1,
            step: 0.1,
          }}
        />
      </Modal>

      {/* Route Rename Dialog */}
      {routeRenameRouteId && (
        <RenameDialog
          open={routeRenameDialogOpen}
          currentName={
            routes.find((r) => r.id === routeRenameRouteId)?.name || ""
          }
          onClose={() => {
            setRouteRenameDialogOpen(false)
            setRouteRenameRouteId(null)
          }}
          onSave={handleRouteRenameSave}
          title="Rename Route"
          label="Route Name"
          isLoading={updateRouteMutation.isPending}
          formId="rename-route-form"
        />
      )}

      {/* Segment Rename Dialog */}
      {segmentRenameSegmentId && segmentRenameParentRouteId && (
        <RenameDialog
          open={segmentRenameDialogOpen}
          currentName={(() => {
            const routeToUse =
              selectedRoute?.id === segmentRenameParentRouteId
                ? selectedRoute
                : routesStore.find(
                    (r) => r.id === segmentRenameParentRouteId,
                  ) || routes.find((r) => r.id === segmentRenameParentRouteId)
            const segment = routeToUse?.segments?.find(
              (s: { uuid: string }) => s.uuid === segmentRenameSegmentId,
            )
            return segment?.route_name || ""
          })()}
          onClose={() => {
            setSegmentRenameDialogOpen(false)
            setSegmentRenameSegmentId(null)
            setSegmentRenameParentRouteId(null)
          }}
          onSave={handleSegmentRenameSave}
          title="Rename Segment"
          label="Segment Name"
          isLoading={updateRouteMutation.isPending}
          minLength={2}
          maxLength={100}
          formId="rename-segment-form"
        />
      )}

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box
          className={`px-4 py-2 rounded-lg ${
            snackbar.severity === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          <Typography variant="body2" style={{ fontSize: "14px" }}>
            {snackbar.message}
          </Typography>
        </Box>
      </Snackbar>

      {/* Unsaved Routes Dialog for route selection */}
      {pendingRouteSelection !== null &&
        (() => {
          const targetRouteId = pendingRouteSelection
          const isCollapsing =
            targetRouteId === "close" || targetRouteId === null

          return (
            <UnsavedRoutesDialog
              open={pendingRouteSelection !== null}
              type="uploaded_routes"
              routeCount={1}
              onConfirm={async () => {
                // Discard unsaved changes
                // routeBeingEdited could be editingSavedRouteId (uploaded route) or routeUUID (saved route) or selectedRoute.id
                const routeBeingEdited =
                  editingSavedRouteId || routeUUID || selectedRoute?.id
                if (routeBeingEdited) {
                  discardRouteChanges(routeBeingEdited)
                }

                // If targetRouteId is "close" or null, we're collapsing/closing
                if (isCollapsing) {
                  // If it was "close", clear search and folder FIRST (navigating back)
                  // IMPORTANT: Set currentFolder to null BEFORE clearing selectedRoute
                  // to prevent useEffect from setting it back based on selectedRoute
                  if (targetRouteId === "close") {
                    setRouteSearchQuery(null)
                    setSearchQuery("")
                    // Use store directly and set folder to null BEFORE clearing selectedRoute
                    // This prevents the useEffect that watches selectedRoute from setting folder back
                    setMultiSelectEnabled(false)
                    setCurrentFolder(null)
                  }

                  // Collapse the route / close panel / navigate back
                  setExpandedRouteId(null)
                  selectRouteSync(null)
                  setShowSelectedRouteSegments(false)
                  exitEditMode()

                  // Clear right panel if closing
                  setRightPanelType(null)
                } else {
                  // Select the new route
                  // Exit edit mode first
                  exitEditMode()

                  // Stop segmentation if it's active
                  const { stopSegmentation, segmentation } =
                    useLayerStore.getState()
                  if (segmentation.isActive) {
                    stopSegmentation()
                  }

                  // Clear rightPanelType if needed
                  const currentRightPanelType =
                    useProjectWorkspaceStore.getState().rightPanelType
                  if (
                    currentRightPanelType === "route_ready" ||
                    currentRightPanelType === "segmentation" ||
                    currentRightPanelType === "naming"
                  ) {
                    setRightPanelType(null)
                  }

                  // Hide uploaded routes for other routes
                  const { removeUploadedRoute } = useLayerStore.getState()
                  const currentVisibleRoutes = Array.from(
                    visibleUploadedRoutes.entries(),
                  )
                  currentVisibleRoutes.forEach(
                    ([otherRouteId, uploadedRouteId]) => {
                      if (otherRouteId !== targetRouteId && uploadedRouteId) {
                        removeUploadedRoute(uploadedRouteId)
                      }
                    },
                  )

                  // Update visibleUploadedRoutes
                  setVisibleUploadedRoutes((prev) => {
                    const newMap = new Map()
                    if (prev.has(targetRouteId)) {
                      const uploadedRouteId = prev.get(targetRouteId)
                      if (uploadedRouteId) {
                        newMap.set(targetRouteId, uploadedRouteId)
                      }
                    }
                    return newMap
                  })

                  // Set flag to prevent useEffect from collapsing during async selection
                  isSelectingRouteRef.current = true
                  isSelectionFromPanelRef.current = true
                  setExpandedRouteId(targetRouteId)

                  // Optimistically set the selected route immediately
                  const routeFromList = routes.find(
                    (r) => r.id === targetRouteId,
                  )
                  if (routeFromList) {
                    const { addRoute, selectRoute: selectRouteSync } =
                      useProjectWorkspaceStore.getState()
                    const existingRoute = useProjectWorkspaceStore
                      .getState()
                      .routes.find((r) => r.id === targetRouteId)
                    if (!existingRoute) {
                      addRoute(routeFromList)
                    }
                    selectRouteSync(targetRouteId)
                  }

                  // Use selectRouteWithNavigation to ensure map navigation happens
                  try {
                    await selectRouteWithNavigation(targetRouteId, "panel")
                  } finally {
                    isSelectingRouteRef.current = false
                    setTimeout(() => {
                      isSelectionFromPanelRef.current = false
                    }, 300)
                  }

                  // Show segments if route is segmented
                  const routeAfterSelection =
                    useProjectWorkspaceStore.getState().selectedRoute
                  if (
                    routeAfterSelection?.isSegmented &&
                    routeAfterSelection?.segments &&
                    routeAfterSelection.segments.length > 0
                  ) {
                    setShowSelectedRouteSegments(true)
                  } else {
                    setShowSelectedRouteSegments(false)
                  }
                }

                // Clear pending route selection AFTER all navigation is complete
                // This closes the dialog only after navigation state is updated
                setPendingRouteSelection(null)
              }}
              onCancel={() => {
                setPendingRouteSelection(null)
              }}
            />
          )
        })()}

      {/* Full-page loader for route selection */}
      <FullPageLoader
        open={isSelectingRoute}
        message="Selecting and navigating to route...."
      />
    </>
  )
}

export default RoutesPanel
