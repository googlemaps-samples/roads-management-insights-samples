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

import { APIProvider, Map } from "@vis.gl/react-google-maps"
import React from "react"

interface StaticMapProps {
  center?: { lat: number; lng: number }
  zoom?: number
  apiKey: string
  mapId?: string
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

/**
 * StaticMap component for dashboard - shows only Google Maps with no DeckGL layers
 * Lightweight component for basic map display without any data visualization
 */
export const StaticMap: React.FC<StaticMapProps> = ({
  center = { lat: 20.5937, lng: 78.9629 },
  zoom = 5,
  apiKey,
  mapId = "73a66895f21ab8d1af4c7933",
  className,
  style,
  children,
}) => {
  return (
    <APIProvider apiKey={apiKey} region={"IN"}>
      <div className={className} style={style}>
        <Map
          defaultCenter={center}
          defaultZoom={zoom}
          mapId={mapId}
          gestureHandling="greedy"
          disableDefaultUI={true}
          restriction={{
            latLngBounds: {
              north: 85,
              south: -85,
              west: -180,
              east: 180,
            },
            strictBounds: true,
          }}
        />
        {children}
      </div>
    </APIProvider>
  )
}

export default StaticMap
