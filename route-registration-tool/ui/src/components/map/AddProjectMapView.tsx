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

import { useMap } from "@vis.gl/react-google-maps"
import { useEffect, useRef } from "react"

import { StaticMap } from "./StaticMap"

function MapWithGeoJson({ boundaryGeoJson }: { boundaryGeoJson?: any }) {
  const map = useMap()
  const dataLayerRef = useRef<google.maps.Data | null>(null)

  useEffect(() => {
    if (!map) return

    const dataLayer = new google.maps.Data()
    dataLayerRef.current = dataLayer
    dataLayer.setMap(map)

    return () => {
      if (dataLayerRef.current) {
        dataLayerRef.current.setMap(null)
      }
    }
  }, [map])

  useEffect(() => {
    if (!boundaryGeoJson || !dataLayerRef.current || !map) return

    const dataLayer = dataLayerRef.current

    // Clear existing features
    dataLayer.forEach((feature) => {
      dataLayer.remove(feature)
    })

    // Add new GeoJSON
    try {
      dataLayer.addGeoJson(boundaryGeoJson)

      // Style the boundary
      dataLayer.setStyle({
        fillColor: "#1976d2",
        fillOpacity: 0.2,
        strokeColor: "#1976d2",
        strokeWeight: 3,
        strokeOpacity: 1,
      })

      console.log("Added GeoJSON to map, fitting bounds...")

      // Fit bounds to the GeoJSON
      const bounds = new google.maps.LatLngBounds()

      // Calculate bounds from GeoJSON coordinates
      const calculateBounds = (geometry: any) => {
        if (geometry.type === "Polygon") {
          geometry.coordinates[0].forEach((coord: number[]) => {
            bounds.extend(new google.maps.LatLng(coord[1], coord[0]))
          })
        } else if (geometry.type === "MultiPolygon") {
          geometry.coordinates.forEach((polygon: number[][][]) => {
            polygon[0].forEach((coord: number[]) => {
              bounds.extend(new google.maps.LatLng(coord[1], coord[0]))
            })
          })
        }
      }

      if (boundaryGeoJson.type === "FeatureCollection") {
        boundaryGeoJson.features.forEach((feature: any) => {
          calculateBounds(feature.geometry)
        })
      } else if (boundaryGeoJson.type === "Feature") {
        calculateBounds(boundaryGeoJson.geometry)
      }

      // Fit bounds with padding
      map.fitBounds(bounds, {
        top: 50,
        right: 50,
        bottom: 50,
        left: 50,
      })

      console.log("Bounds fitted successfully")
    } catch (error) {
      console.error("Error rendering GeoJSON:", error)
    }
  }, [boundaryGeoJson, map])

  return null
}

interface AddProjectMapViewProps {
  apiKey: string
  boundaryGeoJson?: any
  className?: string
  style?: React.CSSProperties
}

export default function AddProjectMapView({
  apiKey,
  boundaryGeoJson,
  className,
  style,
}: AddProjectMapViewProps) {
  return (
    <StaticMap apiKey={apiKey} className={className} style={style}>
      <MapWithGeoJson boundaryGeoJson={boundaryGeoJson} />
    </StaticMap>
  )
}
