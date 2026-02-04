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

import { LayersList } from "@deck.gl/core"
import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react"

import { animateMapTransition } from "../deck-gl/map-navigation"
import { useAppStore } from "../store/useAppStore"
import { Usecase } from "../types/common"
import { RouteSegment } from "../types/route-segment"

interface MapContextType {
  customLayers: LayersList | undefined
  setCustomLayers: (layers: LayersList | undefined) => void

  onSegmentClick: (segmentId: string) => void
  setOnSegmentClick: (handler: (segmentId: string) => void) => void

  onHandleClose: () => void
  setOnHandleClose: (handler: () => void) => void

  selectedRouteId: string | null
  setSelectedRouteId: (id: string) => void

  selectedRouteSegment: RouteSegment | null
  setSelectedRouteSegment: (segment: RouteSegment | null) => void

  // Polygon data loading state
  isLoadingPolygonData: boolean
  setIsLoadingPolygonData: (loading: boolean) => void

  // Full route data for layering (used in urban congestion)
  fullRouteData: RouteSegment[]
  setFullRouteData: (data: RouteSegment[]) => void

  resetMapData: () => void
  resetSelectedRoute: () => void
  resetHandlers: () => void
  zoomToLocation: (
    center: { lat: number; lng: number },
    zoom: number,
    usecase: Usecase,
  ) => void
  resetZoom: () => void
}

const MapContext = createContext<MapContextType | undefined>(undefined)

export const useMapContext = () => {
  const context = useContext(MapContext)
  if (!context) {
    throw new Error("useMapContext must be used within a MapProvider")
  }
  return context
}

interface MapProviderProps {
  children: ReactNode
}

export const MapProvider: React.FC<MapProviderProps> = ({ children }) => {
  const [customLayers, setCustomLayers] = useState<LayersList | undefined>(
    undefined,
  )

  const setOnSegmentClickWithLogging = useCallback(
    (handler: (segmentId: string) => void) => {
      handlerRef.current = handler
    },
    [],
  )

  const [onHandleCloseState, setOnHandleCloseState] = useState<() => void>(
    () => {},
  )

  // Use a ref to directly store the handler, bypassing React state
  const handlerRef = useRef<(segmentId: string) => void>(() => {})

  // Use global state instead of local state
  const selectedRouteId = useAppStore((state) => state.selectedRouteId)
  const setSelectedRouteId = useAppStore((state) => state.setSelectedRouteId)
  const selectedRouteSegment = useAppStore(
    (state) => state.selectedRouteSegment,
  )
  const setSelectedRouteSegment = useAppStore(
    (state) => state.setSelectedRouteSegment,
  )
  const [isLoadingPolygonData, setIsLoadingPolygonData] =
    useState<boolean>(false)
  const [fullRouteData, setFullRouteData] = useState<RouteSegment[]>([])

  // Memoize the default empty handlers
  const defaultOnSegmentClick = useCallback((segmentId: string) => {
    // Defensive check to prevent render-phase issues
    if (!segmentId || typeof segmentId !== "string") {
      return
    }
  }, [])
  const defaultOnHandleClose = useCallback(() => {}, [])

  const resetMapData = useCallback(() => {
    setCustomLayers(undefined)
    // Don't reset handlers here - they should be managed by the individual usecase components
    // Don't clear selectedRouteId and selectedRouteSegment here - they should only be cleared when switching modes/places/usecase
  }, [])

  const resetSelectedRoute = useCallback(() => {
    if (selectedRouteId) {
      setSelectedRouteId("")
    }

    setSelectedRouteSegment(null)
  }, [setSelectedRouteId, setSelectedRouteSegment])

  const resetHandlers = useCallback(() => {
    handlerRef.current = defaultOnSegmentClick
    setOnHandleCloseState(defaultOnHandleClose)
  }, [defaultOnSegmentClick, defaultOnHandleClose])

  // Zoom functionality
  const zoomToLocation = useCallback(
    (center: { lat: number; lng: number }, zoom: number, usecase: Usecase) => {
      // Get map reference from global state
      const map = useAppStore.getState().refs.map
      const selectedCity = useAppStore.getState().selectedCity

      if (!map) {
        console.warn("Map not available for zoom to location")
        return
      }

      const currentCenter = map.getCenter()
      const currentZoom =
        map.getZoom() || selectedCity.customZoom?.[usecase] || selectedCity.zoom

      if (currentCenter) {
        animateMapTransition({
          map,
          startCenter: currentCenter,
          targetCenter: new google.maps.LatLng(center.lat, center.lng),
          startZoom: currentZoom,
          targetZoom: zoom,
        })
      } else {
        map.panTo(center)
        map.setZoom(zoom)
      }
    },
    [],
  )

  const resetZoom = useCallback(() => {
    // Get map reference and city from global state
    const map = useAppStore.getState().refs.map
    const selectedCity = useAppStore.getState().selectedCity

    if (!map) {
      console.warn("Map not available for reset zoom")
      return
    }

    const currentCenter = map.getCenter()
    const currentZoom = map.getZoom() || selectedCity.zoom

    if (currentCenter) {
      const targetCenter = new google.maps.LatLng(
        selectedCity.coords.lat,
        selectedCity.coords.lng,
      )

      animateMapTransition({
        map,
        startCenter: currentCenter,
        targetCenter: targetCenter,
        startZoom: currentZoom,
        targetZoom: selectedCity.zoom,
      })
    }
  }, [])

  const value: MapContextType = {
    customLayers,
    setCustomLayers,
    onSegmentClick: handlerRef.current,
    setOnSegmentClick: setOnSegmentClickWithLogging,
    onHandleClose: onHandleCloseState,
    setOnHandleClose: setOnHandleCloseState,
    selectedRouteId,
    setSelectedRouteId,
    selectedRouteSegment,
    setSelectedRouteSegment,
    isLoadingPolygonData,
    setIsLoadingPolygonData,
    fullRouteData,
    setFullRouteData,
    resetMapData,
    resetSelectedRoute,
    resetHandlers,
    zoomToLocation,
    resetZoom,
  }

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>
}
