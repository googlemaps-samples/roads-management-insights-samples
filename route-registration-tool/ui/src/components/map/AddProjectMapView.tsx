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
import * as turf from "@turf/turf"

import { isWorldJurisdictionGeoJson } from "../../utils/world-jurisdiction-geojson"
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
    if (!dataLayerRef.current || !map) return

    const dataLayer = dataLayerRef.current

    dataLayer.forEach((feature) => {
      dataLayer.remove(feature)
    })

    if (!boundaryGeoJson || isWorldJurisdictionGeoJson(boundaryGeoJson)) return

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

      // Use Turf.js to calculate bounds reliably for any GeoJSON geometry type
      try {
        const bbox = turf.bbox(boundaryGeoJson) as [number, number, number, number]
        // bbox format: [minLng, minLat, maxLng, maxLat]

        const bounds = new google.maps.LatLngBounds(
          new google.maps.LatLng(bbox[1], bbox[0]), // SW corner (minLat, minLng)
          new google.maps.LatLng(bbox[3], bbox[2])  // NE corner (maxLat, maxLng)
        )

        // Fit bounds with padding
        map.fitBounds(bounds)
      } catch (bboxError) {
        console.error("Failed to calculate bounds with Turf.js:", bboxError)
        // Fallback to manual calculation if Turf.js fails
        const bounds = new google.maps.LatLngBounds()

        const addCoordsToBounds = (coords: number[][]) => {
          coords.forEach((coord: number[]) => {
            if (coord.length >= 2) {
              bounds.extend(new google.maps.LatLng(coord[1], coord[0]))
            }
          })
        }

        // Simple fallback for basic geometries
        if (boundaryGeoJson.type === "FeatureCollection") {
          boundaryGeoJson.features?.forEach((feature: any) => {
            if (feature.geometry?.type === "Polygon") {
              addCoordsToBounds(feature.geometry.coordinates[0] || [])
            }
          })
        } else if (boundaryGeoJson.type === "Feature" && boundaryGeoJson.geometry?.type === "Polygon") {
          addCoordsToBounds(boundaryGeoJson.geometry.coordinates[0] || [])
        }

        map.fitBounds(bounds)
      }

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
