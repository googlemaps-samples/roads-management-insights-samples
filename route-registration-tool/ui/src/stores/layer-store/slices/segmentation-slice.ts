import * as turf from "@turf/turf"
import { StateCreator } from "zustand"

import { MAX_SEGMENTS_LIMIT, useLayerStore } from ".."
import { CutPoint, SegmentationSnapshot } from "../../../types/route"
import { decodePolylineToGeoJSON } from "../../../utils/polyline-decoder"
import {
  calculateDistanceFromStart,
  extractCoordinatesFromEncodedPolyline,
  extractCoordinatesFromGeoJSON,
  findClosestPointOnRoute,
  snapCutPointToRoute,
} from "../../../utils/route-snapping"
// @ts-ignore - Vite worker import
import SegmentationWorker from "../../../workers/segmentation-worker?worker"
import { Route } from "../../project-workspace-store"
import { useProjectWorkspaceStore } from "../../project-workspace-store"
import { LayerStore, SegmentationState } from "../types"
import {
  buildSegmentBetweenDistances,
  calculateSegmentDistance,
  findExactCutPointOnRoute,
} from "../utils/geo-math"

function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

export interface SegmentationSlice {
  segmentation: SegmentationState
  startSegmentation: (
    route: Route,
    type: "distance" | "manual" | "intersections",
  ) => void
  addCutPoint: (point: CutPoint) => void
  removeCutPoint: (pointId: string) => void
  updateCutPoint: (
    pointId: string,
    coordinates: { lat: number; lng: number },
  ) => void
  clearCutPoints: () => void
  stopSegmentation: () => void
  setDistanceKm: (distanceKm: number) => void
  calculatePreviewSegments: () => void
  clearPreviewSegments: () => void
  toggleSegmentSelection: (segmentId: string) => void
  selectAllSegments: () => void
  deselectAllSegments: () => void
  setHoveredSegmentId: (segmentId: string | null) => void
  setSnapToRoute: (enabled: boolean) => void
  setSnapPrecision: (precision: number) => void
  startDragging: (
    pointId: string,
    position: { lat: number; lng: number },
  ) => void
  updateDragging: (
    pointId: string,
    position: { lat: number; lng: number },
  ) => void
  endDragging: (pointId: string, position: { lat: number; lng: number }) => void
  createSnapshot: (description?: string) => void
  restoreSnapshot: (snapshotId: string) => void
  getSnapshots: () => SegmentationSnapshot[]
  loadExistingCutPoints: (cutPointsData: {
    cutPoints: Array<{ id: string; coordinates: { lat: number; lng: number } }>
    segmentationType: "manual" | "distance" | "intersections"
    distanceKm?: number
  }) => void
  clearSegmentation: () => void
  applySegmentation: (segmentationData: {
    type: "manual" | "distance" | "intersections"
    cutPoints?: number[][]
    distanceKm?: number
    segments: any[]
  }) => Promise<void>
  fetchIntersectionsAndCreateSegments: () => Promise<void>
  switchToManualMode: () => void
  switchToDistanceMode: () => void
}

export const createSegmentationSlice: StateCreator<
  LayerStore,
  [],
  [],
  SegmentationSlice
> = (set, get) => {
  // Worker instance (singleton)
  let workerInstance: Worker | null = null
  let workerRequestId: string | null = null

  const getWorker = (): Worker => {
    if (!workerInstance) {
      workerInstance = new SegmentationWorker()
      workerInstance.onmessage = (e: MessageEvent) => {
        const { type, payload } = e.data
        const messageRequestId = payload.requestId

        // Check if this message is for the current request
        // If workerRequestId doesn't match, this message is from a cancelled request
        if (!workerRequestId || workerRequestId !== messageRequestId) {
          return // Request was cancelled or no active request, ignore this message
        }

        if (type === "SEGMENTS_CHUNK") {
          if (payload.isComplete) {
            // Final chunk - set all segments
            // Double-check one more time that we're still the current request
            if (workerRequestId === messageRequestId) {
              // Get the distanceKm that was used for this calculation
              const currentSegmentation = get().segmentation
              const calculatedDistance = currentSegmentation.distanceKm

              set((state) => ({
                segmentation: {
                  ...state.segmentation,
                  previewSegments: payload.segments,
                  selectedSegmentIds: new Set(
                    payload.segments.map((seg: any) => seg.id),
                  ),
                  isCalculating: false,
                  error: undefined,
                  calculatedDistanceKm: calculatedDistance, // Store the distance that was calculated
                },
              }))
              workerRequestId = null
            } else {
              console.warn(
                "[segmentation-slice] Ignoring segments - request ID mismatch",
                {
                  messageRequestId,
                  workerRequestId,
                },
              )
            }
          } else {
            // Intermediate chunk - accumulate segments
            // For now, we'll just wait for the complete message
            // TODO: Could implement progressive updates if needed
          }
        } else if (type === "ERROR") {
          // Double-check that this is still the current request
          if (workerRequestId === messageRequestId) {
            set((state) => ({
              segmentation: {
                ...state.segmentation,
                isCalculating: false,
                error:
                  payload.error ||
                  "Segmentation calculation failed. Please try again.",
                previewSegments: [],
              },
            }))
            workerRequestId = null
          }
        }
      }

      workerInstance.onerror = (error) => {
        // Note: onerror doesn't give us the requestId, so we check if there's an active request
        // This is a fallback - the main error handling is in onmessage with ERROR type
        const currentRequestId = workerRequestId
        console.error("Segmentation worker error:", error)
        if (currentRequestId !== null) {
          set((state) => ({
            segmentation: {
              ...state.segmentation,
              isCalculating: false,
              error:
                "Segmentation calculation failed. Please try again with different parameters.",
              previewSegments: [],
            },
          }))
          // Only clear if it's still the current request (race condition protection)
          if (workerRequestId === currentRequestId) {
            workerRequestId = null
          }
        }
      }
    }
    return workerInstance
  }

  const debouncedCalculatePreviewSegments = debounce(() => {
    const { segmentation } = get()
    if (!segmentation.targetRoute) return

    // For distance mode, ensure distanceKm is defined
    if (segmentation.type === "distance" && !segmentation.distanceKm) {
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          isCalculating: false,
          error: undefined,
          previewSegments: [],
        },
      }))
      return
    }

    set((state) => ({
      segmentation: {
        ...state.segmentation,
        isCalculating: true,
        error: undefined,
        // Don't clear calculatedDistanceKm here - we'll update it after successful calculation
      },
    }))

    try {
      if (!segmentation.targetRoute.encodedPolyline) {
        throw new Error("Route has no encoded polyline")
      }

      const routeCoordinates = decodePolylineToGeoJSON(
        segmentation.targetRoute.encodedPolyline,
      )

      if (
        !routeCoordinates.coordinates ||
        routeCoordinates.coordinates.length === 0
      ) {
        throw new Error("Invalid route coordinates")
      }

      const routeCoords = routeCoordinates.coordinates

      // Calculate cumulative distances for consistent length calculation
      const cumulativeDistancesForTotal: number[] = [0]
      for (let i = 0; i < routeCoords.length - 1; i++) {
        const segmentLength = turf.distance(
          turf.point([routeCoords[i][0], routeCoords[i][1]]),
          turf.point([routeCoords[i + 1][0], routeCoords[i + 1][1]]),
          "kilometers" as const,
        )
        cumulativeDistancesForTotal.push(
          cumulativeDistancesForTotal[i] + segmentLength,
        )
      }
      // Use cumulative distance sum as authoritative total length for consistency
      const totalLength =
        cumulativeDistancesForTotal[cumulativeDistancesForTotal.length - 1]

      // Store calculated length in state for UI display
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          calculatedRouteLengthKm: totalLength,
        },
      }))

      // For distance mode, validate route length and use Web Worker
      if (segmentation.type === "distance" && segmentation.distanceKm) {
        const distanceKm = segmentation.distanceKm

        // Skip recalculation if the same distance was already calculated and we have results
        if (
          segmentation.calculatedDistanceKm === distanceKm &&
          segmentation.previewSegments.length > 0 &&
          !segmentation.error
        ) {
          // Same distance already calculated with valid results, skip
          set((state) => ({
            segmentation: {
              ...state.segmentation,
              isCalculating: false,
            },
          }))
          return
        }

        // Validate if route length is less than or equal to segment distance
        if (totalLength <= distanceKm + 0.001) {
          // Cancel any pending worker requests
          workerRequestId = null

          set((state) => ({
            segmentation: {
              ...state.segmentation,
              isCalculating: false,
              error: `ROUTE_LENGTH_${totalLength}_SEGMENT_DISTANCE_${distanceKm}`,
              previewSegments: [],
              calculatedDistanceKm: undefined, // Clear calculated distance on error
            },
          }))
          return
        }

        // Validate maximum segments limit
        const estimatedSegmentCount = Math.ceil(totalLength / distanceKm)
        if (estimatedSegmentCount > MAX_SEGMENTS_LIMIT) {
          // Cancel any pending worker requests
          workerRequestId = null

          set((state) => ({
            segmentation: {
              ...state.segmentation,
              isCalculating: false,
              error: `MAX_SEGMENTS_EXCEEDED_${estimatedSegmentCount}_LIMIT_${MAX_SEGMENTS_LIMIT}_ROUTE_LENGTH_${totalLength}_DISTANCE_${distanceKm}`,
              previewSegments: [],
              calculatedDistanceKm: undefined, // Clear calculated distance on error
            },
          }))
          return
        }

        // Cancel previous calculation by generating new request ID
        // This ensures old worker responses will be ignored
        const worker = getWorker()
        const requestId = `${Date.now()}-${Math.random()}`
        workerRequestId = requestId

        // Send calculation request to worker with requestId
        worker.postMessage({
          type: "CALCULATE_SEGMENTS",
          payload: {
            encodedPolyline: segmentation.targetRoute.encodedPolyline,
            distanceKm: distanceKm,
            routeId: segmentation.targetRoute.id,
            requestId: requestId,
          },
        })

        // Return early - worker will update state when done
        return
      }

      // Manual/intersections mode continues with existing logic
      let exactCutCoordinates: Array<{
        index: number
        coordinate: number[]
        distanceAlongRoute?: number
      }> = []

      if (
        segmentation.type === "manual" ||
        segmentation.type === "intersections"
      ) {
        // Calculate cumulative distances for accurate distance calculation
        const cumulativeDistances: number[] = [0]
        for (let i = 0; i < routeCoords.length - 1; i++) {
          const segmentLength = turf.distance(
            turf.point([routeCoords[i][0], routeCoords[i][1]]),
            turf.point([routeCoords[i + 1][0], routeCoords[i + 1][1]]),
            "kilometers" as const,
          )
          cumulativeDistances.push(cumulativeDistances[i] + segmentLength)
        }

        exactCutCoordinates = segmentation.cutPoints
          .map((cutPoint: CutPoint) => {
            const segmentInfo = findExactCutPointOnRoute(
              routeCoordinates.coordinates,
              cutPoint.coordinates,
            )
            // Calculate distance along route using cumulative distances
            // Find which segment the cut point is on
            const cutPointCoord = [
              cutPoint.coordinates.lng,
              cutPoint.coordinates.lat,
            ]
            let distanceAlongRoute = 0

            // Find the segment index
            const segmentIdx = Math.max(
              0,
              Math.min(segmentInfo.index - 1, cumulativeDistances.length - 2),
            )

            // Calculate distance up to the segment start
            distanceAlongRoute = cumulativeDistances[segmentIdx] || 0

            // Add distance within the segment
            if (segmentIdx < routeCoords.length - 1) {
              const segmentStart = routeCoords[segmentIdx]
              const segmentEnd = routeCoords[segmentIdx + 1]
              const segmentLine = turf.lineString([
                [segmentStart[0], segmentStart[1]],
                [segmentEnd[0], segmentEnd[1]],
              ])
              const nearest = (turf as any).nearestPointOnLine(
                segmentLine,
                turf.point(cutPointCoord),
                { units: "kilometers" as const },
              )

              // Calculate distance from segment start to the cut point
              const distInSegment = turf.distance(
                turf.point([segmentStart[0], segmentStart[1]]),
                nearest,
                "kilometers" as const,
              )
              distanceAlongRoute += distInSegment
            }

            return {
              index: segmentInfo.index,
              coordinate: [cutPoint.coordinates.lng, cutPoint.coordinates.lat],
              distanceAlongRoute,
            }
          })
          .sort((a, b) => {
            // Sort by distance along route to ensure correct order
            return a.distanceAlongRoute - b.distanceAlongRoute
          })
      } else {
        // Distance mode: use Web Worker for calculation
        if (!segmentation.distanceKm) {
          throw new Error(
            "Distance is required for distance-based segmentation",
          )
        }

        // Use Web Worker for distance-based segmentation
        const worker = getWorker()
        const requestId = `${Date.now()}-${Math.random()}`
        workerRequestId = requestId

        // Send calculation request to worker with requestId
        worker.postMessage({
          type: "CALCULATE_SEGMENTS",
          payload: {
            encodedPolyline: segmentation.targetRoute.encodedPolyline,
            distanceKm: segmentation.distanceKm,
            routeId: segmentation.targetRoute.id,
            requestId: requestId,
          },
        })

        // Return early - worker will update state when done
        return
      }

      const segments: any[] = []

      if (
        (segmentation.type === "manual" ||
          segmentation.type === "intersections") &&
        exactCutCoordinates.length > 0
      ) {
        // Manual and intersections modes use distance-based segmentation
        // (Distance mode is handled by Web Worker above)
        // Manual mode: use distance-based if available, otherwise fallback to index-based
        const hasDistanceInfo = exactCutCoordinates.some(
          (cp) => cp.distanceAlongRoute !== undefined,
        )

        if (hasDistanceInfo) {
          // Use distance-based segmentation for manual mode
          const firstCut = exactCutCoordinates[0]
          const firstSegmentCoords = buildSegmentBetweenDistances(
            routeCoords,
            0,
            firstCut.distanceAlongRoute || 0,
            undefined,
            firstCut.coordinate,
          )

          if (firstSegmentCoords.length >= 2) {
            // Calculate distance from route distance (more accurate than from coordinates)
            const firstSegmentDistance = (firstCut.distanceAlongRoute || 0) - 0
            const segment = {
              id: `temp-segment-0`,
              routeId: segmentation.targetRoute.id,
              name: `Segment 1`,
              linestringGeoJson: {
                type: "LineString",
                coordinates: firstSegmentCoords,
              },
              segmentOrder: 1,
              distanceKm: firstSegmentDistance,
              createdAt: new Date().toISOString(),
            }
            segments.push(segment)
          } else {
            console.error(
              "[segmentation-slice] First segment invalid - too few coordinates",
              {
                coordsCount: firstSegmentCoords.length,
                firstSegmentCoords,
              },
            )
          }

          for (let i = 1; i < exactCutCoordinates.length; i++) {
            const prevCut = exactCutCoordinates[i - 1]
            const currentCut = exactCutCoordinates[i]
            const segmentCoords = buildSegmentBetweenDistances(
              routeCoords,
              prevCut.distanceAlongRoute || 0,
              currentCut.distanceAlongRoute || totalLength,
              prevCut.coordinate,
              currentCut.coordinate,
            )

            if (segmentCoords.length >= 2) {
              // Calculate distance from route distance (more accurate than from coordinates)
              const segmentStartDistance = prevCut.distanceAlongRoute || 0
              const segmentEndDistance =
                currentCut.distanceAlongRoute || totalLength
              const segmentDistance = segmentEndDistance - segmentStartDistance
              segments.push({
                id: `temp-segment-${i}`,
                routeId: segmentation.targetRoute.id,
                name: `Segment ${i + 1}`,
                linestringGeoJson: {
                  type: "LineString",
                  coordinates: segmentCoords,
                },
                segmentOrder: i + 1,
                distanceKm: segmentDistance,
                createdAt: new Date().toISOString(),
              })
            }
          }

          const lastCut = exactCutCoordinates[exactCutCoordinates.length - 1]
          const finalSegmentCoords = buildSegmentBetweenDistances(
            routeCoords,
            lastCut.distanceAlongRoute || 0,
            totalLength,
            lastCut.coordinate,
            undefined,
          )

          if (finalSegmentCoords.length >= 2) {
            // Calculate distance from route distance (more accurate than from coordinates)
            const finalSegmentStartDistance = lastCut.distanceAlongRoute || 0
            const finalSegmentDistance = totalLength - finalSegmentStartDistance
            segments.push({
              id: `temp-segment-${segments.length}`,
              routeId: segmentation.targetRoute.id,
              name: `Segment ${segments.length + 1}`,
              linestringGeoJson: {
                type: "LineString",
                coordinates: finalSegmentCoords,
              },
              segmentOrder: segments.length + 1,
              distanceKm: finalSegmentDistance,
              createdAt: new Date().toISOString(),
            })
          }
        } else {
          // Fallback to index-based (for backward compatibility)
          const firstCut = exactCutCoordinates[0]
          const firstSegmentCoords: number[][] = [routeCoords[0]]
          for (let j = 1; j < firstCut.index; j++) {
            firstSegmentCoords.push(routeCoords[j])
          }
          firstSegmentCoords.push(firstCut.coordinate)

          if (firstSegmentCoords.length >= 2) {
            segments.push({
              id: `temp-segment-0`,
              routeId: segmentation.targetRoute.id,
              name: `Segment 1`,
              linestringGeoJson: {
                type: "LineString",
                coordinates: firstSegmentCoords,
              },
              segmentOrder: 1,
              distanceKm: calculateSegmentDistance(firstSegmentCoords),
              createdAt: new Date().toISOString(),
            })
          }

          for (let i = 1; i < exactCutCoordinates.length; i++) {
            const prevCut = exactCutCoordinates[i - 1]
            const currentCut = exactCutCoordinates[i]
            // Ensure indices are monotonic
            if (currentCut.index <= prevCut.index) {
              console.warn(
                `Skipping invalid cut point: index ${currentCut.index} <= previous ${prevCut.index}`,
              )
              continue
            }
            const segmentCoords: number[][] = [prevCut.coordinate]
            for (let j = prevCut.index; j < currentCut.index; j++) {
              segmentCoords.push(routeCoords[j])
            }
            segmentCoords.push(currentCut.coordinate)

            if (segmentCoords.length >= 2) {
              segments.push({
                id: `temp-segment-${i}`,
                routeId: segmentation.targetRoute.id,
                name: `Segment ${i + 1}`,
                linestringGeoJson: {
                  type: "LineString",
                  coordinates: segmentCoords,
                },
                segmentOrder: i + 1,
                distanceKm: calculateSegmentDistance(segmentCoords),
                createdAt: new Date().toISOString(),
              })
            }
          }

          const lastCut = exactCutCoordinates[exactCutCoordinates.length - 1]
          const finalSegmentCoords: number[][] = [lastCut.coordinate]
          for (let j = lastCut.index; j < routeCoords.length; j++) {
            finalSegmentCoords.push(routeCoords[j])
          }

          if (finalSegmentCoords.length >= 2) {
            segments.push({
              id: `temp-segment-${segments.length}`,
              routeId: segmentation.targetRoute.id,
              name: `Segment ${segments.length + 1}`,
              linestringGeoJson: {
                type: "LineString",
                coordinates: finalSegmentCoords,
              },
              segmentOrder: segments.length + 1,
              distanceKm: calculateSegmentDistance(finalSegmentCoords),
              createdAt: new Date().toISOString(),
            })
          }
        }
      }

      const segmentIds = new Set(segments.map((seg: any) => seg.id))

      set((state) => ({
        segmentation: {
          ...state.segmentation,
          previewSegments: segments,
          selectedSegmentIds: segmentIds,
          isCalculating: false,
        },
      }))
    } catch (error: any) {
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          isCalculating: false,
          error: error.message,
        },
      }))
    }
  }, 300)

  return {
    segmentation: {
      targetRoute: null,
      cutPoints: [],
      type: "manual",
      distanceKm: undefined,
      isActive: false,
      previewSegments: [],
      selectedSegmentIds: new Set<string>(),
      hoveredSegmentId: null,
      isCalculating: false,
      error: undefined,
      snapToRoute: true,
      snapPrecision: 10,
      isDragging: false,
      dragStartPosition: undefined,
      snapshots: [],
      calculatedRouteLengthKm: undefined,
      calculatedDistanceKm: undefined,
    },

    startSegmentation: (route, type) => {
      // Clear all temporal history when entering segmentation or switching modes
      // This prevents undoing back to individualRoute drawing state or previous mode states
      // and creates a clean slate for segmentation undo/redo
      useLayerStore.temporal.getState().clear()

      set(() => ({
        segmentation: {
          targetRoute: route,
          cutPoints: [],
          type,
          distanceKm: undefined,
          isActive: true,
          previewSegments: [],
          selectedSegmentIds: new Set<string>(),
          hoveredSegmentId: null,
          isCalculating: false,
          error: undefined,
          snapToRoute: true,
          snapPrecision: 10,
          isDragging: false,
          dragStartPosition: undefined,
          snapshots: [],
        },
      }))

      const { setMapMode, mapMode } = useProjectWorkspaceStore.getState()
      if (mapMode !== "individual_drawing") {
        setMapMode("segmentation")
      }
    },

    addCutPoint: (point) => {
      const { segmentation } = get()
      const isManual = segmentation.type === "manual"
      let processedPoint = { ...point }

      if (isManual) {
        const targetRoute = segmentation.targetRoute
        if (!targetRoute) {
          set((state) => ({
            segmentation: {
              ...state.segmentation,
              error: "Cannot add manual cut: route data is missing.",
            },
          }))
          return
        }

        let routeCoordinates: Array<{ lat: number; lng: number }> | null = null
        let snapResult: {
          snappedPoint: { lat: number; lng: number }
          isSnapped: boolean
          distance: number
        } | null = null

        // Fall back to encodedPolyline if originalRouteGeoJson is not available or failed
        if (!snapResult || !routeCoordinates) {
          if (targetRoute.encodedPolyline) {
            // Check if encodedPolyline is a JSON array (for imported routes)
            const jsonCoords = extractCoordinatesFromEncodedPolyline(
              targetRoute.encodedPolyline,
            )

            if (jsonCoords) {
              // It's a JSON array - use it directly
              routeCoordinates = jsonCoords
              snapResult = findClosestPointOnRoute(
                point.coordinates,
                routeCoordinates,
                segmentation.snapPrecision,
              )
            } else {
              // It's a Google-encoded polyline - decode it
              snapResult = snapCutPointToRoute(
                point.coordinates,
                targetRoute.encodedPolyline,
                true,
                segmentation.snapPrecision,
              )

              // Extract coordinates for distance calculation
              try {
                const routeCoords = decodePolylineToGeoJSON(
                  targetRoute.encodedPolyline,
                )
                if (routeCoords.type === "LineString") {
                  routeCoordinates = routeCoords.coordinates.map(
                    ([lng, lat]) => ({
                      lat,
                      lng,
                    }),
                  )
                }
              } catch (error) {
                console.error("Error decoding polyline:", error)
              }
            }
          } else {
            set((state) => ({
              segmentation: {
                ...state.segmentation,
                error: "Cannot add manual cut: route data is missing.",
              },
            }))
            return
          }
        }

        if (!snapResult || !snapResult.isSnapped) {
          set((state) => ({
            segmentation: {
              ...state.segmentation,
              error: `Click is too far from the route. Please click directly on the route (within ${segmentation.snapPrecision}m).`,
            },
          }))
          return
        }

        // Use the snapped point coordinates instead of the original clicked point
        processedPoint = {
          ...point,
          coordinates: snapResult.snappedPoint,
          snappedCoordinates: snapResult.snappedPoint,
          isSnapped: true,
        }

        // Calculate distance from start using the route coordinates
        if (routeCoordinates && routeCoordinates.length > 0) {
          try {
            processedPoint.distanceFromStart = calculateDistanceFromStart(
              snapResult.snappedPoint,
              routeCoordinates,
            )
          } catch (error) {
            // Error calculating distance from start
            console.error("Error calculating distance from start:", error)
          }
        }
      } else {
        const targetRoute = segmentation.targetRoute
        if (segmentation.snapToRoute && targetRoute) {
          let routeCoordinates: Array<{ lat: number; lng: number }> | null =
            null
          let snapResult: {
            snappedPoint: { lat: number; lng: number }
            isSnapped: boolean
            distance: number
          } | null = null

          // For routes from import roads flow, use originalRouteGeoJson if available
          if (targetRoute.originalRouteGeoJson) {
            try {
              routeCoordinates = extractCoordinatesFromGeoJSON(
                targetRoute.originalRouteGeoJson,
              )
              if (routeCoordinates.length > 0) {
                snapResult = findClosestPointOnRoute(
                  point.coordinates,
                  routeCoordinates,
                  segmentation.snapPrecision,
                )
              }
            } catch (error) {
              console.error(
                "Error extracting coordinates from originalRouteGeoJson:",
                error,
              )
            }
          }

          // Fall back to encodedPolyline if originalRouteGeoJson is not available or failed
          if (!snapResult && targetRoute.encodedPolyline) {
            // Check if encodedPolyline is a JSON array (for imported routes)
            const jsonCoords = extractCoordinatesFromEncodedPolyline(
              targetRoute.encodedPolyline,
            )

            if (jsonCoords) {
              // It's a JSON array - use it directly
              routeCoordinates = jsonCoords
              snapResult = findClosestPointOnRoute(
                point.coordinates,
                routeCoordinates,
                segmentation.snapPrecision,
              )
            } else {
              // It's a Google-encoded polyline - decode it
              snapResult = snapCutPointToRoute(
                point.coordinates,
                targetRoute.encodedPolyline,
                segmentation.snapToRoute,
                segmentation.snapPrecision,
              )

              // Extract coordinates for distance calculation
              try {
                const routeCoords = decodePolylineToGeoJSON(
                  targetRoute.encodedPolyline,
                )
                if (routeCoords.type === "LineString") {
                  routeCoordinates = routeCoords.coordinates.map(
                    ([lng, lat]) => ({
                      lat,
                      lng,
                    }),
                  )
                }
              } catch (error) {
                console.error("Error decoding polyline:", error)
              }
            }
          }

          if (snapResult) {
            processedPoint = {
              ...point,
              coordinates: snapResult.snappedPoint,
              snappedCoordinates: snapResult.isSnapped
                ? snapResult.snappedPoint
                : undefined,
              isSnapped: snapResult.isSnapped,
            }
          }

          if (snapResult?.isSnapped && routeCoordinates) {
            try {
              processedPoint.distanceFromStart = calculateDistanceFromStart(
                snapResult.snappedPoint,
                routeCoordinates,
              )
            } catch (error) {
              console.error("Error calculating distance from start:", error)
            }
          }
        }
      }

      set((state) => ({
        segmentation: {
          ...state.segmentation,
          error: undefined,
        },
      }))
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          cutPoints: [...state.segmentation.cutPoints, processedPoint],
        },
      }))

      debouncedCalculatePreviewSegments()
    },

    removeCutPoint: (pointId) => {
      const { segmentation } = get()
      const cutPoint = segmentation.cutPoints.find(
        (p: CutPoint) => p.id === pointId,
      )

      if (cutPoint) {
        set((state) => ({
          segmentation: {
            ...state.segmentation,
            cutPoints: state.segmentation.cutPoints.filter(
              (point) => point.id !== pointId,
            ),
          },
        }))

        debouncedCalculatePreviewSegments()
      }
    },

    updateCutPoint: (pointId, coordinates) => {
      const { segmentation } = get()
      const cutPoint = segmentation.cutPoints.find(
        (p: CutPoint) => p.id === pointId,
      )

      if (cutPoint) {
        set((state) => ({
          segmentation: {
            ...state.segmentation,
            cutPoints: state.segmentation.cutPoints.map((point) =>
              point.id === pointId ? { ...point, coordinates } : point,
            ),
          },
        }))

        debouncedCalculatePreviewSegments()
      }
    },

    clearCutPoints: () => {
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          cutPoints: [],
        },
      }))
    },

    stopSegmentation: () => {
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          targetRoute: null,
          cutPoints: [],
          type: "manual",
          distanceKm: undefined,
          isActive: false,
          previewSegments: [],
          selectedSegmentIds: new Set<string>(),
          hoveredSegmentId: null,
          isCalculating: false,
          error: undefined,
          snapToRoute: true,
          snapPrecision: 10,
          isDragging: false,
          dragStartPosition: undefined,
          snapshots: [],
        },
      }))

      const { setMapMode, mapMode } = useProjectWorkspaceStore.getState()
      if (mapMode !== "individual_drawing") {
        setMapMode("view")
      }
    },

    setDistanceKm: (distanceKm) => {
      const { segmentation } = get()

      // Validate minimum distance (0.01 km)
      if (distanceKm < 0.01) {
        set((state) => ({
          segmentation: {
            ...state.segmentation,
            distanceKm,
            error: "Distance must be at least 0.01 km",
            previewSegments: [],
          },
        }))
        return
      }

      if (segmentation.targetRoute) {
        // Calculate route length from polyline for consistent validation
        // This matches the calculation in debouncedCalculatePreviewSegments
        let routeLengthKm: number | null = null

        if (segmentation.targetRoute.encodedPolyline) {
          try {
            const routeCoordinates = decodePolylineToGeoJSON(
              segmentation.targetRoute.encodedPolyline,
            )

            if (
              routeCoordinates.coordinates &&
              routeCoordinates.coordinates.length > 0
            ) {
              const routeCoords = routeCoordinates.coordinates

              // Calculate cumulative distances for consistent length calculation
              const cumulativeDistancesForTotal: number[] = [0]
              for (let i = 0; i < routeCoords.length - 1; i++) {
                const segmentLength = turf.distance(
                  turf.point([routeCoords[i][0], routeCoords[i][1]]),
                  turf.point([routeCoords[i + 1][0], routeCoords[i + 1][1]]),
                  "kilometers" as const,
                )
                cumulativeDistancesForTotal.push(
                  cumulativeDistancesForTotal[i] + segmentLength,
                )
              }
              routeLengthKm =
                cumulativeDistancesForTotal[
                  cumulativeDistancesForTotal.length - 1
                ]
            }
          } catch (error) {
            // If calculation fails, fall back to route.distance
            const targetRoute = segmentation.targetRoute as any
            routeLengthKm = targetRoute.distance
          }
        } else {
          // Fall back to route.distance if no polyline
          const targetRoute = segmentation.targetRoute as any
          routeLengthKm = targetRoute.distance
        }

        // Only validate if route length is less than or equal to segment distance
        if (routeLengthKm !== null && routeLengthKm <= distanceKm + 0.001) {
          // Cancel any pending worker requests
          workerRequestId = null

          set((state) => ({
            segmentation: {
              ...state.segmentation,
              distanceKm,
              error: `ROUTE_LENGTH_${routeLengthKm}_SEGMENT_DISTANCE_${distanceKm}`,
              previewSegments: [],
              isCalculating: false,
              calculatedDistanceKm: undefined,
            },
          }))
          return
        }
      }

      set((state) => ({
        segmentation: {
          ...state.segmentation,
          distanceKm,
          error: undefined,
        },
      }))

      debouncedCalculatePreviewSegments()
    },

    calculatePreviewSegments: () => {
      debouncedCalculatePreviewSegments()
    },

    clearPreviewSegments: () => {
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          previewSegments: [],
          selectedSegmentIds: new Set<string>(),
          hoveredSegmentId: null,
        },
      }))
    },

    toggleSegmentSelection: (segmentId) => {
      set((state) => {
        const newSelectedIds = new Set(state.segmentation.selectedSegmentIds)
        if (newSelectedIds.has(segmentId)) {
          newSelectedIds.delete(segmentId)
        } else {
          newSelectedIds.add(segmentId)
        }
        return {
          segmentation: {
            ...state.segmentation,
            selectedSegmentIds: newSelectedIds,
          },
        }
      })
    },

    selectAllSegments: () => {
      set((state) => {
        const allIds = new Set(
          state.segmentation.previewSegments.map((seg: any) => seg.id),
        )
        return {
          segmentation: {
            ...state.segmentation,
            selectedSegmentIds: allIds,
          },
        }
      })
    },

    deselectAllSegments: () => {
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          selectedSegmentIds: new Set<string>(),
        },
      }))
    },

    setHoveredSegmentId: (segmentId) => {
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          hoveredSegmentId: segmentId,
        },
      }))
    },

    setSnapToRoute: (enabled) => {
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          snapToRoute: enabled,
        },
      }))
    },

    setSnapPrecision: (precision) => {
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          snapPrecision: precision,
        },
      }))
    },

    startDragging: (pointId, position) => {
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          isDragging: true,
          dragStartPosition: position,
          cutPoints: state.segmentation.cutPoints.map((point) =>
            point.id === pointId ? { ...point, isDragging: true } : point,
          ),
        },
      }))
    },

    updateDragging: (pointId, position) => {
      const { segmentation } = get()

      let processedPosition = position
      let isSnapped = false

      const targetRoute = segmentation.targetRoute
      if (segmentation.snapToRoute && targetRoute) {
        let snapResult: {
          snappedPoint: { lat: number; lng: number }
          isSnapped: boolean
          distance: number
        } | null = null

        // For routes from import roads flow, use originalRouteGeoJson if available
        if (targetRoute.originalRouteGeoJson) {
          try {
            const routeCoordinates = extractCoordinatesFromGeoJSON(
              targetRoute.originalRouteGeoJson,
            )
            if (routeCoordinates.length > 0) {
              snapResult = findClosestPointOnRoute(
                position,
                routeCoordinates,
                segmentation.snapPrecision,
              )
            }
          } catch (error) {
            console.error(
              "Error extracting coordinates from originalRouteGeoJson:",
              error,
            )
          }
        }

        // Fall back to encodedPolyline if originalRouteGeoJson is not available or failed
        if (!snapResult && targetRoute.encodedPolyline) {
          // Check if encodedPolyline is a JSON array (for imported routes)
          const jsonCoords = extractCoordinatesFromEncodedPolyline(
            targetRoute.encodedPolyline,
          )

          if (jsonCoords) {
            // It's a JSON array - use it directly
            snapResult = findClosestPointOnRoute(
              position,
              jsonCoords,
              segmentation.snapPrecision,
            )
          } else {
            // It's a Google-encoded polyline - decode it
            snapResult = snapCutPointToRoute(
              position,
              targetRoute.encodedPolyline,
              segmentation.snapToRoute,
              segmentation.snapPrecision,
            )
          }
        }

        if (snapResult) {
          processedPosition = snapResult.snappedPoint
          isSnapped = snapResult.isSnapped
        }
      }

      set((state) => ({
        segmentation: {
          ...state.segmentation,
          cutPoints: state.segmentation.cutPoints.map((point) =>
            point.id === pointId
              ? {
                  ...point,
                  coordinates: processedPosition,
                  isSnapped: isSnapped,
                  snappedCoordinates: isSnapped
                    ? processedPosition
                    : point.snappedCoordinates,
                }
              : point,
          ),
        },
      }))

      debouncedCalculatePreviewSegments()
    },

    endDragging: (pointId, position) => {
      const { segmentation } = get()
      const cutPoint = segmentation.cutPoints.find(
        (p: CutPoint) => p.id === pointId,
      )

      if (cutPoint && segmentation.dragStartPosition) {
        set((state) => ({
          segmentation: {
            ...state.segmentation,
            isDragging: false,
            dragStartPosition: undefined,
            cutPoints: state.segmentation.cutPoints.map((point) =>
              point.id === pointId
                ? { ...point, isDragging: false, coordinates: position }
                : point,
            ),
          },
        }))
      }

      debouncedCalculatePreviewSegments()
    },

    applySegmentation: async (segmentationData) => {
      const { segmentation } = get()
      if (!segmentation.targetRoute) {
        throw new Error("No target route selected")
      }

      try {
        const { routesApi } = await import("../../../data/api")

        const response = await routesApi.applySegmentation(
          segmentation.targetRoute.id,
          segmentationData,
        )

        if (response.success) {
          const { updateRoute } = useProjectWorkspaceStore.getState()
          updateRoute(segmentation.targetRoute.id, {
            isSegmented: true,
            roads: segmentationData.segments,
            segmentCount: segmentationData.segments.length,
            segmentationType: segmentationData.type,
            updatedAt: new Date().toISOString(),
          })

          get().stopSegmentation()
        } else {
          throw new Error(response.message || "Failed to apply segmentation")
        }
      } catch (error: any) {
        set((state) => ({
          segmentation: {
            ...state.segmentation,
            error: error.message,
          },
        }))
        throw error
      }
    },

    createSnapshot: (description) => {
      const { segmentation } = get()
      if (!segmentation.targetRoute) return

      const snapshot: SegmentationSnapshot = {
        id: `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        routeId: segmentation.targetRoute.id,
        cutPoints: [...segmentation.cutPoints],
        segments: [...segmentation.previewSegments],
        createdAt: new Date(),
        description,
      }

      set((state) => ({
        segmentation: {
          ...state.segmentation,
          snapshots: [snapshot, ...state.segmentation.snapshots.slice(0, 9)],
        },
      }))
    },

    restoreSnapshot: (snapshotId) => {
      const { segmentation } = get()
      const snapshot = segmentation.snapshots.find(
        (s: SegmentationSnapshot) => s.id === snapshotId,
      )
      if (!snapshot) return

      set((state) => ({
        segmentation: {
          ...state.segmentation,
          cutPoints: [...snapshot.cutPoints],
          previewSegments: [...snapshot.segments],
        },
      }))

      debouncedCalculatePreviewSegments()
    },

    getSnapshots: () => {
      const { segmentation } = get()
      return segmentation.snapshots
    },

    loadExistingCutPoints: (cutPointsData) => {
      try {
        const cutPoints: CutPoint[] = cutPointsData.cutPoints.map(
          (cp, index) => ({
            id: cp.id,
            routeId: get().segmentation.targetRoute?.id || "",
            coordinates: cp.coordinates,
            cutOrder: index,
            distanceFromStart: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isSnapped: true,
          }),
        )

        set((state) => ({
          segmentation: {
            ...state.segmentation,
            cutPoints: cutPoints,
            type: cutPointsData.segmentationType || "manual",
            distanceKm: cutPointsData.distanceKm,
          },
        }))

        get().calculatePreviewSegments()
      } catch (error) {
        throw error
      }
    },

    clearSegmentation: () => {
      // Cancel any pending worker requests
      workerRequestId = null

      set((state) => ({
        segmentation: {
          ...state.segmentation,
          targetRoute: null,
          cutPoints: [],
          type: "manual",
          distanceKm: undefined,
          isActive: false,
          previewSegments: [],
          selectedSegmentIds: new Set<string>(),
          hoveredSegmentId: null,
          isCalculating: false,
          error: undefined,
          snapToRoute: true,
          snapPrecision: 10,
          isDragging: false,
          dragStartPosition: undefined,
          history: [],
          historyIndex: -1,
          snapshots: [],
        },
      }))
    },

    fetchIntersectionsAndCreateSegments: async () => {
      const { segmentation } = get()
      if (!segmentation.targetRoute?.encodedPolyline) {
        set((state) => ({
          segmentation: {
            ...state.segmentation,
            isCalculating: false,
            error: "Route has no encoded polyline",
          },
        }))
        return
      }

      set((state) => ({
        segmentation: {
          ...state.segmentation,
          isCalculating: true,
          error: undefined,
        },
      }))

      try {
        // Import routesApi dynamically to avoid circular dependencies
        const { routesApi } = await import("../../../data/api/routes-api")
        const response = await routesApi.getIntersections(
          segmentation.targetRoute.encodedPolyline,
        )

        if (!response.success) {
          throw new Error(response.message || "Failed to fetch intersections")
        }

        const intersectionFeatures = response.data.features || []
        if (intersectionFeatures.length === 0) {
          set((state) => ({
            segmentation: {
              ...state.segmentation,
              isCalculating: false,
              error: "No intersections found along this route",
              cutPoints: [],
            },
          }))
          return
        }

        // Decode route to get coordinates for snapping intersection points
        const routeCoordinates = decodePolylineToGeoJSON(
          segmentation.targetRoute.encodedPolyline,
        )

        // Convert intersection points to cut points by snapping them to the route
        const cutPoints: CutPoint[] = intersectionFeatures
          .map((feature: GeoJSON.Feature<GeoJSON.Point>, index: number) => {
            if (feature.geometry.type !== "Point") return null
            const [lng, lat] = feature.geometry.coordinates

            // Find the exact point on the route
            const segmentInfo = findExactCutPointOnRoute(
              routeCoordinates.coordinates,
              { lat, lng },
            )

            return {
              id: `intersection-${index}-${Date.now()}`,
              routeId: segmentation.targetRoute!.id,
              coordinates: {
                lat: segmentInfo.coordinate[1],
                lng: segmentInfo.coordinate[0],
              },
              cutOrder: index,
              distanceFromStart: 0, // Will be calculated in calculatePreviewSegments
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              isSnapped: true,
            }
          })
          .filter((cp): cp is CutPoint => cp !== null)

        // Sort cut points by distance along route
        const routeCoords = routeCoordinates.coordinates
        const line = turf.lineString(
          routeCoords.map((coord) => [coord[0], coord[1]]),
        )

        // Calculate cumulative distances
        const cumulativeDistances: number[] = [0]
        for (let i = 0; i < routeCoords.length - 1; i++) {
          const segmentLength = turf.distance(
            turf.point([routeCoords[i][0], routeCoords[i][1]]),
            turf.point([routeCoords[i + 1][0], routeCoords[i + 1][1]]),
            "kilometers" as const,
          )
          cumulativeDistances.push(cumulativeDistances[i] + segmentLength)
        }

        // Calculate distance along route for each cut point and sort
        const cutPointsWithDistance = cutPoints
          .map((cutPoint) => {
            const segmentInfo = findExactCutPointOnRoute(
              routeCoordinates.coordinates,
              cutPoint.coordinates,
            )
            const segmentIdx = Math.max(
              0,
              Math.min(segmentInfo.index - 1, cumulativeDistances.length - 2),
            )
            let distanceAlongRoute = cumulativeDistances[segmentIdx] || 0

            if (segmentIdx < routeCoords.length - 1) {
              const segmentStart = routeCoords[segmentIdx]
              const segmentEnd = routeCoords[segmentIdx + 1]
              const segmentLine = turf.lineString([
                [segmentStart[0], segmentStart[1]],
                [segmentEnd[0], segmentEnd[1]],
              ])
              const cutPointCoord = [
                cutPoint.coordinates.lng,
                cutPoint.coordinates.lat,
              ]
              const nearest = (turf as any).nearestPointOnLine(
                segmentLine,
                turf.point(cutPointCoord),
                { units: "kilometers" as const },
              )
              const distInSegment = turf.distance(
                turf.point([segmentStart[0], segmentStart[1]]),
                nearest,
                "kilometers" as const,
              )
              distanceAlongRoute += distInSegment
            }

            return { cutPoint, distanceAlongRoute }
          })
          .sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute)

        // Update cut points with sorted order
        const sortedCutPoints = cutPointsWithDistance.map((item, index) => ({
          ...item.cutPoint,
          cutOrder: index,
          distanceFromStart: item.distanceAlongRoute * 1000, // Convert to meters
        }))

        set((state) => ({
          segmentation: {
            ...state.segmentation,
            cutPoints: sortedCutPoints,
            isCalculating: false,
            error: undefined,
          },
        }))

        // Trigger preview segment calculation
        get().calculatePreviewSegments()
      } catch (error: any) {
        set((state) => ({
          segmentation: {
            ...state.segmentation,
            isCalculating: false,
            error: error.message || "Failed to fetch intersections",
          },
        }))
      }
    },

    switchToManualMode: () => {
      // Clear temporal history when switching to manual mode
      useLayerStore.temporal.getState().clear()

      // Switch to manual mode while preserving existing cut points
      // Clear preview segments - they will be recalculated based on manual cut points
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          type: "manual",
          error: undefined,
          previewSegments: [],
        },
      }))
      // Recalculate preview segments with the new mode
      debouncedCalculatePreviewSegments()
    },

    switchToDistanceMode: () => {
      // Clear temporal history when switching to distance mode
      useLayerStore.temporal.getState().clear()

      // Switch to distance mode
      // Clear cut points and preview segments - they will be recalculated based on distance
      set((state) => ({
        segmentation: {
          ...state.segmentation,
          type: "distance",
          cutPoints: [],
          distanceKm: undefined,
          error: undefined,
          previewSegments: [],
        },
      }))
      // Recalculate preview segments with the new mode
      debouncedCalculatePreviewSegments()
    },
  }
}
