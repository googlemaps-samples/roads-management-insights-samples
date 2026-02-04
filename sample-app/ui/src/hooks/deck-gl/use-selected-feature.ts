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

import { Feature, FeatureCollection, Geometry } from "geojson"
import { useEffect, useMemo, useRef, useState } from "react"

import { RouteProperties } from "../../deck-gl/route-layer-renderer"
import { RouteSegment } from "../../types/route-segment"

// Use RouteSegment directly instead of creating a separate interface
type RouteWithPath = RouteSegment

// Interface for direct segment objects
interface DirectSegmentObject {
  properties?: {
    id: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Custom hook to handle feature selection and coordinate extraction
 *
 * @param selectedRouteId The ID of the selected route
 * @param selectedRouteSegment The selected route segment
 * @param geoJsonData The GeoJSON data containing all features
 * @param fullRouteData Optional full route data to search in if not found in main data
 * @returns Object containing selected feature, coordinates, and state setters
 */
export function useSelectedFeature(
  selectedRouteId: string | null,
  selectedRouteSegment: RouteSegment | null,
  geoJsonData: FeatureCollection | null,
  fullRouteData?: RouteWithPath[],
  directSegmentObject?: DirectSegmentObject, // Add parameter to check for direct segment object
) {
  // State for selected object and tooltip coordinates
  const [selectedObject, setSelectedObject] = useState<Feature<
    Geometry,
    RouteProperties
  > | null>(null)
  const [tooltipCoordinates, setTooltipCoordinates] = useState<
    [number, number] | null
  >(null)

  // Track the last route ID we set coordinates for to avoid unnecessary updates
  const lastProcessedRouteId = useRef<string | null>(null)

  // Find the selected feature from geoJsonData or fullRouteData based on selectedRouteId
  const selectedFeature = useMemo(() => {
    if (!selectedRouteId) {
      return null
    }

    // First, try to find in the main geoJsonData
    if (geoJsonData && geoJsonData.features) {
      const feature = geoJsonData.features.find((f) => {
        const props = f.properties as RouteProperties | null
        return props?.id === selectedRouteId
      }) as Feature<Geometry, RouteProperties> | undefined

      if (feature) {
        return feature
      }
    }

    // If not found in main data, try to find in fullRouteData
    if (fullRouteData && fullRouteData.length > 0) {
      const route = fullRouteData.find((r) => r.id === selectedRouteId)
      if (route) {
        // Convert the route to a GeoJSON feature format
        // RouteSegment has 'path' property with coordinates
        const coordinates =
          route.path?.map((point) => {
            if ("lat" in point && "lng" in point) {
              return [point.lng, point.lat]
            } else {
              return [
                (point as google.maps.LatLng).lng(),
                (point as google.maps.LatLng).lat(),
              ]
            }
          }) || []

        const feature = {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: coordinates,
          },
          properties: {
            id: route.id,
            delayRatio: route.delayRatio,
            duration: route.duration,
            staticDuration: route.staticDuration,
            placeId: route.placeId,
            color: route.color,
            name: route.name,
            type: route.type,
            congestionLevel: route.congestionLevel,
            historicalRouteId: route.historicalRouteId,
          } as RouteProperties,
        } as Feature<Geometry, RouteProperties>

        return feature
      }
    }

    return null
  }, [selectedRouteId, geoJsonData, fullRouteData])

  // Extract center coordinates from the selected feature
  const centerCoordinates = useMemo(() => {
    if (!selectedFeature || !selectedFeature.geometry) {
      return null
    }

    // Handle different geometry types safely
    const geometry = selectedFeature.geometry

    // For LineString geometries - most common case for route segments
    if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
      const coordinates = geometry.coordinates
      if (coordinates.length === 0) return null

      // Always use the exact middle point of the LineString
      const centerIndex = Math.floor(coordinates.length / 2)
      return coordinates[centerIndex] || coordinates[0]
    }

    // For MultiLineString geometries - handle multiple line segments
    if (
      geometry.type === "MultiLineString" &&
      Array.isArray(geometry.coordinates)
    ) {
      if (geometry.coordinates.length === 0) return null

      // Find the longest line segment
      let longestSegment = geometry.coordinates[0]
      let maxLength = longestSegment.length

      for (let i = 1; i < geometry.coordinates.length; i++) {
        if (geometry.coordinates[i].length > maxLength) {
          longestSegment = geometry.coordinates[i]
          maxLength = longestSegment.length
        }
      }

      // Get the center of the longest segment
      const centerIndex = Math.floor(longestSegment.length / 2)
      return longestSegment[centerIndex] || longestSegment[0]
    }

    // For Point geometries
    if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
      return geometry.coordinates
    }

    // For other geometry types, try to extract coordinates if possible
    if ("coordinates" in geometry && Array.isArray(geometry.coordinates)) {
      const coordinates = geometry.coordinates

      if (coordinates.length === 0) return null

      // If it's a single coordinate pair
      if (!Array.isArray(coordinates[0])) {
        return coordinates
      }

      // For other cases with multiple coordinates
      const centerIndex = Math.floor(coordinates.length / 2)
      return coordinates[centerIndex] || coordinates[0]
    }

    return null
  }, [selectedFeature])

  // Update selected object and tooltip coordinates when selection changes
  useEffect(() => {
    // Don't override if we have a directSegmentObject for the same route
    if (directSegmentObject && selectedRouteId) {
      const directRouteId = directSegmentObject.properties?.id
      if (directRouteId === selectedRouteId) {
        return
      }
    }

    setSelectedObject(selectedFeature)

    // Ensure we're passing a valid [number, number] tuple for tooltip coordinates
    if (
      Array.isArray(centerCoordinates) &&
      centerCoordinates.length === 2 &&
      typeof centerCoordinates[0] === "number" &&
      typeof centerCoordinates[1] === "number"
    ) {
      setTooltipCoordinates(centerCoordinates as [number, number])
    } else {
      if (selectedFeature && !centerCoordinates) {
        // Don't clear tooltip coordinates yet
      } else {
        setTooltipCoordinates(null)
      }
    }
  }, [
    selectedFeature,
    centerCoordinates,
    directSegmentObject,
    selectedRouteId,
    geoJsonData,
    fullRouteData,
  ])

  // Handle route ID changes and data updates
  useEffect(() => {
    if (!selectedRouteId) {
      setSelectedObject(null)
      setTooltipCoordinates(null)
      lastProcessedRouteId.current = null
      return
    }

    // Always try to find and update the selected feature when route ID or data changes
    let foundFeature: Feature<Geometry, RouteProperties> | undefined

    // Try to find in main geoJsonData first
    if (geoJsonData?.features) {
      foundFeature = geoJsonData.features.find((f) => {
        const props = f.properties as RouteProperties | null
        return props?.id === selectedRouteId
      }) as Feature<Geometry, RouteProperties> | undefined
    }

    // If not found in main data, try fullRouteData
    if (!foundFeature && fullRouteData && fullRouteData.length > 0) {
      const route = fullRouteData.find((r) => r.id === selectedRouteId)
      if (route) {
        // Convert the route to a GeoJSON feature format
        // RouteSegment has 'path' property with coordinates
        const coordinates =
          route.path?.map((point) => {
            if ("lat" in point && "lng" in point) {
              return [point.lng, point.lat]
            } else {
              return [
                (point as google.maps.LatLng).lng(),
                (point as google.maps.LatLng).lat(),
              ]
            }
          }) || []

        foundFeature = {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: coordinates,
          },
          properties: {
            id: route.id,
            delayRatio: route.delayRatio,
            duration: route.duration,
            staticDuration: route.staticDuration,
            placeId: route.placeId,
            color: route.color,
            name: route.name,
            type: route.type,
            congestionLevel: route.congestionLevel,
            historicalRouteId: route.historicalRouteId,
          } as RouteProperties,
        } as Feature<Geometry, RouteProperties>
      }
    }

    // Update the selected object if we found a feature
    if (foundFeature) {
      setSelectedObject(foundFeature)
      lastProcessedRouteId.current = selectedRouteId
    }
  }, [selectedRouteId, selectedRouteSegment, geoJsonData, fullRouteData])

  return {
    selectedFeature,
    centerCoordinates,
    selectedObject,
    tooltipCoordinates,
    setSelectedObject,
    setTooltipCoordinates,
  }
}
