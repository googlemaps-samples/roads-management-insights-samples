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

import { Feature } from "geojson"
import { useEffect, useState } from "react"

import { calculateOptimalZoomWithViewport } from "../deck-gl/helpers"
import { useAppStore } from "../store"
import { City } from "../types/city.d"

/**
 * Hook to automatically calculate and set zoom level for cities without a predefined zoom
 * Calculates zoom based on all realtime routes for that city
 * @param city - The selected city
 */
export const useAutoZoom = (city: City) => {
  const [isCalculating, setIsCalculating] = useState(false)
  const [calculatedZoom, setCalculatedZoom] = useState<number | null>(null)
  const realtimeData = useAppStore((state) => state.queries.realtimeData.data)
  const usecase = useAppStore((state) => state.usecase)
  const selectedCity = useAppStore((state) => state.selectedCity)
  const updateCityZoom = useAppStore((state) => state.updateCityZoom)

  // Reset calculated zoom when usecase or selectedCity changes
  useEffect(() => {
    setCalculatedZoom(null)
  }, [usecase, selectedCity])

  useEffect(() => {
    // Skip if city already has zoom defined
    if (city.zoom) {
      return
    }

    if (city.boundingBox) {
      const zoom = calculateOptimalZoomWithViewport(
        [
          city.boundingBox.minLng,
          city.boundingBox.minLat,
          city.boundingBox.maxLng,
          city.boundingBox.maxLat,
        ],
        12,
        0,
      )
      setCalculatedZoom(zoom)
      updateCityZoom(city.id, zoom)
      return
    }

    // Skip if we've already calculated zoom for this city
    if (calculatedZoom !== null) {
      return
    }

    // Skip if no realtime data available yet
    if (!realtimeData || !realtimeData.rawData) {
      return
    }

    // Skip if already calculating
    if (isCalculating) {
      return
    }

    setIsCalculating(true)

    try {
      // Extract all coordinates from realtime routes
      const features = realtimeData.rawData.features || []

      if (features.length === 0) {
        console.warn(`No features found for city ${city.id}`)
        // Use a default zoom if no features found
        const defaultZoom = 12
        setCalculatedZoom(defaultZoom)
        updateCityZoom(city.id, defaultZoom)
        setIsCalculating(false)
        return
      }

      // Calculate bounding box encompassing all features
      let minLng = Infinity
      let minLat = Infinity
      let maxLng = -Infinity
      let maxLat = -Infinity

      features.forEach((feature: Feature) => {
        if (
          feature.geometry &&
          feature.geometry.type === "LineString" &&
          feature.geometry.coordinates
        ) {
          feature.geometry.coordinates.forEach((coord: number[]) => {
            const [lng, lat] = coord
            minLng = Math.min(minLng, lng)
            minLat = Math.min(minLat, lat)
            maxLng = Math.max(maxLng, lng)
            maxLat = Math.max(maxLat, lat)
          })
        }
      })

      if (
        !isFinite(minLng) ||
        !isFinite(minLat) ||
        !isFinite(maxLng) ||
        !isFinite(maxLat)
      ) {
        console.warn(`No valid coordinates found for city ${city.id}`)
        // Use a default zoom if no valid coordinates found
        const defaultZoom = 12
        setCalculatedZoom(defaultZoom)
        updateCityZoom(city.id, defaultZoom)
        setIsCalculating(false)
        return
      }

      // Calculate optimal zoom using the bounding box of all features
      const zoom = calculateOptimalZoomWithViewport(
        [minLng, minLat, maxLng, maxLat],
        12,
        80,
      )

      console.log(
        `✅ Calculated zoom level ${zoom} for ${city.name} based on ${features.length} routes`,
      )

      setCalculatedZoom(zoom)

      // Update the city's zoom in the store
      updateCityZoom(city.id, zoom)
    } catch (error) {
      console.error(`Error calculating zoom for city ${city.id}:`, error)
      // Use default zoom on error
      const defaultZoom = 12
      setCalculatedZoom(defaultZoom)
      updateCityZoom(city.id, defaultZoom)
    } finally {
      setIsCalculating(false)
    }
  }, [
    city.id,
    city.zoom,
    city.coords,
    city.name,
    usecase,
    realtimeData,
    calculatedZoom,
    isCalculating,
    updateCityZoom,
    selectedCity,
  ])

  return {
    zoom: city.zoom || calculatedZoom || 12,
    isCalculating,
    calculatedZoom,
  }
}
