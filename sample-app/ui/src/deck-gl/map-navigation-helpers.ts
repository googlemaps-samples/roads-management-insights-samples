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

import * as turf from "@turf/turf"
import type { Feature, FeatureCollection, Geometry } from "geojson"

import { useAppStore } from "../store"
import { City } from "../types/city"
import { Usecase } from "../types/common"
import {
  calculateMultiPolygonBoundingBox,
  calculateOptimalZoomWithViewport,
} from "./helpers"

// Interface for polygon feature properties
interface PolygonFeatureProperties {
  place_id: string
  [key: string]: unknown
}

// Interface for urban congestion data
interface UrbanCongestionData {
  features: Feature<Geometry, PolygonFeatureProperties>[]
}

// Type for polygon feature
type PolygonFeature = Feature<Geometry, PolygonFeatureProperties>

// Interface for bounding box calculation result
interface BoundingBox {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

// Animation function for smooth map transitions
// Store active animation ID to allow cancellation
let activeAnimationId: number | null = null

export const animateMapTransition = ({
  map,
  startCenter,
  targetCenter,
  startZoom,
  targetZoom,
}: {
  map: google.maps.Map
  startCenter: google.maps.LatLng
  targetCenter: google.maps.LatLng
  startZoom: number
  targetZoom: number
}) => {
  console.log("animateMapTransition called")
  // Cancel any existing animation to prevent stacking
  if (activeAnimationId !== null) {
    cancelAnimationFrame(activeAnimationId)
    activeAnimationId = null
  }

  let duration = 500
  if (startZoom - targetZoom > 3) {
    duration = 800
  }
  const startTime = performance.now()
  let animationId: number

  const animate = (currentTime: number) => {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)

    // Easing function for smooth acceleration and deceleration
    const easeInOutQuad = (t: number): number => {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    }

    const easedProgress = easeInOutQuad(progress)

    // Calculate new position
    const lat =
      startCenter.lat() +
      (targetCenter.lat() - startCenter.lat()) * easedProgress
    const lng =
      startCenter.lng() +
      (targetCenter.lng() - startCenter.lng()) * easedProgress
    const newZoom = startZoom + (targetZoom - startZoom) * easedProgress

    map.moveCamera({
      center: { lat, lng },
      zoom: newZoom,
    })

    if (progress < 1) {
      animationId = requestAnimationFrame(animate)
      activeAnimationId = animationId
    } else {
      map.moveCamera({
        center: targetCenter,
        zoom: targetZoom,
      })
      activeAnimationId = null
    }
  }

  animationId = requestAnimationFrame(animate)
  activeAnimationId = animationId
}

// Helper function to update map position without animation
export const updateMapPosition = (
  map: google.maps.Map,
  center: { lat: number; lng: number },
  zoom: number,
) => {
  // Use setCenter and setZoom to avoid any built-in animations
  map.setCenter(center)
  map.setZoom(zoom)
}

// Helper function to reset to home view
export const resetToHomeView = (
  map: google.maps.Map,
  selectedCity: City,
  usecase: Usecase,
) => {
  const currentCenter = map.getCenter()
  const selectedCityZoom =
    selectedCity.customZoom?.[usecase] || selectedCity.zoom
  const currentZoom = map.getZoom() || selectedCityZoom
  const defaultZoom = selectedCityZoom

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
      targetZoom: defaultZoom,
    })
  }
}

export const zoomToPolygon = ({
  map,
  polygonFeature,
  padding,
  selectedCity,
  usecase,
}: {
  map: google.maps.Map
  polygonFeature?: PolygonFeature[]
  padding?: number
  selectedCity: City
  usecase: Usecase
}) => {
  if (!polygonFeature) {
    return
  }

  try {
    const bbox = calculateMultiPolygonBoundingBox(polygonFeature) as BoundingBox

    const centerLng = (bbox.minLng + bbox.maxLng) / 2
    const centerLat = (bbox.minLat + bbox.maxLat) / 2
    const coordinates = [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]
    const zoom = calculateOptimalZoomWithViewport(coordinates, 14, padding)

    const currentCenter = map.getCenter()
    const selectedCityZoom =
      selectedCity.customZoom?.[usecase] || selectedCity.zoom
    const currentZoom = map.getZoom() || selectedCityZoom

    if (currentCenter) {
      animateMapTransition({
        map,
        startCenter: currentCenter,
        targetCenter: new google.maps.LatLng(centerLat, centerLng),
        startZoom: currentZoom,
        targetZoom: zoom,
      })
    } else {
      map.panTo({ lat: centerLat, lng: centerLng })
      map.setZoom(zoom)
    }
  } catch (error) {
    console.error("❌ Error zooming to polygon:", error)
  }
}

// Helper function to handle route zoom
export const handleRouteZoom = (
  selectedRouteId: string | null,
  tooltipCoordinates: [number, number] | null,
  geoJsonData: FeatureCollection,
  selectedCity: City,
  usecase: Usecase,
) => {
  if (!selectedRouteId || !tooltipCoordinates) {
    return
  }

  // Get map reference from global state
  const map = useAppStore.getState().refs.map

  if (!map) {
    console.warn("Map not available for route zoom")
    return
  }

  // Validate coordinates
  const [lng, lat] = tooltipCoordinates
  if (
    !Array.isArray(tooltipCoordinates) ||
    tooltipCoordinates.length !== 2 ||
    isNaN(lng) ||
    isNaN(lat) ||
    !isFinite(lng) ||
    !isFinite(lat)
  ) {
    console.error("Invalid tooltip coordinates:", tooltipCoordinates)
    return
  }

  const relevantRouteCoordinates = geoJsonData?.features.find(
    (f: Feature) =>
      f.properties?.id === selectedRouteId ||
      f.properties?.name === selectedRouteId,
  )

  if (!relevantRouteCoordinates) {
    return
  }

  const bbox = turf.bbox(relevantRouteCoordinates)
  const optimalZoom = calculateOptimalZoomWithViewport(bbox, 14)

  // Get current map state
  const currentCenter = map.getCenter()
  const selectedCityZoom =
    selectedCity.customZoom?.[usecase] || selectedCity.zoom
  const currentZoom = map.getZoom() || selectedCityZoom

  if (currentCenter) {
    console.log("animateMapTransition called in handleRouteZoom")
    animateMapTransition({
      map,
      startCenter: currentCenter,
      targetCenter: new google.maps.LatLng(lat, lng),
      startZoom: currentZoom,
      targetZoom: optimalZoom,
    })
  } else {
    map.panTo({ lat, lng })
    map.setZoom(optimalZoom)
  }
}

// Helper function to handle polygon zoom with route segments
export const handlePolygonWithSegments = (
  selectedPolygonId: string,
  urbanCongestionData: PolygonFeature[] | UrbanCongestionData,
  selectedCity: City,
  usecase: Usecase,
) => {
  if (urbanCongestionData) {
    const features = Array.isArray(urbanCongestionData)
      ? urbanCongestionData
      : urbanCongestionData.features || []
    const polygonFeature = features.filter(
      (feature: PolygonFeature) =>
        feature.properties?.place_id === selectedPolygonId,
    )

    if (polygonFeature) {
      const map = useAppStore.getState().refs.map
      if (map) {
        zoomToPolygon({
          map,
          polygonFeature,
          padding: 50,
          selectedCity,
          usecase,
        })
      }
    }
  }
}

// Helper function to handle polygon selection zoom
export const handlePolygonSelectionZoom = (
  selectedPolygonId: string | null,
  urbanCongestionData: PolygonFeature[] | UrbanCongestionData,
  selectedCity: City,
  usecase: Usecase,
) => {
  if (!selectedPolygonId) {
    return
  }

  // Get map reference from global state
  const map = useAppStore.getState().refs.map

  if (!map) {
    console.warn("Map not available for polygon selection zoom")
    return
  }

  // Find the polygon geometry for fallback zoom
  let polygonFeature: PolygonFeature[] | null = null
  if (urbanCongestionData) {
    // Handle both array format and GeoJSON FeatureCollection format
    let features: PolygonFeature[] = []
    if (Array.isArray(urbanCongestionData)) {
      features = urbanCongestionData
    } else if (
      "features" in urbanCongestionData &&
      Array.isArray(urbanCongestionData.features)
    ) {
      features = urbanCongestionData.features
    }

    if (features.length > 0) {
      polygonFeature = features.filter(
        (feature: PolygonFeature) =>
          feature.properties?.place_id === selectedPolygonId,
      )
    }
  }

  // No route segments available, zoom directly to the polygon
  if (polygonFeature) {
    zoomToPolygon({
      map,
      polygonFeature,
      padding: 50,
      selectedCity,
      usecase,
    })
  }
}
