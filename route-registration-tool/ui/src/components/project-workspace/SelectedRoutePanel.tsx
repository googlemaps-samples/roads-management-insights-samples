import { Add, Cancel, Edit } from "@mui/icons-material"
import { Box, Chip, IconButton, Typography, useTheme } from "@mui/material"
import React from "react"

import {
  PRIMARY_BLUE,
  PRIMARY_RED_GOOGLE,
  PRIMARY_RED_LIGHT,
} from "../../constants/colors"
import { useProjectWorkspaceStore } from "../../stores"
import { type Waypoint, useLayerStore } from "../../stores/layer-store"
import { isPointInBoundary } from "../../utils/boundary-validation"
import { formatDistance, useDistanceUnit } from "../../utils/distance-utils"
import { useResponsiveTypography } from "../../utils/typography-utils"
import Button from "../common/Button"
import RouteRenameDialog from "../common/RouteRenameDialog"
import RightPanel from "./RightPanel"
import RoutePointsList from "./RoutePointsList"

// Maximum number of waypoints allowed per route
const MAX_WAYPOINTS = 25

interface SelectedRouteInfo {
  routeId: string
  routeName: string
  distanceKm: number
  durationMinutes: number
  similarityPercentage: number
  waypoints: Waypoint[]
}

interface SelectedRoutePanelProps {
  routeId: string
  routeInfo: SelectedRouteInfo
  className?: string
  style?: React.CSSProperties
  onBack: () => void
  onRenameRoute: (newName: string) => Promise<void>
  onSwapStartEnd: (routeId: string) => void
  onAddWaypoint: (routeId: string) => void
  onRemoveWaypoint: (routeId: string, waypointId: string) => void
  onMoveWaypointUp: (routeId: string, waypointId: string) => void
  onMoveWaypointDown: (routeId: string, waypointId: string) => void
  onMoveOriginDown: (routeId: string) => void
  onMoveDestinationUp: (routeId: string) => void
  onCancelAddingWaypoint: () => void
  isAddingWaypoint: boolean
  waypointAddingRouteId: string | null
  onSaveRouteChanges: (routeId: string) => void
  onDiscardRouteChanges: (routeId: string) => void
}

const SelectedRoutePanel: React.FC<SelectedRoutePanelProps> = ({
  routeId,
  routeInfo,
  className,
  style,
  onBack,
  onRenameRoute,
  onSwapStartEnd,
  onAddWaypoint,
  onRemoveWaypoint,
  onMoveWaypointUp,
  onMoveWaypointDown,
  onMoveOriginDown,
  onMoveDestinationUp,
  onCancelAddingWaypoint,
  isAddingWaypoint,
  waypointAddingRouteId,
  onSaveRouteChanges,
  onDiscardRouteChanges,
}) => {
  const [renameDialogOpen, setRenameDialogOpen] = React.useState(false)
  const distanceUnit = useDistanceUnit()
  const typography = useResponsiveTypography()
  const snappedRoads = useLayerStore((state) => state.snappedRoads)
  const initializeRouteEditing = useLayerStore(
    (state) => state.initializeRouteEditing,
  )
  const hasUnsavedChanges = useLayerStore((state) =>
    state.hasUnsavedChanges(routeId),
  )
  const getEditingState = useLayerStore((state) => state.getEditingState)
  const dynamicIslandHeight = useProjectWorkspaceStore(
    (state) => state.dynamicIslandHeight,
  )
  const projectData = useProjectWorkspaceStore((state) => state.projectData)
  const boundary = projectData?.boundaryGeoJson
  const theme = useTheme()

  // Check if the current route is within boundary
  const isRouteWithinBoundary = React.useMemo(() => {
    if (!boundary) return true // No boundary means all routes are valid

    const editingState = getEditingState(routeId)

    // Get route markers (use temporary if editing, otherwise regular)
    const routeMarkers = snappedRoads.routeMarkers.find(
      (m) => m.routeId === routeId,
    )
    const displayMarkers = editingState?.temporaryMarkers || routeMarkers

    // First, check origin, destination, and waypoints directly
    if (displayMarkers) {
      // Check origin
      if (
        !isPointInBoundary(
          displayMarkers.startMarker.lat,
          displayMarkers.startMarker.lng,
          boundary,
        )
      ) {
        return false
      }

      // Check destination
      if (
        !isPointInBoundary(
          displayMarkers.endMarker.lat,
          displayMarkers.endMarker.lng,
          boundary,
        )
      ) {
        return false
      }

      // Check all waypoints
      if (displayMarkers.waypoints && displayMarkers.waypoints.length > 0) {
        for (const waypoint of displayMarkers.waypoints) {
          if (
            !isPointInBoundary(
              waypoint.position.lat,
              waypoint.position.lng,
              boundary,
            )
          ) {
            return false
          }
        }
      }
    }

    // Check preview roads first (if editing), then snapped roads
    const routeRoads = editingState
      ? snappedRoads.previewRoads.filter(
          (road) => road.uploadedRouteId === routeId,
        )
      : snappedRoads.roads.filter((road) => road.uploadedRouteId === routeId)

    // If we're in edit mode but have no preview roads, validation likely failed
    // In this case, we should disable save
    if (editingState && routeRoads.length === 0) {
      return false
    }

    if (routeRoads.length === 0) return true // No route to validate (not in edit mode)

    // Check all route features
    for (const road of routeRoads) {
      const geometry = road.feature.geometry
      if (geometry.type === "LineString") {
        const coordinates = geometry.coordinates
        for (const coord of coordinates) {
          if (Array.isArray(coord) && coord.length >= 2) {
            const [lng, lat] = [coord[0] as number, coord[1] as number]
            if (!isPointInBoundary(lat, lng, boundary)) {
              return false
            }
          }
        }
      } else if (geometry.type === "MultiLineString") {
        for (const line of geometry.coordinates) {
          if (Array.isArray(line)) {
            for (const coord of line) {
              if (Array.isArray(coord) && coord.length >= 2) {
                const [lng, lat] = [coord[0] as number, coord[1] as number]
                if (!isPointInBoundary(lat, lng, boundary)) {
                  return false
                }
              }
            }
          }
        }
      }
    }

    return true
  }, [
    boundary,
    routeId,
    snappedRoads.roads,
    snappedRoads.previewRoads,
    snappedRoads.routeMarkers,
    getEditingState,
  ])
  const waypointsScrollContainerRef = React.useRef<HTMLDivElement | null>(null)
  const innerWaypointsScrollContainerRef = React.useRef<HTMLDivElement | null>(
    null,
  )

  // Initialize editing state when route is selected
  // Note: We don't include hasUnsavedChanges in dependencies to avoid re-initializing
  // during save operations. The save handler will manually re-initialize after save completes.
  React.useEffect(() => {
    // Check if editing state exists - if not, initialize it
    const editingState = getEditingState(routeId)
    if (!editingState) {
      initializeRouteEditing(routeId)
    }
  }, [routeId, initializeRouteEditing, getEditingState])

  // Check if this specific route is being regenerated
  const isRouteLoading = React.useMemo(() => {
    if (!snappedRoads.isLoading) return false
    // Check if this route has markers but no roads (being regenerated)
    const routeMarkers = snappedRoads.routeMarkers.find(
      (m) => m.routeId === routeId,
    )
    if (!routeMarkers) return false

    const routeRoads = snappedRoads.roads.filter(
      (road) => road.uploadedRouteId === routeId,
    )
    // If route has markers but no roads, it's being generated/regenerated
    return routeRoads.length === 0
  }, [
    snappedRoads.isLoading,
    snappedRoads.roads,
    snappedRoads.routeMarkers,
    routeId,
  ])

  // Track previous waypoints count to detect new additions
  const prevWaypointsCountRef = React.useRef<Record<string, number>>({})
  // Store scroll position to preserve it when entering waypoint adding mode
  const savedScrollPositionRef = React.useRef<number>(0)

  // Preserve scroll position when entering waypoint adding mode
  React.useEffect(() => {
    if (isAddingWaypoint && waypointAddingRouteId === routeId) {
      // Save current scroll position when entering waypoint adding mode
      const scrollContainer =
        innerWaypointsScrollContainerRef.current ||
        waypointsScrollContainerRef.current
      if (scrollContainer) {
        savedScrollPositionRef.current = scrollContainer.scrollTop
      }
    }
  }, [isAddingWaypoint, waypointAddingRouteId, routeId])

  // Restore scroll position after state changes that might reset it
  React.useEffect(() => {
    if (isAddingWaypoint && waypointAddingRouteId === routeId) {
      // Restore scroll position after a brief delay to ensure DOM is stable
      const timeoutId = setTimeout(() => {
        const scrollContainer =
          innerWaypointsScrollContainerRef.current ||
          waypointsScrollContainerRef.current
        if (scrollContainer && savedScrollPositionRef.current > 0) {
          scrollContainer.scrollTop = savedScrollPositionRef.current
        }
      }, 50)

      return () => clearTimeout(timeoutId)
    }
  }, [isAddingWaypoint, waypointAddingRouteId, routeId])

  // Auto-scroll to newly added waypoint after route regeneration
  React.useEffect(() => {
    const currentState = useLayerStore.getState()
    const getEditingState = currentState.getEditingState
    const editingState = getEditingState(routeId)

    // Use temporary markers if editing, otherwise regular markers
    const routeMarkers =
      editingState?.temporaryMarkers ||
      currentState.snappedRoads.routeMarkers.find((m) => m.routeId === routeId)

    if (!routeMarkers) {
      return
    }

    const currentWaypointsCount = routeMarkers.waypoints?.length || 0

    // Initialize previous count if not set for this route
    if (!(routeId in prevWaypointsCountRef.current)) {
      prevWaypointsCountRef.current[routeId] = currentWaypointsCount
      return
    }

    const previousCount = prevWaypointsCountRef.current[routeId]

    // If waypoints count increased, a new waypoint was added
    if (currentWaypointsCount > previousCount && currentWaypointsCount > 0) {
      // Scroll to bottom of the container
      const scrollToBottom = (retryCount = 0) => {
        // Try inner container first (where waypoints actually are), fallback to outer
        const scrollContainer =
          innerWaypointsScrollContainerRef.current ||
          waypointsScrollContainerRef.current

        if (scrollContainer) {
          // Scroll to the bottom of the container
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior: "smooth",
          })

          // Update saved scroll position
          savedScrollPositionRef.current = scrollContainer.scrollHeight
        } else {
          // If container not found yet, try again after a short delay (max 5 retries)
          if (retryCount < 5) {
            requestAnimationFrame(() => {
              setTimeout(() => scrollToBottom(retryCount + 1), 150)
            })
          } else {
            console.warn("⚠️ Failed to scroll to bottom after 5 retries")
          }
        }
      }

      // Wait for route regeneration and DOM update, then scroll
      // Use multiple requestAnimationFrame calls to ensure DOM is fully updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => scrollToBottom(0), 400) // Give time for route regeneration
        })
      })
    }

    // Update the previous count
    prevWaypointsCountRef.current[routeId] = currentWaypointsCount
  }, [routeId, routeInfo.waypoints.length, snappedRoads.routeMarkers])

  const handleStartEditRouteName = React.useCallback(() => {
    setRenameDialogOpen(true)
  }, [])

  const handleRenameSave = React.useCallback(
    async (newName: string) => {
      await onRenameRoute(newName)
      setRenameDialogOpen(false)
    },
    [onRenameRoute],
  )

  const handleExit = React.useCallback(() => {
    onBack()
  }, [onBack])

  // Fixed height for the panel to prevent expansion
  // Calculate fixed height to avoid overlap with DynamicIsland
  // DynamicIsland is at bottom: 22px, right: 10px
  // SelectedRoutePanel is at top: 36px (144px), right: 4px
  // We need to leave space for DynamicIsland + padding
  const [windowHeight, setWindowHeight] = React.useState(window.innerHeight)

  React.useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const maxHeight = React.useMemo(() => {
    const topOffset = 144 // top-36 = 144px (36 * 4)
    const dynamicIslandBottomPosition = 22 // DynamicIsland is positioned at bottom: 22px
    const safetyMargin = 24 // Safety margin between panels to prevent overlap
    // DynamicIsland is at bottom: 22px, so its top edge is at: windowHeight - 22 - dynamicIslandHeight
    // SelectedRoutePanel starts at top: 144px
    // To avoid overlap: 144 + maxHeight <= windowHeight - 22 - dynamicIslandHeight - safetyMargin
    // So: maxHeight <= windowHeight - 144 - 22 - dynamicIslandHeight - safetyMargin
    const maxAvailableHeight =
      windowHeight -
      topOffset -
      dynamicIslandBottomPosition -
      dynamicIslandHeight -
      safetyMargin
    // Use max height (ensure minimum height for usability, but don't exceed available space)
    return Math.max(Math.min(maxAvailableHeight, 600), 400)
  }, [dynamicIslandHeight, windowHeight])

  // Calculate max height for scrollable container
  const scrollableMaxHeight = React.useMemo(() => {
    const headerHeight = 80 // Approximate header height
    const routeInfoHeight = 60 // Route summary section
    const saveButtonsHeight = 60 // Save/Discard buttons
    const padding = 40 // Additional padding
    return (
      maxHeight - headerHeight - routeInfoHeight - saveButtonsHeight - padding
    )
  }, [maxHeight])

  // Create title component - just the route name
  const titleComponent = (
    <Box className="flex flex-col gap-1">
      <Typography
        variant="h6"
        component="div"
        title={routeInfo.routeName}
        className="text-lg font-medium text-gray-900 leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]"
        sx={{
          fontFamily: '"Google Sans", sans-serif',
        }}
      >
        {routeInfo.routeName}
      </Typography>
      <Box className="flex items-center gap-3">
        <Typography
          variant="body2"
          className="text-[0.813rem] font-medium text-[#5f6368]"
          sx={{
            fontFamily: '"Google Sans", sans-serif',
          }}
        >
          {routeInfo.waypoints.length}{" "}
          {routeInfo.waypoints.length === 1 ? "waypoint" : "waypoints"}
        </Typography>
        <Chip
          label={`${routeInfo.similarityPercentage}% match`}
          size="small"
          sx={{
            height: "20px",
            backgroundColor:
              routeInfo.similarityPercentage >= 80
                ? "#e8f5e9"
                : routeInfo.similarityPercentage >= 60
                  ? "#fff3e0"
                  : PRIMARY_RED_LIGHT,
            color:
              routeInfo.similarityPercentage >= 80
                ? "#2e7d32"
                : routeInfo.similarityPercentage >= 60
                  ? "#e65100"
                  : "#c62828",
            "& .MuiChip-label": {
              padding: "0 6px",
              fontSize: theme.fontSizes?.helper || "0.75rem",
              fontWeight: 500,
              fontFamily: '"Google Sans", sans-serif',
            },
            border: "none",
          }}
        />
      </Box>
    </Box>
  )

  // Create header content with edit button
  const headerContent = (
    <IconButton
      size="small"
      onClick={handleStartEditRouteName}
      sx={{
        color: "#5f6368",
        "&:hover": {
          backgroundColor: "#f1f3f4",
          color: "#1967d2",
        },
      }}
      title="Edit route name"
    >
      <Edit fontSize="small" />
    </IconButton>
  )

  return (
    <RightPanel
      className={className}
      style={{
        ...style,
        maxHeight: maxHeight,
      }}
      dynamicIslandHeight={dynamicIslandHeight}
      title={titleComponent}
      // subtitle={

      // }
      showBackButton={false}
      // onBack={handleExit}
      onClose={handleExit}
      headerContent={headerContent}
      footer={
        <>
          {/* Save/Discard buttons - always visible, disabled when no changes */}
          <Box
            sx={{
              px: 2.5,
              pt: 2,
              pb: 2,
              display: "flex",
              gap: 1,
              width: "100%",
            }}
          >
            <Button
              size="small"
              variant="outlined"
              onClick={() => onDiscardRouteChanges(routeId)}
              disabled={!hasUnsavedChanges}
              sx={{
                flex: 1,
                minWidth: "80px",
                textTransform: "none",
                fontSize: theme.fontSizes.body,
                fontWeight: 500,
                fontFamily: '"Google Sans", sans-serif',
                padding: "6px 12px",
                color: "#5f6368",
                borderColor: "#dadce0",
                backgroundColor: "#ffffff",
                "&:hover": {
                  borderColor: "#bdc1c6",
                  backgroundColor: "#f8f9fa",
                },
                "&.Mui-disabled": {
                  color: "#bdc1c6",
                  borderColor: "#e8eaed",
                  backgroundColor: "#f8f9fa",
                },
              }}
            >
              Discard
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => onSaveRouteChanges(routeId)}
              disabled={!hasUnsavedChanges || !isRouteWithinBoundary}
              sx={{
                flex: 1,
                minWidth: "80px",
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
              title={
                !isRouteWithinBoundary
                  ? "Route is outside the jurisdiction boundary"
                  : undefined
              }
            >
              Save
            </Button>
          </Box>
        </>
      }
    >
      {/* Selected Route Content */}
      <Box
        sx={{
          px: 0,
          pt: 0,
          pb: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flex: 1,
        }}
      >
        {isRouteLoading ? (
          <Box className="text-center py-4 text-gray-500">
            <Typography
              variant="body2"
              sx={{
                fontSize: theme.fontSizes.body,
                fontFamily: '"Google Sans", sans-serif',
                color: "#5f6368",
              }}
            >
              Generating route...
            </Typography>
          </Box>
        ) : (
          <>
            {/* Static route info card when a route is selected */}
            <Box className="px-5 py-2 border-b border-gray-200">
              <Box>
                {/* Route Summary */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    {(() => {
                      return (
                        <Typography
                          variant="body1"
                          sx={{
                            fontSize: typography.body.small,
                            color: "#202124",
                            fontWeight: 500,
                            fontFamily: '"Google Sans", sans-serif',
                            letterSpacing: "-0.01em",
                            lineHeight: 1.4,
                          }}
                        >
                          {formatDistance(routeInfo.distanceKm, distanceUnit)}
                        </Typography>
                      )
                    })()}
                  </Box>
                  {/* Add waypoints button */}

                  <span>
                    <Button
                      title={
                        routeInfo.waypoints.length >= MAX_WAYPOINTS &&
                        !(isAddingWaypoint && waypointAddingRouteId === routeId)
                          ? `Maximum ${MAX_WAYPOINTS} waypoints reached`
                          : isAddingWaypoint &&
                              waypointAddingRouteId === routeId
                            ? "Click to stop adding waypoints"
                            : "Click to add waypoints by clicking on the map"
                      }
                      size="small"
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation()
                        if (
                          isAddingWaypoint &&
                          waypointAddingRouteId === routeId
                        ) {
                          onCancelAddingWaypoint()
                        } else if (routeInfo.waypoints.length < MAX_WAYPOINTS) {
                          onAddWaypoint(routeId)
                        }
                      }}
                      disabled={
                        routeInfo.waypoints.length >= MAX_WAYPOINTS &&
                        !(isAddingWaypoint && waypointAddingRouteId === routeId)
                      }
                      startIcon={
                        isAddingWaypoint &&
                        waypointAddingRouteId === routeId ? (
                          <Cancel sx={{ fontSize: typography.body.medium }} />
                        ) : (
                          <Add
                            sx={{
                              fontSize: typography.body.medium,
                              backgroundColor: PRIMARY_BLUE,
                              color: "#ffffff",
                              borderRadius: "50%",
                              width: "16px",
                              height: "16px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          />
                        )
                      }
                      sx={{
                        color:
                          isAddingWaypoint && waypointAddingRouteId === routeId
                            ? PRIMARY_RED_GOOGLE
                            : PRIMARY_BLUE,
                        textTransform: "none",
                        fontSize: typography.body.small,
                        fontWeight: 500,
                        fontFamily: '"Google Sans", sans-serif',
                        padding: "8px",
                        minWidth: "auto",
                        boxShadow: "none",
                        "&:hover": {
                          backgroundColor: "#f1f3f4",
                          boxShadow: "none",
                        },
                        "&.Mui-disabled": {
                          color: "#bdc1c6",
                        },
                        "& .MuiButton-startIcon": {
                          marginRight: "4px",
                          marginLeft: 0,
                        },
                      }}
                    >
                      {isAddingWaypoint && waypointAddingRouteId === routeId
                        ? "Cancel"
                        : "Add Waypoints"}
                    </Button>
                  </span>
                </Box>
              </Box>
            </Box>

            {/* Route waypoints section - Use RoutePointsList component */}
            <Box className=" flex flex-col overflow-hidden flex-1">
              {(() => {
                const waypoints = routeInfo.waypoints || []
                // Get route markers (use temporary if editing, otherwise regular)
                const routeMarkers = snappedRoads.routeMarkers.find(
                  (m) => m.routeId === routeId,
                )
                const getEditingState = useLayerStore.getState().getEditingState
                const editingState = getEditingState(routeId)
                const displayMarkers =
                  editingState?.temporaryMarkers || routeMarkers

                const originMarker = displayMarkers?.startMarker
                const destinationMarker = displayMarkers?.endMarker

                // Convert markers to RoutePoint format for RoutePointsList
                const points: Array<{
                  id: string
                  coordinates: { lat: number; lng: number }
                }> = []

                if (originMarker) {
                  points.push({
                    id: "origin",
                    coordinates: originMarker,
                  })
                }

                // Add waypoints in order
                waypoints
                  .sort((a, b) => a.order - b.order)
                  .forEach((waypoint) => {
                    points.push({
                      id: waypoint.id,
                      coordinates: waypoint.position,
                    })
                  })

                if (destinationMarker) {
                  points.push({
                    id: "destination",
                    coordinates: destinationMarker,
                  })
                }

                // Handle reordering for uploaded routes
                const handleReorder = (activeId: string, overId: string) => {
                  // Find indices
                  const activeIndex = points.findIndex((p) => p.id === activeId)
                  const overIndex = points.findIndex((p) => p.id === overId)

                  if (activeIndex === -1 || overIndex === -1) return

                  const activePoint = points[activeIndex]
                  const overPoint = points[overIndex]

                  // Determine if we're moving origin, waypoint, or destination
                  if (activePoint.id === "origin") {
                    // Moving origin down (swap with first waypoint)
                    if (overIndex > activeIndex) {
                      onMoveOriginDown(routeId)
                    }
                  } else if (activePoint.id === "destination") {
                    // Moving destination up (swap with last waypoint)
                    if (overIndex < activeIndex) {
                      onMoveDestinationUp(routeId)
                    }
                  } else {
                    // Moving a waypoint
                    if (overPoint.id === "origin") {
                      // Moving waypoint up towards origin
                      onMoveWaypointUp(routeId, activePoint.id)
                    } else if (overPoint.id === "destination") {
                      // Moving waypoint down towards destination
                      onMoveWaypointDown(routeId, activePoint.id)
                    } else {
                      // Moving waypoint to another waypoint position
                      if (overIndex < activeIndex) {
                        onMoveWaypointUp(routeId, activePoint.id)
                      } else {
                        onMoveWaypointDown(routeId, activePoint.id)
                      }
                    }
                  }
                }

                return (
                  <RoutePointsList
                    points={points}
                    onRemove={(pointId) => {
                      // Only allow removing waypoints, not origin/destination
                      if (pointId !== "origin" && pointId !== "destination") {
                        onRemoveWaypoint(routeId, pointId)
                      }
                    }}
                    onReorder={handleReorder}
                    onSwapStartEnd={
                      waypoints.length === 0
                        ? () => onSwapStartEnd(routeId)
                        : undefined
                    }
                    scrollableMaxHeight={scrollableMaxHeight}
                    showDeleteButtons={true}
                    showSwapButton={true}
                  />
                )
              })()}
            </Box>
          </>
        )}
      </Box>

      {/* Route Rename Dialog */}
      <RouteRenameDialog
        open={renameDialogOpen}
        currentName={routeInfo.routeName}
        onClose={() => setRenameDialogOpen(false)}
        onSave={handleRenameSave}
      />
    </RightPanel>
  )
}

export default SelectedRoutePanel
