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

// ui/src/hooks/useTerraDraw.ts
import { useMap } from "@vis.gl/react-google-maps"
import { useCallback, useEffect, useRef } from "react"
import { TerraDraw } from "terra-draw"
import { TerraDrawPolygonMode } from "terra-draw"
import { TerraDrawGoogleMapsAdapter } from "terra-draw-google-maps-adapter"

import { useLayerStore, useProjectWorkspaceStore } from "../stores"
import { isPointInBoundary } from "../utils/boundary-validation"
import { toast } from "../utils/toast"

interface UseTerraDrawOptions {
  mapId: string
  isActive: boolean
  mode: "polygon"
}

export const useTerraDraw = ({
  mapId,
  isActive,
  mode,
}: UseTerraDrawOptions) => {
  const terraDrawRef = useRef<TerraDraw | null>(null)
  const adapterRef = useRef<TerraDrawGoogleMapsAdapter | null>(null)
  const changeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const startPolygonDrawing = useLayerStore(
    (state) => state.startPolygonDrawing,
  )
  const syncPolygonPointsFromTerraDraw = useLayerStore(
    (state) => state.syncPolygonPointsFromTerraDraw,
  )
  const startLassoDrawing = useLayerStore((state) => state.startLassoDrawing)
  const setLassoPoints = useLayerStore((state) => state.setLassoPoints)
  const finishLassoDrawing = useLayerStore((state) => state.finishLassoDrawing)
  const clearLassoDrawing = useLayerStore((state) => state.clearLassoDrawing)
  const polygonDrawing = useLayerStore((state) => state.polygonDrawing)
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const drawingCompletionMenuPosition = useLayerStore(
    (state) => state.drawingCompletionMenuPosition,
  )

  // Get map instance using useMap hook (must be called inside Map component context)
  const map = useMap(mapId)

  // Helper function to reset cursor on map
  const resetMapCursor = useCallback((mapInstance: any) => {
    try {
      const googleMap = mapInstance as unknown as google.maps.Map
      if (googleMap && googleMap.getDiv) {
        const mapDiv = googleMap.getDiv()
        if (mapDiv) {
          // Force reset cursor on map container - try multiple methods
          mapDiv.style.cursor = ""
          mapDiv.style.removeProperty("cursor")
          mapDiv.style.setProperty("cursor", "default", "important")

          // CRITICAL: Google Maps uses canvas elements - Terra Draw likely sets cursor on these
          const canvasElements = mapDiv.querySelectorAll("canvas")
          canvasElements.forEach((canvas) => {
            if (canvas instanceof HTMLElement) {
              canvas.style.cursor = ""
              canvas.style.removeProperty("cursor")
              canvas.style.setProperty("cursor", "default", "important")
              // Also remove any event listeners that might be setting cursor
              // We can't directly remove them, but we can override the style
            }
          })

          // Reset cursor on ALL elements within the map (Terra Draw might set it anywhere)
          const allElements = mapDiv.querySelectorAll("*")
          allElements.forEach((el) => {
            if (el instanceof HTMLElement) {
              // Check computed style to see if cursor is set
              const computedCursor = window.getComputedStyle(el).cursor
              // If cursor is crosshair or any non-default value, reset it
              if (
                computedCursor &&
                computedCursor !== "default" &&
                computedCursor !== "auto" &&
                computedCursor !== "inherit"
              ) {
                el.style.cursor = ""
                el.style.removeProperty("cursor")
                el.style.setProperty("cursor", "default", "important")
              }
              // Also clear any inline cursor styles
              if (el.style.cursor) {
                el.style.cursor = ""
                el.style.removeProperty("cursor")
              }
            }
          })

          // Use multiple requestAnimationFrame calls to ensure DOM updates are processed
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Final reset to ensure it sticks - remove important flag
              mapDiv.style.removeProperty("cursor")
              mapDiv.style.cursor = ""

              // Reset canvas elements again
              canvasElements.forEach((canvas) => {
                if (canvas instanceof HTMLElement) {
                  canvas.style.removeProperty("cursor")
                  canvas.style.cursor = ""
                }
              })
            })
          })
        }
      }
    } catch (error) {
      console.warn("Failed to reset cursor:", error)
    }
  }, [])

  // Reset cursor when exiting polygon/lasso modes
  useEffect(() => {
    const isPolygonMode = mode === "polygon"
    const isLassoMode = mapMode === "lasso_selection"
    const shouldBeActive = isPolygonMode || isLassoMode

    // If we're not in polygon/lasso mode, reset cursor
    if (!shouldBeActive && map) {
      resetMapCursor(map)
    }
  }, [map, mode, mapMode, resetMapCursor])

  useEffect(() => {
    // Check actual map modes, not the TerraDraw mode prop (which is always "polygon")
    const isPolygonDrawingMode = mapMode === "polygon_drawing"
    const isLassoSelectionMode = mapMode === "lasso_selection"
    // Check if we're in road_selection mode with lasso selection (sub-mode)
    const roadImportState = useLayerStore.getState().roadImport
    const isRoadSelectionLasso =
      mapMode === "road_selection" && roadImportState.selectionMode === "lasso"

    if (!map || !isActive) {
      clearLassoDrawing()
      // Cleanup if map is not available or not active
      if (terraDrawRef.current) {
        try {
          terraDrawRef.current.stop()
          // Remove Terra Draw active class
          const googleMap = map as unknown as google.maps.Map
          if (googleMap && googleMap.getDiv) {
            googleMap.getDiv().classList.remove("terra-draw-active")
          }
          // Immediately reset cursor after stopping
          if (map) {
            resetMapCursor(map)
            // Also try resetting on document level in case Terra Draw set it globally
            document.body.style.cursor = ""
            if (document.documentElement) {
              document.documentElement.style.cursor = ""
            }
          }
        } catch (error) {
          console.error("Error stopping Terra Draw:", error)
        }
        terraDrawRef.current = null
      }
      if (adapterRef.current) {
        adapterRef.current = null
      }
      // Reset cursor style when Terra Draw is stopped (fallback)
      if (map) {
        const googleMap = map as unknown as google.maps.Map
        if (googleMap && googleMap.getDiv) {
          googleMap.getDiv().classList.remove("terra-draw-active")
        }
        resetMapCursor(map)
      }
      return
    }

    try {
      const adapter = new TerraDrawGoogleMapsAdapter({
        lib: google.maps,
        map,
      })
      adapterRef.current = adapter

      const draw = new TerraDraw({
        adapter,
        modes: [new TerraDrawPolygonMode()],
      })

      terraDrawRef.current = draw
      draw.start()
      draw.setMode("polygon")

      // Add class to map container to indicate Terra Draw is active
      const googleMapInstance = map as unknown as google.maps.Map
      if (googleMapInstance && googleMapInstance.getDiv) {
        const mapDiv = googleMapInstance.getDiv()
        if (mapDiv) {
          mapDiv.classList.add("terra-draw-active")
        }
      }

      // Clear any existing polygons when starting (prevent multiple polygons)
      if (
        isPolygonDrawingMode ||
        isLassoSelectionMode ||
        isRoadSelectionLasso
      ) {
        try {
          const existingFeatures = draw.getSnapshot()
          if (existingFeatures && Array.isArray(existingFeatures)) {
            const existingPolygons = existingFeatures.filter(
              (f: any) => f?.geometry?.type === "Polygon",
            )
            if (existingPolygons.length > 0) {
              // Use clear() for more reliable removal
              draw.clear()
              if (isPolygonDrawingMode) {
                syncPolygonPointsFromTerraDraw([])
              } else if (isLassoSelectionMode || isRoadSelectionLasso) {
                setLassoPoints([])
              }
            }
          }
        } catch (error) {
          console.error("Error checking for existing polygons:", error)
        }
      }

      // Only clear temporal history when entering HIGH-LEVEL modes (polygon_drawing or lasso_selection)
      // Do NOT clear when switching selection modes WITHIN road_selection (single/lasso/multi-select)
      // isRoadSelectionLasso means we're in road_selection mode with lasso selection, which is a sub-mode
      const shouldClearHistory = isPolygonDrawingMode || isLassoSelectionMode
      if (shouldClearHistory) {
        console.log(
          `🔄 [useTerraDraw] Entering ${isPolygonDrawingMode ? "polygon_drawing" : "lasso_selection"} mode - clearing temporal history`,
        )
        const temporal = useLayerStore.temporal.getState()
        temporal.clear()
      } else {
        console.log(
          `🔄 [useTerraDraw] Activating TerraDraw in road_selection mode (${roadImportState.selectionMode}) - preserving temporal history`,
        )
      }

      if (isPolygonDrawingMode) {
        startPolygonDrawing()
      }

      if (isLassoSelectionMode || isRoadSelectionLasso) {
        startLassoDrawing()
      }

      const extractPointsFromPolygon = (
        polygonFeature: any,
      ): [number, number][] => {
        const coordinates = polygonFeature.geometry.coordinates[0] as [
          number,
          number,
        ][]

        const points = coordinates.filter((coord, index) => {
          if (index === coordinates.length - 1 && coordinates.length > 1) {
            return (
              coord[0] !== coordinates[0][0] || coord[1] !== coordinates[0][1]
            )
          }
          return true
        })

        return points as [number, number][]
      }

      const handleChange = (_features: any[]) => {
        if (changeTimeoutRef.current) {
          clearTimeout(changeTimeoutRef.current)
        }
        changeTimeoutRef.current = setTimeout(() => {
          if (!draw) return
          const snapshot = draw.getSnapshot()
          if (!snapshot || !Array.isArray(snapshot)) return

          // Prevent multiple polygons in both polygon and lasso modes
          const allPolygons = snapshot.filter(
            (f: any) => f?.geometry?.type === "Polygon",
          )

          // Check if completion menu is open - if so, prevent new polygon creation
          const isMenuOpen =
            useLayerStore.getState().drawingCompletionMenuPosition !== null

          // If menu is open and user tries to create a new polygon, remove it silently
          if (isMenuOpen && allPolygons.length > 1) {
            // Menu is open - user must complete/cancel current polygon first
            // Remove the new polygon without showing warning (menu already indicates action needed)
            try {
              // Keep only the first polygon (the completed one)
              const firstPolygon = allPolygons[0]
              draw.clear()
              // Re-add only the first polygon to preserve it
              if (firstPolygon) {
                draw.addFeatures([firstPolygon])
              }
              // Reset state based on mode to match the preserved polygon
              if (isPolygonDrawingMode) {
                const coords = firstPolygon?.geometry?.coordinates?.[0]
                if (
                  Array.isArray(coords) &&
                  coords.length > 0 &&
                  Array.isArray(coords[0])
                ) {
                  const points = coords as [number, number][]
                  syncPolygonPointsFromTerraDraw(points.slice(0, -1)) // Remove closing point
                }
              } else if (isLassoSelectionMode || isRoadSelectionLasso) {
                const coords = firstPolygon?.geometry?.coordinates?.[0]
                if (
                  Array.isArray(coords) &&
                  coords.length > 0 &&
                  Array.isArray(coords[0])
                ) {
                  const points = coords as [number, number][]
                  setLassoPoints(points.slice(0, -1)) // Remove closing point
                }
              }
            } catch (error) {
              console.error(
                "Error preserving polygon when menu is open:",
                error,
              )
              // Fallback: clear all and restore from store
              draw.clear()
              if (isPolygonDrawingMode && polygonDrawing.points.length > 0) {
                const closedPoints = [
                  ...polygonDrawing.points,
                  polygonDrawing.points[0],
                ]
                draw.addFeatures([
                  {
                    type: "Feature",
                    geometry: {
                      type: "Polygon",
                      coordinates: [closedPoints],
                    },
                    properties: {},
                  },
                ])
              }
            }
            return // Don't process further
          }

          // If there are multiple polygons and menu is NOT open, show warning
          if (allPolygons.length > 1) {
            toast.warning(
              "Please cancel or complete the existing polygon before creating a new one",
            )
            // Clear all polygons to prevent duplicates
            try {
              draw.clear()
              // Reset state based on mode
              if (isPolygonDrawingMode) {
                syncPolygonPointsFromTerraDraw([])
              } else if (isLassoSelectionMode || isRoadSelectionLasso) {
                setLassoPoints([])
              }
            } catch (error) {
              console.error("Error clearing duplicate polygons:", error)
              // Fallback: try removing individual polygons
              allPolygons.slice(1).forEach((polygon: any) => {
                try {
                  if (polygon?.id) {
                    draw.clear()
                  }
                } catch (removeError) {
                  console.error(
                    "Error removing duplicate polygon:",
                    removeError,
                  )
                }
              })
              if (isPolygonDrawingMode) {
                syncPolygonPointsFromTerraDraw([])
              } else if (isLassoSelectionMode || isRoadSelectionLasso) {
                setLassoPoints([])
              }
            }
            return // Don't process further if we removed polygons
          }

          if (isLassoSelectionMode || isRoadSelectionLasso) {
            const polygonFeature = snapshot.find(
              (f: any) => f.geometry?.type === "Polygon",
            )
            if (polygonFeature) {
              const points = extractPointsFromPolygon(polygonFeature)
              setLassoPoints(points)
            } else {
              setLassoPoints([])
            }
          } else if (isPolygonDrawingMode) {
            const polygonFeature = snapshot.find(
              (f: any) => f.geometry?.type === "Polygon",
            )
            if (polygonFeature) {
              const points = extractPointsFromPolygon(polygonFeature)
              // Sync points without validation during drawing
              // Validation will happen when polygon is finished
              syncPolygonPointsFromTerraDraw(points)
            } else {
              syncPolygonPointsFromTerraDraw([])
            }
          }
        }, 50)
      }

      const handleFinish = (id: string | number) => {
        const features = draw.getSnapshot()
        if (isLassoSelectionMode || isRoadSelectionLasso) {
          const polygonFeature = features.find(
            (f: any) => f.id === id && f.geometry.type === "Polygon",
          )
          if (polygonFeature) {
            const points = extractPointsFromPolygon(polygonFeature)
            // Validate all points are within boundary before finalizing
            const projectData = useProjectWorkspaceStore.getState().projectData
            const boundary = projectData?.boundaryGeoJson
            if (boundary) {
              const allPointsValid = points.every((point) => {
                // Points are in [lng, lat] format, convert to [lat, lng] for validation
                const [lng, lat] = point
                return isPointInBoundary(lat, lng, boundary)
              })
              if (!allPointsValid) {
                toast.error(
                  "All lasso polygon points must be within the jurisdiction boundary",
                )
                // Remove the invalid polygon from Terra Draw
                try {
                  draw.clear()
                  setLassoPoints([])
                  const clearLassoDrawing =
                    useLayerStore.getState().clearLassoDrawing
                  clearLassoDrawing()
                } catch (error) {
                  console.error("Error removing invalid lasso polygon:", error)
                  // Fallback: clear all features
                  draw.clear()
                  setLassoPoints([])
                  const clearLassoDrawing =
                    useLayerStore.getState().clearLassoDrawing
                  clearLassoDrawing()
                }
                return
              }
            }
            setLassoPoints(points)
            // Show completion menu at the rightmost point to avoid blocking the view
            if (points.length > 0) {
              // Find rightmost point (max longitude)
              const rightmostPoint = points.reduce((max, point) => {
                return point[0] > max[0] ? point : max
              }, points[0])
              const [lng, lat] = rightmostPoint
              // Add small offset to position menu to the right
              const showMenu =
                useLayerStore.getState().showDrawingCompletionMenu
              showMenu(lat, lng + 0.00002)
            }
          }
        } else if (isPolygonDrawingMode) {
          const polygonFeature = features.find(
            (f: any) => f.id === id && f.geometry.type === "Polygon",
          )
          if (polygonFeature) {
            const points = extractPointsFromPolygon(polygonFeature)
            // Validate all points are within boundary before finalizing
            const projectData = useProjectWorkspaceStore.getState().projectData
            const boundary = projectData?.boundaryGeoJson
            if (boundary) {
              const allPointsValid = points.every((point) => {
                // Points are in [lng, lat] format, convert to [lat, lng] for validation
                const [lng, lat] = point
                return isPointInBoundary(lat, lng, boundary)
              })
              if (!allPointsValid) {
                toast.error(
                  "All polygon points must be within the jurisdiction boundary",
                )
                // Remove the invalid polygon from Terra Draw
                try {
                  draw.clear()
                  syncPolygonPointsFromTerraDraw([])
                } catch (error) {
                  console.error("Error removing invalid polygon:", error)
                  // Fallback: clear all features
                  draw.clear()
                  syncPolygonPointsFromTerraDraw([])
                }
                return
              }
            }
            syncPolygonPointsFromTerraDraw(points)
            // Set isDrawing to false since polygon is complete
            const finishPolygonDrawing =
              useLayerStore.getState().finishPolygonDrawing
            finishPolygonDrawing()
            // Show completion menu at the rightmost point to avoid blocking the view
            if (points.length > 0) {
              // Find rightmost point (max longitude)
              const rightmostPoint = points.reduce((max, point) => {
                return point[0] > max[0] ? point : max
              }, points[0])
              const [lng, lat] = rightmostPoint
              // Add small offset to position menu to the right
              const showMenu =
                useLayerStore.getState().showDrawingCompletionMenu
              showMenu(lat, lng + 0.00002)
            }
          }
        }
      }

      draw.on("change", handleChange)
      draw.on("finish", handleFinish)
    } catch (error) {
      console.error("❌ Failed to initialize Terra Draw:", error)
    }

    return () => {
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current)
        changeTimeoutRef.current = null
      }
      if (terraDrawRef.current) {
        try {
          terraDrawRef.current.stop()
          // Immediately reset cursor after stopping
          if (map) {
            resetMapCursor(map)
            // Also try resetting on document level
            document.body.style.cursor = ""
            if (document.documentElement) {
              document.documentElement.style.cursor = ""
            }
          }
        } catch (error) {
          console.error("Error stopping Terra Draw:", error)
        }
        terraDrawRef.current = null
      }
      if (adapterRef.current) {
        adapterRef.current = null
      }
      // Reset cursor style when Terra Draw is cleaned up (fallback)
      if (map) {
        resetMapCursor(map)
        // Final reset on document level
        document.body.style.cursor = ""
        if (document.documentElement) {
          document.documentElement.style.cursor = ""
        }
      }
    }
  }, [
    map,
    isActive,
    mode,
    startPolygonDrawing,
    syncPolygonPointsFromTerraDraw,
    startLassoDrawing,
    setLassoPoints,
    finishLassoDrawing,
    clearLassoDrawing,
    mapMode,
  ])

  // Sync Terra Draw when undo/redo happens in the temporal store
  useEffect(() => {
    if (!terraDrawRef.current || !isActive || mode !== "polygon") return

    // Update Terra Draw to match the store's polygon points
    const currentFeatures = terraDrawRef.current.getSnapshot()
    const polygonFeature = currentFeatures.find(
      (f: any) => f.geometry.type === "Polygon",
    )

    const storePoints = polygonDrawing.points

    // Check if Terra Draw's polygon differs from store
    if (polygonFeature) {
      const coordinates = polygonFeature.geometry.coordinates[0]
      const terraPoints = (
        Array.isArray(coordinates) ? coordinates.slice(0, -1) : []
      ) as [number, number][]
      const pointsDiffer =
        terraPoints.length !== storePoints.length ||
        terraPoints.some(
          (p, i) =>
            p[0] !== storePoints[i]?.[0] || p[1] !== storePoints[i]?.[1],
        )

      if (pointsDiffer) {
        // Clear existing features by removing them
        try {
          terraDrawRef.current?.clear()
        } catch (error) {
          console.error("Error clearing Terra Draw features:", error)
        }

        // Re-create polygon if we have points
        if (storePoints.length > 0) {
          const closedPoints = [...storePoints, storePoints[0]]
          try {
            terraDrawRef.current?.addFeatures([
              {
                type: "Feature",
                geometry: {
                  type: "Polygon",
                  coordinates: [closedPoints],
                },
                properties: {},
              },
            ])
          } catch (error) {
            console.error("Error adding Terra Draw features:", error)
          }
        }
      }
    } else if (storePoints.length > 0) {
      // No polygon in Terra Draw but store has points - recreate
      const closedPoints = [...storePoints, storePoints[0]]
      try {
        terraDrawRef.current?.addFeatures([
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [closedPoints],
            },
            properties: {},
          },
        ])
      } catch (error) {
        console.error("Error adding Terra Draw features:", error)
      }
    }
  }, [polygonDrawing.points, isActive, mode])

  // Expose undo/redo methods (using zundo temporal store)
  const finishDrawing = useCallback(() => {
    ;(terraDrawRef.current as any)?.finish?.()
  }, [])

  const undo = useCallback(() => {
    const temporal = useLayerStore.temporal.getState()
    if (temporal.pastStates.length > 0) {
      temporal.undo()
    }
  }, [])

  const redo = useCallback(() => {
    const temporal = useLayerStore.temporal.getState()
    if (temporal.futureStates.length > 0) {
      temporal.redo()
    }
  }, [])

  // Expose undo/redo to store for toolbar access
  useEffect(() => {
    if (isActive && map) {
      useLayerStore.setState({
        terraDrawUndo: undo,
        terraDrawRedo: redo,
        terraDrawFinish: finishDrawing,
      })
    } else {
      useLayerStore.setState({
        terraDrawUndo: undefined,
        terraDrawRedo: undefined,
        terraDrawFinish: undefined,
      })
    }
  }, [isActive, map, undo, redo, finishDrawing])

  // Get current polygon from Terra Draw
  const getCurrentPolygon = () => {
    if (!terraDrawRef.current) return null

    const features = terraDrawRef.current.getSnapshot()
    const polygonFeature = features.find(
      (f: any) => f.geometry.type === "Polygon",
    )

    if (polygonFeature) {
      const coordinates = polygonFeature.geometry.coordinates[0] as [
        number,
        number,
      ][]

      // Remove last point if it's duplicate of first
      const points = coordinates.filter((coord, index) => {
        if (index === coordinates.length - 1 && coordinates.length > 1) {
          return (
            coord[0] !== coordinates[0][0] || coord[1] !== coordinates[0][1]
          )
        }
        return true
      })

      return {
        type: "Polygon",
        coordinates: [[...points, points[0]]], // Ensure closed
      }
    }

    return null
  }

  return {
    terraDraw: terraDrawRef.current,
    undo,
    redo,
    getCurrentPolygon,
  }
}
