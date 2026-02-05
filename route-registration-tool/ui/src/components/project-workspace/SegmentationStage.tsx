import {
  ArrowDropDown,
  Delete,
  Edit,
  ExpandLess,
  ExpandMore,
} from "@mui/icons-material"
import {
  Box,
  Checkbox,
  CircularProgress,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material"
import { useVirtualizer } from "@tanstack/react-virtual"
import React from "react"

import { PRIMARY_RED } from "../../constants/colors"
import { useLayerStore } from "../../stores/layer-store"
import {
  convertKmToMiles,
  convertMilesToKm,
  formatDistance,
  useDistanceUnit,
} from "../../utils/distance-utils"
import { calculateRouteLengthFromPolyline } from "../../utils/polyline-decoder"
import Button from "../common/Button"
import ContextMenu from "../common/ContextMenu"
import RightPanel from "./RightPanel"

// Maximum allowed segment distance in kilometers
const MAX_SEGMENT_DISTANCE_KM = 80
const MIN_SEGMENT_DISTANCE_KM = 0.01

interface SegmentationStageProps {
  className?: string
  style?: React.CSSProperties
  dynamicIslandHeight: number
  routeLength: number
  segmentationMode: "distance" | "manual" | "intersections"
  distanceInput: string
  segmentNames: Map<string, string>
  onBack: () => void
  onClose: () => void
  onSegmentationModeChange: (
    mode: "distance" | "manual" | "intersections",
  ) => void
  onDistanceInputChange: (value: string) => void
  onDistanceKmSet: (distanceKm: number) => void
  onSegmentNameChange: (segmentId: string, name: string) => void
  onSave: () => void
  onHoveredSegmentIdChange: (id: string | null) => void
}

const SegmentationStage: React.FC<SegmentationStageProps> = ({
  className,
  style,
  dynamicIslandHeight,
  routeLength,
  segmentationMode,
  distanceInput,
  segmentNames,
  onBack,
  onClose,
  onSegmentationModeChange,
  onDistanceInputChange,
  onDistanceKmSet,
  onSegmentNameChange,
  onSave,
  onHoveredSegmentIdChange,
}) => {
  const theme = useTheme()
  const distanceUnit = useDistanceUnit()
  const segmentation = useLayerStore((state) => state.segmentation)
  const individualRoute = useLayerStore((state) => state.individualRoute)
  const [distanceInputExpanded, setDistanceInputExpanded] = React.useState(true)
  const [autoMenuPosition, setAutoMenuPosition] = React.useState<{
    x: number
    y: number
  } | null>(null)
  const autoButtonRef = React.useRef<HTMLButtonElement | null>(null)

  // Calculate route length from decoded polyline coordinates for accuracy
  // This ensures we always show the calculated value, even before segmentation
  const calculatedRouteLength = React.useMemo(() => {
    const route = segmentation.targetRoute || individualRoute.generatedRoute
    if (!route?.encodedPolyline) {
      return null
    }

    return calculateRouteLengthFromPolyline(route.encodedPolyline)
  }, [segmentation.targetRoute, individualRoute.generatedRoute])

  // Use calculated route length if available (more accurate), otherwise fall back to prop
  // Prioritize segmentation's calculated value if available, otherwise use component's calculation
  // This ensures the displayed length matches the actual polyline calculation used for segments
  const displayRouteLength =
    segmentation.calculatedRouteLengthKm ?? calculatedRouteLength ?? routeLength

  // Limit is 50km, convert to user's unit for display
  const limitKm = 50
  const limitInUserUnit =
    distanceUnit === "miles" ? convertKmToMiles(limitKm) : limitKm
  const limitExceeded = displayRouteLength > limitKm

  const toggleSegmentSelection = useLayerStore(
    (state) => state.toggleSegmentSelection,
  )
  const startSegmentation = useLayerStore((state) => state.startSegmentation)
  const fetchIntersectionsAndCreateSegments = useLayerStore(
    (state) => state.fetchIntersectionsAndCreateSegments,
  )
  const removeCutPoint = useLayerStore((state) => state.removeCutPoint)
  const switchToManualMode = useLayerStore((state) => state.switchToManualMode)
  const clearPreviewSegments = useLayerStore(
    (state) => state.clearPreviewSegments,
  )

  // Expand distance input when switching to distance mode
  React.useEffect(() => {
    if (segmentationMode === "distance") {
      setDistanceInputExpanded(true)
    }
  }, [segmentationMode])

  // Keep distance input expanded when there's an error
  React.useEffect(() => {
    if (segmentationMode === "distance" && segmentation.error) {
      setDistanceInputExpanded(true)
    }
  }, [segmentationMode, segmentation.error])

  // Close menu when switching modes or when segments are cleared
  React.useEffect(() => {
    if (
      segmentationMode !== "intersections" ||
      segmentation.previewSegments.length === 0
    ) {
      setAutoMenuPosition(null)
    }
  }, [
    segmentationMode,
    segmentation.previewSegments.length,
    segmentation.isCalculating,
  ])

  // Clear segmentation state when distance input is emptied in distance mode
  React.useEffect(() => {
    if (
      segmentationMode === "distance" &&
      distanceInput === "" &&
      (segmentation.previewSegments.length > 0 ||
        segmentation.error ||
        segmentation.distanceKm !== undefined)
    ) {
      // Clear all segmentation state
      clearPreviewSegments()
      useLayerStore.setState((state) => ({
        segmentation: {
          ...state.segmentation,
          distanceKm: undefined,
          error: undefined,
        },
      }))
    }
  }, [
    distanceInput,
    segmentationMode,
    segmentation.previewSegments.length,
    segmentation.error,
    segmentation.distanceKm,
    clearPreviewSegments,
  ])

  const selectedIds = segmentation.selectedSegmentIds
  const hasError = !!segmentation.error
  // Sort preview segments by segmentOrder to ensure consistent ordering
  const sortedPreviewSegments = React.useMemo(() => {
    return [...segmentation.previewSegments].sort(
      (a, b) => (a.segmentOrder || 0) - (b.segmentOrder || 0),
    )
  }, [segmentation.previewSegments])

  // Check if any segment exceeds 80km limit
  const segmentsOver80Km = React.useMemo(() => {
    return sortedPreviewSegments.filter((seg) => {
      const segmentDistance =
        (seg as { length?: number; distanceKm?: number }).length ||
        (seg as { length?: number; distanceKm?: number }).distanceKm ||
        0
      return segmentDistance > MAX_SEGMENT_DISTANCE_KM
    })
  }, [sortedPreviewSegments])

  const hasSegmentsOver80Km = segmentsOver80Km.length > 0

  // Helper function to format segment distances consistently
  // If segments are approximately the same distance, format them all the same way
  const formatSegmentDistance = React.useCallback(
    (distanceKm: number): string => {
      if (sortedPreviewSegments.length === 0) {
        return formatDistance(distanceKm, distanceUnit)
      }

      // Get all segment distances
      const allDistances = sortedPreviewSegments.map((seg) => {
        return (
          (seg as { length?: number; distanceKm?: number }).length ||
          (seg as { length?: number; distanceKm?: number }).distanceKm ||
          0
        )
      })

      // Find segments similar to the current one (within 0.02 km = 20 meters)
      // This handles cases where the last segment is shorter
      const tolerance = 0.02 // 20 meters
      const similarDistances = allDistances.filter(
        (d) => Math.abs(d - distanceKm) <= tolerance,
      )

      // If we have multiple similar segments (at least 2, or most segments are similar)
      const isMostlySimilar =
        similarDistances.length >= 2 &&
        similarDistances.length >= allDistances.length * 0.5

      if (isMostlySimilar) {
        // Most segments are similar, format consistently
        const minSimilar = Math.min(...similarDistances)
        const maxSimilar = Math.max(...similarDistances)

        // Check if similar segments are around 0.1 km (0.08 to 0.12 km)
        const isNear100m = minSimilar >= 0.08 && maxSimilar <= 0.12

        if (distanceUnit === "miles") {
          // Convert to miles for display
          const distanceMiles = convertKmToMiles(distanceKm)

          if (isNear100m || maxSimilar < 0.1) {
            // Small distances - show in feet
            const result = `${Math.round(distanceMiles * 5280)} ft`
            return result
          } else {
            // Larger distances - show in miles with 2 decimal places
            const result = `${distanceMiles.toFixed(2)} mi`
            return result
          }
        } else {
          // Metric unit formatting
          if (isNear100m) {
            // Similar segments are around 100m, format all as meters for consistency
            const result = `${Math.round(distanceKm * 1000)} m`
            return result
          } else if (maxSimilar < 0.1) {
            // Similar segments are less than 0.1 km, format all as meters
            const result = `${Math.round(distanceKm * 1000)} m`
            return result
          } else {
            // Similar segments are >= 0.1 km, format all as km with 2 decimal places
            const result = `${distanceKm.toFixed(2)} km`
            return result
          }
        }
      }

      // No similar segments found, use normal formatting
      const result = formatDistance(distanceKm, distanceUnit)
      return result
    },
    [sortedPreviewSegments, distanceUnit],
  )

  // Virtualization setup
  const listParentRef = React.useRef<HTMLDivElement>(null)
  const shouldVirtualize = sortedPreviewSegments.length > 50

  const virtualizer = useVirtualizer({
    count: sortedPreviewSegments.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 48, // Approximate item height
    overscan: 5,
    enabled: shouldVirtualize,
  })

  const toggleSelect = (id: string) => {
    toggleSegmentSelection(id)
  }

  const handleDeleteSegment = (segmentOrder: number) => {
    // Find the cut point to remove based on segment order
    // Segments are created between cut points:
    // - Segment 1: start -> cut point 0
    // - Segment N (middle): cut point N-2 -> cut point N-1
    // - Last segment: last cut point -> end
    const cutPoints = segmentation.cutPoints
    const totalSegments = sortedPreviewSegments.length

    if (cutPoints.length === 0) return

    // Sort cut points by distanceFromStart to ensure correct order
    const sortedCutPoints = [...cutPoints].sort(
      (a, b) => a.distanceFromStart - b.distanceFromStart,
    )

    let cutPointToRemove: string | null = null

    if (segmentOrder === 1) {
      // Remove first cut point
      cutPointToRemove = sortedCutPoints[0]?.id || null
    } else if (segmentOrder === totalSegments) {
      // Remove last cut point
      cutPointToRemove = sortedCutPoints[sortedCutPoints.length - 1]?.id || null
    } else {
      // Remove the cut point that ends this segment (at index segmentOrder - 1)
      const cutPointIndex = segmentOrder - 1
      cutPointToRemove = sortedCutPoints[cutPointIndex]?.id || null
    }

    if (cutPointToRemove) {
      removeCutPoint(cutPointToRemove)
    }
  }

  const handleDistanceInputChange = (value: string) => {
    // Allow empty string, numbers, and decimal point
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      onDistanceInputChange(value)
      // Clear error when user changes the input
      if (segmentation.error) {
        useLayerStore.setState((state) => ({
          segmentation: {
            ...state.segmentation,
            error: undefined,
          },
        }))
      }
    }
  }

  const handleDistanceOk = () => {
    const v = parseFloat(distanceInput)
    if (!isNaN(v) && v > 0) {
      // Convert from current unit to km before storing
      const distanceInKm = distanceUnit === "miles" ? convertMilesToKm(v) : v
      // Validate minimum is 0.01 km (already converted)
      if (distanceInKm < 0.01) {
        return
      }
      // Validate maximum is 80 km
      if (distanceInKm > MAX_SEGMENT_DISTANCE_KM) {
        const maxInUserUnit =
          distanceUnit === "miles"
            ? convertKmToMiles(MAX_SEGMENT_DISTANCE_KM)
            : MAX_SEGMENT_DISTANCE_KM
        const maxDisplay =
          distanceUnit === "miles"
            ? `${maxInUserUnit.toFixed(2)} mi`
            : `${MAX_SEGMENT_DISTANCE_KM} km`
        useLayerStore.setState((state) => ({
          segmentation: {
            ...state.segmentation,
            error: `Segment distance cannot exceed ${maxDisplay}. Please use a smaller distance.`,
          },
        }))
        return
      }
      // Clear error before setting new distance to ensure clean state
      useLayerStore.setState((state) => ({
        segmentation: {
          ...state.segmentation,
          error: undefined,
        },
      }))
      onDistanceKmSet(distanceInKm)
      // Auto-collapse the input section after successful distance entry
      setDistanceInputExpanded(false)
    }
  }

  return (
    <RightPanel
      className={className}
      style={style}
      dynamicIslandHeight={dynamicIslandHeight}
      title="Segment Route"
      subtitle={
        displayRouteLength > 0
          ? formatDistance(displayRouteLength, distanceUnit)
          : undefined
      }
      showBackButton={true}
      onBack={onBack}
      onClose={onClose}
      footer={
        <Box
          sx={{
            borderTop: "1px solid #e0e0e0",
            p: 2,
            px: 3,
            display: "flex",
            flexDirection: "column",
            gap: 1,
            flexShrink: 0,
          }}
        >
          {hasSegmentsOver80Km &&
            (() => {
              const limitInUserUnit =
                distanceUnit === "miles"
                  ? convertKmToMiles(MAX_SEGMENT_DISTANCE_KM)
                  : MAX_SEGMENT_DISTANCE_KM
              const limitDisplay =
                distanceUnit === "miles"
                  ? `${limitInUserUnit.toFixed(1)} mi`
                  : `${MAX_SEGMENT_DISTANCE_KM} km`

              return (
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: "12px",
                    fontWeight: 400,
                    color: "#d32f2f",
                    fontFamily: '"Google Sans", sans-serif',
                    display: "block",
                    mb: 0.5,
                  }}
                >
                  {segmentsOver80Km.length} segment
                  {segmentsOver80Km.length > 1 ? "s" : ""} exceed {limitDisplay}{" "}
                  limit
                </Typography>
              )
            })()}
          <Button
            variant="contained"
            fullWidth
            disabled={selectedIds.size === 0 || hasError || hasSegmentsOver80Km}
            onClick={onSave}
            size="small"
            sx={{
              py: 1,
              fontSize: theme.fontSizes.body,
              minHeight: "36px",
            }}
          >
            Save{" "}
            {selectedIds.size > 0 &&
              !hasError &&
              !hasSegmentsOver80Km &&
              `(${selectedIds.size})`}
          </Button>
        </Box>
      }
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
        }}
      >
        {/* Fixed Mode Selection */}
        <Box
          sx={{
            p: 2,
            flexShrink: 0,
            backgroundColor: "#ffffff",
            borderBottom: "1px solid #e0e0e0",
          }}
        >
          {/* Mode Selection Buttons */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Box
              sx={{
                display: "flex",
                gap: 0.75,
              }}
            >
              <Button
                size="small"
                variant={
                  segmentationMode === "distance" ? "contained" : "outlined"
                }
                onClick={() => {
                  onSegmentationModeChange("distance")
                  if (individualRoute.generatedRoute) {
                    startSegmentation(
                      individualRoute.generatedRoute,
                      "distance",
                    )
                  }
                }}
                disabled={
                  segmentation.isCalculating &&
                  segmentationMode === "intersections"
                }
                sx={{
                  flex: 1,
                  minHeight: "32px",
                  py: 0.5,
                  fontSize: theme.fontSizes.helper,
                  fontWeight: segmentationMode === "distance" ? 500 : 400,
                }}
              >
                Distance
              </Button>
              <Button
                size="small"
                variant={
                  segmentationMode === "manual" ? "contained" : "outlined"
                }
                onClick={() => {
                  // If switching from intersections mode with existing cut points, preserve them
                  if (
                    segmentationMode === "intersections" &&
                    segmentation.cutPoints.length > 0
                  ) {
                    switchToManualMode()
                    onSegmentationModeChange("manual")
                  } else {
                    // Otherwise, start fresh segmentation
                    onSegmentationModeChange("manual")
                    if (individualRoute.generatedRoute) {
                      startSegmentation(
                        individualRoute.generatedRoute,
                        "manual",
                      )
                    }
                  }
                }}
                disabled={
                  segmentation.isCalculating &&
                  (segmentationMode === "intersections" ||
                    segmentationMode === "distance")
                }
                sx={{
                  flex: 1,
                  minHeight: "32px",
                  py: 0.5,
                  fontSize: theme.fontSizes.helper,
                  fontWeight: segmentationMode === "manual" ? 500 : 400,
                }}
              >
                Manual
              </Button>
              <Tooltip
                title={
                  limitExceeded
                    ? `Auto segmentation is only available for routes up to ${limitInUserUnit.toFixed(0)} ${distanceUnit === "miles" ? "mi" : "km"}. This route is ${formatDistance(displayRouteLength, distanceUnit)}.`
                    : ""
                }
                arrow
              >
                <Box
                  sx={{
                    position: "relative",
                    flex: 1,
                    display: "flex",
                  }}
                >
                  <Button
                    ref={autoButtonRef}
                    size="small"
                    variant={
                      segmentationMode === "intersections"
                        ? "contained"
                        : "outlined"
                    }
                    onClick={async (e) => {
                      // If segments exist, toggle context menu instead of running segmentation again
                      if (
                        segmentationMode === "intersections" &&
                        !segmentation.isCalculating &&
                        segmentation.previewSegments.length > 0
                      ) {
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()

                        // Menu dimensions (approximate)
                        const menuWidth = 160
                        const menuHeight = 50 // Approximate height for 1 item + padding
                        const padding = 5

                        // Calculate available space
                        const viewportWidth = window.innerWidth
                        const viewportHeight = window.innerHeight

                        // Calculate horizontal position - center below button
                        let x = rect.left + rect.width / 2 - menuWidth / 2
                        // Ensure menu doesn't go off screen
                        if (x < padding) {
                          x = padding
                        } else if (x + menuWidth > viewportWidth - padding) {
                          x = viewportWidth - menuWidth - padding
                        }

                        // Calculate vertical position - below button
                        let y = rect.bottom + padding
                        // If not enough space below, position above
                        if (y + menuHeight > viewportHeight) {
                          y = rect.top - menuHeight - padding
                          // If still not enough space, position at the bottom edge of viewport
                          if (y < 0) {
                            y = viewportHeight - menuHeight - padding
                          }
                        }

                        if (autoMenuPosition) {
                          // Close menu if already open
                          setAutoMenuPosition(null)
                        } else {
                          setAutoMenuPosition({ x, y })
                        }
                        return
                      }
                      if (segmentation.isCalculating) return // Prevent multiple clicks
                      onSegmentationModeChange("intersections")
                      if (individualRoute.generatedRoute) {
                        startSegmentation(
                          individualRoute.generatedRoute,
                          "intersections",
                        )
                        await fetchIntersectionsAndCreateSegments()
                      }
                    }}
                    disabled={segmentation.isCalculating || limitExceeded}
                    endIcon={
                      segmentationMode === "intersections" &&
                      !segmentation.isCalculating &&
                      segmentation.previewSegments.length > 0 ? (
                        <ArrowDropDown
                          sx={{
                            fontSize: "20px",
                            color:
                              segmentationMode === "intersections"
                                ? "#ffffff"
                                : "#4285f4",
                          }}
                        />
                      ) : null
                    }
                    sx={{
                      flex: 1,
                      minHeight: "32px",
                      py: 0.5,
                      fontSize: theme.fontSizes.helper,
                      fontWeight:
                        segmentationMode === "intersections" ? 500 : 400,
                      position: "relative",
                    }}
                  >
                    {"Auto"}
                  </Button>
                </Box>
              </Tooltip>
            </Box>
          </Box>

          {/* Auto Segments Context Menu - appears over Auto button when successful */}
          {autoMenuPosition && (
            <ContextMenu
              className="py-1"
              x={autoMenuPosition.x}
              y={autoMenuPosition.y}
              onClose={() => setAutoMenuPosition(null)}
              draggable={false}
              width={160}
              items={[
                {
                  id: "edit",
                  label: "Edit Segments",
                  icon: <Edit sx={{ fontSize: 16 }} />,
                  onClick: () => {
                    switchToManualMode()
                    onSegmentationModeChange("manual")
                    setAutoMenuPosition(null)
                  },
                },
              ]}
            />
          )}

          {/* Distance Input - Appears below when Distance mode is active */}
          {segmentationMode === "distance" && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                mt: 1.5,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: distanceInputExpanded ? 1 : 0,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: theme.fontSizes.helper,
                    color: "#5f6368",
                    fontFamily: '"Google Sans", sans-serif',
                    fontWeight: 500,
                  }}
                >
                  Distance Input
                </Typography>
                <IconButton
                  size="small"
                  onClick={() =>
                    setDistanceInputExpanded(!distanceInputExpanded)
                  }
                  sx={{
                    padding: "4px",
                    color: "#5f6368",
                  }}
                >
                  {distanceInputExpanded ? (
                    <ExpandLess fontSize="small" />
                  ) : (
                    <ExpandMore fontSize="small" />
                  )}
                </IconButton>
              </Box>
              <Collapse in={distanceInputExpanded} timeout={0}>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      alignItems: "center",
                    }}
                  >
                    <TextField
                      label={`Distance (${distanceUnit === "miles" ? "mi" : "km"})`}
                      type="text"
                      size="small"
                      variant="outlined"
                      fullWidth
                      value={distanceInput}
                      onChange={(e) =>
                        handleDistanceInputChange(e.target.value)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleDistanceOk()
                        }
                      }}
                      slotProps={{
                        input: {
                          inputMode: "decimal",
                          sx: {
                            fontSize: "0.813rem",
                            fontFamily: '"Google Sans", sans-serif',
                          },
                        },
                        inputLabel: {
                          sx: {
                            fontSize: "0.813rem",
                            fontFamily: '"Google Sans", sans-serif',
                          },
                        },
                      }}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: "8px",
                        },
                      }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleDistanceOk}
                      disabled={
                        !distanceInput ||
                        isNaN(parseFloat(distanceInput)) ||
                        (() => {
                          const v = parseFloat(distanceInput)
                          if (v <= 0) return true
                          // Convert to km and check minimum and maximum
                          const distanceInKm =
                            distanceUnit === "miles" ? convertMilesToKm(v) : v
                          return (
                            distanceInKm < 0.01 ||
                            distanceInKm > MAX_SEGMENT_DISTANCE_KM
                          )
                        })()
                      }
                      sx={{
                        flexShrink: 0,
                        minWidth: "64px",
                        minHeight: "36px",
                        py: 1,
                        fontSize: "0.813rem",
                        textTransform: "none",
                        fontWeight: 500,
                      }}
                    >
                      OK
                    </Button>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.75rem",
                      color: "#5f6368",
                      fontFamily: '"Google Sans", sans-serif',
                      whiteSpace: "nowrap",
                    }}
                  >
                    Segment length must be between{" "}
                    {distanceUnit === "miles"
                      ? `${convertKmToMiles(MIN_SEGMENT_DISTANCE_KM).toFixed(2)} mi and ${convertKmToMiles(MAX_SEGMENT_DISTANCE_KM).toFixed(1)} mi`
                      : `${MIN_SEGMENT_DISTANCE_KM} km and ${MAX_SEGMENT_DISTANCE_KM} km`}
                    .
                  </Typography>
                </Box>
              </Collapse>
            </Box>
          )}
        </Box>

        {/* Content */}
        <Box
          sx={{
            px: 2,
            py: 1,
            overflow: "hidden",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {/* Distance Mode */}
          {segmentationMode === "distance" ? (
            <>
              {segmentation.isCalculating ? (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    py: 4,
                    flex: 1,
                  }}
                >
                  <CircularProgress size={32} thickness={4} />
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: theme.fontSizes.helper,
                      color: "#5f6368",
                      fontFamily: '"Google Sans", sans-serif',
                    }}
                  >
                    Calculating segments...
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ flexShrink: 0, mb: 0.5 }}>
                  {segmentation.error &&
                    (() => {
                      // Parse error message to format with proper units
                      let errorMessage = segmentation.error
                      if (segmentation.error.startsWith("ROUTE_LENGTH_")) {
                        errorMessage = `Segmentation distance should always be smaller than the route length. Please use a smaller distance.`
                      } else if (
                        segmentation.error.startsWith("MAX_SEGMENTS_EXCEEDED_")
                      ) {
                        const match = segmentation.error.match(
                          /MAX_SEGMENTS_EXCEEDED_([\d.]+)_LIMIT_([\d.]+)_ROUTE_LENGTH_([\d.]+)_DISTANCE_([\d.]+)/,
                        )
                        if (match) {
                          const estimatedCount = parseInt(match[1])
                          const limit = parseInt(match[2])
                          errorMessage = `This would create approximately ${estimatedCount.toLocaleString()} segments, which exceeds the maximum limit of ${limit.toLocaleString()}. Please use a larger segment distance.`
                        }
                      }
                      return (
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: theme.fontSizes.helper,
                            color: PRIMARY_RED,
                            fontFamily: '"Google Sans", sans-serif',
                            display: "block",
                            mb: 0.5,
                          }}
                        >
                          {errorMessage}
                        </Typography>
                      )
                    })()}
                </Box>
              )}
            </>
          ) : segmentationMode === "intersections" ? (
            <Box sx={{ flexShrink: 0 }}>
              {limitExceeded && (
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: theme.fontSizes.helper,
                    color: PRIMARY_RED,
                    fontFamily: '"Google Sans", sans-serif',
                    display: "block",
                    mb: 2,
                  }}
                >
                  Auto segmentation is only available for routes up to{" "}
                  {limitInUserUnit.toFixed(2)}{" "}
                  {distanceUnit === "miles" ? "mi" : "km"}. This route is{" "}
                  {formatDistance(displayRouteLength, distanceUnit)}.
                </Typography>
              )}

              {segmentation.isCalculating ? (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    py: 4,
                    flex: 1,
                  }}
                >
                  <CircularProgress size={32} thickness={4} />
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: theme.fontSizes.helper,
                      color: "#5f6368",
                      fontFamily: '"Google Sans", sans-serif',
                    }}
                  >
                    Analyzing route and finding intersections...
                  </Typography>
                </Box>
              ) : (
                <>
                  {segmentation.error &&
                    (() => {
                      // Parse error message to format with proper units
                      let errorMessage = segmentation.error
                      if (
                        segmentation.error.startsWith("MAX_SEGMENTS_EXCEEDED_")
                      ) {
                        const match = segmentation.error.match(
                          /MAX_SEGMENTS_EXCEEDED_([\d.]+)_LIMIT_([\d.]+)_ROUTE_LENGTH_([\d.]+)_DISTANCE_([\d.]+)/,
                        )
                        if (match) {
                          const estimatedCount = parseInt(match[1])
                          const limit = parseInt(match[2])
                          errorMessage = `This would create approximately ${estimatedCount.toLocaleString()} segments, which exceeds the maximum limit of ${limit.toLocaleString()}. Please use a larger segment distance.`
                        }
                      }
                      return (
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: theme.fontSizes.helper,
                            color: PRIMARY_RED,
                            fontFamily: '"Google Sans", sans-serif',
                            display: "block",
                            mb: 2,
                          }}
                        >
                          {errorMessage}
                        </Typography>
                      )
                    })()}
                </>
              )}
            </Box>
          ) : (
            <Box sx={{ flexShrink: 0 }}>
              {segmentation.cutPoints.length > 0 && (
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: theme.fontSizes.helper,
                    color: "#5f6368",
                    fontFamily: '"Google Sans", sans-serif',
                    display: "block",
                    mb: 2,
                  }}
                >
                  {segmentation.cutPoints.length} cut point
                  {segmentation.cutPoints.length !== 1 ? "s" : ""} added
                </Typography>
              )}

              {segmentation.error && (
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: theme.fontSizes.helper,
                    color: PRIMARY_RED,
                    fontFamily: '"Google Sans", sans-serif',
                    display: "block",
                    mb: 2,
                  }}
                >
                  {segmentation.error}
                </Typography>
              )}
            </Box>
          )}

          {/* Segments List */}
          {!segmentation.isCalculating && sortedPreviewSegments.length > 0 && (
            <Box
              ref={listParentRef}
              className="pretty-scrollbar"
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                pr: 1, // Add padding to create space between scrollbar and content
              }}
            >
              {shouldVirtualize ? (
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const seg = sortedPreviewSegments[virtualItem.index]
                    const index = virtualItem.index
                    const isSelected = selectedIds.has(seg.id)
                    const segmentDistance =
                      (seg as { length?: number; distanceKm?: number })
                        .length ||
                      (
                        seg as {
                          length?: number
                          distanceKm?: number
                        }
                      ).distanceKm ||
                      0

                    return (
                      <div
                        key={seg.id}
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
                        <ListItem
                          disableGutters
                          onMouseEnter={() => onHoveredSegmentIdChange(seg.id)}
                          onMouseLeave={() => onHoveredSegmentIdChange(null)}
                          sx={{
                            py: 0.5,
                            borderBottom: "1px solid #f1f3f4",
                            opacity: isSelected ? 1 : 0.5,
                            "&:last-child": {
                              borderBottom: "none",
                            },
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <Checkbox
                              edge="start"
                              checked={isSelected}
                              tabIndex={-1}
                              disableRipple
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleSelect(seg.id)
                              }}
                            />
                          </ListItemIcon>
                          <Box
                            sx={{
                              flex: 1,
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <TextField
                              size="small"
                              variant="standard"
                              fullWidth
                              placeholder={`Segment ${index + 1}`}
                              value={segmentNames.get(seg.id) || ""}
                              onChange={(e) =>
                                onSegmentNameChange(seg.id, e.target.value)
                              }
                              onClick={(e) => e.stopPropagation()}
                              disabled={!isSelected}
                              slotProps={{
                                input: {
                                  sx: {
                                    fontSize: theme.fontSizes.body,
                                    fontFamily: '"Google Sans", sans-serif',
                                    color: isSelected ? "inherit" : "#9e9e9e",
                                    minWidth: 0,
                                  },
                                },
                              }}
                              sx={{
                                minWidth: 0,
                                flexShrink: 1,
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: theme.fontSizes.helper,
                                color: isSelected ? "#5f6368" : "#9e9e9e",
                                fontFamily: '"Google Sans", sans-serif',
                                minWidth: "60px",
                                textAlign: "right",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                              }}
                            >
                              {formatSegmentDistance(segmentDistance)}
                            </Typography>
                            {/* Delete button - only show for manual and intersections modes */}
                            {(segmentationMode === "manual" ||
                              segmentationMode === "intersections") && (
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteSegment(
                                    seg.segmentOrder || index + 1,
                                  )
                                }}
                                sx={{
                                  minWidth: 32,
                                  minHeight: 32,
                                  padding: "6px",
                                  color: isSelected ? "#5f6368" : "#9e9e9e",
                                  opacity: isSelected ? 1 : 0.6,
                                  borderRadius: "6px",
                                  transition: "all 0.15s ease",
                                  "&:hover": {
                                    backgroundColor: "#fce8e6",
                                    color: "#d93025",
                                    opacity: 1,
                                  },
                                }}
                                title="Delete segment"
                              >
                                <Delete sx={{ fontSize: 18 }} />
                              </IconButton>
                            )}
                          </Box>
                        </ListItem>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <List dense disablePadding>
                  {sortedPreviewSegments.map((seg, index: number) => {
                    const isSelected = selectedIds.has(seg.id)
                    const segmentDistance =
                      (seg as { length?: number; distanceKm?: number })
                        .length ||
                      (
                        seg as {
                          length?: number
                          distanceKm?: number
                        }
                      ).distanceKm ||
                      0

                    return (
                      <ListItem
                        key={seg.id}
                        disableGutters
                        onMouseEnter={() => onHoveredSegmentIdChange(seg.id)}
                        onMouseLeave={() => onHoveredSegmentIdChange(null)}
                        sx={{
                          py: 0.5,
                          borderBottom: "1px solid #f1f3f4",
                          opacity: isSelected ? 1 : 0.5,
                          "&:last-child": {
                            borderBottom: "none",
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Checkbox
                            edge="start"
                            checked={isSelected}
                            tabIndex={-1}
                            disableRipple
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleSelect(seg.id)
                            }}
                          />
                        </ListItemIcon>
                        <Box
                          sx={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <TextField
                            size="small"
                            variant="standard"
                            fullWidth
                            placeholder={`Segment ${index + 1}`}
                            value={segmentNames.get(seg.id) || ""}
                            onChange={(e) =>
                              onSegmentNameChange(seg.id, e.target.value)
                            }
                            onClick={(e) => e.stopPropagation()}
                            disabled={!isSelected}
                            slotProps={{
                              input: {
                                sx: {
                                  fontSize: theme.fontSizes.body,
                                  fontFamily: '"Google Sans", sans-serif',
                                  color: isSelected ? "inherit" : "#9e9e9e",
                                  minWidth: 0,
                                },
                              },
                            }}
                            sx={{
                              minWidth: 0,
                              flexShrink: 1,
                            }}
                          />
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: theme.fontSizes.helper,
                              color: isSelected ? "#5f6368" : "#9e9e9e",
                              fontFamily: '"Google Sans", sans-serif',
                              minWidth: "60px",
                              textAlign: "right",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {formatSegmentDistance(segmentDistance)}
                          </Typography>
                          {/* Delete button - only show for manual and intersections modes */}
                          {(segmentationMode === "manual" ||
                            segmentationMode === "intersections") && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteSegment(
                                  seg.segmentOrder || index + 1,
                                )
                              }}
                              sx={{
                                minWidth: 32,
                                minHeight: 32,
                                padding: "6px",
                                color: isSelected ? "#5f6368" : "#9e9e9e",
                                opacity: isSelected ? 1 : 0.6,
                                borderRadius: "6px",
                                transition: "all 0.15s ease",
                                "&:hover": {
                                  backgroundColor: "#fce8e6",
                                  color: "#d93025",
                                  opacity: 1,
                                },
                              }}
                              title="Delete segment"
                            >
                              <Delete sx={{ fontSize: 18 }} />
                            </IconButton>
                          )}
                        </Box>
                      </ListItem>
                    )
                  })}
                </List>
              )}
            </Box>
          )}

          {/* Empty State */}
          {!segmentation.isCalculating &&
            sortedPreviewSegments.length === 0 &&
            !segmentation.error && (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: theme.fontSizes.body,
                    color: "#5f6368",
                    fontFamily: '"Google Sans", sans-serif',
                  }}
                >
                  {segmentationMode === "distance"
                    ? "Enter distance and click OK to generate segments"
                    : segmentationMode === "intersections"
                      ? "Click 'Auto' to automatically segment at intersections"
                      : "Click on the route to add cut points"}
                </Typography>
              </Box>
            )}
        </Box>
      </Box>
    </RightPanel>
  )
}

export default SegmentationStage
