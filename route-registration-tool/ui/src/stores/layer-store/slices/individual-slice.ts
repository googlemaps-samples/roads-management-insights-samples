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

import { StateCreator } from "zustand"

import { isRouteWithinBoundary } from "../../../utils/boundary-validation"
import { toast } from "../../../utils/toast"
import { useMessageStore } from "../../message-store"
import { Route } from "../../project-workspace-store"
import { useProjectWorkspaceStore } from "../../project-workspace-store"
import {
  IndividualRouteState,
  LayerStore,
  RouteGenerationState,
  RoutePoint,
} from "../types"

export interface IndividualSlice {
  individualRoute: IndividualRouteState
  routeGeneration: RouteGenerationState
  isAddingIndividualWaypoint: boolean
  setAddingIndividualWaypointMode: (isAdding: boolean) => void
  cancelAddingIndividualWaypoint: () => void
  addPoint: (point: RoutePoint) => void
  movePoint: (
    pointId: string,
    coordinates: { lat: number; lng: number },
  ) => void
  removePoint: (pointId: string) => void
  reorderPoints: (activeId: string, overId: string) => void
  swapStartEnd: () => void
  clearPoints: () => void
  setGenerating: (isGenerating: boolean) => void
  setGeneratedRoute: (route: Route | null) => void
  setCurrentRouteId: (routeId: string | null) => void
  setRouteUUID: (uuid: string | null) => void
  setIndividualRouteError: (error: string | null) => void
  loadRoutePoints: (route: Route) => void
  clearIndividualRoute: () => void
  clearRouteGenerationKey: () => void
  generateRoute: (params: {
    points: RoutePoint[]
    projectId: string
    generateRouteMutation: any
    saveRouteMutation: any
    setGenerating: (isGenerating: boolean) => void
    setGeneratedRoute: (route: Route | null) => void
    setRouteUUID: (uuid: string | null) => void
  }) => void
}

export const createIndividualSlice: StateCreator<
  LayerStore,
  [],
  [],
  IndividualSlice
> = (set, get) => ({
  individualRoute: {
    points: [],
    isGenerating: false,
    generatedRoute: null,
    currentRouteId: null,
    routeUUID: null,
    originalRouteName: null,
    originalRouteTag: null,
    originalRouteIsSegmented: false,
    validationError: null,
  },

  routeGeneration: {
    isGenerating: false,
    lastGeneratedRouteKey: "",
    routeUUID: null,
  },

  isAddingIndividualWaypoint: false,

  setAddingIndividualWaypointMode: (isAdding) => {
    set({ isAddingIndividualWaypoint: isAdding })
  },

  cancelAddingIndividualWaypoint: () => {
    set({ isAddingIndividualWaypoint: false })
  },

  addPoint: (point) => {
    set((state) => {
      const currentPoints = state.individualRoute.points
      let newPoints: RoutePoint[]

      // If we have 0 or 1 points, just append (first is origin, second is destination)
      if (currentPoints.length < 2) {
        newPoints = [...currentPoints, point]
      } else {
        // If we have 2+ points, insert the new point BEFORE the last point (destination)
        // This ensures waypoints are added between origin and destination
        // e.g., [O, D] + W1 becomes [O, W1, D]
        // e.g., [O, W1, D] + W2 becomes [O, W1, W2, D]
        newPoints = [
          ...currentPoints.slice(0, -1), // All points except the last (destination)
          point, // New waypoint
          currentPoints[currentPoints.length - 1], // Last point (destination)
        ]
      }

      return {
        individualRoute: {
          ...state.individualRoute,
          points: newPoints,
          validationError: null,
        },
      }
    })
  },

  movePoint: (pointId, coordinates) => {
    set((state) => ({
      individualRoute: {
        ...state.individualRoute,
        points: state.individualRoute.points.map((point) =>
          point.id === pointId ? { ...point, coordinates } : point,
        ),
        validationError: null, // Clear validation error when point is moved
      },
    }))

    // Clear boundary-related error messages when point is moved
    const { dismissMessagesByPattern } = useMessageStore.getState()
    dismissMessagesByPattern(
      /jurisdiction boundary|outside.*boundary/i,
      "error",
    )
  },

  removePoint: (pointId) => {
    set((state) => ({
      individualRoute: {
        ...state.individualRoute,
        points: state.individualRoute.points.filter(
          (point) => point.id !== pointId,
        ),
        validationError: null,
      },
    }))
  },

  reorderPoints: (activeId, overId) => {
    set((state) => {
      const points = [...state.individualRoute.points]
      const activeIndex = points.findIndex((p) => p.id === activeId)
      const overIndex = points.findIndex((p) => p.id === overId)

      if (activeIndex === -1 || overIndex === -1) return state

      const [removed] = points.splice(activeIndex, 1)
      points.splice(overIndex, 0, removed)

      return {
        individualRoute: {
          ...state.individualRoute,
          points,
        },
      }
    })
  },

  swapStartEnd: () => {
    set((state) => {
      const points = [...state.individualRoute.points]

      // Need at least 2 points to swap
      if (points.length < 2) return state

      // Swap first and last points
      const temp = points[0]
      points[0] = points[points.length - 1]
      points[points.length - 1] = temp

      return {
        individualRoute: {
          ...state.individualRoute,
          points,
        },
      }
    })
  },

  clearPoints: () => {
    set((state) => ({
      individualRoute: {
        ...state.individualRoute,
        points: [],
        generatedRoute: null,
        currentRouteId: null,
        routeUUID: null,
        originalRouteName: null,
        originalRouteTag: null,
        originalRouteIsSegmented: false,
        validationError: null,
      },
    }))
  },

  setGenerating: (isGenerating) => {
    set((state) => ({
      individualRoute: {
        ...state.individualRoute,
        isGenerating,
      },
    }))
  },

  setGeneratedRoute: (route) => {
    set((state) => ({
      individualRoute: {
        ...state.individualRoute,
        generatedRoute: route,
        validationError: null,
      },
    }))
  },

  setCurrentRouteId: (routeId) => {
    set((state) => ({
      individualRoute: {
        ...state.individualRoute,
        currentRouteId: routeId,
      },
    }))
  },

  setRouteUUID: (uuid) => {
    set((state) => ({
      individualRoute: {
        ...state.individualRoute,
        routeUUID: uuid,
      },
    }))
  },

  setIndividualRouteError: (error) => {
    set((state) => ({
      individualRoute: {
        ...state.individualRoute,
        validationError: error,
        // generatedRoute: error ? null : state.individualRoute.generatedRoute,
      },
    }))
  },

  loadRoutePoints: (route) => {
    const points: RoutePoint[] = []

    // Validate and normalize origin
    if (!route.origin || (route.origin.lat === 0 && route.origin.lng === 0)) {
      console.error("❌ Invalid route origin - cannot load route for editing", {
        routeId: route.id,
        origin: route.origin,
      })
      return
    }

    // Validate and normalize destination
    if (
      !route.destination ||
      (route.destination.lat === 0 && route.destination.lng === 0)
    ) {
      console.error(
        "❌ Invalid route destination - cannot load route for editing",
        {
          routeId: route.id,
          destination: route.destination,
        },
      )
      return
    }

    // Add origin
    points.push({
      id: `origin_${Date.now()}`,
      coordinates: route.origin,
    })

    // Handle waypoints - ensure it's an array and normalize coordinates
    const waypoints = Array.isArray(route.waypoints) ? route.waypoints : []
    waypoints.forEach((waypoint: any, index) => {
      // Normalize coordinate format if needed
      let normalizedWaypoint: { lat: number; lng: number }

      if (
        typeof waypoint === "object" &&
        waypoint !== null &&
        "lat" in waypoint &&
        "lng" in waypoint
      ) {
        // Already in { lat, lng } format
        normalizedWaypoint = { lat: waypoint.lat, lng: waypoint.lng }
      } else if (Array.isArray(waypoint) && waypoint.length >= 2) {
        // Handle [lng, lat] array format
        normalizedWaypoint = { lat: waypoint[1], lng: waypoint[0] }
      } else {
        console.warn("⚠️ Invalid waypoint format, skipping:", waypoint)
        return
      }

      points.push({
        id: `waypoint_${index}_${Date.now()}`,
        coordinates: normalizedWaypoint,
      })
    })

    // Add destination
    points.push({
      id: `destination_${Date.now()}`,
      coordinates: route.destination,
    })

    set((state) => ({
      individualRoute: {
        ...state.individualRoute,
        points,
        generatedRoute: route,
        originalRouteName: route.name,
        originalRouteTag: route.tag || null,
        originalRouteIsSegmented: route.isSegmented,
        validationError: null,
      },
      isAddingIndividualWaypoint: false, // Reset waypoint adding mode when loading route
    }))
  },

  clearIndividualRoute: () => {
    set(() => ({
      individualRoute: {
        points: [],
        isGenerating: false,
        generatedRoute: null,
        currentRouteId: null,
        routeUUID: null,
        originalRouteName: null,
        originalRouteTag: null,
        originalRouteIsSegmented: false,
        validationError: null,
      },
      routeGeneration: {
        isGenerating: false,
        lastGeneratedRouteKey: "",
        routeUUID: null,
      },
      isAddingIndividualWaypoint: false, // Reset waypoint adding mode
    }))
  },

  clearRouteGenerationKey: () => {
    set((state) => ({
      routeGeneration: {
        ...state.routeGeneration,
        lastGeneratedRouteKey: "",
      },
    }))
  },

  generateRoute: (params) => {
    const {
      points,
      projectId,
      generateRouteMutation,
      setGenerating,
      setGeneratedRoute,
      setRouteUUID,
    } = params
    const { routeGeneration } = get()

    if (points.length >= 2) {
      const typedPoints = points.map((point, index) => {
        if (index === 0) {
          return { ...point, type: "origin" as const }
        } else if (index === points.length - 1) {
          return { ...point, type: "destination" as const }
        } else {
          return { ...point, type: "waypoint" as const }
        }
      })

      const origin = typedPoints[0]
      const destination = typedPoints[typedPoints.length - 1]
      const waypoints = typedPoints.slice(1, -1)

      if (origin && destination) {
        const pointsKey = `${origin.coordinates.lat},${origin.coordinates.lng}-${destination.coordinates.lat},${destination.coordinates.lng}-${waypoints.map((w) => `${w.coordinates.lat},${w.coordinates.lng}`).join("|")}`

        if (routeGeneration.lastGeneratedRouteKey !== pointsKey) {
          set((state: LayerStore) => ({
            routeGeneration: {
              ...state.routeGeneration,
              lastGeneratedRouteKey: pointsKey,
              isGenerating: true,
            },
          }))

          setGenerating(true)

          generateRouteMutation.mutate(
            {
              origin: origin.coordinates,
              destination: destination.coordinates,
              waypoints: waypoints.map((w) => w.coordinates),
            },
            {
              onSuccess: (routeData: any) => {
                // Check if polyline is empty - this means no route exists between the points
                if (
                  !routeData?.encodedPolyline ||
                  routeData.encodedPolyline.trim() === ""
                ) {
                  console.error("❌ No route found between points")
                  toast.error(
                    "No routes found between these points. Please select different points.",
                  )

                  // Clear generating state, reset key, and store validation error
                  setGenerating(false)
                  set((state: LayerStore) => ({
                    routeGeneration: {
                      ...state.routeGeneration,
                      isGenerating: false,
                      lastGeneratedRouteKey: "",
                    },
                    individualRoute: {
                      ...state.individualRoute,
                      validationError:
                        "No routes found between these points. Please select different points.",
                    },
                  }))
                  return
                }

                // Validate route is within jurisdiction boundary
                const { projectData } = useProjectWorkspaceStore.getState()
                const boundary = projectData?.boundaryGeoJson

                if (boundary) {
                  const isWithinBoundary = isRouteWithinBoundary(
                    routeData.encodedPolyline,
                    boundary,
                  )

                  if (!isWithinBoundary) {
                    console.error(
                      "❌ Route extends outside jurisdiction boundary",
                    )
                    toast.error(
                      "Route extends outside the jurisdiction boundary. Please adjust your route points.",
                    )

                    // Clear generating state, reset key, and store validation error
                    setGenerating(false)
                    set((state: LayerStore) => ({
                      routeGeneration: {
                        ...state.routeGeneration,
                        isGenerating: false,
                        lastGeneratedRouteKey: "",
                      },
                      individualRoute: {
                        ...state.individualRoute,
                        // generatedRoute: null,
                        validationError:
                          "Route extends outside the jurisdiction boundary. Please adjust your route points.",
                      },
                    }))
                    return
                  }
                }

                // Clear boundary-related error messages when route is successfully generated
                const { dismissMessagesByPattern } = useMessageStore.getState()
                dismissMessagesByPattern(
                  /jurisdiction boundary|outside.*boundary/i,
                  "error",
                )

                // Preserve the original route type if editing an existing route
                const currentState = get()
                const originalRouteType =
                  currentState.individualRoute.generatedRoute?.type ||
                  "individual"

                const generatedRoute = {
                  id: `temp_route_${Date.now()}`,
                  name: `Individual Route ${Date.now()}`,
                  projectId: projectId,
                  type: originalRouteType as Route["type"],
                  source: "individual_drawing" as const,
                  origin: origin.coordinates,
                  destination: destination.coordinates,
                  waypoints: waypoints.map((w) => w.coordinates),
                  encodedPolyline: routeData.encodedPolyline,
                  distance: routeData.distance || 0,
                  duration: routeData.duration || 0,
                  status: "unsynced" as const,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  roads: [],
                  isSegmented: false,
                  segmentCount: 0,
                  color: "#2196F3",
                  opacity: 1,
                  strokeWidth: 4,
                }

                setGeneratedRoute(generatedRoute)
                setGenerating(false)

                set((state: LayerStore) => ({
                  routeGeneration: {
                    ...state.routeGeneration,
                    isGenerating: false,
                  },
                }))
              },
              onError: (error: Error | unknown) => {
                console.error("Failed to generate route:", error)

                // Extract error message from error object
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : "Failed to generate route. Please try again."

                // Show error toast with the actual error message
                toast.error(errorMessage)

                setGenerating(false)

                set((state: LayerStore) => ({
                  routeGeneration: {
                    ...state.routeGeneration,
                    isGenerating: false,
                    lastGeneratedRouteKey: "",
                  },
                  individualRoute: {
                    ...state.individualRoute,
                    validationError: errorMessage,
                  },
                }))
              },
            },
          )
        }
      }
    }
  },
})
