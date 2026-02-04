// Copyright 2025 Google LLC
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

import React, { useMemo, useRef } from "react"
import { createPortal } from "react-dom"

import { PolygonTooltip } from "./deck-tooltip"

// Props for MapPolygonTooltipOverlay component
interface MapPolygonTooltipOverlayProps {
  mousePosition: [number, number]
  hoveredPolygon: any
  polygonStats: any
  mode: string
  usecase?: string
  onClose: () => void
}

/**
 * A component that renders a polygon tooltip directly on the map using a custom overlay
 */
export const MapPolygonTooltipOverlay: React.FC<MapPolygonTooltipOverlayProps> =
  React.memo(
    ({
      mousePosition,
      hoveredPolygon,
      polygonStats,
      mode,
      usecase,
      onClose,
    }) => {
      const tooltipRef = useRef<HTMLDivElement>(null)

      // Memoize the calculated position to avoid recalculating on every render
      const tooltipPosition = useMemo(() => {
        const screenX = mousePosition[0] + 10 // Offset slightly from cursor
        const screenY = Math.max(mousePosition[1] - 10, 80) // Ensure tooltip is below header (header is ~60px)
        return { screenX, screenY }
      }, [mousePosition])

      // Memoize the inline styles to prevent object recreation on every render
      const tooltipStyles = useMemo(
        () => ({
          position: "fixed" as const,
          left: `${tooltipPosition.screenX}px`,
          top: `${tooltipPosition.screenY}px`,
          zIndex: 2147483647, // Maximum z-index value
          pointerEvents: "none" as const, // Allow clicks to pass through
        }),
        [tooltipPosition],
      )

      // Use portal to render tooltip at document body level to avoid z-index issues
      if (typeof document === "undefined") {
        return null
      }

      return createPortal(
        <div
          ref={tooltipRef}
          style={tooltipStyles}
          className="polygon-tooltip-overlay"
        >
          <PolygonTooltip
            hoveredPolygon={hoveredPolygon}
            polygonStats={polygonStats}
            mode={mode}
            usecase={usecase}
            positionBelow={false}
            onClose={onClose}
          />
        </div>,
        document.body,
      )
    },
  )

export default MapPolygonTooltipOverlay
