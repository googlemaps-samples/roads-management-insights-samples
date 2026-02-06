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

import {
  LayerStore,
  RouteEditingState,
  RouteMarkers,
  SnappedRoad,
  SnappedRoadsState,
  UploadedRoute,
  UploadedRoutesState,
  Waypoint,
} from "../types"

export interface UserRoutesSlice {
  uploadedRoutes: UploadedRoutesState
  snappedRoads: SnappedRoadsState
  selectedUploadedRouteId: string | null
  isAddingWaypoint: boolean
  waypointAddingRouteId: string | null
  addUploadedRoute: (route: UploadedRoute) => void
  updateUploadedRoute: (
    routeId: string,
    updates: Partial<UploadedRoute>,
  ) => void
  removeUploadedRoute: (routeId: string) => void
  clearUploadedRoutes: () => void
  setUploadedRoutesVisibility: (visible: boolean) => void
  focusOnUploadedRoutes: (routeIds: string[]) => void
  clearUploadedRouteFocus: () => void
  addSnappedRoads: (uploadedRouteId: string, roads: GeoJSON.Feature[]) => void
  removeSnappedRoadsForRoute: (uploadedRouteId: string) => void
  clearSnappedRoads: () => void
  addPreviewRoads: (uploadedRouteId: string, roads: GeoJSON.Feature[]) => void
  removePreviewRoadsForRoute: (uploadedRouteId: string) => void
  setSnappedRoadsVisibility: (visible: boolean) => void
  setSnappedRoadsLoading: (isLoading: boolean) => void
  setOptimizedRouteMarkers: (
    routeId: string,
    startMarker: { lat: number; lng: number },
    endMarker: { lat: number; lng: number },
  ) => void
  updateOptimizedRouteMarker: (
    routeId: string,
    type: "start" | "end",
    position: { lat: number; lng: number },
  ) => void
  removeOptimizedRouteMarkers: (routeId: string) => void
  clearAllOptimizedRouteMarkers: () => void
  setDraggingMarker: (isDragging: boolean) => void
  setHoveredRouteId: (routeId: string | null) => void
  setSelectedUploadedRouteId: (routeId: string | null) => void
  addWaypoint: (routeId: string, position: { lat: number; lng: number }) => void
  removeWaypoint: (routeId: string, waypointId: string) => void
  updateWaypoint: (
    routeId: string,
    waypointId: string,
    position: { lat: number; lng: number },
  ) => void
  moveWaypointUp: (routeId: string, waypointId: string) => void
  moveWaypointDown: (routeId: string, waypointId: string) => void
  moveOriginDown: (routeId: string) => void
  moveDestinationUp: (routeId: string) => void
  setAddingWaypointMode: (routeId: string | null) => void
  cancelAddingWaypoint: () => void
  swapRouteStartEnd: (routeId: string) => void
  hasUnsavedChanges: (routeId: string) => boolean
  initializeRouteEditing: (routeId: string) => void
  getEditingState: (routeId: string) => RouteEditingState | null
  saveRouteChanges: (routeId: string) => void
  discardRouteChanges: (routeId: string) => void
  editingSavedRouteId: string | null
  setEditingSavedRouteId: (routeId: string | null) => void
}

export const createUserRoutesSlice: StateCreator<
  LayerStore,
  [],
  [],
  UserRoutesSlice
> = (set, get) => ({
  uploadedRoutes: {
    routes: [],
    isVisible: true,
    focusRouteIds: [],
  },

  snappedRoads: {
    roads: [],
    isVisible: true,
    isLoading: false,
    routeMarkers: [],
    isDraggingMarker: false,
    hoveredRouteId: null,
    previewRoads: [],
    editingStates: {},
  },

  selectedUploadedRouteId: null,
  isAddingWaypoint: false,
  waypointAddingRouteId: null,
  editingSavedRouteId: null,

  addUploadedRoute: (route) => {
    set((state) => ({
      uploadedRoutes: {
        ...state.uploadedRoutes,
        routes: [...state.uploadedRoutes.routes, route],
      },
    }))
  },

  updateUploadedRoute: (routeId, updates) => {
    set((state) => ({
      uploadedRoutes: {
        ...state.uploadedRoutes,
        routes: state.uploadedRoutes.routes.map((r) =>
          r.id === routeId ? { ...r, ...updates } : r,
        ),
      },
    }))
  },

  removeUploadedRoute: (routeId) => {
    set((state) => ({
      uploadedRoutes: {
        ...state.uploadedRoutes,
        routes: state.uploadedRoutes.routes.filter((r) => r.id !== routeId),
      },
    }))
  },

  clearUploadedRoutes: () => {
    set((state) => ({
      uploadedRoutes: {
        ...state.uploadedRoutes,
        routes: [],
      },
    }))
  },

  setUploadedRoutesVisibility: (visible) => {
    set((state) => ({
      uploadedRoutes: {
        ...state.uploadedRoutes,
        isVisible: visible,
      },
    }))
  },

  focusOnUploadedRoutes: (routeIds) => {
    set((state) => ({
      uploadedRoutes: {
        ...state.uploadedRoutes,
        focusRouteIds: routeIds,
      },
    }))
  },

  clearUploadedRouteFocus: () => {
    set((state) => ({
      uploadedRoutes: {
        ...state.uploadedRoutes,
        focusRouteIds: [],
      },
    }))
  },

  addSnappedRoads: (uploadedRouteId, roads) => {
    set((state) => {
      // Safety check: Don't add snapped roads if the route no longer exists
      // This prevents routes from being added after they've been cleared
      const routeExists = state.uploadedRoutes.routes.some(
        (r) => r.id === uploadedRouteId,
      )
      if (!routeExists) {
        console.warn(
          `⚠️ Skipping addSnappedRoads for route ${uploadedRouteId} - route no longer exists`,
        )
        return state
      }

      const newRoads: SnappedRoad[] = roads.map((feature, index) => ({
        id: `${uploadedRouteId}-snapped-${index}`,
        uploadedRouteId,
        feature,
      }))

      return {
        snappedRoads: {
          ...state.snappedRoads,
          roads: [...state.snappedRoads.roads, ...newRoads],
        },
      }
    })
  },

  removeSnappedRoadsForRoute: (uploadedRouteId) => {
    set((state) => ({
      snappedRoads: {
        ...state.snappedRoads,
        roads: state.snappedRoads.roads.filter(
          (road) => road.uploadedRouteId !== uploadedRouteId,
        ),
      },
    }))
  },

  clearSnappedRoads: () => {
    set((state) => ({
      snappedRoads: {
        ...state.snappedRoads,
        roads: [],
      },
    }))
  },

  addPreviewRoads: (uploadedRouteId, roads) => {
    set((state) => {
      const newRoads: SnappedRoad[] = roads.map((feature, index) => ({
        id: `${uploadedRouteId}-preview-${index}`,
        uploadedRouteId,
        feature,
      }))

      // Remove existing preview roads for this route first
      const otherPreviewRoads = state.snappedRoads.previewRoads.filter(
        (road) => road.uploadedRouteId !== uploadedRouteId,
      )

      return {
        snappedRoads: {
          ...state.snappedRoads,
          previewRoads: [...otherPreviewRoads, ...newRoads],
        },
      }
    })
  },

  removePreviewRoadsForRoute: (uploadedRouteId) => {
    set((state) => ({
      snappedRoads: {
        ...state.snappedRoads,
        previewRoads: state.snappedRoads.previewRoads.filter(
          (road) => road.uploadedRouteId !== uploadedRouteId,
        ),
      },
    }))
  },

  setSnappedRoadsVisibility: (visible) => {
    set((state) => ({
      snappedRoads: {
        ...state.snappedRoads,
        isVisible: visible,
      },
    }))
  },

  setSnappedRoadsLoading: (isLoading) => {
    set((state) => ({
      snappedRoads: {
        ...state.snappedRoads,
        isLoading,
      },
    }))
  },

  setOptimizedRouteMarkers: (routeId, startMarker, endMarker) => {
    set((state) => {
      // Safety check: Don't add markers if the route no longer exists
      // This prevents markers from being added after routes have been cleared
      const routeExists = state.uploadedRoutes.routes.some(
        (r) => r.id === routeId,
      )
      if (!routeExists) {
        console.warn(
          `⚠️ Skipping setOptimizedRouteMarkers for route ${routeId} - route no longer exists`,
        )
        return state
      }

      const existingIndex = state.snappedRoads.routeMarkers.findIndex(
        (m) => m.routeId === routeId,
      )

      let updatedMarkers
      if (existingIndex >= 0) {
        updatedMarkers = [...state.snappedRoads.routeMarkers]
        updatedMarkers[existingIndex] = {
          ...updatedMarkers[existingIndex],
          routeId,
          startMarker,
          endMarker,
        }
      } else {
        updatedMarkers = [
          ...state.snappedRoads.routeMarkers,
          { routeId, startMarker, endMarker, waypoints: [] },
        ]
      }

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          isDraggingMarker: false,
        },
      }
    })
  },

  updateOptimizedRouteMarker: (routeId, type, position) => {
    set((state) => {
      const updatedMarkers = state.snappedRoads.routeMarkers.map((markers) =>
        markers.routeId === routeId
          ? {
              ...markers,
              [type === "start" ? "startMarker" : "endMarker"]: position,
            }
          : markers,
      )

      // Also update temporary markers in editing state if it exists
      const editingState = state.snappedRoads.editingStates[routeId]
      const updatedEditingStates = editingState
        ? {
            ...state.snappedRoads.editingStates,
            [routeId]: {
              ...editingState,
              temporaryMarkers: {
                ...editingState.temporaryMarkers,
                [type === "start" ? "startMarker" : "endMarker"]: position,
              },
            },
          }
        : state.snappedRoads.editingStates

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          editingStates: updatedEditingStates,
        },
      }
    })
  },

  removeOptimizedRouteMarkers: (routeId) => {
    set((state) => ({
      snappedRoads: {
        ...state.snappedRoads,
        routeMarkers: state.snappedRoads.routeMarkers.filter(
          (m) => m.routeId !== routeId,
        ),
      },
    }))
  },

  clearAllOptimizedRouteMarkers: () => {
    set((state) => ({
      snappedRoads: {
        ...state.snappedRoads,
        routeMarkers: [],
        isDraggingMarker: false,
      },
    }))
  },

  setDraggingMarker: (isDragging) => {
    set((state) => ({
      snappedRoads: {
        ...state.snappedRoads,
        isDraggingMarker: isDragging,
      },
    }))
  },

  setHoveredRouteId: (routeId) => {
    set((state) => ({
      snappedRoads: {
        ...state.snappedRoads,
        hoveredRouteId: routeId,
      },
    }))
  },

  setSelectedUploadedRouteId: (routeId) => {
    set({ selectedUploadedRouteId: routeId })
  },

  addWaypoint: (routeId, position) => {
    set((state) => {
      const routeMarkers = state.snappedRoads.routeMarkers.find(
        (m) => m.routeId === routeId,
      )
      if (!routeMarkers) {
        return state
      }

      const newWaypoint: Waypoint = {
        id: `waypoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        position,
        order: routeMarkers.waypoints.length,
      }

      const updatedMarkers = state.snappedRoads.routeMarkers.map((markers) =>
        markers.routeId === routeId
          ? {
              ...markers,
              waypoints: [...markers.waypoints, newWaypoint],
            }
          : markers,
      )

      // Also update temporary markers in editing state if it exists
      const editingState = state.snappedRoads.editingStates[routeId]
      const updatedEditingStates = editingState
        ? {
            ...state.snappedRoads.editingStates,
            [routeId]: {
              ...editingState,
              temporaryMarkers: {
                ...editingState.temporaryMarkers,
                waypoints: [
                  ...editingState.temporaryMarkers.waypoints,
                  newWaypoint,
                ],
              },
            },
          }
        : state.snappedRoads.editingStates

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          editingStates: updatedEditingStates,
        },
        // Keep waypoint adding mode active so user can add multiple waypoints
        // Mode will be exited when user clicks "Cancel" or max waypoints reached
      }
    })
  },

  removeWaypoint: (routeId, waypointId) => {
    set((state) => {
      const updatedMarkers = state.snappedRoads.routeMarkers.map((markers) => {
        if (markers.routeId !== routeId) return markers

        const filteredWaypoints = markers.waypoints.filter(
          (wp) => wp.id !== waypointId,
        )
        const reorderedWaypoints = filteredWaypoints.map((wp, index) => ({
          ...wp,
          order: index,
        }))

        return {
          ...markers,
          waypoints: reorderedWaypoints,
        }
      })

      // Also update temporary markers in editing state if it exists
      const editingState = state.snappedRoads.editingStates[routeId]
      const updatedEditingStates = editingState
        ? {
            ...state.snappedRoads.editingStates,
            [routeId]: {
              ...editingState,
              temporaryMarkers: {
                ...editingState.temporaryMarkers,
                waypoints: editingState.temporaryMarkers.waypoints
                  .filter((wp) => wp.id !== waypointId)
                  .map((wp, index) => ({ ...wp, order: index })),
              },
            },
          }
        : state.snappedRoads.editingStates

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          editingStates: updatedEditingStates,
        },
      }
    })
  },

  updateWaypoint: (routeId, waypointId, position) => {
    set((state) => {
      const updatedMarkers = state.snappedRoads.routeMarkers.map((markers) => {
        if (markers.routeId !== routeId) return markers

        return {
          ...markers,
          waypoints: markers.waypoints.map((wp) =>
            wp.id === waypointId ? { ...wp, position } : wp,
          ),
        }
      })

      // Also update temporary markers in editing state if it exists
      const editingState = state.snappedRoads.editingStates[routeId]
      const updatedEditingStates = editingState
        ? {
            ...state.snappedRoads.editingStates,
            [routeId]: {
              ...editingState,
              temporaryMarkers: {
                ...editingState.temporaryMarkers,
                waypoints: editingState.temporaryMarkers.waypoints.map((wp) =>
                  wp.id === waypointId ? { ...wp, position } : wp,
                ),
              },
            },
          }
        : state.snappedRoads.editingStates

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          editingStates: updatedEditingStates,
        },
      }
    })
  },

  moveWaypointUp: (routeId, waypointId) => {
    set((state) => {
      const updatedMarkers = state.snappedRoads.routeMarkers.map((markers) => {
        if (markers.routeId !== routeId) return markers

        const waypoints = [...markers.waypoints].sort(
          (a, b) => a.order - b.order,
        )
        const waypointIndex = waypoints.findIndex((wp) => wp.id === waypointId)

        if (waypointIndex < 0) return markers

        // If it's the first waypoint, swap with origin
        if (waypointIndex === 0) {
          const newOrigin = waypoints[0].position
          const newFirstWaypoint = markers.startMarker

          return {
            ...markers,
            startMarker: newOrigin,
            waypoints: [
              {
                ...waypoints[0],
                position: newFirstWaypoint,
              },
              ...waypoints.slice(1),
            ].map((wp, index) => ({ ...wp, order: index })),
          }
        }

        // Swap with previous waypoint
        ;[waypoints[waypointIndex - 1], waypoints[waypointIndex]] = [
          waypoints[waypointIndex],
          waypoints[waypointIndex - 1],
        ]

        // Reassign orders
        const reorderedWaypoints = waypoints.map((wp, index) => ({
          ...wp,
          order: index,
        }))

        return {
          ...markers,
          waypoints: reorderedWaypoints,
        }
      })

      // Also update temporary markers in editing state if it exists
      const editingState = state.snappedRoads.editingStates[routeId]
      const updatedEditingStates = editingState
        ? {
            ...state.snappedRoads.editingStates,
            [routeId]: {
              ...editingState,
              temporaryMarkers: (() => {
                const tempMarkers = editingState.temporaryMarkers
                const waypoints = [...tempMarkers.waypoints].sort(
                  (a, b) => a.order - b.order,
                )
                const waypointIndex = waypoints.findIndex(
                  (wp) => wp.id === waypointId,
                )

                if (waypointIndex < 0) return tempMarkers

                // If it's the first waypoint, swap with origin
                if (waypointIndex === 0) {
                  const newOrigin = waypoints[0].position
                  const newFirstWaypoint = tempMarkers.startMarker

                  return {
                    ...tempMarkers,
                    startMarker: newOrigin,
                    waypoints: [
                      {
                        ...waypoints[0],
                        position: newFirstWaypoint,
                      },
                      ...waypoints.slice(1),
                    ].map((wp, index) => ({ ...wp, order: index })),
                  }
                }

                // Swap with previous waypoint
                ;[waypoints[waypointIndex - 1], waypoints[waypointIndex]] = [
                  waypoints[waypointIndex],
                  waypoints[waypointIndex - 1],
                ]

                // Reassign orders
                return {
                  ...tempMarkers,
                  waypoints: waypoints.map((wp, index) => ({
                    ...wp,
                    order: index,
                  })),
                }
              })(),
            },
          }
        : state.snappedRoads.editingStates

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          editingStates: updatedEditingStates,
        },
      }
    })
  },

  moveWaypointDown: (routeId, waypointId) => {
    set((state) => {
      const updatedMarkers = state.snappedRoads.routeMarkers.map((markers) => {
        if (markers.routeId !== routeId) return markers

        const waypoints = [...markers.waypoints].sort(
          (a, b) => a.order - b.order,
        )
        const waypointIndex = waypoints.findIndex((wp) => wp.id === waypointId)

        if (waypointIndex < 0) return markers

        // If it's the last waypoint, swap with destination
        if (waypointIndex >= waypoints.length - 1) {
          const newDestination = waypoints[waypointIndex].position
          const newLastWaypoint = markers.endMarker

          return {
            ...markers,
            endMarker: newDestination,
            waypoints: waypoints
              .slice(0, -1)
              .concat([
                {
                  ...waypoints[waypointIndex],
                  position: newLastWaypoint,
                },
              ])
              .map((wp, index) => ({ ...wp, order: index })),
          }
        }

        // Swap with next waypoint
        ;[waypoints[waypointIndex], waypoints[waypointIndex + 1]] = [
          waypoints[waypointIndex + 1],
          waypoints[waypointIndex],
        ]

        // Reassign orders
        const reorderedWaypoints = waypoints.map((wp, index) => ({
          ...wp,
          order: index,
        }))

        return {
          ...markers,
          waypoints: reorderedWaypoints,
        }
      })

      // Also update temporary markers in editing state if it exists
      const editingState = state.snappedRoads.editingStates[routeId]
      const updatedEditingStates = editingState
        ? {
            ...state.snappedRoads.editingStates,
            [routeId]: {
              ...editingState,
              temporaryMarkers: (() => {
                const tempMarkers = editingState.temporaryMarkers
                const waypoints = [...tempMarkers.waypoints].sort(
                  (a, b) => a.order - b.order,
                )
                const waypointIndex = waypoints.findIndex(
                  (wp) => wp.id === waypointId,
                )

                if (waypointIndex < 0) return tempMarkers

                // If it's the last waypoint, swap with destination
                if (waypointIndex >= waypoints.length - 1) {
                  const newDestination = waypoints[waypointIndex].position
                  const newLastWaypoint = tempMarkers.endMarker

                  return {
                    ...tempMarkers,
                    endMarker: newDestination,
                    waypoints: waypoints
                      .slice(0, -1)
                      .concat([
                        {
                          ...waypoints[waypointIndex],
                          position: newLastWaypoint,
                        },
                      ])
                      .map((wp, index) => ({ ...wp, order: index })),
                  }
                }

                // Swap with next waypoint
                ;[waypoints[waypointIndex], waypoints[waypointIndex + 1]] = [
                  waypoints[waypointIndex + 1],
                  waypoints[waypointIndex],
                ]

                // Reassign orders
                return {
                  ...tempMarkers,
                  waypoints: waypoints.map((wp, index) => ({
                    ...wp,
                    order: index,
                  })),
                }
              })(),
            },
          }
        : state.snappedRoads.editingStates

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          editingStates: updatedEditingStates,
        },
      }
    })
  },

  moveOriginDown: (routeId) => {
    set((state) => {
      const updatedMarkers = state.snappedRoads.routeMarkers.map((markers) => {
        if (markers.routeId !== routeId) return markers

        const waypoints = [...markers.waypoints].sort(
          (a, b) => a.order - b.order,
        )

        if (waypoints.length === 0) return markers // Can't move if no waypoints

        // Swap origin with first waypoint
        const newOrigin = waypoints[0].position
        const newFirstWaypoint = markers.startMarker

        return {
          ...markers,
          startMarker: newOrigin,
          waypoints: [
            {
              ...waypoints[0],
              position: newFirstWaypoint,
            },
            ...waypoints.slice(1),
          ].map((wp, index) => ({ ...wp, order: index })),
        }
      })

      // Also update temporary markers in editing state if it exists
      const editingState = state.snappedRoads.editingStates[routeId]
      const updatedEditingStates = editingState
        ? {
            ...state.snappedRoads.editingStates,
            [routeId]: {
              ...editingState,
              temporaryMarkers: (() => {
                const tempMarkers = editingState.temporaryMarkers
                const waypoints = [...tempMarkers.waypoints].sort(
                  (a, b) => a.order - b.order,
                )

                if (waypoints.length === 0) return tempMarkers

                const newOrigin = waypoints[0].position
                const newFirstWaypoint = tempMarkers.startMarker

                return {
                  ...tempMarkers,
                  startMarker: newOrigin,
                  waypoints: [
                    {
                      ...waypoints[0],
                      position: newFirstWaypoint,
                    },
                    ...waypoints.slice(1),
                  ].map((wp, index) => ({ ...wp, order: index })),
                }
              })(),
            },
          }
        : state.snappedRoads.editingStates

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          editingStates: updatedEditingStates,
        },
      }
    })
  },

  moveDestinationUp: (routeId) => {
    set((state) => {
      const updatedMarkers = state.snappedRoads.routeMarkers.map((markers) => {
        if (markers.routeId !== routeId) return markers

        const waypoints = [...markers.waypoints].sort(
          (a, b) => a.order - b.order,
        )

        if (waypoints.length === 0) return markers // Can't move if no waypoints

        // Swap destination with last waypoint
        const newDestination = waypoints[waypoints.length - 1].position
        const newLastWaypoint = markers.endMarker

        return {
          ...markers,
          endMarker: newDestination,
          waypoints: waypoints
            .slice(0, -1)
            .concat([
              {
                ...waypoints[waypoints.length - 1],
                position: newLastWaypoint,
              },
            ])
            .map((wp, index) => ({ ...wp, order: index })),
        }
      })

      // Also update temporary markers in editing state if it exists
      const editingState = state.snappedRoads.editingStates[routeId]
      const updatedEditingStates = editingState
        ? {
            ...state.snappedRoads.editingStates,
            [routeId]: {
              ...editingState,
              temporaryMarkers: (() => {
                const tempMarkers = editingState.temporaryMarkers
                const waypoints = [...tempMarkers.waypoints].sort(
                  (a, b) => a.order - b.order,
                )

                if (waypoints.length === 0) return tempMarkers

                const newDestination = waypoints[waypoints.length - 1].position
                const newLastWaypoint = tempMarkers.endMarker

                return {
                  ...tempMarkers,
                  endMarker: newDestination,
                  waypoints: waypoints
                    .slice(0, -1)
                    .concat([
                      {
                        ...waypoints[waypoints.length - 1],
                        position: newLastWaypoint,
                      },
                    ])
                    .map((wp, index) => ({ ...wp, order: index })),
                }
              })(),
            },
          }
        : state.snappedRoads.editingStates

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          editingStates: updatedEditingStates,
        },
      }
    })
  },

  setAddingWaypointMode: (routeId) => {
    set({
      isAddingWaypoint: routeId !== null,
      waypointAddingRouteId: routeId,
    })
  },

  cancelAddingWaypoint: () => {
    set({
      isAddingWaypoint: false,
      waypointAddingRouteId: null,
    })
  },

  swapRouteStartEnd: (routeId) => {
    set((state) => {
      const routeMarkers = state.snappedRoads.routeMarkers.find(
        (m) => m.routeId === routeId,
      )
      if (!routeMarkers) {
        return state
      }

      const newStartMarker = routeMarkers.endMarker
      const newEndMarker = routeMarkers.startMarker

      const reversedWaypoints = routeMarkers.waypoints
        .map((wp, index) => ({
          ...wp,
          order: routeMarkers.waypoints.length - 1 - index,
        }))
        .reverse()

      const updatedMarkers = state.snappedRoads.routeMarkers.map((markers) =>
        markers.routeId === routeId
          ? {
              ...markers,
              startMarker: newStartMarker,
              endMarker: newEndMarker,
              waypoints: reversedWaypoints,
            }
          : markers,
      )

      // Also update temporary markers in editing state if it exists
      const editingState = state.snappedRoads.editingStates[routeId]
      const updatedEditingStates = editingState
        ? {
            ...state.snappedRoads.editingStates,
            [routeId]: {
              ...editingState,
              temporaryMarkers: {
                ...editingState.temporaryMarkers,
                startMarker: newStartMarker,
                endMarker: newEndMarker,
                waypoints: reversedWaypoints,
              },
            },
          }
        : state.snappedRoads.editingStates

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          editingStates: updatedEditingStates,
        },
      }
    })
  },

  hasUnsavedChanges: (routeId) => {
    const state = get()
    // Check if there are preview roads
    const hasPreviewRoads = state.snappedRoads.previewRoads.some(
      (road) => road.uploadedRouteId === routeId,
    )

    // Check if temporary markers differ from original markers
    const editingState = state.snappedRoads.editingStates[routeId]
    if (editingState) {
      const originalMarkers = editingState.originalMarkers
      const temporaryMarkers = editingState.temporaryMarkers

      // Compare markers to see if they've changed
      const markersChanged =
        originalMarkers.startMarker.lat !== temporaryMarkers.startMarker.lat ||
        originalMarkers.startMarker.lng !== temporaryMarkers.startMarker.lng ||
        originalMarkers.endMarker.lat !== temporaryMarkers.endMarker.lat ||
        originalMarkers.endMarker.lng !== temporaryMarkers.endMarker.lng ||
        originalMarkers.waypoints.length !==
          temporaryMarkers.waypoints.length ||
        originalMarkers.waypoints.some(
          (wp, index) =>
            temporaryMarkers.waypoints[index]?.position.lat !==
              wp.position.lat ||
            temporaryMarkers.waypoints[index]?.position.lng !== wp.position.lng,
        )

      return hasPreviewRoads || markersChanged
    }

    return hasPreviewRoads
  },

  initializeRouteEditing: (routeId) => {
    set((state) => {
      // Find the current route markers
      const routeMarkers = state.snappedRoads.routeMarkers.find(
        (m) => m.routeId === routeId,
      )

      if (!routeMarkers) {
        return state
      }

      // Create a copy of the markers for temporary editing
      const temporaryMarkers: RouteMarkers = {
        routeId: routeMarkers.routeId,
        startMarker: { ...routeMarkers.startMarker },
        endMarker: { ...routeMarkers.endMarker },
        waypoints: routeMarkers.waypoints.map((wp) => ({ ...wp })),
      }

      // Store original markers to restore on discard
      const originalMarkers: RouteMarkers = {
        routeId: routeMarkers.routeId,
        startMarker: { ...routeMarkers.startMarker },
        endMarker: { ...routeMarkers.endMarker },
        waypoints: routeMarkers.waypoints.map((wp) => ({ ...wp })),
      }

      // Store the editing state
      const editingState: RouteEditingState = {
        routeId,
        temporaryMarkers,
        originalMarkers,
      }

      return {
        snappedRoads: {
          ...state.snappedRoads,
          editingStates: {
            ...state.snappedRoads.editingStates,
            [routeId]: editingState,
          },
        },
      }
    })
  },

  getEditingState: (routeId) => {
    const state = get()
    return state.snappedRoads.editingStates[routeId] || null
  },

  saveRouteChanges: (routeId) => {
    set((state) => {
      const editingState = state.snappedRoads.editingStates[routeId]

      // Move temporary markers to actual route markers if editing state exists
      const updatedMarkers = editingState
        ? state.snappedRoads.routeMarkers.map((markers) =>
            markers.routeId === routeId
              ? editingState.temporaryMarkers
              : markers,
          )
        : state.snappedRoads.routeMarkers

      // Move preview roads to regular roads
      const previewRoads = state.snappedRoads.previewRoads.filter(
        (road) => road.uploadedRouteId === routeId,
      )
      const otherPreviewRoads = state.snappedRoads.previewRoads.filter(
        (road) => road.uploadedRouteId !== routeId,
      )

      // Remove old roads for this route and add preview roads as new roads
      const roadsWithoutRoute = state.snappedRoads.roads.filter(
        (road) => road.uploadedRouteId !== routeId,
      )

      // Clear editing state for this route
      const updatedEditingStates = { ...state.snappedRoads.editingStates }
      delete updatedEditingStates[routeId]

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          roads: [...roadsWithoutRoute, ...previewRoads],
          previewRoads: otherPreviewRoads,
          editingStates: updatedEditingStates,
        },
      }
    })
  },

  discardRouteChanges: (routeId) => {
    set((state) => {
      const editingState = state.snappedRoads.editingStates[routeId]

      // Restore original markers if editing state exists
      const updatedMarkers = editingState
        ? state.snappedRoads.routeMarkers.map((markers) =>
            markers.routeId === routeId
              ? editingState.originalMarkers
              : markers,
          )
        : state.snappedRoads.routeMarkers

      // Remove preview roads for this route
      const updatedPreviewRoads = state.snappedRoads.previewRoads.filter(
        (road) => road.uploadedRouteId !== routeId,
      )

      // Clear editing state for this route
      const updatedEditingStates = { ...state.snappedRoads.editingStates }
      delete updatedEditingStates[routeId]

      // Find the restored route markers to re-initialize editing state
      const restoredMarkers = updatedMarkers.find((m) => m.routeId === routeId)

      // Re-initialize editing state with restored markers so future changes can be tracked
      let finalEditingStates = updatedEditingStates
      if (restoredMarkers) {
        const temporaryMarkers: RouteMarkers = {
          routeId: restoredMarkers.routeId,
          startMarker: { ...restoredMarkers.startMarker },
          endMarker: { ...restoredMarkers.endMarker },
          waypoints: restoredMarkers.waypoints.map((wp) => ({ ...wp })),
        }

        const originalMarkers: RouteMarkers = {
          routeId: restoredMarkers.routeId,
          startMarker: { ...restoredMarkers.startMarker },
          endMarker: { ...restoredMarkers.endMarker },
          waypoints: restoredMarkers.waypoints.map((wp) => ({ ...wp })),
        }

        const newEditingState: RouteEditingState = {
          routeId,
          temporaryMarkers,
          originalMarkers,
        }

        finalEditingStates = {
          ...updatedEditingStates,
          [routeId]: newEditingState,
        }
      }

      return {
        snappedRoads: {
          ...state.snappedRoads,
          routeMarkers: updatedMarkers,
          previewRoads: updatedPreviewRoads,
          editingStates: finalEditingStates,
        },
      }
    })
  },

  setEditingSavedRouteId: (routeId) => {
    set({ editingSavedRouteId: routeId })
  },
})
