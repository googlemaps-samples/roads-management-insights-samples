import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Close,
  ContentCopy,
  DragIndicator,
  SwapVert,
} from "@mui/icons-material"
import { Box, IconButton, Tooltip, Typography, useTheme } from "@mui/material"
import React from "react"

import { PRIMARY_BLUE, PRIMARY_RED_GOOGLE } from "../../constants/colors"
import { toast } from "../../utils/toast"

interface RoutePoint {
  id: string
  coordinates: { lat: number; lng: number }
}

interface RoutePointsListProps {
  // Unified format: first point is origin, last is destination, middle are waypoints
  points: RoutePoint[]
  onRemove?: (pointId: string) => void
  onReorder?: (activeId: string, overId: string) => void
  onSwapStartEnd?: () => void
  scrollableMaxHeight?: number
  // Control which features are enabled
  showReorderButtons?: boolean
  showDeleteButtons?: boolean
  showSwapButton?: boolean
}

// Sortable item component for drag and drop
interface SortablePointItemProps {
  point: RoutePoint
  index: number
  total: number
  isOrigin: boolean
  isDestination: boolean
  isWaypoint: boolean
  onRemove?: (pointId: string) => void
  showDeleteButtons: boolean
  onRef?: (id: string, element: HTMLElement | null) => void
}

const SortablePointItem: React.FC<SortablePointItemProps> = ({
  point,
  index,
  total,
  isOrigin,
  isDestination,
  isWaypoint,
  onRemove,
  showDeleteButtons,
  onRef,
}) => {
  const theme = useTheme()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: point.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const formatCoordinate = () => {
    return `${point.coordinates.lat.toFixed(2)}, ${point.coordinates.lng.toFixed(2)}`
  }

  const copyToClipboard = () => {
    const text = `${point.coordinates.lat}, ${point.coordinates.lng}`
    navigator.clipboard.writeText(text)
    toast.success("Coordinates copied to clipboard", {
      duration: 1000,
    })
  }

  // Determine label based on type
  let label: string
  let icon: React.ReactNode

  if (isOrigin) {
    label = `Origin`
    icon = (
      <svg width="16" height="16" viewBox="0 0 32 32">
        <circle
          cx="16"
          cy="16"
          r="13"
          fill="none"
          stroke="white"
          strokeWidth="1"
        />
        <circle
          cx="16"
          cy="16"
          r="10"
          fill="white"
          stroke="#202124"
          strokeWidth="6"
        />
      </svg>
    )
  } else if (isDestination) {
    label = `Destination`
    icon = (
      <svg
        width="16"
        height="16"
        viewBox="0 0 48 72"
        style={{ filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))" }}
      >
        <path
          d="M24 0 C13 0 4 9 4 20 C4 34 17 48 22.5 67 C22.8 68 23.3 72 24 72 C24.7 72 25.2 68 25.5 67 C31 48 44 34 44 20 C44 9 35 0 24 0Z"
          fill={PRIMARY_RED_GOOGLE}
          stroke="#b11313"
          strokeWidth="1"
        />
        <circle cx="24" cy="20" r="8" fill="#b11313" />
      </svg>
    )
  } else {
    // Waypoint
    const waypointNumber = index // index already accounts for origin at position 0
    label = `Waypoint ${waypointNumber}`
    icon = (
      <Box
        sx={{
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          backgroundColor: PRIMARY_BLUE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "#ffffff",
          fontSize: theme.fontSizes?.caption || "0.75rem",
          fontWeight: 600,
          fontFamily: '"Google Sans", sans-serif',
        }}
      >
        {waypointNumber}
      </Box>
    )
  }

  return (
    <Box
      ref={(el: HTMLElement | null) => {
        setNodeRef(el)
        if (onRef) onRef(point.id, el)
      }}
      style={style}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,

        py: 1.5,
        position: "relative",
        "&:hover": {
          backgroundColor: "#f8f9fa",
          borderRadius: "4px",
        },
        transition: "background-color 0.15s",
      }}
    >
      {/* Drag Handle */}
      <Box
        {...attributes}
        {...listeners}
        sx={{
          cursor: isDragging ? "grabbing" : "grab",
          display: "flex",
          alignItems: "center",
          color: "#5f6368",
          "&:hover": {
            color: "#202124",
          },
        }}
      >
        <DragIndicator sx={{ fontSize: "18px" }} />
      </Box>

      {/* Icon */}
      <Box
        sx={{
          width: "18px",
          height: "18px",
          flexShrink: 0,
          display: "flex",
          alignItems: isDestination ? "flex-start" : "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </Box>

      {/* Label */}
      <Typography
        sx={{
          fontSize: theme.fontSizes?.body || "0.875rem",
          color: "#202124",
          fontFamily: '"Google Sans", sans-serif',
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={label}
      >
        {label}
      </Typography>

      {/* Action Buttons */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        {/* Copy to Clipboard Button */}
        <IconButton
          aria-label="copy coordinates"
          title="Copy coordinates to clipboard"
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            copyToClipboard()
          }}
          sx={{
            color: "#5f6368",
            padding: "2px",
            "&:hover": {
              backgroundColor: "#e8f0fe",
              color: PRIMARY_BLUE,
            },
            transition: "all 0.15s",
          }}
        >
          <ContentCopy sx={{ fontSize: "14px" }} />
        </IconButton>

        {/* Delete Button */}
        {showDeleteButtons && onRemove && (
          <IconButton
            aria-label={`delete ${isOrigin ? "origin" : isDestination ? "destination" : "waypoint"}`}
            title={`Remove point`}
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(point.id)
            }}
            sx={{
              color: "#5f6368",
              padding: "2px",
              "&:hover": {
                backgroundColor: "#fce8e6",
                color: "#d93025",
              },
              transition: "all 0.15s",
            }}
          >
            <Close sx={{ fontSize: "14px" }} />
          </IconButton>
        )}
      </Box>
    </Box>
  )
}

const RoutePointsList: React.FC<RoutePointsListProps> = ({
  points,
  onRemove,
  onReorder,
  onSwapStartEnd,
  scrollableMaxHeight = 400,
  showDeleteButtons = true,
  showSwapButton = true,
}) => {
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null)
  const pointRefs = React.useRef<Record<string, HTMLElement | null>>({})
  const prevPointsCountRef = React.useRef<number>(0)

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  if (points.length === 0) {
    return null
  }

  const waypointPoints = points.length > 2 ? points.slice(1, -1) : []
  const hasWaypoints = waypointPoints.length > 0

  // Auto-scroll to newly added point ONLY (not on removal or reordering)
  React.useEffect(() => {
    const currentPointsCount = points.length

    // Initialize previous count if not set
    if (prevPointsCountRef.current === 0) {
      prevPointsCountRef.current = currentPointsCount
      return
    }

    const previousCount = prevPointsCountRef.current

    // Only scroll if points count INCREASED (point added)
    // Will NOT scroll if:
    // - Points count decreased (point removed)
    // - Points count stayed same (points reordered - won't trigger this effect anyway)
    if (currentPointsCount > previousCount && currentPointsCount > 0) {
      // Wait for DOM to update
      const timeoutId = setTimeout(() => {
        // Scroll to bottom (where the latest waypoint would be, before destination)
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            top: scrollContainerRef.current.scrollHeight,
            behavior: "smooth",
          })
        }
      }, 100) // Small delay for DOM update

      // Update the previous count only when we actually scroll
      prevPointsCountRef.current = currentPointsCount

      return () => clearTimeout(timeoutId)
    }

    // Update the previous count even if we didn't scroll
    prevPointsCountRef.current = currentPointsCount
  }, [points.length])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    if (onReorder) {
      onReorder(active.id as string, over.id as string)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={points.map((pt) => pt.id)}
        strategy={verticalListSortingStrategy}
      >
        <Box
          ref={scrollContainerRef}
          className="pretty-scrollbar"
          sx={{
            maxHeight: `${scrollableMaxHeight}px`,
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
            px: "20px",
          }}
        >
          {/* Render all points with drag and drop */}
          {points.map((point, index) => {
            const isOrigin = index === 0
            const isDestination = index === points.length - 1
            const isWaypoint = !isOrigin && !isDestination

            return (
              <React.Fragment key={point.id}>
                {/* Render the sortable point */}
                <SortablePointItem
                  point={point}
                  index={index}
                  total={points.length}
                  isOrigin={isOrigin}
                  isDestination={isDestination}
                  isWaypoint={isWaypoint}
                  onRemove={onRemove}
                  showDeleteButtons={showDeleteButtons}
                  onRef={(id, element) => {
                    pointRefs.current[id] = element
                  }}
                />

                {/* Horizontal line separator */}
                {!isDestination && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      position: "relative",
                      py: 0,
                      height: 0,
                    }}
                  >
                    <Box
                      sx={{
                        flex: 1,
                        borderTop: "1px solid #dadce0",
                      }}
                    />
                    {/* Swap Icon (only between origin and destination when no waypoints) */}
                    {!hasWaypoints &&
                      isOrigin &&
                      showSwapButton &&
                      onSwapStartEnd && (
                        <Tooltip
                          title="Swap start and end points"
                          placement="top"
                          arrow
                        >
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation()
                              onSwapStartEnd()
                            }}
                            sx={{
                              position: "absolute",
                              right: "8px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              color: "#5f6368",
                              padding: "2px",
                              zIndex: 1000,
                              backgroundColor: "#ffffff",
                              "&:hover": {
                                backgroundColor: "#f1f3f4",
                                color: "#202124",
                              },
                            }}
                          >
                            <SwapVert sx={{ fontSize: "16px" }} />
                          </IconButton>
                        </Tooltip>
                      )}
                  </Box>
                )}
              </React.Fragment>
            )
          })}
        </Box>
      </SortableContext>
    </DndContext>
  )
}

export default RoutePointsList
