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

import { LayerStore } from "../types"

export interface UtilsSlice {
  layerVisibility: Record<string, boolean>
  layerOrder: string[]
  clearAllDrawing: () => void
  toggleLayerVisibility: (layerId: string) => void
  setLayerVisibility: (layerId: string, visible: boolean) => void
  moveLayerUp: (layerId: string) => void
  moveLayerDown: (layerId: string) => void
  reorderLayers: (layerIds: string[]) => void
}

export const createUtilsSlice: StateCreator<LayerStore, [], [], UtilsSlice> = (
  set,
  get,
) => ({
  layerVisibility: {},
  layerOrder: [],

  clearAllDrawing: () => {
    get().clearIndividualRoute()
    get().clearPolygonDrawing()
    get().clearSegmentation()
  },

  toggleLayerVisibility: (layerId) => {
    set((state) => ({
      layerVisibility: {
        ...state.layerVisibility,
        [layerId]: !state.layerVisibility[layerId],
      },
    }))
  },

  setLayerVisibility: (layerId, visible) => {
    set((state) => ({
      ...state,
      layerVisibility: {
        ...state.layerVisibility,
        [layerId]: visible,
      },
    }))
  },

  moveLayerUp: (layerId) => {
    const state = get()
    const layers = state.layerOrder
    const index = layers.indexOf(layerId)
    if (index > 0) {
      const newOrder = [...layers]
      ;[newOrder[index - 1], newOrder[index]] = [
        newOrder[index],
        newOrder[index - 1],
      ]
      state.reorderLayers(newOrder)
    }
  },

  moveLayerDown: (layerId) => {
    const state = get()
    const layers = state.layerOrder
    const index = layers.indexOf(layerId)
    if (index >= 0 && index < layers.length - 1) {
      const newOrder = [...layers]
      ;[newOrder[index], newOrder[index + 1]] = [
        newOrder[index + 1],
        newOrder[index],
      ]
      state.reorderLayers(newOrder)
    }
  },

  reorderLayers: (layerIds) => {
    set((state) => ({
      ...state,
      layerOrder: layerIds,
    }))
  },
})
