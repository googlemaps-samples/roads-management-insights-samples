// ui/src/components/map/DrawingAnnotations.tsx
import { useMap } from "@vis.gl/react-google-maps"
import React, { useEffect, useState } from "react"

import { useMapCursorPosition } from "../../hooks/use-map-cursor-position"
import { useLayerStore, useProjectWorkspaceStore } from "../../stores"
import { latLngToScreen } from "../../utils/distance-utils"

interface AnnotationTooltipProps {
  x: number
  y: number
  message: string
  arrowPosition?: "top" | "bottom" | "left" | "right"
}

const AnnotationTooltip: React.FC<AnnotationTooltipProps> = ({
  x,
  y,
  message,
  arrowPosition = "bottom",
}) => {
  const getArrowClass = () => {
    switch (arrowPosition) {
      case "top":
        return "bottom-full left-1/2 -translate-x-1/2 border-t-transparent border-r-transparent border-l-transparent border-b-white"
      case "bottom":
        return "top-full left-1/2 -translate-x-1/2 border-b-transparent border-r-transparent border-l-transparent border-t-white"
      case "left":
        return "right-full top-1/2 -translate-y-1/2 border-l-transparent border-t-transparent border-b-transparent border-r-white"
      case "right":
        return "left-full top-1/2 -translate-y-1/2 border-r-transparent border-t-transparent border-b-transparent border-l-white"
    }
  }

  return (
    <div
      className="fixed z-[10001] pointer-events-none animate-fade-in"
      style={{
        left: `${x}px`,
        top: `${y - 10}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="relative bg-white rounded-lg shadow-lg px-3 py-2 text-sm text-gray-700 whitespace-nowrap border border-gray-200">
        {message}
        {/* Arrow */}
        <div
          className={`absolute ${getArrowClass()} border-4`}
          style={{
            marginTop: arrowPosition === "bottom" ? "-1px" : undefined,
            marginBottom: arrowPosition === "top" ? "-1px" : undefined,
            marginLeft: arrowPosition === "right" ? "-1px" : undefined,
            marginRight: arrowPosition === "left" ? "-1px" : undefined,
          }}
        />
      </div>
    </div>
  )
}

/**
 * Component that shows interactive annotations during polygon drawing
 * - Shows "Click on map to add point" when no points added
 * - Shows instructions as user adds points
 * - Highlights starting point and shows "Click here to close" when near it
 */
export default function DrawingAnnotations() {
  const map = useMap("main-map")
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const polygonDrawing = useLayerStore((state) => state.polygonDrawing)
  const lassoDrawing = useLayerStore((state) => state.lassoDrawing)
  const isPolygonCompleted = useLayerStore(
    (state) =>
      !state.polygonDrawing.isDrawing &&
      state.polygonDrawing.points.length >= 3,
  )
  const isDrawing = useLayerStore((state) => state.polygonDrawing.isDrawing)
  // console.log("isDrawing", isDrawing)
  // console.log("isPolygonCompleted", isPolygonCompleted)

  // Get points based on mode
  const points =
    mapMode === "polygon_drawing" ? polygonDrawing.points : lassoDrawing.points

  // Track cursor position
  const cursorPosition = useMapCursorPosition({
    mapId: "main-map",
    enabled: mapMode === "polygon_drawing" || mapMode === "lasso_selection",
    throttleMs: 50,
  })

  const [tooltipState, setTooltipState] = useState<{
    x: number
    y: number
    message: string
    arrowPosition: "top" | "bottom" | "left" | "right"
  } | null>(null)

  const setIsNearStartPoint = useLayerStore(
    (state) => state.setIsNearStartPoint,
  )

  // Check if cursor is near starting point
  useEffect(() => {
    if (
      !map ||
      !cursorPosition ||
      points.length < 2 ||
      mapMode !== "polygon_drawing"
    ) {
      setIsNearStartPoint(false)
      return
    }

    const googleMap = map as unknown as google.maps.Map
    const startPoint = points[0]
    const [startLng, startLat] = startPoint

    // Convert starting point to screen coordinates
    const startScreen = latLngToScreen(googleMap, startLat, startLng)
    if (!startScreen) {
      setIsNearStartPoint(false)
      return
    }

    // Get map container bounds
    const mapDiv = googleMap.getDiv()
    if (!mapDiv) return

    const rect = mapDiv.getBoundingClientRect()
    const cursorScreenX = cursorPosition.screenX - rect.left
    const cursorScreenY = cursorPosition.screenY - rect.top

    // Calculate distance in pixels
    const distance = Math.sqrt(
      Math.pow(cursorScreenX - startScreen.x, 2) +
        Math.pow(cursorScreenY - startScreen.y, 2),
    )

    // Threshold: 30 pixels
    const threshold = 30
    const near = distance < threshold
    setIsNearStartPoint(near)

    console.log("points", points)

    // when only 1 point , still it has an array like :
    // [
    //     [
    //         54.522165696,
    //         24.423914905
    //     ],
    //     [
    //         54.522165696,
    //         24.423914905
    //     ],
    //     [
    //         54.522165696,
    //         24.423914905
    //     ]
    // ]

    // Update tooltip when near starting point

    if (isPolygonCompleted) {
      setTooltipState(null)
      return
    }
    if (near && points.length >= 3) {
      setTooltipState({
        x: cursorPosition.screenX,
        y: cursorPosition.screenY,
        message: "Click here to close polygon",
        arrowPosition: "bottom",
      })
    } else {
      // Show general instruction
      if (points.length >= 3) {
        setTooltipState({
          x: cursorPosition.screenX,
          y: cursorPosition.screenY,
          message: "Click to add point, Click again to complete",
          arrowPosition: "bottom",
        })
      } else {
        setTooltipState({
          x: cursorPosition.screenX,
          y: cursorPosition.screenY,
          message: "Add another point",
          arrowPosition: "bottom",
        })
      }
    }
  }, [map, cursorPosition, points, mapMode])

  // Show initial instruction when no points
  useEffect(() => {
    if (mapMode === "polygon_drawing" && points.length === 0) {
      if (cursorPosition) {
        // Update tooltip position when cursor is available
        setTooltipState({
          x: cursorPosition.screenX,
          y: cursorPosition.screenY,
          message: "Add point",
          arrowPosition: "bottom",
        })
      }
      // Don't clear tooltip if cursorPosition is null - keep it visible
      // It will update when cursor moves back over the map
    } else if (points.length > 0) {
      // Only clear if we have points (tooltip is handled by other useEffect)
      // Don't clear here to avoid flickering
    }
  }, [mapMode, points.length, cursorPosition])

  // Hide tooltip when cursor leaves map or mode changes
  useEffect(() => {
    if (mapMode !== "polygon_drawing" && mapMode !== "lasso_selection") {
      setTooltipState(null)
      setIsNearStartPoint(false)
    }
  }, [mapMode, setIsNearStartPoint])

  // Reset state when points are cleared
  useEffect(() => {
    if (points.length === 0) {
      setIsNearStartPoint(false)
    }
  }, [points.length, setIsNearStartPoint])

  // Don't render if not in drawing mode
  if (mapMode !== "polygon_drawing" && mapMode !== "lasso_selection") {
    return null
  }

  return (
    <>
      {/* Tooltip */}
      {tooltipState && (
        <AnnotationTooltip
          x={tooltipState.x}
          y={tooltipState.y}
          message={tooltipState.message}
          arrowPosition={tooltipState.arrowPosition}
        />
      )}

      {/* Starting point highlight will be handled by DeckGL layer */}
    </>
  )
}
