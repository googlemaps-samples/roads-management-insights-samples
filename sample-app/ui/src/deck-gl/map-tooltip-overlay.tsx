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

import { useMap } from "@vis.gl/react-google-maps"
import React, { useEffect, useRef, useState } from "react"
import ReactDOM from "react-dom"

import DeckTooltip from "./deck-tooltip"

// Common data source interface that covers all possible data structures
interface TooltipDataSource {
  id?: string
  routeId?: string
  duration?: number
  averageDuration?: number
  staticDuration?: number
  delay?: number
  delayTime?: number
  delayRatio?: number
  averageSpeed?: number
  length?: number
  color?: string
  path?: (google.maps.LatLng | { lat: number; lng: number })[]
  name?: string
  type?: string
  congestionLevel?: string
  historicalRouteId?: string
}

// Props for MapTooltipOverlay component
interface MapTooltipOverlayProps {
  position: [number, number]
  hoveredObject: {
    properties?: TooltipDataSource
  } | null
  mode: string
  usecase?: string
  onClose: () => void
}

/**
 * A component that renders a tooltip directly on the map using a custom overlay
 */
export const MapTooltipOverlay: React.FC<MapTooltipOverlayProps> = ({
  position,
  hoveredObject,
  mode,
  usecase,
  onClose,
}) => {
  const map = useMap()
  const [positionBelow, setPositionBelow] = useState(false)
  const [markerDiv, setMarkerDiv] = useState<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Create a marker element
  useEffect(() => {
    if (!map || !position) return

    // Create a div for the marker
    const div = document.createElement("div")
    div.className = "tooltip-marker"
    div.style.position = "absolute"
    div.style.zIndex = "1000"

    // Create a custom overlay class to avoid compatibility issues
    class TooltipOverlay extends google.maps.OverlayView {
      private div: HTMLElement
      private position: google.maps.LatLng

      constructor(div: HTMLElement, position: google.maps.LatLng) {
        super()
        this.div = div
        this.position = position
      }

      onAdd() {
        const panes = this.getPanes()
        if (panes && panes.overlayMouseTarget) {
          panes.overlayMouseTarget.appendChild(this.div)
        }
      }

      draw() {
        const projection = this.getProjection()
        if (!projection) return

        const point = projection.fromLatLngToDivPixel(this.position)
        if (point) {
          this.div.style.left = point.x + "px"
          this.div.style.top = point.y + "px"

          // Check if tooltip would go above viewport and adjust position
          if (point.y < 220) {
            // Approximate tooltip height
            setPositionBelow(true)
          } else {
            setPositionBelow(false)
          }
        }
      }

      onRemove() {
        if (this.div.parentNode) {
          // this.div.parentNode.removeChild(this.div)
        }
      }
    }

    // Create the position object
    const latLng = new google.maps.LatLng(position[1], position[0])

    // Create and add the overlay
    const tooltipOverlay = new TooltipOverlay(div, latLng)
    tooltipOverlay.setMap(map)
    setMarkerDiv(div)

    // Clean up - use a safer approach
    return () => {
      // Remove the overlay from the map
      tooltipOverlay.setMap(null)

      // Ensure the div is removed from DOM even if overlay cleanup fails
      if (div.parentNode) {
        // div.parentNode.removeChild(div)
      }
    }
  }, [map, position])

  // Render the tooltip into the marker div using React Portal
  return markerDiv
    ? ReactDOM.createPortal(
        <div ref={tooltipRef}>
          <DeckTooltip
            hoveredObject={hoveredObject}
            mode={mode}
            usecase={usecase}
            positionBelow={positionBelow}
            onClose={onClose}
          />
        </div>,
        markerDiv,
      )
    : null
}

export default MapTooltipOverlay
