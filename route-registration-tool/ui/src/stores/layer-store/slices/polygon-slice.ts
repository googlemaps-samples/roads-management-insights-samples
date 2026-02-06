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

import { TerraDraw } from "terra-draw"
import { StateCreator } from "zustand"

import { Road as ProjectRoad } from "../../project-workspace-store"
import { LayerStore, PolygonDrawingState } from "../types"

export interface PolygonSlice {
  polygonDrawing: PolygonDrawingState
  lassoDrawing: PolygonDrawingState
  savedPolygons: any[]
  terraDrawUndo?: () => void
  terraDrawRedo?: () => void
  terraDrawFinish?: () => void
  terraDrawInstance: TerraDraw | null
  setTerraDrawInstance: (instance: TerraDraw | null) => void
  startPolygonDrawing: () => void
  addPolygonPoint: (point: [number, number]) => void
  completePolygon: () => void
  clearPolygon: () => void
  finishPolygonDrawing: () => void
  isPolygonComplete: () => boolean
  syncPolygonPointsFromTerraDraw: (points: [number, number][]) => void
  startLassoDrawing: () => void
  setLassoPoints: (points: [number, number][]) => void
  finishLassoDrawing: () => void
  setLassoSelectedRoads: (roads: ProjectRoad[]) => void
  confirmLassoDrawing: () => void
  clearLassoDrawing: () => void
  isLassoComplete: () => boolean
  clearPolygonDrawing: () => void
  isNearStartPoint: boolean
  setIsNearStartPoint: (isNear: boolean) => void
}

export const createPolygonSlice: StateCreator<
  LayerStore,
  [],
  [],
  PolygonSlice
> = (set, get) => ({
  polygonDrawing: {
    isDrawing: false,
    points: [],
    completedPolygon: null,
    selectedRoads: [],
    confirmed: false,
  },

  lassoDrawing: {
    isDrawing: false,
    points: [],
    completedPolygon: null,
    selectedRoads: [],
    confirmed: false,
  },

  savedPolygons: [],

  terraDrawUndo: undefined,
  terraDrawRedo: undefined,
  terraDrawFinish: undefined,
  terraDrawInstance: null,

  setTerraDrawInstance: (instance) => {
    set(() => ({
      terraDrawInstance: instance,
    }))
  },

  startPolygonDrawing: () => {
    const newState = {
      isDrawing: true,
      points: [],
      completedPolygon: null,
      selectedRoads: [],
      confirmed: false,
    }
    set(() => ({
      polygonDrawing: newState,
      lassoDrawing: newState,
    }))
  },

  addPolygonPoint: (point) => {
    set((state) => {
      const updated = {
        ...state.polygonDrawing,
        points: [...state.polygonDrawing.points, point],
      }
      return {
        polygonDrawing: updated,
        lassoDrawing: updated,
      }
    })
  },

  completePolygon: () => {
    const { polygonDrawing } = get()
    if (polygonDrawing.points.length >= 3) {
      const ring = polygonDrawing.points
      const isClosed =
        ring.length > 0 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
      const closedRing = isClosed ? ring : [...ring, ring[0]]

      const polygon: GeoJSON.Polygon = {
        type: "Polygon",
        coordinates: [closedRing],
      }

      set((state) => {
        const updated = {
          ...state.polygonDrawing,
          isDrawing: false,
          completedPolygon: polygon,
        }
        return {
          polygonDrawing: updated,
          lassoDrawing: updated,
        }
      })
    }
  },

  clearPolygon: () => {
    const newState = {
      isDrawing: false,
      points: [],
      completedPolygon: null,
      selectedRoads: [],
      confirmed: false,
    }
    set(() => ({
      polygonDrawing: newState,
      lassoDrawing: newState,
    }))
  },

  finishPolygonDrawing: () => {
    const { polygonDrawing } = get()
    if (polygonDrawing.points.length >= 3) {
      const ring = polygonDrawing.points
      const isClosed =
        ring.length > 0 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
      const closedRing = isClosed ? ring : [...ring, ring[0]]

      const polygon: GeoJSON.Polygon = {
        type: "Polygon",
        coordinates: [closedRing],
      }

      set((state) => {
        const updated = {
          ...state.polygonDrawing,
          isDrawing: false,
          completedPolygon: polygon,
        }
        return {
          polygonDrawing: updated,
          lassoDrawing: updated,
        }
      })
    }
  },

  isPolygonComplete: () => {
    const { polygonDrawing } = get()
    return polygonDrawing.points.length >= 3
  },

  syncPolygonPointsFromTerraDraw: (points) => {
    set((state) => {
      const completedPolygon: GeoJSON.Polygon | null =
        points.length >= 3
          ? {
              type: "Polygon",
              coordinates: [
                points[0][0] === points[points.length - 1][0] &&
                points[0][1] === points[points.length - 1][1]
                  ? points
                  : [...points, points[0]],
              ],
            }
          : null
      const updated = {
        ...state.polygonDrawing,
        points,
        completedPolygon,
      }
      return {
        polygonDrawing: updated,
        lassoDrawing: updated,
      }
    })
  },

  startLassoDrawing: () => {
    const newState = {
      isDrawing: true,
      points: [],
      completedPolygon: null,
      selectedRoads: [],
      confirmed: false,
    }
    set(() => ({
      polygonDrawing: newState,
      lassoDrawing: newState,
    }))
  },

  setLassoPoints: (points) => {
    set((state) => {
      const updated = {
        ...state.polygonDrawing,
        points,
        completedPolygon: null,
      }
      return {
        polygonDrawing: updated,
        lassoDrawing: updated,
      }
    })
  },

  finishLassoDrawing: () => {
    const { polygonDrawing } = get()
    if (polygonDrawing.points.length >= 3) {
      const ring = polygonDrawing.points
      const isClosed =
        ring.length > 0 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
      const closedRing = isClosed ? ring : [...ring, ring[0]]

      const polygon: GeoJSON.Polygon = {
        type: "Polygon",
        coordinates: [closedRing],
      }

      set((state) => {
        const updated = {
          ...state.polygonDrawing,
          isDrawing: false,
          completedPolygon: polygon,
          confirmed: false, // Not confirmed until user clicks Done
        }
        return {
          polygonDrawing: updated,
          lassoDrawing: updated,
        }
      })
    }
  },

  setLassoSelectedRoads: (roads) => {
    set((state) => {
      const updated = {
        ...state.polygonDrawing,
        selectedRoads: roads,
      }
      return {
        polygonDrawing: updated,
        lassoDrawing: updated,
      }
    })
  },

  confirmLassoDrawing: () => {
    set((state) => {
      const updated = {
        ...state.lassoDrawing,
        confirmed: true,
      }
      return {
        lassoDrawing: updated,
      }
    })
  },

  clearLassoDrawing: () => {
    const newState = {
      isDrawing: false,
      points: [],
      completedPolygon: null,
      selectedRoads: [],
      confirmed: false,
    }
    set(() => ({
      polygonDrawing: newState,
      lassoDrawing: newState,
    }))
  },

  isLassoComplete: () => {
    const { polygonDrawing } = get()
    return polygonDrawing.points.length >= 3
  },

  clearPolygonDrawing: () => {
    const newState = {
      isDrawing: false,
      points: [],
      completedPolygon: null,
      selectedRoads: [],
      confirmed: false,
    }
    set(() => ({
      polygonDrawing: newState,
      lassoDrawing: newState,
    }))
  },

  isNearStartPoint: false,
  setIsNearStartPoint: (isNear) => {
    set({ isNearStartPoint: isNear })
  },
})
