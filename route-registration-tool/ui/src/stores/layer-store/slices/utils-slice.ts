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
