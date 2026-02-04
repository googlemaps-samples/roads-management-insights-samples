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
import { useMap } from "@vis.gl/react-google-maps"
import type { Feature, FeatureCollection, Geometry } from "geojson"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { usePulseAnimation, useSelectedFeature } from "../hooks"
import { useAppStore } from "../store"
import { Mode, Usecase } from "../types/common"
import { RouteSegment } from "../types/route-segment"
import { MapData } from "../types/store-data"
import DeckGlOverlay from "./deck-gl-overlay"
import { convertToGeoJSON } from "./helpers"
import {
  createAlertIconLayer,
  createColorBasedLayers,
  createPinIconLayer,
} from "./layer-creators"
import { handleMapResetZoom } from "./map-navigation"
import MapTooltipOverlay from "./map-tooltip-overlay"

// Types for GeoJSON properties
export type RouteProperties = {
  id: string
  name: string
  color: string
  delay?: number
  delayRatio?: number
  duration?: number
  staticDuration?: number
  averageSpeed?: number
  length?: number
  lineWidth?: number
  isSelected?: boolean
}

// Type for alert points
export type AlertPoint = {
  position: [number, number] | { lng: number; lat: number }
  name: string
  id: string
  color?: string
  routeId?: string
  segmentData?: RouteSegment
  delayRatio?: number
  placeId?: string
}

interface RouteLayerRendererProps {
  // Data props
  data: RouteSegment[] | FeatureCollection | MapData
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

  // Custom layers to render on top of the map
  customLayers?: LayersList

  // Polygon selection state
  isPolygonSelected?: boolean

  fullRouteData?: RouteSegment[]

  // Disable route selection (for dual map mode)
  disableRouteSelection?: boolean

  // Map ref name for dual map mode
  mapRefName?: "map" | "leftMap" | "rightMap"
}

// Inner component that has access to the map instance
export const RouteLayerRenderer: React.FC<RouteLayerRendererProps> = ({
  data,
  mode,
  usecase,
  onSegmentClick,
  onHandleClose,
  selectedRouteId,
  selectedRouteSegment,
  alertsGeojson,
  customLayers,
  fullRouteData = [],
  disableRouteSelection = false,
  mapRefName = "map",
}) => {
  const pulseValue = usePulseAnimation(!!selectedRouteId)
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null)
  const isAutoplayPlaying = useAppStore((state) => state.isAutoplayPlaying)

  // Get setSelectedRouteId and setSelectedRouteSegment from app store for universal route selection
  const setSelectedRouteId = useAppStore((state) => state.setSelectedRouteId)
  const setSelectedRouteSegment = useAppStore(
    (state) => state.setSelectedRouteSegment,
  )

  // Get alerts from store and convert to AlertPoint format
  const storeAlerts = useAppStore((state) => state.alerts)

  // Get grey routes state from store
  const shouldUseGreyRoutes = false

  // Convert data to GeoJSON format
  const geoJsonData = useMemo(() => {
    // If data is MapData, extract the features
    if (data && typeof data === "object" && "features" in data) {
      return convertToGeoJSON((data as MapData).features)
    }
    return convertToGeoJSON(data)
  }, [data])

  // State to track if we have a direct segment object from alert marker
  const [directSegmentObject, setDirectSegmentObject] =
    useState<RouteSegment | null>(null)

  // Handle feature selection and tooltip coordinates
  const {
    selectedObject: hookSelectedObject,
    tooltipCoordinates,
    setSelectedObject,
    setTooltipCoordinates,
  } = useSelectedFeature(
    selectedRouteId,
    selectedRouteSegment,
    geoJsonData,
    fullRouteData as RouteSegment[],
    directSegmentObject || undefined,
  )

  // Clear directSegmentObject when selectedRouteId is cleared
  useEffect(() => {
    if (!selectedRouteId) {
      // Clear directSegmentObject when selection is cleared
      setDirectSegmentObject(null)
    }
  }, [selectedRouteId])

  // Clear hover state when route selection is disabled
  useEffect(() => {
    if (disableRouteSelection) {
      setHoveredRouteId(null)
    }
  }, [disableRouteSelection])

  // Get the map instance directly from the useMap hook
  const map = useMap()

  // Get map reference from global state based on mapRefName
  const mapFromStore = useAppStore((state) => state.refs[mapRefName])
  const setRef = useAppStore((state) => state.setRef)

  // Create a ref object for useMapEvents compatibility
  const mapRef = useRef<google.maps.Map | null>(mapFromStore)
  // Track if this component instance set the ref
  const didSetRef = useRef(false)

  // Animation control
  const setAnimationInProgress = useState(false)[1]
  const animationRef = useRef<number | null>(null)
  const isClickingRoute = useRef(false)

  // Update the ref when the map from store changes
  useEffect(() => {
    mapRef.current = mapFromStore
  }, [mapFromStore])

  // Set the map reference in global state when the map is available
  useEffect(() => {
    if (map && !mapFromStore) {
      setRef(mapRefName, map)
      map.setOptions({ draggableCursor: "grab" })
      didSetRef.current = true
    }
  }, [map, mapFromStore, setRef, mapRefName])

  // Cleanup: clear the ref when this component unmounts (only if we set it)
  useEffect(() => {
    return () => {
      if (didSetRef.current) {
        setRef(mapRefName, null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRefName])

  // Function to cancel any ongoing animation
  const cancelAnimation = useCallback(async () => {
    if (animationRef.current) {
      // The ref could be either an animation frame ID or a timeout ID
      // Try both ways to cancel it
      cancelAnimationFrame(animationRef.current)
      clearTimeout(animationRef.current)
      animationRef.current = null
    }
    setAnimationInProgress(false)
    return Promise.resolve()
  }, [setAnimationInProgress])

  const onHover = useCallback(
    (info: { object?: Feature<Geometry, RouteProperties> }) => {
      // If route selection is disabled (e.g., in dual map mode), don't process hover
      if (disableRouteSelection) {
        return
      }

      // Update hoveredRouteId based on the hovered object
      if (info.object && info.object.properties) {
        const hoveredId = info.object.properties.id
        // Don't apply hover effect if this is the selected route
        if (hoveredId === selectedRouteId) {
          setHoveredRouteId(null)
        } else {
          setHoveredRouteId(hoveredId)
        }
      } else {
        setHoveredRouteId(null)
      }

      // Update Google Maps cursor based on hover state
      if (mapRef.current) {
        const cursor = info.object ? "pointer" : "grab"
        mapRef.current.setOptions({
          draggableCursor: cursor,
        })
      }
    },
    [disableRouteSelection, selectedRouteId],
  )

  // Hover handler for alert markers
  const onAlertHover = useCallback(
    (info: { object?: AlertPoint }) => {
      // If route selection is disabled (e.g., in dual map mode), don't process hover
      if (disableRouteSelection) {
        return
      }

      // Update hoveredRouteId based on the hovered object
      if (info.object) {
        const hoveredId = info.object.id
        // Don't apply hover effect if this is the selected route
        if (hoveredId === selectedRouteId) {
          setHoveredRouteId(null)
        } else {
          setHoveredRouteId(hoveredId)
        }
      } else {
        setHoveredRouteId(null)
      }

      // Update Google Maps cursor based on hover state
      if (mapRef.current) {
        const cursor = info.object ? "pointer" : "grab"
        mapRef.current.setOptions({
          draggableCursor: cursor,
        })
      }
    },
    [disableRouteSelection, selectedRouteId],
  )

  // Hover handler for pin markers
  const onPinHover = useCallback(
    (info: { object?: { position: [number, number]; name: string } }) => {
      // If route selection is disabled (e.g., in dual map mode), don't process hover
      if (disableRouteSelection) {
        return
      }

      // Update hoveredRouteId based on the hovered object
      if (info.object) {
        const hoveredId = info.object.name
        // Don't apply hover effect if this is the selected route
        if (hoveredId === selectedRouteId) {
          setHoveredRouteId(null)
        } else {
          setHoveredRouteId(hoveredId)
        }
      } else {
        setHoveredRouteId(null)
      }

      // Update Google Maps cursor based on hover state
      if (mapRef.current) {
        const cursor = info.object ? "pointer" : "grab"
        mapRef.current.setOptions({
          draggableCursor: cursor,
        })
      }
    },
    [disableRouteSelection, selectedRouteId],
  )

  // Track previous values to prevent unnecessary zoom calls
  const prevSelectedRouteId = useRef<string | null>(null)
  const prevTooltipCoordinates = useRef<[number, number] | null>(null)

  // Ref for debouncing route selection during autoplay
  const routeSelectionTimeoutRef = useRef<number | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (routeSelectionTimeoutRef.current) {
        clearTimeout(routeSelectionTimeoutRef.current)
      }
    }
  }, [])

  // Effect to handle route selection from panel when we have the data
  useEffect(() => {
    // Clear previous values when route is deselected
    if (!selectedRouteId) {
      prevSelectedRouteId.current = null
      prevTooltipCoordinates.current = null
      return
    }

    if (
      (usecase !== "route-reliability" || isAutoplayPlaying) &&
      selectedRouteId &&
      tooltipCoordinates &&
      mapRef.current &&
      !isClickingRoute.current &&
      // Only zoom if the route selection actually changed
      (selectedRouteId !== prevSelectedRouteId.current ||
        JSON.stringify(tooltipCoordinates) !==
          JSON.stringify(prevTooltipCoordinates.current))
    ) {
      // Route was selected from panel, call handleMapResetZoom with panel coordinates
      handleMapResetZoom(selectedRouteId, tooltipCoordinates, geoJsonData)

      // Update the previous values
      prevSelectedRouteId.current = selectedRouteId
      prevTooltipCoordinates.current = tooltipCoordinates
    }
  }, [
    selectedRouteId,
    tooltipCoordinates,
    geoJsonData,
    usecase,
    isAutoplayPlaying,
  ])

  // Handle clicks on route segments
  const handleOnClick = useCallback(
    (
      routeId: string,
      coordinates: number[][],
      object: Feature<Geometry, RouteProperties>,
    ) => {
      if (!routeId) {
        console.error(
          "🎯 RouteLayerRenderer: handleOnClick received undefined/null routeId",
          { object, coordinates },
        )
        return
      }

      // If route selection is disabled (e.g., in dual map mode), don't process the click
      if (disableRouteSelection) {
        return
      }

      // Get the actual route ID that will be selected
      const actualRouteId = routeId

      // If clicking on already selected route, do nothing
      if (actualRouteId === selectedRouteId) {
        return
      }

      // Set flag to prevent useEffect from triggering
      isClickingRoute.current = true

      let centerCoord: [number, number] | null = null

      // Find the exact middle point of the route segment
      if (coordinates && coordinates.length > 0) {
        // For LineString geometry (most common case)
        if (coordinates.length > 1) {
          // Always use the exact middle point
          const centerIndex = Math.floor(coordinates.length / 2)

          // Ensure we have a valid [number, number] tuple
          const coord = coordinates[centerIndex]
          if (
            Array.isArray(coord) &&
            coord.length === 2 &&
            typeof coord[0] === "number" &&
            typeof coord[1] === "number" &&
            !isNaN(coord[0]) &&
            !isNaN(coord[1]) &&
            isFinite(coord[0]) &&
            isFinite(coord[1])
          ) {
            centerCoord = coord as [number, number]
          }
        } else {
          // For single point or single coordinate pair
          if (
            Array.isArray(coordinates[0]) &&
            coordinates[0].length === 2 &&
            !isNaN(coordinates[0][0]) &&
            !isNaN(coordinates[0][1]) &&
            isFinite(coordinates[0][0]) &&
            isFinite(coordinates[0][1])
          ) {
            centerCoord = coordinates[0] as [number, number]
          }
        }
      }

      // First, cancel any ongoing animation
      cancelAnimation()

      // Set tooltip coordinates
      if (centerCoord) {
        setTooltipCoordinates(centerCoord)
      } else {
        console.error("Invalid coordinates in handleOnClick:", coordinates)
      }

      setHoveredRouteId(null)

      // Call the use case specific handler if provided (for additional logic like polygon selection)
      if (onSegmentClick) {
        onSegmentClick(actualRouteId)
      }

      // Set the selected route ID
      setSelectedRouteId(actualRouteId)

      // Handle route zoom directly with fresh coordinates
      if (centerCoord) {
        handleMapResetZoom(actualRouteId, centerCoord, geoJsonData)
      }

      // Clear flag after a short delay to allow useEffect to work for other cases
      setTimeout(() => {
        isClickingRoute.current = false
      }, 100)
    },
    [
      disableRouteSelection,
      selectedRouteId,
      onSegmentClick,
      setSelectedRouteId,
      setTooltipCoordinates,
      cancelAnimation,
      geoJsonData,
    ],
  )

  // Handle clicks on alert markers (different signature)
  const handleAlertOnClick = useCallback(
    async (
      routeId: string,
      coordinates: number[][],
      object: AlertPoint | RouteSegment,
    ) => {
      if (!routeId) {
        console.error(
          "🎯 RouteLayerRenderer: handleAlertOnClick received undefined/null routeId",
        )
        return
      }

      // If route selection is disabled (e.g., in dual map mode), don't process the click
      if (disableRouteSelection) {
        return
      }

      // If clicking on already selected route, do nothing
      if (routeId === selectedRouteId) {
        return
      }

      // During autoplay, debounce route selection to prevent conflicts with time updates
      const state = useAppStore.getState()
      if (state.isAutoplayPlaying) {
        // Clear any existing timeout
        if (routeSelectionTimeoutRef.current) {
          clearTimeout(routeSelectionTimeoutRef.current)
        }

        // Debounce route selection during autoplay
        routeSelectionTimeoutRef.current = setTimeout(() => {
          onSegmentClick(routeId)
        }, 100) // Short debounce to maintain responsiveness
        return
      }

      // Set flag to prevent useEffect from triggering
      isClickingRoute.current = true

      let centerCoord: [number, number] | null = null

      // Find the exact middle point of the route segment
      if (coordinates && coordinates.length > 0) {
        // For LineString geometry (most common case)
        if (coordinates.length > 1) {
          // Always use the exact middle point
          const centerIndex = Math.floor(coordinates.length / 2)

          // Ensure we have a valid [number, number] tuple
          const coord = coordinates[centerIndex]
          if (
            Array.isArray(coord) &&
            coord.length === 2 &&
            typeof coord[0] === "number" &&
            typeof coord[1] === "number" &&
            !isNaN(coord[0]) &&
            !isNaN(coord[1]) &&
            isFinite(coord[0]) &&
            isFinite(coord[1])
          ) {
            centerCoord = coord as [number, number]
          }
        } else {
          // For single point or single coordinate pair
          if (
            Array.isArray(coordinates[0]) &&
            coordinates[0].length === 2 &&
            !isNaN(coordinates[0][0]) &&
            !isNaN(coordinates[0][1]) &&
            isFinite(coordinates[0][0]) &&
            isFinite(coordinates[0][1])
          ) {
            centerCoord = coordinates[0] as [number, number]
          }
        }
      }

      // First, cancel any ongoing animation
      await cancelAnimation()

      // Set tooltip coordinates
      if (centerCoord) {
        setTooltipCoordinates(centerCoord)
      } else {
        console.error("Invalid coordinates in handleAlertOnClick:", coordinates)
      }

      // Check if this is an alert marker click (only in historical mode)

      // For alert markers in historical mode, handle single segment only
      const segment = object as RouteSegment

      setDirectSegmentObject(segment || null)
      setSelectedRouteSegment(segment || null)

      // Set the route ID for tooltip functionality
      setSelectedRouteId(object.routeId || routeId)

      // Also call onSegmentClick to trigger route selection and focusing
      if (onSegmentClick) {
        onSegmentClick(object.routeId || routeId)
      }

      // Handle route zoom directly with fresh coordinates for alert markers
      if (centerCoord) {
        handleMapResetZoom(object.routeId || routeId, centerCoord, geoJsonData)
      }

      // Clear flag after a short delay to allow useEffect to work for other cases
      setTimeout(() => {
        isClickingRoute.current = false
      }, 100)

      setHoveredRouteId(null)
    },
    [
      disableRouteSelection,
      selectedRouteId,
      onSegmentClick,
      setDirectSegmentObject,
      setSelectedRouteSegment,
      setSelectedRouteId,
      setTooltipCoordinates,
      cancelAnimation,
      geoJsonData,
    ],
  )

  // No-op hover handler for grey routes
  const noOpHover = useCallback(() => {
    // Don't update hover state or cursor for grey routes
  }, [])

  // Create route layers from the data - memoize to improve performance
  const routeLayers = useMemo(() => {
    if (!geoJsonData) return null

    // Use color-based layers for better performance and organization
    // For grey routes, disable hover by passing null hoveredRouteId and noOpHover
    const colorBasedLayers = createColorBasedLayers(
      geoJsonData,
      mode,
      shouldUseGreyRoutes ? null : hoveredRouteId, // Disable hover for grey routes
      selectedRouteId,
      pulseValue,
      handleOnClick,
      shouldUseGreyRoutes ? noOpHover : onHover, // Use no-op hover for grey routes
      shouldUseGreyRoutes,
    )

    return colorBasedLayers
  }, [
    geoJsonData,
    mode,
    hoveredRouteId,
    selectedRouteId,
    pulseValue,
    handleOnClick,
    onHover,
    noOpHover,
    shouldUseGreyRoutes,
  ])

  // Create alert layers if alert data is provided
  const alertsLayer = useMemo(() => {
    // Use store alerts if available, otherwise fall back to props
    const alertsToUse = storeAlerts || alertsGeojson

    if (alertsToUse && Array.isArray(alertsToUse) && alertsToUse.length > 0) {
      // Convert RouteAlert[] or RouteAlertWithPosition[] to AlertPoint[]
      const alertPoints: AlertPoint[] = alertsToUse
        .map((alert) => {
          if ("position" in alert) {
            // RouteAlertWithPosition format
            const alertPoint = {
              id: alert.id,
              name: alert.name,
              position: alert.position,
              color: alert.color,
              routeId: alert.name, // Use name as routeId
            } as AlertPoint

            console.log("🔄 Converting alert to AlertPoint:", {
              originalAlert: alert,
              alertPoint,
            })

            return alertPoint
          } else {
            // RouteAlert format - we need to find the route segment to get position
            // For now, return null which will be filtered out
            console.log("⚠️ Alert without position, skipping:", alert)
            return null
          }
        })
        .filter((alert): alert is AlertPoint => alert !== null)

      console.log("📋 Final alertPoints for layer creation:", alertPoints)

      if (alertPoints.length > 0) {
        return createAlertIconLayer(
          alertPoints,
          handleAlertOnClick,
          onAlertHover,
        )
      }
    } else if (
      hookSelectedObject &&
      (usecase === "realtime-monitoring" || usecase === "data-analytics")
    ) {
      return createPinIconLayer(
        hookSelectedObject,
        selectedRouteId,
        pulseValue,
        onPinHover,
      )
    }
    return null
  }, [
    storeAlerts,
    alertsGeojson,
    hookSelectedObject,
    selectedRouteId,
    pulseValue,
    handleAlertOnClick,
    onAlertHover,
    onPinHover,
    usecase,
  ])

  // Reset hover state when data changes
  useEffect(() => {
    setHoveredRouteId(null) // Reset hover state when dependencies change
  }, [geoJsonData])

  // Combine route layers, alert layers, and custom layers with proper ordering
  const allLayers = useMemo(() => {
    const layers: LayersList = []

    // Route layers form the base
    if (routeLayers) layers.push(...routeLayers)

    // Custom layers render above route layers (e.g., landmark labels)
    if (customLayers) layers.push(...customLayers)

    // Add alert layers on top of everything
    if (alertsLayer) layers.push(alertsLayer)

    return layers
  }, [routeLayers, alertsLayer, customLayers])

  // Use direct segment object if available and it matches the selected route, otherwise use the one from useSelectedFeature
  const finalSelectedObject = useMemo(() => {
    if (directSegmentObject && selectedRouteId) {
      const directRouteId = directSegmentObject.id
      if (directRouteId === selectedRouteId) {
        // Convert RouteSegment/SplitRouteSegment to the expected format
        return {
          properties: {
            ...directSegmentObject,
            id: directSegmentObject.id,
          },
        }
      }
    }

    // If we have a selectedRouteSegment from the store (e.g., from panel click),
    // create a proper object with the updated data
    if (
      selectedRouteSegment &&
      selectedRouteId &&
      selectedRouteSegment.id === selectedRouteId
    ) {
      // Create a new object that combines the geometry from hookSelectedObject with the updated data from selectedRouteSegment
      const baseObject = hookSelectedObject || directSegmentObject
      if (baseObject) {
        return {
          ...baseObject,
          properties: {
            ...(baseObject &&
            "properties" in baseObject &&
            baseObject.properties
              ? baseObject.properties
              : {}),
            ...selectedRouteSegment,
            // Ensure we have the id property for consistency
            id: selectedRouteSegment.id || selectedRouteId,
          },
        }
      }
    }

    return hookSelectedObject
  }, [
    directSegmentObject,
    hookSelectedObject,
    selectedRouteId,
    selectedRouteSegment,
  ])

  // Safety check: Don't proceed if map is not properly initialized
  if (!map) {
    return null
  }

  return (
    <>
      <DeckGlOverlay layers={allLayers} />
      {selectedRouteId && finalSelectedObject && tooltipCoordinates && (
        <MapTooltipOverlay
          position={tooltipCoordinates}
          hoveredObject={finalSelectedObject}
          mode={mode}
          usecase={usecase}
          onClose={() => {
            // Use setTimeout to defer expensive operations and prevent blocking the click handler
            setTimeout(async () => {
              // First cancel any ongoing animation
              await cancelAnimation()

              // Clear selection state
              setSelectedObject(null)
              setDirectSegmentObject(null)
              setTooltipCoordinates(null)

              // Clear the selected route ID when user explicitly closes the tooltip
              setSelectedRouteId("")

              // Call the custom handle close function if provided (for view reset)
              if (onHandleClose) {
                onHandleClose()
              }
            }, 10) // Small delay to ensure click handler completes first
          }}
        />
      )}
    </>
  )
}
