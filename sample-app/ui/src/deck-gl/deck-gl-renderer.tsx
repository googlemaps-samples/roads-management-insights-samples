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
import { APIProvider, Map } from "@vis.gl/react-google-maps"
import type { FeatureCollection } from "geojson"
import React, { useEffect, useState } from "react"

import { City } from "../types/city"
import { Mode, Usecase } from "../types/common"
import { RouteSegment } from "../types/route-segment"
import { MapData } from "../types/store-data"
import { AlertPoint, RouteLayerRenderer } from "./route-layer-renderer"

interface DeckGLRendererProps {
  // Data props
  data: RouteSegment[] | FeatureCollection | MapData
  selectedCity: City
  mode: Mode
  usecase: Usecase

  // Alert data
  alertsGeojson?: AlertPoint[] | null

  // Selection handlers
  onSegmentClick: (segmentId: string) => void
  onHandleClose?: () => void
  selectedRouteId: string | null
  selectedRouteSegment: RouteSegment | null

  // Optional customization
  mapId: string
  defaultZoom: number

  // Custom layers to render on top of the map
  customLayers?: LayersList

  // Full route data for layering - always an array since we control all data sources
  fullRouteData?: RouteSegment[]

  // Disable route selection (for dual map mode)
  disableRouteSelection?: boolean

  // Map ref name for dual map mode
  mapRefName?: "map" | "leftMap" | "rightMap"
}

// Main component that provides the map context
export const DeckGLRenderer: React.FC<DeckGLRendererProps> = (props) => {
  const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false)

  // Check if Google Maps API is loaded
  useEffect(() => {
    const checkGoogleMapsLoaded = () => {
      if (window.google?.maps && window.mapLoaded) {
        setIsGoogleMapsLoaded(true)
      } else {
        // Retry after a short delay
        setTimeout(checkGoogleMapsLoaded, 100)
      }
    }

    checkGoogleMapsLoaded()
  }, [])

  // Don't render the map until Google Maps API is loaded
  if (!isGoogleMapsLoaded) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f5f5",
        }}
      >
        <div>Loading map...</div>
      </div>
    )
  }

  return (
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
      <Map
        defaultCenter={props.selectedCity.coords}
        defaultZoom={props.defaultZoom || 11.5}
        mapId={props.mapId}
        gestureHandling={"greedy"}
        disableDefaultUI={true}
        clickableIcons={false}
        reuseMaps={true}
      >
        <RouteLayerRenderer {...props} />
      </Map>
    </APIProvider>
  )
}
