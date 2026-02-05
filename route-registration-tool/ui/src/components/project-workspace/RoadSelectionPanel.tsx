import { Check, CloseRounded, Delete, Edit } from "@mui/icons-material"
import {
  Box,
  Chip,
  IconButton,
  ListItem,
  ListItemButton,
  Skeleton,
  TextField,
  Typography,
  useTheme,
} from "@mui/material"
import React, {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"

import { apiClient } from "../../data/api-client"
import {
  useBatchSaveRoutesFromSelection,
  useNavigateToGeometry,
  useProjectTags,
  useValidateRoadContinuity,
} from "../../hooks"
import { useProjectWorkspaceStore } from "../../stores"
import { PanelRoute, useLayerStore } from "../../stores/layer-store"
import {
  convertKmToMiles,
  formatDistance,
  useDistanceUnit,
} from "../../utils/distance-utils"
import { extractWaypointsFromLineString } from "../../utils/multi-select-route"
import { toast } from "../../utils/toast"
import Button from "../common/Button"
import ModeSwitchDialog from "../common/ModeSwitchDialog"
import TagSelector from "../common/TagSelector"
import RightPanel from "./RightPanel"

// Helper function to format priority labels to Title Case
const formatPriorityLabel = (priority: string | undefined): string => {
  if (!priority) return ""
  const clean = priority.replace("ROAD_PRIORITY_", "").replace(/_/g, " ")
  return clean.toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase())
}

// Skeleton component for route items
const RouteSkeleton: React.FC = () => {
  return (
    <ListItem disablePadding style={{ width: "100%" }}>
      <ListItemButton
        disabled
        sx={{
          minHeight: 64,
          padding: "12px 16px",
          borderRadius: "12px",
          backgroundColor: "#ffffff",
          border: "1px solid #e8eaed",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            width: "100%",
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton
              variant="text"
              width="60%"
              height={20}
              sx={{
                mb: 0.75,
                borderRadius: "4px",
              }}
            />
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <Skeleton
                variant="text"
                width={60}
                height={16}
                sx={{ borderRadius: "4px" }}
              />
              <Skeleton
                variant="rectangular"
                width={70}
                height={18}
                sx={{ borderRadius: "9px" }}
              />
            </Box>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
            }}
          >
            <Skeleton
              variant="circular"
              width={32}
              height={32}
              sx={{ borderRadius: "6px" }}
            />
            <Skeleton
              variant="circular"
              width={32}
              height={32}
              sx={{ borderRadius: "6px" }}
            />
          </Box>
        </Box>
      </ListItemButton>
    </ListItem>
  )
}

// Memoized route item component for better performance
interface RouteItemProps {
  route: PanelRoute
  isEditing: boolean
  editingName: string
  distanceUnit: "km" | "miles"
  onNavigate: (data: { linestring: GeoJSON.LineString }) => void
  onHoverEnter: (roadId: string) => void
  onHoverLeave: () => void
  onEditStart: (route: PanelRoute, e?: React.MouseEvent) => void
  onEditSave: (routeId: string) => void
  onEditCancel: () => void
  onEditNameChange: (name: string) => void
  onDelete: (routeId: string, e?: React.MouseEvent) => void
  theme: {
    body: string
    helper: string
    caption: string
  }
}

const RouteItem = memo<RouteItemProps>(
  ({
    route,
    isEditing,
    editingName,
    distanceUnit,
    onNavigate,
    onHoverEnter,
    onHoverLeave,
    onEditStart,
    onEditSave,
    onEditCancel,
    onEditNameChange,
    onDelete,
    theme,
  }) => {
    const displayName = route.name || "Unnamed Route"
    const priorityLabel = formatPriorityLabel(route.priority)

    // Memoize expensive calculations
    const formattedDistance = useMemo(() => {
      const startTime = performance.now()
      const result = formatDistance(route.distance, distanceUnit)
      const duration = performance.now() - startTime

      if (duration > 1) {
        console.warn(
          `⏱️ [RouteItem:${route.id}] formatDistance took ${duration.toFixed(2)}ms`,
        )
      }

      return result
    }, [route.distance, distanceUnit, route.id])

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        const target = e.target as HTMLElement
        if (target.closest("button")) {
          return
        }
        onNavigate({ linestring: route.geometry })
      },
      [onNavigate, route.geometry],
    )

    const handleMouseEnter = useCallback(() => {
      // Only trigger hover if route has roadIds
      // The parent component handles disabling hover for large lists
      if (route.roadIds.length > 0) {
        onHoverEnter(route.roadIds[0])
      }
    }, [route.roadIds, onHoverEnter])

    const handleEditClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        onEditStart(route, e)
      },
      [onEditStart, route],
    )

    const handleDeleteClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        onDelete(route.id, e)
      },
      [onDelete, route.id],
    )

    // Memoize styles to prevent recreation
    const listItemButtonSx = useMemo(
      () => ({
        minHeight: 64,
        padding: "12px 16px",
        borderRadius: "12px",
        position: "relative" as const,
        zIndex: 10,
        backgroundColor: "#ffffff",
        border: "1px solid #e8eaed",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        "&:hover": {
          backgroundColor: "#f8f9fa",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
          borderColor: "#dadce0",
        },
        "&:active": {
          backgroundColor: "#f1f3f4",
        },
      }),
      [],
    )

    return (
      <ListItem disablePadding style={{ width: "100%", paddingBottom: "8px" }}>
        <ListItemButton
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={onHoverLeave}
          sx={listItemButtonSx}
        >
          {isEditing ? (
            <>
              <TextField
                value={editingName}
                onChange={(e) => onEditNameChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation()
                    onEditSave(route.id)
                  } else if (e.key === "Escape") {
                    e.stopPropagation()
                    onEditCancel()
                  }
                }}
                autoFocus
                variant="standard"
                placeholder="Enter route name"
                fullWidth
                inputProps={{ maxLength: 100 }}
                sx={{
                  flex: 1,
                  "& .MuiInput-root": {
                    fontSize: theme.body,
                    fontFamily: '"Google Sans", sans-serif',
                    fontWeight: 500,
                    "&::before": {
                      borderBottom: "1px solid #e0e0e0",
                    },
                    "&::after": {
                      borderBottom: "2px solid #1976d2",
                    },
                  },
                  "& .MuiInput-input": {
                    padding: 0,
                  },
                }}
              />
              <Box sx={{ display: "flex", gap: 0.5, ml: 1 }}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditCancel()
                  }}
                  title="Cancel"
                  sx={{
                    minWidth: 10,
                    minHeight: 10,
                    padding: "6px",
                    color: "#5f6368",
                    borderRadius: "999px",
                    "&:hover": {
                      backgroundColor: "rgba(219, 0, 0,0.12)",
                    },
                  }}
                >
                  <CloseRounded sx={{ fontSize: 18 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditSave(route.id)
                  }}
                  title="Save"
                  sx={{
                    minWidth: 28,
                    minHeight: 28,
                    padding: "6px",
                    color: "#1976d2",
                    borderRadius: "999px",
                    "&:hover": {
                      backgroundColor: "rgba(25, 118, 210, 0.12)",
                    },
                  }}
                >
                  <Check sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            </>
          ) : (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                width: "100%",
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  title={
                    route.roadIds.length > 1
                      ? `${displayName}\nMade from ${route.roadIds.length} roads`
                      : displayName
                  }
                  sx={{
                    fontSize: theme.body,
                    fontWeight: 500,
                    color: "#111827",
                    fontFamily: '"Google Sans", sans-serif',
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    mb: 0.75,
                  }}
                >
                  {displayName}
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    flexWrap: "wrap",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#5f6368",
                      fontWeight: 400,
                      fontSize: theme.helper,
                      fontFamily: '"Google Sans", sans-serif',
                    }}
                  >
                    {formattedDistance}
                  </Typography>
                  {route.roadIds.length > 1 && (
                    <>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "#dadce0",
                          fontSize: theme.helper,
                        }}
                      >
                        •
                      </Typography>
                      <Chip
                        label={`${route.roadIds.length} roads`}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: theme.caption,
                          fontWeight: 500,
                          backgroundColor: "transparent",
                          color: "#5f6368",
                          border: "1px solid #dadce0",
                          "& .MuiChip-label": {
                            padding: "0 6px",
                            fontSize: theme.caption,
                            lineHeight: 1.2,
                          },
                        }}
                      />
                    </>
                  )}
                  {route.priority && (
                    <>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "#dadce0",
                          fontSize: theme.helper,
                        }}
                      >
                        •
                      </Typography>
                      <Chip
                        label={priorityLabel}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: theme.caption,
                          fontWeight: 500,
                          backgroundColor: "transparent",
                          color: priorityLabel.includes("Limited")
                            ? "#c5221f"
                            : "#1967d2",
                          border: `1px solid ${
                            priorityLabel.includes("Limited")
                              ? "#fce8e6"
                              : "#90caf9"
                          }`,
                          "& .MuiChip-label": {
                            padding: "0 6px",
                            fontSize: theme.caption,
                            lineHeight: 1.2,
                          },
                        }}
                      />
                    </>
                  )}
                </Box>
              </Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                <IconButton
                  size="small"
                  onClick={handleEditClick}
                  title="Rename"
                  sx={{
                    minWidth: 32,
                    minHeight: 32,
                    padding: "6px",
                    color: "#5f6368",
                    borderRadius: "6px",
                    "&:hover": {
                      backgroundColor: "#f5f5f5",
                      color: "#1976d2",
                    },
                  }}
                >
                  <Edit sx={{ fontSize: 18 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={handleDeleteClick}
                  title="Remove"
                  sx={{
                    minWidth: 32,
                    minHeight: 32,
                    padding: "6px",
                    color: "#5f6368",
                    borderRadius: "6px",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      backgroundColor: "rgba(219, 0, 0, 0.08)",
                      color: "#c5221f",
                    },
                  }}
                >
                  <Delete sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            </Box>
          )}
        </ListItemButton>
      </ListItem>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison function for better performance
    // Check handler references first (most common cause of unnecessary re-renders)
    const handlersEqual =
      prevProps.onNavigate === nextProps.onNavigate &&
      prevProps.onHoverEnter === nextProps.onHoverEnter &&
      prevProps.onHoverLeave === nextProps.onHoverLeave &&
      prevProps.onEditStart === nextProps.onEditStart &&
      prevProps.onEditSave === nextProps.onEditSave &&
      prevProps.onEditCancel === nextProps.onEditCancel &&
      prevProps.onEditNameChange === nextProps.onEditNameChange &&
      prevProps.onDelete === nextProps.onDelete

    if (!handlersEqual) {
      const changedHandlers: string[] = []
      if (prevProps.onNavigate !== nextProps.onNavigate)
        changedHandlers.push("onNavigate")
      if (prevProps.onHoverEnter !== nextProps.onHoverEnter)
        changedHandlers.push("onHoverEnter")
      if (prevProps.onHoverLeave !== nextProps.onHoverLeave)
        changedHandlers.push("onHoverLeave")
      if (prevProps.onEditStart !== nextProps.onEditStart)
        changedHandlers.push("onEditStart")
      if (prevProps.onEditSave !== nextProps.onEditSave)
        changedHandlers.push("onEditSave")
      if (prevProps.onEditCancel !== nextProps.onEditCancel)
        changedHandlers.push("onEditCancel")
      if (prevProps.onEditNameChange !== nextProps.onEditNameChange)
        changedHandlers.push("onEditNameChange")
      if (prevProps.onDelete !== nextProps.onDelete)
        changedHandlers.push("onDelete")

      console.warn(
        `🔄 [RouteItem:${nextProps.route.id}] Handler references changed:`,
        changedHandlers.join(", "),
      )
      return false
    }

    // Then check route data
    const routeDataEqual =
      prevProps.route.id === nextProps.route.id &&
      prevProps.route.name === nextProps.route.name &&
      prevProps.route.distance === nextProps.route.distance &&
      prevProps.route.priority === nextProps.route.priority &&
      prevProps.route.roadIds.length === nextProps.route.roadIds.length &&
      // Deep compare roadIds array content
      prevProps.route.roadIds.every(
        (id, idx) => id === nextProps.route.roadIds[idx],
      ) &&
      prevProps.isEditing === nextProps.isEditing &&
      prevProps.editingName === nextProps.editingName &&
      prevProps.distanceUnit === nextProps.distanceUnit &&
      // Check theme fontSizes (extract only what we need to avoid theme object changes)
      prevProps.theme.body === nextProps.theme.body &&
      prevProps.theme.helper === nextProps.theme.helper &&
      prevProps.theme.caption === nextProps.theme.caption

    if (!routeDataEqual) {
      const changedProps: string[] = []
      if (prevProps.route.id !== nextProps.route.id)
        changedProps.push("route.id")
      if (prevProps.route.name !== nextProps.route.name)
        changedProps.push("route.name")
      if (prevProps.route.distance !== nextProps.route.distance)
        changedProps.push("route.distance")
      if (prevProps.route.priority !== nextProps.route.priority)
        changedProps.push("route.priority")
      if (
        !prevProps.route.roadIds.every(
          (id, idx) => id === nextProps.route.roadIds[idx],
        )
      )
        changedProps.push("route.roadIds")
      if (prevProps.isEditing !== nextProps.isEditing)
        changedProps.push("isEditing")
      if (prevProps.editingName !== nextProps.editingName)
        changedProps.push("editingName")
      if (prevProps.distanceUnit !== nextProps.distanceUnit)
        changedProps.push("distanceUnit")

      console.warn(
        `🔄 [RouteItem:${nextProps.route.id}] Route data changed:`,
        changedProps.join(", "),
      )
    }

    return routeDataEqual
  },
)

RouteItem.displayName = "RouteItem"

const RoadSelectionPanel: React.FC = () => {
  const renderCountRef = useRef(0)
  const lastRenderTimeRef = useRef(Date.now())

  // Performance logging - only log warnings for performance issues
  useEffect(() => {
    renderCountRef.current += 1
    const now = Date.now()
    const timeSinceLastRender = now - lastRenderTimeRef.current
    lastRenderTimeRef.current = now

    if (renderCountRef.current === 1) {
      console.log("🚀 [RoadSelectionPanel] Component mounted")
    } else if (timeSinceLastRender < 50 && renderCountRef.current % 10 === 0) {
      // Only log every 10th rapid re-render to reduce noise
      console.warn(
        `⚠️ [RoadSelectionPanel] Rapid re-renders detected (${renderCountRef.current} total, ${timeSinceLastRender}ms since last)`,
      )
    }
  })

  const theme = useTheme()
  const {
    mapMode,
    setMapMode,
    projectId,
    dynamicIslandHeight,
    setLeftPanelExpanded,
    setCurrentFolder,
  } = useProjectWorkspaceStore()
  const resetRoadPriorityFilters = useLayerStore(
    (state) => state.resetRoadPriorityFilters,
  )
  const roadImport = useLayerStore((state) => state.roadImport)
  const removeRouteFromPanel = useLayerStore(
    (state) => state.removeRouteFromPanel,
  )
  const updateRouteName = useLayerStore((state) => state.updateRouteName)
  const setHoveredRoadId = useLayerStore((state) => state.setHoveredRoadId)
  const clearRoadImport = useLayerStore((state) => state.clearRoadImport)
  const clearAllDrawing = useLayerStore((state) => state.clearAllDrawing)
  const combineMultiSelectRoadsToRoute = useLayerStore(
    (state) => state.combineMultiSelectRoadsToRoute,
  )
  const setMultiSelectValidationResult = useLayerStore(
    (state) => state.setMultiSelectValidationResult,
  )
  const setMultiSelectValidating = useLayerStore(
    (state) => state.setMultiSelectValidating,
  )
  const batchSaveRoutesMutation = useBatchSaveRoutesFromSelection()
  const validateRoadContinuityMutation = useValidateRoadContinuity()
  const distanceUnit = useDistanceUnit()
  const { data: availableTags = [] } = useProjectTags(projectId || "")
  const navigateToGeometry = useNavigateToGeometry("main-map")

  const [editingRouteId, setEditingRouteId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [tagError, setTagError] = useState<string>("")
  const [showSaveScreen, setShowSaveScreen] = useState(false)
  const [exitDialogOpen, setExitDialogOpen] = useState(false)

  const [windowHeight, setWindowHeight] = useState(window.innerHeight)

  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const maxHeight = useMemo(() => {
    const topOffset = 144
    const dynamicIslandBottomPosition = 22
    const safetyMargin = 24
    const maxAvailableHeight =
      windowHeight -
      topOffset -
      dynamicIslandBottomPosition -
      dynamicIslandHeight -
      safetyMargin
    return Math.max(Math.min(maxAvailableHeight, 600), 400)
  }, [dynamicIslandHeight, windowHeight])

  const scrollableMaxHeight = useMemo(() => {
    const headerHeight = 80
    const footerHeight = showSaveScreen ? 120 : 60
    // Account for validation message box if present (approximately 60px)
    const validationMessageHeight =
      roadImport.selectionMode === "multi-select" &&
      roadImport.multiSelectTempSelection.length > 0
        ? 60
        : 0
    // Account for outer container padding: pt: 2 (16px) + pb: 1.5 (12px) = 28px
    // Plus additional safety margin for spacing
    const padding = 32
    const calculatedHeight =
      maxHeight -
      headerHeight -
      footerHeight -
      padding -
      validationMessageHeight
    // Ensure we don't go negative and leave some buffer
    return Math.max(calculatedHeight, 200)
  }, [
    maxHeight,
    showSaveScreen,
    roadImport.selectionMode,
    roadImport.multiSelectTempSelection.length,
  ])

  // Reverse the routes array so newest items appear at the top
  const reversedPanelRoutes = useMemo(() => {
    const startTime = performance.now()
    const reversed = [...roadImport.panelRoutes].reverse()
    const duration = performance.now() - startTime

    if (roadImport.panelRoutes.length > 100) {
      console.log(
        `🔄 [RoadSelectionPanel] Reversed ${roadImport.panelRoutes.length} routes in ${duration.toFixed(2)}ms`,
      )
    }

    return reversed
  }, [roadImport.panelRoutes])

  const totalRoadsCount = useMemo(() => {
    return roadImport.panelRoutes.reduce(
      (sum, route) => sum + route.roadIds.length,
      0,
    )
  }, [roadImport.panelRoutes])

  const hasUnsavedRoadImports = useMemo(() => {
    return (
      (roadImport.panelRoutes && roadImport.panelRoutes.length > 0) ||
      (roadImport.lassoFilteredRoadIds &&
        roadImport.lassoFilteredRoadIds.length > 0) ||
      (roadImport.multiSelectTempSelection &&
        roadImport.multiSelectTempSelection.length > 0)
    )
  }, [
    roadImport.panelRoutes,
    roadImport.lassoFilteredRoadIds,
    roadImport.multiSelectTempSelection,
  ])

  const lastValidatedRoadIdsRef = useRef<string>("")

  const currentRoadIdsString = useMemo(
    () => JSON.stringify([...roadImport.multiSelectTempSelection].sort()),
    [roadImport.multiSelectTempSelection],
  )

  useEffect(() => {
    if (
      roadImport.multiSelectValidating ||
      lastValidatedRoadIdsRef.current === currentRoadIdsString
    ) {
      return
    }

    if (
      roadImport.selectionMode === "multi-select" &&
      roadImport.multiSelectTempSelection.length > 0 &&
      projectId
    ) {
      const roadIds = roadImport.multiSelectTempSelection.map((id) =>
        parseInt(id),
      )
      if (roadIds.length > 0) {
        lastValidatedRoadIdsRef.current = currentRoadIdsString
        setMultiSelectValidating(true)

        validateRoadContinuityMutation
          .mutateAsync({
            roadIds,
            projectId,
          })
          .then((result) => {
            setMultiSelectValidationResult(result)
          })
          .catch((error) => {
            console.error("Validation error:", error)
            setMultiSelectValidationResult({
              is_continuous: false,
              gaps: [],
              error:
                error instanceof Error ? error.message : "Validation failed",
            })
          })
          .finally(() => {
            setMultiSelectValidating(false)
          })
      }
    } else {
      if (roadImport.multiSelectValidationResult) {
        setMultiSelectValidationResult(null)
      }
      lastValidatedRoadIdsRef.current = ""
    }
  }, [
    currentRoadIdsString,
    roadImport.selectionMode,
    roadImport.multiSelectValidating,
    projectId,
  ])

  const handleCombineMultiSelect = async () => {
    try {
      await combineMultiSelectRoadsToRoute()
      toast.success("Routes combined successfully")
    } catch (error) {
      console.error("Failed to combine roads:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to combine roads",
      )
    }
  }

  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const virtuosoContainerRef = useRef<HTMLDivElement>(null)
  const [virtuosoHeight, setVirtuosoHeight] = useState<number>(400)
  const shouldVirtualize = reversedPanelRoutes.length > 20
  const previousRoutesLengthRef = useRef<number>(0)

  // Measure container height for Virtuoso
  useEffect(() => {
    if (!virtuosoContainerRef.current || !shouldVirtualize) return

    const updateHeight = () => {
      if (virtuosoContainerRef.current) {
        const height = virtuosoContainerRef.current.clientHeight
        setVirtuosoHeight(height)
      }
    }

    updateHeight()

    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(virtuosoContainerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [shouldVirtualize])

  // Log virtualization decision
  useEffect(() => {
    if (reversedPanelRoutes.length > 0) {
      console.log(
        `📋 [RoadSelectionPanel] ${reversedPanelRoutes.length} routes, virtualization: ${shouldVirtualize ? "ON" : "OFF"}`,
      )
    }
  }, [reversedPanelRoutes.length, shouldVirtualize])

  // Optimize overscan based on list size for better performance
  const overscanConfig = useMemo(() => {
    const count = reversedPanelRoutes.length
    let config
    if (count <= 100) {
      config = { overscan: 5, increaseViewportBy: 100 }
    } else if (count <= 500) {
      config = { overscan: 3, increaseViewportBy: 150 }
    } else if (count <= 1000) {
      config = { overscan: 2, increaseViewportBy: 200 }
    } else if (count <= 5000) {
      config = { overscan: 1, increaseViewportBy: 250 }
    } else {
      // For very large lists (5000+), minimize overscan
      config = { overscan: 0, increaseViewportBy: 300 }
    }

    if (count > 100) {
      console.log(
        `⚙️ [Virtuoso Config] ${count} items -> overscan: ${config.overscan}, increaseViewportBy: ${config.increaseViewportBy}`,
      )
    }

    return config
  }, [reversedPanelRoutes.length])

  // Scroll to top when a new route is added (not when deleted)
  // Only scroll if user is near the top to avoid interrupting manual scrolling
  useEffect(() => {
    const currentLength = reversedPanelRoutes.length
    const previousLength = previousRoutesLengthRef.current

    // Only scroll to top if a new route was added (length increased)
    if (
      currentLength > previousLength &&
      virtuosoRef.current &&
      shouldVirtualize
    ) {
      // Check if user is near the top (within first 3 items) before auto-scrolling
      // This prevents interrupting user when they're scrolling down
      const timeoutId = setTimeout(() => {
        if (virtuosoRef.current) {
          // Use a small delay to check scroll position
          virtuosoRef.current.scrollToIndex({
            index: 0,
            align: "start",
            behavior: "smooth", // Use smooth instead of auto for better UX
          })
        }
      }, 100) // Small delay to avoid conflicts with user scrolling

      return () => clearTimeout(timeoutId)
    }

    previousRoutesLengthRef.current = currentLength
  }, [reversedPanelRoutes.length, shouldVirtualize])

  const handleEditStart = useCallback(
    (route: PanelRoute, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation()
      }
      setEditingRouteId(route.id)
      setEditingName(route.name)
    },
    [],
  )

  const handleEditSave = useCallback(
    (routeId: string) => {
      const trimmed = editingName.trim()
      if (trimmed && trimmed.length <= 100) {
        updateRouteName(routeId, trimmed)
        setEditingRouteId(null)
        setEditingName("")
      }
    },
    [editingName, updateRouteName],
  )

  const handleEditCancel = useCallback(() => {
    setEditingRouteId(null)
    setEditingName("")
  }, [])

  const handleDelete = useCallback(
    (routeId: string, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation()
      }
      removeRouteFromPanel(routeId)
    },
    [removeRouteFromPanel],
  )

  // Reset showSaveScreen when roads are imported or when panelRoutes becomes empty
  // This ensures the "Save Routes" panel only opens after routes are actually selected
  const prevImportedRoadsRef = useRef<typeof roadImport.importedRoads>(null)
  const prevPanelRoutesLengthRef = useRef<number>(roadImport.panelRoutes.length)

  useEffect(() => {
    const currentImportedRoads = roadImport.importedRoads
    const prevImportedRoads = prevImportedRoadsRef.current
    const currentPanelRoutesLength = roadImport.panelRoutes.length
    const prevPanelRoutesLength = prevPanelRoutesLengthRef.current

    // Reset showSaveScreen when:
    // 1. Roads are newly imported (importedRoads changes from null to non-null)
    // 2. Panel routes become empty (after saving or clearing)
    const roadsJustImported =
      !prevImportedRoads &&
      currentImportedRoads &&
      currentPanelRoutesLength === 0
    const panelRoutesBecameEmpty =
      prevPanelRoutesLength > 0 && currentPanelRoutesLength === 0

    if (roadsJustImported || panelRoutesBecameEmpty) {
      setShowSaveScreen(false)
    }

    prevImportedRoadsRef.current = currentImportedRoads
    prevPanelRoutesLengthRef.current = currentPanelRoutesLength
  }, [roadImport.importedRoads, roadImport.panelRoutes.length])

  // Check for routes exceeding 80km
  const routesOver80Km = useMemo(() => {
    return roadImport.panelRoutes.filter((route) => route.distance > 80)
  }, [roadImport.panelRoutes])

  const hasRoutesOver80Km = routesOver80Km.length > 0
  const limitKm = 80
  const limitInUserUnit =
    distanceUnit === "miles" ? convertKmToMiles(limitKm) : limitKm
  const limitDisplay =
    distanceUnit === "miles"
      ? `${limitInUserUnit.toFixed(1)} mi`
      : `${limitKm} km`

  const getRouteDisplayName = useCallback((route: PanelRoute) => {
    return route.name || "Unnamed Route"
  }, [])

  // Memoized handlers for route items
  const handleNavigate = useCallback(
    (data: { linestring: GeoJSON.LineString }) => {
      navigateToGeometry(data)
    },
    [navigateToGeometry],
  )

  // Throttle hover handlers and disable during fast scrolling
  const hoverThrottleRef = useRef<NodeJS.Timeout | null>(null)
  const lastHoveredRoadIdRef = useRef<string | null>(null)
  const isScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Track scrolling state to disable hover during fast scroll
  // Note: Scrolling is tracked via rangeChanged callback in Virtuoso

  const handleHoverEnter = useCallback(
    (roadId: string) => {
      // Disable hover during scrolling to prevent expensive map updates
      if (isScrollingRef.current) {
        return
      }

      // Skip if already hovering this road
      if (lastHoveredRoadIdRef.current === roadId) {
        return
      }

      // Clear any pending hover update
      if (hoverThrottleRef.current) {
        clearTimeout(hoverThrottleRef.current)
      }

      // Debounce hover updates to reduce map layer updates (only update after user stops moving mouse)
      // This prevents excessive map updates when quickly moving mouse over multiple items
      hoverThrottleRef.current = setTimeout(() => {
        // Double-check we're not scrolling before applying hover
        if (!isScrollingRef.current) {
          lastHoveredRoadIdRef.current = roadId
          startTransition(() => {
            setHoveredRoadId(roadId)
          })
        }
      }, 150) // 150ms debounce - balances responsiveness with performance
    },
    [setHoveredRoadId],
  )

  const handleHoverLeave = useCallback(() => {
    // Clear any pending hover enter
    if (hoverThrottleRef.current) {
      clearTimeout(hoverThrottleRef.current)
      hoverThrottleRef.current = null
    }

    // Clear hover immediately on mouse leave (but only if not scrolling)
    // This provides immediate feedback when user moves mouse away
    if (!isScrollingRef.current) {
      lastHoveredRoadIdRef.current = null
      startTransition(() => {
        setHoveredRoadId(null)
      })
    }
  }, [setHoveredRoadId])

  // Cleanup on unmount
  useEffect(() => {
    const hoverThrottle = hoverThrottleRef.current
    const scrollTimeout = scrollTimeoutRef.current

    return () => {
      if (hoverThrottle) {
        clearTimeout(hoverThrottle)
      }
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }
    }
  }, [])

  const handleEditNameChange = useCallback((name: string) => {
    setEditingName(name)
  }, [])

  // Memoize theme font sizes to prevent RouteItem re-renders
  const themeFontSizes = useMemo(
    () => ({
      body: theme.fontSizes.body,
      helper: theme.fontSizes.helper,
      caption: theme.fontSizes.caption,
    }),
    [theme.fontSizes.body, theme.fontSizes.helper, theme.fontSizes.caption],
  )

  // Performance tracking for renderRouteItem
  const renderRouteItemCallCountRef = useRef(0)
  const renderRouteItemIndicesRef = useRef<Set<number>>(new Set())

  // Use refs to access latest values without recreating renderRouteItem
  const routesRef = useRef(reversedPanelRoutes)
  const editingRouteIdRef = useRef(editingRouteId)
  const editingNameRef = useRef(editingName)

  // Update refs when values change
  useEffect(() => {
    routesRef.current = reversedPanelRoutes
  }, [reversedPanelRoutes])

  useEffect(() => {
    editingRouteIdRef.current = editingRouteId
  }, [editingRouteId])

  useEffect(() => {
    editingNameRef.current = editingName
  }, [editingName])

  // Route item renderer for virtualization - stable reference using refs
  const renderRouteItem = useCallback(
    (index: number) => {
      renderRouteItemCallCountRef.current += 1
      renderRouteItemIndicesRef.current.add(index)

      const route = routesRef.current[index]
      if (!route) {
        return null
      }

      const isEditing = editingRouteIdRef.current === route.id

      // Log every 500th call for performance tracking (reduced noise)
      if (renderRouteItemCallCountRef.current % 500 === 0) {
        const uniqueIndices = renderRouteItemIndicesRef.current.size
        const avgRendersPerItem =
          uniqueIndices > 0
            ? (renderRouteItemCallCountRef.current / uniqueIndices).toFixed(1)
            : "N/A"
        console.warn(
          `⚠️ [renderRouteItem] Performance: ${renderRouteItemCallCountRef.current} calls for ${uniqueIndices} items (avg ${avgRendersPerItem}x per item)`,
        )
        renderRouteItemIndicesRef.current.clear()
      }

      return (
        <RouteItem
          key={route.id}
          route={route}
          isEditing={isEditing}
          editingName={editingNameRef.current}
          distanceUnit={distanceUnit}
          onNavigate={handleNavigate}
          onHoverEnter={handleHoverEnter}
          onHoverLeave={handleHoverLeave}
          onEditStart={handleEditStart}
          onEditSave={handleEditSave}
          onEditCancel={handleEditCancel}
          onEditNameChange={handleEditNameChange}
          onDelete={handleDelete}
          theme={themeFontSizes}
        />
      )
    },
    [
      // Only include stable dependencies - routes accessed via ref
      distanceUnit,
      handleNavigate,
      handleHoverEnter,
      handleHoverLeave,
      handleEditStart,
      handleEditSave,
      handleEditCancel,
      handleEditNameChange,
      handleDelete,
      themeFontSizes,
    ],
  )

  // Log when renderRouteItem dependencies change
  useEffect(() => {
    if (reversedPanelRoutes.length > 100) {
      console.log(
        `🔄 [renderRouteItem] Dependencies changed - routes: ${reversedPanelRoutes.length}, editingId: ${editingRouteId}, editingName: ${editingName?.substring(0, 20)}...`,
      )
    }
  }, [reversedPanelRoutes.length, editingRouteId, editingName])

  // Performance monitoring for handler stability
  const handlerStabilityRef = useRef({
    navigate: handleNavigate,
    hoverEnter: handleHoverEnter,
    hoverLeave: handleHoverLeave,
  })

  useEffect(() => {
    if (reversedPanelRoutes.length > 100) {
      const handlersChanged =
        handlerStabilityRef.current.navigate !== handleNavigate ||
        handlerStabilityRef.current.hoverEnter !== handleHoverEnter ||
        handlerStabilityRef.current.hoverLeave !== handleHoverLeave

      if (handlersChanged) {
        console.warn(
          `⚠️ [Handlers] Handler references changed - this will cause RouteItem re-renders!`,
        )
        handlerStabilityRef.current = {
          navigate: handleNavigate,
          hoverEnter: handleHoverEnter,
          hoverLeave: handleHoverLeave,
        }
      }
    }
  }, [
    handleNavigate,
    handleHoverEnter,
    handleHoverLeave,
    reversedPanelRoutes.length,
  ])

  if (mapMode !== "road_selection") {
    return null
  }

  const handleSave = async () => {
    if (!projectId || roadImport.panelRoutes.length === 0) return

    // Folder is required for import roads flow
    if (!selectedTag || !selectedTag.trim()) {
      setTagError("Please select or type a folder")
      return
    }

    // Check for routes exceeding 80km
    const routesOver80Km = roadImport.panelRoutes.filter(
      (route) => route.distance > 80,
    )
    if (routesOver80Km.length > 0) {
      const limitKm = 80
      const limitInUserUnit =
        distanceUnit === "miles" ? convertKmToMiles(limitKm) : limitKm
      const limitDisplay =
        distanceUnit === "miles"
          ? `${limitInUserUnit.toFixed(1)} mi`
          : `${limitKm} km`
      const routeNames = routesOver80Km.map((r) => r.name).join(", ")
      toast.error(
        `Cannot save routes longer than ${limitDisplay}. Please adjust the following route${
          routesOver80Km.length > 1 ? "s" : ""
        }: ${routeNames}`,
      )
      return
    }

    try {
      const payloadRoads = roadImport.panelRoutes.map((route) => {
        const coordinates = route.geometry.coordinates
        if (!coordinates || coordinates.length < 2) {
          throw new Error(`Invalid geometry for route ${route.name}`)
        }

        const origin: [number, number] = [coordinates[0][0], coordinates[0][1]]
        const destination: [number, number] = [
          coordinates[coordinates.length - 1][0],
          coordinates[coordinates.length - 1][1],
        ]

        const waypointObjects = extractWaypointsFromLineString(route.geometry)
        const waypoints: [number, number][] = waypointObjects.map(
          (wp: { lat: number; lng: number }) => [wp.lng, wp.lat],
        )

        return {
          id: route.id,
          name: route.name,
          linestringGeoJson: route.geometry,
          origin,
          destination,
          length: route.distance,
          waypoints,
          route_type: "imported",
        }
      })

      const result = await batchSaveRoutesMutation.mutateAsync({
        projectId,
        tag: selectedTag.trim(),
        roads: payloadRoads,
      })

      toast.success(
        `Saved ${result.savedCount} route${
          result.savedCount === 1 ? "" : "s"
        } successfully.`,
      )

      if (result.errors.length > 0) {
        toast.error(
          `Failed to save ${result.errors.length} route${
            result.errors.length === 1 ? "" : "s"
          }: ${result.errors.map((err) => err.message).join("; ")}`,
        )
      }

      if (projectId) {
        try {
          await apiClient.delete(`/polygon/delete/${projectId}`)
          console.log("✅ Roads deleted successfully after save")
        } catch (error) {
          console.error("❌ Failed to delete roads after save:", error)
          toast.error("Failed to delete roads", {
            description:
              error instanceof Error
                ? error.message
                : "Could not delete roads from database",
          })
        }
      }

      // Capture the tag before clearing it - keep empty string and "Untagged" as separate
      const savedTag = selectedTag ?? ""

      clearRoadImport()
      clearAllDrawing()
      setMapMode("view")
      resetRoadPriorityFilters()
      setSelectedTag(null)
      // Navigate to the folder where routes were saved and open left panel
      // Keep empty string "" and "Untagged" as separate - use tag value as-is
      setCurrentFolder(savedTag)
      setLeftPanelExpanded(true)
    } catch (error) {
      console.error("❌ Failed to save routes:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to save routes",
      )
    }
  }

  const handleCancel = async () => {
    if (hasUnsavedRoadImports) {
      setExitDialogOpen(true)
    } else {
      if (projectId) {
        try {
          await apiClient.delete(`/polygon/delete/${projectId}`)
          console.log("✅ Roads deleted successfully on exit")
        } catch (error) {
          console.error("❌ Failed to delete roads on exit:", error)
          toast.error("Failed to delete roads", {
            description:
              error instanceof Error
                ? error.message
                : "Could not delete roads from database",
          })
        }
      }
      clearRoadImport()
      clearAllDrawing()
      setMapMode("view")
      resetRoadPriorityFilters()
    }
  }

  const handleModeSwitchCancel = () => {
    setExitDialogOpen(false)
  }

  const handleModeSwitchConfirm = async () => {
    setExitDialogOpen(false)
    if (projectId) {
      try {
        await apiClient.delete(`/polygon/delete/${projectId}`)
        console.log("✅ Roads deleted successfully on exit")
      } catch (error) {
        console.error("❌ Failed to delete roads on exit:", error)
        toast.error("Failed to delete roads", {
          description:
            error instanceof Error
              ? error.message
              : "Could not delete roads from database",
        })
      }
    }
    clearRoadImport()
    clearAllDrawing()
    setMapMode("view")
    resetRoadPriorityFilters()
  }

  const handleContinue = () => {
    if (roadImport.panelRoutes.length === 0) return
    setShowSaveScreen(true)
  }

  const handleBack = () => {
    setShowSaveScreen(false)
    setSelectedTag(null)
  }

  if (showSaveScreen) {
    // Check for routes exceeding 80km in save screen
    const saveScreenRoutesOver80Km = roadImport.panelRoutes.filter(
      (route) => route.distance > 80,
    )
    const saveScreenHasRoutesOver80Km = saveScreenRoutesOver80Km.length > 0
    const saveScreenLimitKm = 80
    const saveScreenLimitInUserUnit =
      distanceUnit === "miles"
        ? convertKmToMiles(saveScreenLimitKm)
        : saveScreenLimitKm
    const saveScreenLimitDisplay =
      distanceUnit === "miles"
        ? `${saveScreenLimitInUserUnit.toFixed(1)} mi`
        : `${saveScreenLimitKm} km`

    return (
      <>
        <RightPanel
          maxHeight={maxHeight}
          title="Save Routes"
          showBackButton={false}
          showCloseButton={true}
          onClose={handleBack}
          footer={
            <Box
              sx={{
                px: 2.5,
                pt: 1,
                pb: 1,
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              {saveScreenHasRoutesOver80Km && (
                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    backgroundColor: "#fff3e0",
                    border: "1px solid #ffb74d",
                    borderRadius: "8px",
                    mb: 1,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: theme.fontSizes.helper,
                      fontWeight: 400,
                      color: "#e65100",
                      fontFamily: '"Google Sans", sans-serif',
                      lineHeight: 1.5,
                    }}
                  >
                    {saveScreenRoutesOver80Km.length}{" "}
                    {saveScreenRoutesOver80Km.length === 1
                      ? "route exceeds"
                      : "routes exceed"}{" "}
                    the {saveScreenLimitDisplay} limit and cannot be saved.
                    Please adjust the route
                    {saveScreenRoutesOver80Km.length > 1 ? "s" : ""} to
                    continue.
                  </Typography>
                </Box>
              )}
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={handleBack}
                  size="small"
                  sx={{
                    textTransform: "none",
                    fontSize: theme.fontSizes.body,
                    fontWeight: 500,
                    fontFamily: '"Google Sans", sans-serif',
                    py: 1,
                    borderColor: "#dadce0",
                    color: "#5f6368",
                    "&:hover": {
                      borderColor: "#bdc1c6",
                      backgroundColor: "#f8f9fa",
                    },
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  onClick={handleSave}
                  disabled={
                    batchSaveRoutesMutation.isPending ||
                    saveScreenHasRoutesOver80Km ||
                    !selectedTag ||
                    !selectedTag.trim()
                  }
                  size="small"
                  sx={{
                    textTransform: "none",
                    fontSize: theme.fontSizes.body,
                    fontWeight: 500,
                    fontFamily: '"Google Sans", sans-serif',
                    py: 1,
                    backgroundColor: "#1976d2",
                    boxShadow: "none",
                    "&:hover": {
                      backgroundColor: "#1565c0",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
                    },
                    "&.Mui-disabled": {
                      backgroundColor: "#e8eaed",
                      color: "#bdc1c6",
                    },
                  }}
                >
                  {batchSaveRoutesMutation.isPending ? "Saving..." : "Confirm"}
                </Button>
              </Box>
            </Box>
          }
        >
          <Box
            sx={{
              px: 2.5,
              py: 1.5,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: theme.fontSizes.caption,
                fontFamily: '"Google Sans", sans-serif',
                color: "#5f6368",
                display: "block",
              }}
            >
              Save all {totalRoadsCount} road{totalRoadsCount !== 1 ? "s" : ""}{" "}
              as routes.
            </Typography>

            <TagSelector
              value={selectedTag}
              onChange={(value) => {
                setSelectedTag(value)
                if (tagError) {
                  setTagError("")
                }
              }}
              tags={availableTags}
              placeholder="Select a folder or type to create new"
              required
              label="Folder"
              error={tagError}
              helperText={tagError || undefined}
            />
          </Box>
        </RightPanel>
        <ModeSwitchDialog
          open={exitDialogOpen}
          fromMode="road_selection"
          toMode="view"
          onConfirm={handleModeSwitchConfirm}
          onCancel={handleModeSwitchCancel}
        />
      </>
    )
  }

  const getValidationMessage = () => {
    if (
      roadImport.selectionMode !== "multi-select" ||
      roadImport.multiSelectTempSelection.length === 0
    ) {
      return null
    }

    if (roadImport.multiSelectValidating) {
      return { text: "⏳ Validating...", color: "#999" }
    }

    if (roadImport.multiSelectValidationResult) {
      const result = roadImport.multiSelectValidationResult
      if (result.is_continuous) {
        return { text: "✓ Continuous path", color: "#4CAF50" }
      } else {
        const gaps = result.gaps || []
        if (gaps.length > 0) {
          const gap = gaps[0]
          return {
            text: `⚠ Gap detected: ${gap.distance_meters?.toFixed(1) || "unknown"}m between Road ${gap.from_road_id} and Road ${gap.to_road_id}`,
            color: "#FF9800",
          }
        }
        return { text: "⚠ Disconnected roads", color: "#FF9800" }
      }
    }

    return null
  }

  const validationMessage = getValidationMessage()
  const isMultiSelectMode = roadImport.selectionMode === "multi-select"
  const hasMultiSelectTemp = roadImport.multiSelectTempSelection.length > 0

  return (
    <>
      <RightPanel
        maxHeight={maxHeight}
        title={
          <>
            Selected Roads{" "}
            <span className="text-sm text-gray-500 ml-1">
              ({totalRoadsCount})
            </span>
          </>
        }
        onClose={handleCancel}
        footer={
          <Box
            sx={{
              px: 2.5,
              pt: 2,
              pb: 2,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            {isMultiSelectMode && hasMultiSelectTemp && (
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={handleCombineMultiSelect}
                disabled={validateRoadContinuityMutation.isPending}
                sx={{
                  textTransform: "none",
                  fontSize: theme.fontSizes.body,
                  fontWeight: 500,
                  fontFamily: '"Google Sans", sans-serif',
                  padding: "6px 12px",
                  backgroundColor: "#1976d2",
                  boxShadow: "none",
                  "&:hover": {
                    backgroundColor: "#1565c0",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
                  },
                  "&.Mui-disabled": {
                    backgroundColor: "#e8eaed",
                    color: "#bdc1c6",
                  },
                }}
              >
                {validateRoadContinuityMutation.isPending
                  ? "Combining..."
                  : `Save as Route (${roadImport.multiSelectTempSelection.length} roads)`}
              </Button>
            )}
            {hasRoutesOver80Km && (
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  backgroundColor: "#fff3e0",
                  border: "1px solid #ffb74d",
                  borderRadius: "8px",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: theme.fontSizes.helper,
                    fontWeight: 400,
                    color: "#e65100",
                    fontFamily: '"Google Sans", sans-serif',
                    lineHeight: 1.5,
                  }}
                >
                  {routesOver80Km.length}{" "}
                  {routesOver80Km.length === 1
                    ? "route exceeds"
                    : "routes exceed"}{" "}
                  the {limitDisplay} limit and cannot be saved. Please adjust
                  the route{routesOver80Km.length > 1 ? "s" : ""} to continue.
                </Typography>
              </Box>
            )}
            <Button
              variant="contained"
              color="primary"
              fullWidth
              onClick={handleContinue}
              disabled={
                roadImport.panelRoutes.length === 0 || hasRoutesOver80Km
              }
              sx={{
                textTransform: "none",
                fontSize: theme.fontSizes.body,
                fontWeight: 500,
                fontFamily: '"Google Sans", sans-serif',
                padding: "6px 12px",
                backgroundColor: "#1976d2",
                boxShadow: "none",
                "&:hover": {
                  backgroundColor: "#1565c0",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
                },
                "&.Mui-disabled": {
                  backgroundColor: "#e8eaed",
                  color: "#bdc1c6",
                },
              }}
            >
              Confirm
            </Button>
          </Box>
        }
      >
        {validationMessage && (
          <Box
            sx={{
              px: 2.5,
              py: 1.5,
              borderBottom: "1px solid #e8eaed",
            }}
          >
            <Box
              sx={{
                borderRadius: "12px",
                px: 2,
                py: 1.5,
                backgroundColor:
                  validationMessage.color === "#4CAF50"
                    ? "#E8F5E9"
                    : validationMessage.color === "#FF9800"
                      ? "#FFF3E0"
                      : "#F5F5F5",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: theme.fontSizes.helper,
                  color: validationMessage.color,
                  fontWeight: 500,
                  fontFamily: '"Google Sans", sans-serif',
                }}
              >
                {validationMessage.text}
              </Typography>
            </Box>
          </Box>
        )}

        <Box
          sx={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {roadImport.panelRoutes.length === 0 && !hasMultiSelectTemp ? (
            <Box className="p-8 text-center">
              <Typography
                variant="body2"
                sx={{
                  fontSize: theme.fontSizes.body,
                  color: "#5f6368",
                  fontFamily: '"Google Sans", sans-serif',
                }}
              >
                No routes added yet. Select roads and click "Add to Panel" to
                add them here.
              </Typography>
            </Box>
          ) : (
            <>
              {shouldVirtualize ? (
                <Box
                  className="pretty-scrollbar"
                  sx={{
                    flex: 1,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    pt: 2,
                    pb: 1.5,
                  }}
                >
                  {validateRoadContinuityMutation.isPending &&
                  reversedPanelRoutes.length === 0 &&
                  hasMultiSelectTemp ? (
                    // Show skeletons when combining routes
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        px: 2.5,
                        pt: 2,
                        pb: 1.5,
                      }}
                    >
                      {Array.from({
                        length: Math.min(
                          Math.max(3, Math.ceil(scrollableMaxHeight / 80)),
                          roadImport.multiSelectTempSelection.length || 10,
                        ),
                      }).map((_, index) => (
                        <RouteSkeleton key={`skeleton-${index}`} />
                      ))}
                    </Box>
                  ) : batchSaveRoutesMutation.isPending &&
                    reversedPanelRoutes.length > 0 ? (
                    // Show skeletons when saving routes
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        px: 2.5,
                        pt: 2,
                        pb: 1.5,
                      }}
                    >
                      {Array.from({
                        length: Math.min(
                          Math.max(3, Math.ceil(scrollableMaxHeight / 80)),
                          reversedPanelRoutes.length,
                        ),
                      }).map((_, index) => (
                        <RouteSkeleton key={`saving-skeleton-${index}`} />
                      ))}
                    </Box>
                  ) : (
                    <Box
                      ref={virtuosoContainerRef}
                      className="pretty-scrollbar"
                      sx={{
                        flex: 1,
                        position: "relative",
                        minHeight: 0,
                        // Target Virtuoso's internal scroller - scrollbar at edge, no padding
                        "& .virtuoso-scroller": {
                          paddingLeft: 0,
                          paddingRight: 0,
                        },
                        // Apply pretty scrollbar to Virtuoso's scroller
                        "& .virtuoso-scroller::-webkit-scrollbar": {
                          width: "8px",
                        },
                        "& .virtuoso-scroller::-webkit-scrollbar-track": {
                          borderRadius: "9999px",
                          backgroundColor: "rgb(243 244 246)",
                        },
                        "& .virtuoso-scroller::-webkit-scrollbar-thumb": {
                          borderRadius: "9999px",
                          backgroundColor: "rgb(209 213 219)",
                        },
                      }}
                    >
                      <Virtuoso
                        ref={virtuosoRef}
                        totalCount={reversedPanelRoutes.length}
                        itemContent={renderRouteItem}
                        style={{ height: `${virtuosoHeight}px` }}
                        defaultItemHeight={72}
                        fixedItemHeight={72}
                        overscan={overscanConfig.overscan}
                        increaseViewportBy={overscanConfig.increaseViewportBy}
                        components={{
                          List: React.forwardRef<
                            HTMLDivElement,
                            React.HTMLAttributes<HTMLDivElement>
                          >((props, ref) => (
                            <div
                              {...props}
                              ref={ref}
                              style={{
                                ...props.style,
                                paddingLeft: "20px",
                                paddingRight: "20px",
                              }}
                            />
                          )),
                        }}
                        // Performance optimizations for large lists
                        followOutput={false}
                        initialTopMostItemIndex={0}
                        // Reduce re-renders during scrolling
                        computeItemKey={(index) =>
                          reversedPanelRoutes[index]?.id || index
                        }
                        // Performance callbacks
                        rangeChanged={(range) => {
                          // Disable hover during scroll (more aggressive - longer timeout)
                          isScrollingRef.current = true
                          if (scrollTimeoutRef.current) {
                            clearTimeout(scrollTimeoutRef.current)
                          }
                          scrollTimeoutRef.current = setTimeout(() => {
                            isScrollingRef.current = false
                          }, 300) // 300ms after range change - prevents hover during fast scroll but allows it after scroll stops

                          // Clear any pending hover updates when scrolling
                          if (hoverThrottleRef.current) {
                            clearTimeout(hoverThrottleRef.current)
                            hoverThrottleRef.current = null
                          }

                          if (reversedPanelRoutes.length > 100) {
                            const visibleCount =
                              range.endIndex - range.startIndex + 1
                            const totalRendered =
                              renderRouteItemCallCountRef.current
                            console.log(
                              `📊 [Virtuoso] Range: ${range.startIndex}-${range.endIndex} (${visibleCount} visible, ${totalRendered} total renders)`,
                            )
                          }
                        }}
                        atBottomStateChange={(atBottom) => {
                          if (atBottom && reversedPanelRoutes.length > 100) {
                            console.log("⬇️ [Virtuoso] Reached bottom")
                          }
                        }}
                        atTopStateChange={(atTop) => {
                          if (atTop && reversedPanelRoutes.length > 100) {
                            console.log("⬆️ [Virtuoso] Reached top")
                          }
                        }}
                        // Track scroll performance
                        scrollSeekConfiguration={{
                          enter: (velocity) => {
                            if (
                              reversedPanelRoutes.length > 100 &&
                              Math.abs(velocity) > 500
                            ) {
                              console.warn(
                                `⚡ [Virtuoso] Fast scroll detected: ${velocity.toFixed(0)}px/s`,
                              )
                            }
                            return false
                          },
                          exit: () => {
                            return false
                          },
                        }}
                      />
                    </Box>
                  )}
                </Box>
              ) : (
                <Box
                  className="pretty-scrollbar"
                  sx={{
                    flex: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    minHeight: 0,
                    pt: 2,
                    pb: 1.5,
                    WebkitOverflowScrolling: "touch",
                    // Scrollbar at edge, no horizontal padding on scrollable container
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      px: 2.5,
                      pt: 2,
                      pb: 1.5,
                      // Content has padding, scrollbar stays at edge
                    }}
                  >
                    {validateRoadContinuityMutation.isPending &&
                    reversedPanelRoutes.length === 0 &&
                    hasMultiSelectTemp
                      ? // Show skeletons when combining routes
                        Array.from({
                          length: Math.min(
                            Math.max(3, Math.ceil(scrollableMaxHeight / 80)),
                            roadImport.multiSelectTempSelection.length || 10,
                          ),
                        }).map((_, index) => (
                          <RouteSkeleton key={`skeleton-${index}`} />
                        ))
                      : batchSaveRoutesMutation.isPending &&
                          reversedPanelRoutes.length > 0
                        ? // Show skeletons when saving routes
                          Array.from({
                            length: Math.min(
                              Math.max(3, Math.ceil(scrollableMaxHeight / 80)),
                              reversedPanelRoutes.length,
                            ),
                          }).map((_, index) => (
                            <RouteSkeleton key={`saving-skeleton-${index}`} />
                          ))
                        : reversedPanelRoutes.map((route) => {
                            const isEditing = editingRouteId === route.id
                            const displayName = getRouteDisplayName(route)
                            const priorityLabel = formatPriorityLabel(
                              route.priority,
                            )

                            return (
                              <ListItem
                                key={route.id}
                                disablePadding
                                style={{ width: "100%" }}
                              >
                                <ListItemButton
                                  onClick={(e) => {
                                    const target = e.target as HTMLElement
                                    if (target.closest("button")) return
                                    navigateToGeometry({
                                      linestring: route.geometry,
                                    })
                                  }}
                                  onMouseEnter={() => {
                                    if (route.roadIds.length > 0) {
                                      setHoveredRoadId(route.roadIds[0])
                                    }
                                  }}
                                  onMouseLeave={() => setHoveredRoadId(null)}
                                  sx={{
                                    minHeight: 64,
                                    padding: "12px 16px",
                                    borderRadius: "12px",
                                    position: "relative",
                                    zIndex: 10,
                                    backgroundColor: "#ffffff",
                                    border: "1px solid #e8eaed",
                                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                    "&:hover": {
                                      backgroundColor: "#f8f9fa",
                                      boxShadow:
                                        "0 2px 8px rgba(0, 0, 0, 0.08)",
                                      borderColor: "#dadce0",
                                    },
                                    "&:active": {
                                      backgroundColor: "#f1f3f4",
                                    },
                                  }}
                                >
                                  {isEditing ? (
                                    <>
                                      <TextField
                                        value={editingName}
                                        onChange={(e) =>
                                          setEditingName(e.target.value)
                                        }
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.stopPropagation()
                                            handleEditSave(route.id)
                                          } else if (e.key === "Escape") {
                                            e.stopPropagation()
                                            handleEditCancel()
                                          }
                                        }}
                                        autoFocus
                                        variant="standard"
                                        placeholder="Enter route name"
                                        fullWidth
                                        inputProps={{ maxLength: 100 }}
                                        sx={{
                                          flex: 1,
                                          "& .MuiInput-root": {
                                            fontSize: theme.fontSizes.body,
                                            fontFamily:
                                              '"Google Sans", sans-serif',
                                            fontWeight: 500,
                                            "&::before": {
                                              borderBottom: "1px solid #e0e0e0",
                                            },
                                            "&::after": {
                                              borderBottom: "2px solid #1976d2",
                                            },
                                          },
                                          "& .MuiInput-input": {
                                            padding: 0,
                                          },
                                        }}
                                      />
                                      <Box
                                        sx={{
                                          display: "flex",
                                          gap: 0.5,
                                          ml: 1,
                                        }}
                                      >
                                        <IconButton
                                          size="small"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleEditCancel()
                                          }}
                                          title="Cancel"
                                          sx={{
                                            minWidth: 10,
                                            minHeight: 10,
                                            padding: "6px",
                                            color: "#5f6368",
                                            borderRadius: "999px",
                                            "&:hover": {
                                              backgroundColor:
                                                "rgba(219, 0, 0,0.12)",
                                            },
                                          }}
                                        >
                                          <CloseRounded sx={{ fontSize: 18 }} />
                                        </IconButton>
                                        <IconButton
                                          size="small"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleEditSave(route.id)
                                          }}
                                          title="Save"
                                          sx={{
                                            minWidth: 28,
                                            minHeight: 28,
                                            padding: "6px",
                                            color: "#1976d2",
                                            borderRadius: "999px",
                                            "&:hover": {
                                              backgroundColor:
                                                "rgba(25, 118, 210, 0.12)",
                                            },
                                          }}
                                        >
                                          <Check sx={{ fontSize: 18 }} />
                                        </IconButton>
                                      </Box>
                                    </>
                                  ) : (
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 2,
                                        width: "100%",
                                      }}
                                    >
                                      <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography
                                          variant="body2"
                                          title={
                                            route.roadIds.length > 1
                                              ? `${displayName}\nMade from ${route.roadIds.length} roads`
                                              : displayName
                                          }
                                          sx={{
                                            fontSize: theme.fontSizes.body,
                                            fontWeight: 500,
                                            color: "#111827",
                                            fontFamily:
                                              '"Google Sans", sans-serif',
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            mb: 0.75,
                                          }}
                                        >
                                          {displayName}
                                        </Typography>
                                        <Box
                                          sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1,
                                            flexWrap: "wrap",
                                          }}
                                        >
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              color: "#5f6368",
                                              fontWeight: 400,
                                              fontSize: theme.fontSizes.helper,
                                              fontFamily:
                                                '"Google Sans", sans-serif',
                                            }}
                                          >
                                            {formatDistance(
                                              route.distance,
                                              distanceUnit,
                                            )}
                                          </Typography>
                                          {route.roadIds.length > 1 && (
                                            <>
                                              <Typography
                                                variant="caption"
                                                sx={{
                                                  color: "#dadce0",
                                                  fontSize:
                                                    theme.fontSizes.helper,
                                                }}
                                              >
                                                •
                                              </Typography>
                                              <Chip
                                                label={`${route.roadIds.length} roads`}
                                                size="small"
                                                sx={{
                                                  height: 18,
                                                  fontSize:
                                                    theme.fontSizes.caption,
                                                  fontWeight: 500,
                                                  backgroundColor:
                                                    "transparent",
                                                  color: "#5f6368",
                                                  border: "1px solid #dadce0",
                                                  "& .MuiChip-label": {
                                                    padding: "0 6px",
                                                    fontSize:
                                                      theme.fontSizes.caption,
                                                    lineHeight: 1.2,
                                                  },
                                                }}
                                              />
                                            </>
                                          )}
                                          {route.priority && (
                                            <>
                                              <Typography
                                                variant="caption"
                                                sx={{
                                                  color: "#dadce0",
                                                  fontSize:
                                                    theme.fontSizes.helper,
                                                }}
                                              >
                                                •
                                              </Typography>
                                              <Chip
                                                label={priorityLabel}
                                                size="small"
                                                sx={{
                                                  height: 18,
                                                  fontSize:
                                                    theme.fontSizes.caption,
                                                  fontWeight: 500,
                                                  backgroundColor:
                                                    "transparent",
                                                  color: priorityLabel.includes(
                                                    "Limited",
                                                  )
                                                    ? "#c5221f"
                                                    : "#1967d2",
                                                  border: `1px solid ${
                                                    priorityLabel.includes(
                                                      "Limited",
                                                    )
                                                      ? "#fce8e6"
                                                      : "#90caf9"
                                                  }`,
                                                  "& .MuiChip-label": {
                                                    padding: "0 6px",
                                                    fontSize:
                                                      theme.fontSizes.caption,
                                                    lineHeight: 1.2,
                                                  },
                                                }}
                                              />
                                            </>
                                          )}
                                        </Box>
                                      </Box>
                                      <Box
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 0.5,
                                        }}
                                      >
                                        <IconButton
                                          size="small"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleEditStart(route, e)
                                          }}
                                          title="Rename"
                                          sx={{
                                            minWidth: 32,
                                            minHeight: 32,
                                            padding: "6px",
                                            color: "#5f6368",
                                            borderRadius: "6px",
                                            "&:hover": {
                                              backgroundColor: "#f5f5f5",
                                              color: "#1976d2",
                                            },
                                          }}
                                        >
                                          <Edit sx={{ fontSize: 18 }} />
                                        </IconButton>
                                        <IconButton
                                          size="small"
                                          onClick={(e) =>
                                            handleDelete(route.id, e)
                                          }
                                          title="Remove"
                                          sx={{
                                            minWidth: 32,
                                            minHeight: 32,
                                            padding: "6px",
                                            color: "#5f6368",
                                            borderRadius: "6px",
                                            transition: "all 0.2s ease",
                                            "&:hover": {
                                              backgroundColor:
                                                "rgba(219, 0, 0, 0.08)",
                                              color: "#c5221f",
                                            },
                                          }}
                                        >
                                          <Delete sx={{ fontSize: 18 }} />
                                        </IconButton>
                                      </Box>
                                    </Box>
                                  )}
                                </ListItemButton>
                              </ListItem>
                            )
                          })}
                  </Box>
                </Box>
              )}
            </>
          )}
        </Box>
      </RightPanel>
      <ModeSwitchDialog
        open={exitDialogOpen}
        fromMode="road_selection"
        toMode="view"
        onConfirm={handleModeSwitchConfirm}
        onCancel={handleModeSwitchCancel}
      />
    </>
  )
}

export default RoadSelectionPanel
