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

// ui/src/hooks/use-map-cursor-position.ts
import { useMap } from "@vis.gl/react-google-maps"
import { useEffect, useRef, useState } from "react"

interface CursorPosition {
  lat: number
  lng: number
  screenX: number
  screenY: number
}

interface UseMapCursorPositionOptions {
  mapId: string
  enabled?: boolean
  throttleMs?: number
}

/**
 * Hook to track cursor position on Google Maps
 * Converts screen coordinates to lat/lng
 */
export const useMapCursorPosition = ({
  mapId,
  enabled = true,
  throttleMs = 50,
}: UseMapCursorPositionOptions) => {
  const map = useMap(mapId)
  const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(
    null,
  )
  const throttleRef = useRef<NodeJS.Timeout | null>(null)
  const overlayRef = useRef<google.maps.OverlayView | null>(null)
  const mousePosRef = useRef<{
    x: number
    y: number
    clientX: number
    clientY: number
  } | null>(null)

  useEffect(() => {
    if (!map || !enabled) {
      setCursorPosition(null)
      // Clean up overlay if disabled
      if (overlayRef.current) {
        try {
          overlayRef.current.setMap(null)
        } catch (e) {
          // Ignore cleanup errors
        }
        overlayRef.current = null
      }
      return
    }

    const googleMap = map as unknown as google.maps.Map
    const mapDiv = googleMap.getDiv()
    if (!mapDiv) return

    // Create overlay once with proper lifecycle methods
    if (!overlayRef.current) {
      overlayRef.current = new google.maps.OverlayView()
      overlayRef.current.onAdd = function () {
        // Overlay added to map
      }
      overlayRef.current.onRemove = function () {
        // Overlay removed from map - this prevents the remove() error
      }
      overlayRef.current.draw = function () {
        const proj = this.getProjection()
        if (proj && mousePosRef.current) {
          const { x, y, clientX, clientY } = mousePosRef.current
          const point = new google.maps.Point(x, y)
          const latLng = proj.fromContainerPixelToLatLng(point)

          if (latLng) {
            setCursorPosition({
              lat: latLng.lat(),
              lng: latLng.lng(),
              screenX: clientX,
              screenY: clientY,
            })
          }
        }
      }
      overlayRef.current.setMap(googleMap)
    }

    const handleMouseMove = (event: MouseEvent) => {
      // Throttle updates for performance
      if (throttleRef.current) {
        clearTimeout(throttleRef.current)
      }

      throttleRef.current = setTimeout(() => {
        try {
          // Get mouse position relative to map container
          const rect = mapDiv.getBoundingClientRect()
          const x = event.clientX - rect.left
          const y = event.clientY - rect.top

          // Store position in ref
          mousePosRef.current = {
            x,
            y,
            clientX: event.clientX,
            clientY: event.clientY,
          }

          // Trigger redraw
          if (overlayRef.current) {
            overlayRef.current.draw()
          }
        } catch (error) {
          console.warn("Failed to convert cursor position:", error)
        }
      }, throttleMs)
    }

    const handleMouseLeave = () => {
      setCursorPosition(null)
      mousePosRef.current = null
    }

    mapDiv.addEventListener("mousemove", handleMouseMove)
    mapDiv.addEventListener("mouseleave", handleMouseLeave)

    return () => {
      mapDiv.removeEventListener("mousemove", handleMouseMove)
      mapDiv.removeEventListener("mouseleave", handleMouseLeave)
      if (throttleRef.current) {
        clearTimeout(throttleRef.current)
      }
      // Clean up overlay
      if (overlayRef.current) {
        try {
          overlayRef.current.setMap(null)
        } catch (e) {
          // Ignore cleanup errors
        }
        overlayRef.current = null
      }
    }
  }, [map, enabled, throttleMs])

  return cursorPosition
}
