import { StateCreator } from "zustand"

import { LayerStore } from "../types"

export interface UiSlice {
  hoveredFeature: {
    layerId: string
    polyline: number[][] | null
    geometry: any
  } | null
  currentZoom: number | undefined
  showTileLayerArrows: boolean
  markerDragEndTime: number
  selectedRouteHoveredSegmentId: string | null
  selectedRouteHovered: boolean
  roadsTilesTimestamp: number
  routesTilesTimestamp: number
  routesTileCache: Map<string, GeoJSON.FeatureCollection>
  refreshTrigger: number
  drawingCompletionMenuPosition: { lat: number; lng: number } | null
  setHoveredFeature: (
    feature: {
      layerId: string
      polyline: number[][] | null
      geometry: any
    } | null,
  ) => void
  setCurrentZoom: (zoom: number | undefined) => void
  setMarkerDragEndTime: (time: number) => void
  setSelectedRouteHoveredSegmentId: (segmentId: string | null) => void
  setSelectedRouteHovered: (hovered: boolean) => void
  refreshRoadsTilesTimestamp: () => void
  refreshRoutesTilesTimestamp: () => void
  refreshTilesTimestamp: () => void
  setRefreshTrigger: () => void
  updateRouteTilesFromWebSocket: (routeId: string) => void
  showDrawingCompletionMenu: (lat: number, lng: number) => void
  hideDrawingCompletionMenu: () => void
}

export const createUiSlice: StateCreator<LayerStore, [], [], UiSlice> = (
  set,
  get,
) => ({
  hoveredFeature: null,
  currentZoom: undefined,
  showTileLayerArrows: false,
  markerDragEndTime: 0,
  selectedRouteHoveredSegmentId: null,
  selectedRouteHovered: false,
  roadsTilesTimestamp: Date.now(),
  routesTilesTimestamp: Date.now(),
  routesTileCache: new Map<string, GeoJSON.FeatureCollection>(),
  refreshTrigger: Date.now(),
  drawingCompletionMenuPosition: null,

  setHoveredFeature: (feature) => {
    set(() => ({
      hoveredFeature: feature,
    }))
  },

  setCurrentZoom: (zoom) => {
    const previousShowArrows = get().showTileLayerArrows
    const newShowArrows = zoom !== undefined && zoom >= 16

    set(() => ({
      currentZoom: zoom,
      // Only update if threshold is crossed
      ...(previousShowArrows !== newShowArrows && {
        showTileLayerArrows: newShowArrows,
      }),
    }))
  },

  setMarkerDragEndTime: (time) => {
    set(() => ({
      markerDragEndTime: time,
    }))
  },

  setSelectedRouteHoveredSegmentId: (segmentId) => {
    set(() => ({
      selectedRouteHoveredSegmentId: segmentId,
    }))
  },

  setSelectedRouteHovered: (hovered) => {
    set(() => ({
      selectedRouteHovered: hovered,
    }))
  },

  refreshRoadsTilesTimestamp: () => {
    set(() => ({
      roadsTilesTimestamp: Date.now(),
    }))
  },

  refreshRoutesTilesTimestamp: () => {
    set(() => ({
      routesTilesTimestamp: Date.now(),
      routesTileCache: new Map(), // Clear cache when timestamp changes
    }))
  },

  refreshTilesTimestamp: () => {
    set(() => ({
      roadsTilesTimestamp: Date.now(),
      routesTilesTimestamp: Date.now(),
      routesTileCache: new Map(), // Clear cache when timestamp changes
    }))
  },

  setRefreshTrigger: () => {
    set(() => ({
      refreshTrigger: Date.now(),
    }))
  },

  updateRouteTilesFromWebSocket: (routeId) => {
    const cache = get().routesTileCache
    cache.delete(routeId)
    set(() => ({
      routesTileCache: new Map(cache),
      routesTilesTimestamp: Date.now(),
    }))
  },

  showDrawingCompletionMenu: (lat, lng) => {
    set(() => ({
      drawingCompletionMenuPosition: { lat, lng },
    }))
  },

  hideDrawingCompletionMenu: () => {
    set(() => ({
      drawingCompletionMenuPosition: null,
    }))
  },
})
