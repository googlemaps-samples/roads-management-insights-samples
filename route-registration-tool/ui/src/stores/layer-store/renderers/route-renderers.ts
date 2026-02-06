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

import { TileLayer } from "@deck.gl/geo-layers"
import { GeoJsonLayer, PathLayer } from "@deck.gl/layers"

import { generateArrowsForLineString } from "../../../utils/arrow-generation"
import {
  calculateRouteLengthFromGeometry,
  decodePolylineToGeoJSON,
} from "../../../utils/polyline-decoder"
import PolylineDecoderWorker from "../../../workers/polyline-decoder-worker?worker"
import { Route } from "../../project-workspace-store"
import {
  ARROW_SIZE_CONFIG,
  BASE_ROUTE_WIDTH,
  DIRECTION_ARROW_WIDTH_PIXELS,
  PATH_BORDER_MIN_PIXELS,
  PATH_BORDER_WIDTH_MULTIPLIER,
  SEGMENT_HOVER_WIDTH,
  SELECTED_ROUTE_WIDTH,
} from "../constants"
import { DeckGLLayer, SnappedRoad, UploadedRoute } from "../types"
import { getColorsForMapType } from "../utils/color-utils"

// Cache for decoded polylines to avoid re-decoding on every render
const polylineDecodeCache = new Map<string, number[][]>()

// Cache for processed segment paths to avoid re-processing on every render
const processedSegmentPathsCache = new Map<
  string,
  Array<{
    id: string
    path: number[][]
    isEnabled: boolean
    sync_status: string
    order: number
    segmentData: any
  }>
>()

// Cache for boundaries layers to avoid recreating on every render
const boundariesLayerCache = new Map<string, DeckGLLayer | null>()

// Web Worker instance for batch polyline decoding (singleton)
let polylineDecoderWorker: Worker | null = null
let workerRequestId = 0

function getPolylineDecoderWorker(): Worker {
  if (!polylineDecoderWorker) {
    polylineDecoderWorker = new PolylineDecoderWorker()
    polylineDecoderWorker.onerror = (error) => {
      console.error("[polyline-decoder-worker] Worker error:", error)
    }
  }
  return polylineDecoderWorker
}

// Batch decode polylines synchronously (for immediate use in synchronous context)
// Web Worker infrastructure is available for future async operations
function batchDecodePolylinesSync(
  polylines: Array<{ key: string; encoded: string }>,
): Map<string, number[][]> {
  const decodedMap = new Map<string, number[][]>()

  // Decode synchronously for immediate use
  // The worker can be used for async operations in the future
  for (const { key, encoded } of polylines) {
    try {
      const decoded = decodePolylineToGeoJSON(encoded)
      if (decoded.coordinates && decoded.coordinates.length >= 2) {
        decodedMap.set(key, decoded.coordinates)
        polylineDecodeCache.set(key, decoded.coordinates)
      }
    } catch (error: any) {
      console.warn(`Failed to decode polyline ${key}:`, error)
    }
  }

  return decodedMap
}

// Async batch decode using Web Worker (available for future async operations)
export async function batchDecodePolylinesAsync(
  polylines: Array<{ key: string; encoded: string }>,
): Promise<Map<string, number[][]>> {
  return new Promise((resolve, reject) => {
    const worker = getPolylineDecoderWorker()
    const currentRequestId = ++workerRequestId
    const decodedMap = new Map<string, number[][]>()

    // Check cache first and add to map
    for (const { key } of polylines) {
      const cached = polylineDecodeCache.get(key)
      if (cached) {
        decodedMap.set(key, cached)
      }
    }

    // Filter out already cached polylines
    const uncachedPolylines = polylines.filter(
      ({ key }) => !polylineDecodeCache.has(key),
    )

    if (uncachedPolylines.length === 0) {
      resolve(decodedMap)
      return
    }

    // Set up one-time message handler
    const messageHandler = (e: MessageEvent) => {
      // Only process if this is still the current request
      if (currentRequestId !== workerRequestId) {
        return
      }

      const { type, payload } = e.data

      if (type === "POLYLINES_DECODED") {
        const { decoded } = payload
        // Update cache and map
        for (const [key, coordinates] of decoded) {
          polylineDecodeCache.set(key, coordinates)
          decodedMap.set(key, coordinates)
        }
        worker.removeEventListener("message", messageHandler)
        resolve(decodedMap)
      } else if (type === "ERROR") {
        worker.removeEventListener("message", messageHandler)
        reject(new Error(payload.error))
      }
    }

    worker.addEventListener("message", messageHandler)

    // Send batch decode request to worker
    worker.postMessage({
      type: "DECODE_POLYLINES",
      payload: { polylines: uncachedPolylines },
    })

    // Timeout after 10 seconds
    setTimeout(() => {
      if (currentRequestId === workerRequestId) {
        worker.removeEventListener("message", messageHandler)
        reject(new Error("Polyline decoding timeout"))
      }
    }, 10000)
  })
}

export function createSavedRoutesLayer(
  projectId: string,
  routesTilesTimestamp: number,
  refreshTrigger: number,
  routesTileCache: Map<string, GeoJSON.FeatureCollection>,
  onRouteClick?: (routeId: string) => void,
  currentZoom?: number,
  showTileLayerArrows?: boolean,
  routeColorMode: "sync_status" | "traffic_status" = "sync_status",
  mapType: "roadmap" | "hybrid" = "roadmap",
): DeckGLLayer | null {
  if (!projectId) {
    return null
  }

  const apiBaseUrl = import.meta.env.PROD ? "" : "http://localhost:8000"

  try {
    const tileLayer = new TileLayer({
      id: `saved-routes-tile-t${routesTilesTimestamp}`,
      getTileData: async (props: any) => {
        const { index } = props
        if (
          !index ||
          typeof index.x !== "number" ||
          typeof index.y !== "number" ||
          typeof index.z !== "number"
        ) {
          return null
        }

        const { x, y, z } = index
        const key = `${z}/${x}/${y}`

        if (routesTileCache.has(key)) {
          return routesTileCache.get(key)
        }

        try {
          const tileUrl = `${apiBaseUrl}/tiles/routes/${z}/${x}/${y}.geojson?project_id=${projectId}&t=${routesTilesTimestamp}`
          const response = await fetch(tileUrl)

          if (!response.ok) {
            return null
          }

          const tileData: GeoJSON.FeatureCollection = await response.json()

          if (!tileData || !tileData.features) {
            return null
          }

          routesTileCache.set(key, tileData)
          return tileData
        } catch (error) {
          console.error(`Error fetching tile ${key}:`, error)
          return null
        }
      },
      minZoom: 4,
      maxZoom: 10,
      pickable: true,
      autohighlight: false,
      updateTriggers: {
        getLineColor: [refreshTrigger, currentZoom, routeColorMode, mapType],
        getLineWidth: [refreshTrigger, currentZoom],
        getTooltip: refreshTrigger,
      },
      renderSubLayers: (subLayerProps: any) => {
        const { data, tile } = subLayerProps
        console.log("🔍 Route TileLayer: data", data)

        if (!data?.features?.length) {
          return null
        }

        const enhancedFeatures: GeoJSON.Feature[] = []
        // Use actual map zoom level for arrow generation, not tile zoom
        const zoomLevel = currentZoom ?? tile?.index?.z ?? 0

        const colors = getColorsForMapType(mapType)
        const getSyncStatusColor = (
          status: string | undefined,
        ): [number, number, number, number] => {
          switch (status) {
            case "unsynced":
              return colors.routeStatusColors.unsynced
            case "validating":
              return colors.routeStatusColors.validating
            case "synced":
              return colors.routeStatusColors.synced
            case "invalid":
              return colors.routeStatusColors.invalid
            case "failed":
              return colors.routeStatusColors.failed
            default:
              return colors.routeStatusColors.unsynced // Default to orange (unsynced)
          }
        }

        const getTrafficStatusColor = (
          status: string | undefined,
        ): [number, number, number, number] => {
          switch (status) {
            case "NORMAL":
              return [0, 255, 0, 255] as [number, number, number, number] // Green
            case "SLOW":
              return [242, 164, 53, 255] as [number, number, number, number] // Orange
            case "TRAFFIC_JAM":
              return [255, 0, 0, 255] as [number, number, number, number] // Red
            default:
              return [242, 164, 53, 255] as [number, number, number, number] // Default orange
          }
        }

        for (const feature of data.features as GeoJSON.Feature[]) {
          // Calculate route length from geometry if available (more accurate than stored length)
          let calculatedLength: number | null = null
          if (
            feature.geometry?.type === "LineString" &&
            feature.geometry.coordinates.length >= 2
          ) {
            calculatedLength = calculateRouteLengthFromGeometry(
              feature.geometry,
            )
          }

          // Enhance the feature with additional properties
          const enhancedFeature = {
            ...feature,
            properties: {
              ...feature.properties,
              featureType: "route", // Add type identifier
              // Add any computed or additional properties
              displayName:
                feature.properties?.name ||
                feature.properties?.display_name ||
                "Unknown Route",
              // Calculate length from geometry if available (more accurate)
              calculatedLength: calculatedLength,
              // Format dates, calculate derived values, etc.
              hasTrafficData:
                !!(
                  feature.properties?.current_duration_seconds ||
                  feature.properties?.current_duration_in_seconds
                ) &&
                !!(
                  feature.properties?.static_duration_seconds ||
                  feature.properties?.static_duration_in_seconds
                ) &&
                !!feature.properties?.traffic_status, // Boolean flag - true if traffic data fields are available
              // Route table fields
              static_duration_seconds:
                feature.properties?.static_duration_seconds ||
                feature.properties?.static_duration_in_seconds,
              current_duration_seconds:
                feature.properties?.current_duration_seconds ||
                feature.properties?.current_duration_in_seconds,
              traffic_status: feature.properties?.traffic_status,
              synced_at: feature.properties?.synced_at,
              sync_status:
                feature.properties?.sync_status ||
                feature.properties?.status ||
                "unsynced",
              latest_data_updated_time:
                feature.properties?.latest_data_updated_time ||
                feature.properties?.retrieval_time ||
                feature.properties?.last_updated_at,
            },
          }

          enhancedFeatures.push(enhancedFeature)

          // Generate arrows for saved routes (zoom >= 16, length-based sizing)
          if (
            feature.geometry?.type === "LineString" &&
            feature.geometry.coordinates.length >= 2
          ) {
            const status =
              (feature.properties as any)?.sync_status ||
              (feature.properties as any)?.status ||
              "unsynced"

            const lengthMeters =
              (feature.properties?.length ?? 0) * 1000 ||
              (feature.properties?.distance ?? 0) ||
              0

            if (lengthMeters > 0) {
              // Determine arrow color based on routeColorMode
              const routeTrafficStatus = feature.properties?.traffic_status
              const arrowColor =
                routeColorMode === "sync_status"
                  ? getSyncStatusColor(status)
                  : getTrafficStatusColor(routeTrafficStatus)

              const arrowFeatures = generateArrowsForLineString(
                feature.geometry.coordinates,
                zoomLevel,
                {
                  color: arrowColor,
                  width: DIRECTION_ARROW_WIDTH_PIXELS,
                  mode: "tile-layer",
                  minZoom: ARROW_SIZE_CONFIG.TILE_LAYER_MIN_ZOOM,
                },
                lengthMeters,
                {
                  type: "direction_arrow",
                  status,
                  sync_status: status,
                  traffic_status: routeTrafficStatus,
                },
                showTileLayerArrows, // Pass external flag
              )
              enhancedFeatures.push(...arrowFeatures)
            }
          }
        }

        const enhancedData = {
          ...data,
          features: enhancedFeatures,
        }

        return new GeoJsonLayer({
          ...subLayerProps,
          id: `${subLayerProps.id}-geojson`,
          data: enhancedData,
          stroked: false,
          filled: true,
          lineWidthMinPixels: 3,
          pickable: true,
          autohighlight: false,
          highlightColor: [255, 255, 255, 255],
          lineWidthUnits: "pixels",
          lineJointRounded: true,
          lineCapRounded: true,
          lineMiterLimit: 2,
          getLineColor: (d: any) => {
            // Direction arrows match their route's color
            if (d.properties?.type === "direction_arrow") {
              const routeStatus = d.properties?.sync_status || "unsynced"
              const routeTrafficStatus = d.properties?.traffic_status

              if (routeColorMode === "sync_status") {
                return getSyncStatusColor(routeStatus)
              } else {
                return getTrafficStatusColor(routeTrafficStatus)
              }
            }

            // Route line colors
            if (routeColorMode === "sync_status") {
              const syncStatus = d.properties?.sync_status || "unsynced"
              return getSyncStatusColor(syncStatus)
            } else {
              const trafficStatus = d.properties?.traffic_status
              return getTrafficStatusColor(trafficStatus)
            }
          },
          getLineWidth: (d: any) =>
            d.properties?.type === "direction_arrow"
              ? DIRECTION_ARROW_WIDTH_PIXELS
              : BASE_ROUTE_WIDTH,
          onClick: onRouteClick
            ? async ({ object }) => {
                if (object?.properties?.id) {
                  onRouteClick(object.properties.id)
                }
              }
            : undefined,
        })
      },
    })

    return {
      id: `saved-routes-tile-t${routesTilesTimestamp}`,
      layer: tileLayer,
      visible: true,
    }
  } catch (error) {
    console.error("Failed to create Routes TileLayer:", error)
    return null
  }
}

export function createSelectedRouteLayer(
  route: Route | null,
  currentZoom?: number,
  mapType: "roadmap" | "hybrid" = "roadmap",
  isHovered: boolean = false,
  onRouteHover?: (routeId: string | null) => void,
): DeckGLLayer | null {
  if (!route) {
    return null
  }

  let coordinates: number[][] = []

  if (route.encodedPolyline) {
    if (typeof route.encodedPolyline === "string") {
      try {
        const parsed = JSON.parse(route.encodedPolyline)
        if (
          Array.isArray(parsed) &&
          parsed.length > 1 &&
          Array.isArray(parsed[0]) &&
          typeof parsed[0][0] === "number"
        ) {
          coordinates = parsed
        } else {
          coordinates = decodePolylineToGeoJSON(
            route.encodedPolyline,
          ).coordinates
        }
      } catch (err) {
        coordinates = decodePolylineToGeoJSON(route.encodedPolyline).coordinates
      }
    } else if (
      Array.isArray(route.encodedPolyline) &&
      Array.isArray(route.encodedPolyline[0]) &&
      typeof route.encodedPolyline[0][0] === "number"
    ) {
      coordinates = route.encodedPolyline
    }
  }

  if (coordinates.length < 2) {
    return null
  }

  const pathData = {
    id: route.id,
    path: coordinates,
    isHovered,
  }

  const colors = getColorsForMapType(mapType)

  // Get sync status color (same as segmented routes)
  const getSyncStatusColor = (
    status: string | undefined,
  ): [number, number, number, number] => {
    switch (status) {
      case "unsynced":
        return colors.routeStatusColors.unsynced
      case "validating":
        return colors.routeStatusColors.validating
      case "synced":
        return colors.routeStatusColors.synced
      case "invalid":
        return colors.routeStatusColors.invalid
      case "failed":
        return colors.routeStatusColors.failed
      default:
        return colors.routeStatusColors.unsynced // Default to orange (unsynced)
    }
  }

  // Use sync status color for non-segmented routes (same as segments)
  const routeColor = getSyncStatusColor(route.sync_status)

  // Get route width (1.5x on hover, same as segments)
  const getRouteWidth = (hovered: boolean) => {
    const baseWidth = SELECTED_ROUTE_WIDTH
    if (hovered) {
      return Math.round(baseWidth * 1.5) // 1.5x thicker on hover, same as segments
    }
    return baseWidth
  }

  const layers: any[] = []

  // Split into hovered and non-hovered for proper rendering (EXACTLY like segments)
  // For non-segmented routes, we use the same pattern as segments:
  // - Non-hovered layers: render when NOT hovered (empty data when hovered)
  // - Hovered layers: render when hovered (empty data when not hovered)
  // - Hovered main layer ALWAYS has data for hover detection (but zero width when not hovered)

  // Non-hovered route layers (render behind when not hovered)
  // Border layer for non-hovered route (not pickable, like segments)
  if (!isHovered) {
    layers.push(
      new PathLayer({
        id: "selected-route-border",
        data: [pathData], // Only when not hovered
        getPath: (d: any) => d.path,
        getColor: colors.pathBorderColor, // Border color (gray/white based on mapType)
        getWidth: () => getRouteWidth(false) + 4, // 1px border on each side
        widthUnits: "pixels" as const,
        capRounded: true,
        jointRounded: true,
        pickable: false, // Border not pickable (like segments)
        parameters: { depthTest: false as any },
        widthMinPixels: SELECTED_ROUTE_WIDTH + 3,
        updateTriggers: {
          getWidth: [isHovered, route.sync_status],
          data: [isHovered], // Trigger re-render when hover state changes
        },
      }),
    )

    // Main route layer (non-hovered) - PICKABLE
    layers.push(
      new PathLayer({
        id: "selected-route-main",
        data: [pathData], // Only when not hovered
        getPath: (d: any) => d.path,
        getColor: routeColor,
        getWidth: () => getRouteWidth(false), // Base width
        widthUnits: "pixels" as const,
        capRounded: true,
        jointRounded: true,
        pickable: true, // PICKABLE for hover detection
        parameters: { depthTest: false as any },
        widthMinPixels: SELECTED_ROUTE_WIDTH,
        onHover: onRouteHover
          ? ({ object }) => {
              if (object?.id) {
                onRouteHover(object.id)
              } else {
                onRouteHover(null)
              }
            }
          : undefined,
        updateTriggers: {
          getColor: [route.sync_status, mapType],
          getWidth: [isHovered, route.sync_status],
          data: [isHovered], // Trigger re-render when hover state changes
        },
      }),
    )
  }

  // Hovered route layers (render on top when hovered) - ALWAYS create structure
  // Border layer for hovered route (thicker border - 3px on each side = 6px total)
  layers.push(
    new PathLayer({
      id: "selected-route-hovered-border",
      data: isHovered ? [pathData] : [], // Only render when hovered
      getPath: (d: any) => d.path,
      getColor: colors.pathBorderColor, // Border color (gray/white based on mapType)
      getWidth: () => getRouteWidth(true) + 6, // 3px border on each side (thicker for more pop)
      widthUnits: "pixels" as const,
      capRounded: true,
      jointRounded: true,
      pickable: false, // Border not pickable
      parameters: { depthTest: false as any },
      widthMinPixels: 6, // Match segments: 6px minimum (actual width is 1.5x + 6px border = ~17px)
      updateTriggers: {
        getWidth: [isHovered, route.sync_status],
        data: [isHovered], // Trigger re-render when hover state changes
      },
    }),
  )

  // Main route layer (hovered - thicker, 1.5x) - ALWAYS PICKABLE (KEY FIX!)
  // This layer ALWAYS has data for hover detection, but uses zero width when not hovered
  // This ensures hover detection works even when not hovered (same pattern as segments)
  layers.push(
    new PathLayer({
      id: "selected-route-hovered-main",
      data: [pathData], // ALWAYS have data for hover detection (critical for hover to work!)
      getPath: (d: any) => d.path,
      getColor: routeColor,
      getWidth: () => (isHovered ? getRouteWidth(true) : 0), // Zero width when not hovered (won't render)
      widthUnits: "pixels" as const,
      capRounded: true,
      jointRounded: true,
      pickable: true, // ALWAYS pickable for hover detection (this is the hover detector layer)
      parameters: { depthTest: false as any },
      widthMinPixels: 0, // Must be 0 to allow zero width when not hovered (actual hovered width is 1.5x = ~11px)
      onHover: onRouteHover
        ? ({ object }) => {
            if (object?.id) {
              onRouteHover(object.id)
            } else {
              onRouteHover(null)
            }
          }
        : undefined,
      updateTriggers: {
        getColor: [route.sync_status, mapType],
        getWidth: [isHovered, route.sync_status],
        data: [isHovered], // Trigger re-render when hover state changes
      },
    }),
  )

  // Generate arrows for selected route (always visible, length+zoom based sizing)
  if (currentZoom !== undefined) {
    // Calculate or extract length
    const lengthMeters = (route.distance ?? 0) * 1000 // km to meters

    // Arrow width comparable to route width (SELECTED_ROUTE_WIDTH = 7)
    const arrowWidth = 6 // Slightly thinner than route for visibility but still prominent
    const arrowBorderWidth = arrowWidth + 3 // Border is 3px wider (1.5px on each side)

    // Hovered arrow width (slightly thicker, 1.2x) - same as segments
    const hoveredArrowWidth = Math.round(arrowWidth * 1.2) // ~7px for hovered route
    const hoveredArrowBorderWidth = hoveredArrowWidth + 4 // Border is 4px wider (2px on each side) for more visibility

    // Calculate longer route length for both main and border arrows (so they match in size)
    // The logarithmic calculation (log10) needs a large multiplier to produce noticeably longer arrows
    const borderArrowLengthMeters = Math.max(
      lengthMeters * 10,
      lengthMeters + 5000,
    )

    // Generate main arrows with longer length (same as border arrows)
    // Use arrows directly from generateArrowsForLineString (no extension needed)
    const arrowFeatures = generateArrowsForLineString(
      coordinates,
      currentZoom,
      {
        color: routeColor, // Use sync status color
        width: arrowWidth,
        mode: "regular-layer",
      },
      borderArrowLengthMeters, // Use same length as border arrows
      {
        route_id: route.id,
      },
    )

    // Generate border arrows with border color (gray/white) and same length
    // Use arrows directly from generateArrowsForLineString (no extension needed)
    const borderArrowFeatures = generateArrowsForLineString(
      coordinates,
      currentZoom,
      {
        color: colors.pathBorderColor, // Use border color (gray/white based on mapType)
        width: arrowBorderWidth,
        mode: "regular-layer",
      },
      borderArrowLengthMeters,
      {
        route_id: route.id,
        is_border: true,
      },
    ).map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        color: colors.pathBorderColor, // Ensure border color
      },
    }))

    if (arrowFeatures.length > 0) {
      // Non-hovered arrows (render behind when not hovered)
      // Arrow border layer (renders first, behind main arrows)
      const arrowBorderLayer = new GeoJsonLayer({
        id: "selected-route-arrows-border",
        data: {
          type: "FeatureCollection",
          features:
            !isHovered && borderArrowFeatures.length > 0
              ? borderArrowFeatures
              : [], // Only render when not hovered
        } as GeoJSON.FeatureCollection,
        getLineColor: colors.pathBorderColor, // Use border color (gray/white based on mapType)
        getLineWidth: (d: any) => d.properties?.width || arrowBorderWidth,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: arrowBorderWidth,
        lineWidthMaxPixels: arrowBorderWidth + 2,
        pickable: false,
        updateTriggers: {
          getLineColor: [mapType, isHovered],
          getLineWidth: [isHovered],
          data: [isHovered],
        },
      })

      // Main arrow layer (non-hovered)
      const arrowLayer = new GeoJsonLayer({
        id: "selected-route-arrows",
        data: {
          type: "FeatureCollection",
          features: !isHovered ? arrowFeatures : [], // Only render when not hovered
        } as GeoJSON.FeatureCollection,
        getLineColor: (d: any) => d.properties?.color || routeColor, // Use sync status color
        getLineWidth: (d: any) => d.properties?.width || arrowWidth,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: arrowWidth,
        lineWidthMaxPixels: arrowWidth + 2,
        pickable: false,
        updateTriggers: {
          getLineColor: [route.sync_status, mapType, isHovered],
          getLineWidth: [isHovered],
          data: [isHovered],
        },
      })

      // Hovered arrows (render on top when hovered) - scale width dynamically
      // Use same arrow features but scale width in getLineWidth based on hover state
      // Store both base and hovered widths in properties for dynamic scaling
      const hoveredArrowFeatures =
        arrowFeatures.length > 0
          ? arrowFeatures.map((feature) => ({
              ...feature,
              properties: {
                ...feature.properties,
                baseWidth: arrowWidth, // Store base width for scaling
                hoveredWidth: hoveredArrowWidth, // Store hovered width (1.2x)
                color: routeColor, // Use sync status color
              },
            }))
          : [] // Ensure array exists even if empty

      // Generate hovered border arrow features - scale width dynamically
      const hoveredBorderArrowFeatures =
        borderArrowFeatures.length > 0
          ? borderArrowFeatures.map((feature) => ({
              ...feature,
              properties: {
                ...feature.properties,
                baseWidth: arrowBorderWidth, // Store base border width
                hoveredWidth: hoveredArrowBorderWidth, // Store hovered border width (1.2x + 4px)
                color: colors.pathBorderColor, // Use border color
              },
            }))
          : [] // Ensure array exists even if empty

      // Hovered arrow border layer (renders first, behind main hovered arrows)
      // Always have data if base arrows exist, scale width dynamically based on hover state
      const hoveredArrowBorderLayer = new GeoJsonLayer({
        id: "selected-route-arrows-hovered-border",
        data: {
          type: "FeatureCollection",
          features: hoveredBorderArrowFeatures, // Always use hovered border arrow features (will have data if base arrows exist)
        } as GeoJSON.FeatureCollection,
        getLineColor: colors.pathBorderColor, // Use border color (gray/white based on mapType)
        getLineWidth: (d: any) =>
          isHovered ? d.properties?.hoveredWidth || hoveredArrowBorderWidth : 0, // Zero width when not hovered, hovered width (1.2x + 4px = ~11px) when hovered
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 0, // Allow zero width when not hovered
        lineWidthMaxPixels: hoveredArrowBorderWidth + 2,
        pickable: false,
        updateTriggers: {
          getLineColor: [mapType, isHovered],
          getLineWidth: [isHovered], // Dynamic width based on hover state - triggers re-render when hover changes
          data: [isHovered],
        },
      })

      // Main hovered arrow layer (renders on top of hovered border)
      // Always have data if base arrows exist, scale width dynamically based on hover state
      const hoveredArrowLayer = new GeoJsonLayer({
        id: "selected-route-arrows-hovered",
        data: {
          type: "FeatureCollection",
          features: hoveredArrowFeatures, // Always use hovered arrow features (will have data if base arrows exist)
        } as GeoJSON.FeatureCollection,
        getLineColor: (d: any) => d.properties?.color || routeColor, // Use sync status color
        getLineWidth: (d: any) =>
          isHovered ? d.properties?.hoveredWidth || hoveredArrowWidth : 0, // Zero width when not hovered, hovered width (1.2x = ~7px) when hovered
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 0, // Allow zero width when not hovered
        lineWidthMaxPixels: hoveredArrowWidth + 2,
        pickable: false,
        updateTriggers: {
          getLineColor: [route.sync_status, mapType, isHovered],
          getLineWidth: [isHovered], // Dynamic width based on hover state - triggers re-render when hover changes
          data: [isHovered],
        },
      })

      // Render order: non-hovered border -> non-hovered main -> hovered border -> hovered main
      layers.push(
        arrowBorderLayer,
        arrowLayer,
        hoveredArrowBorderLayer,
        hoveredArrowLayer,
      )
    }
  }

  return {
    id: "selected-route",
    layer: layers,
    visible: true,
  }
}

// Helper function to create boundaries layer from saved route segments
// Uses cache for decoded coordinates (same approach as main segments layer)
function createSavedRouteBoundariesLayer(
  route: Route | null,
  mapType: "roadmap" | "hybrid" = "roadmap",
  currentZoom?: number,
): DeckGLLayer | null {
  if (!route?.segments || route.segments.length < 2) {
    console.warn(
      "🔍 [createSavedRouteBoundariesLayer] Returning null - insufficient segments",
      {
        hasSegments: !!route?.segments,
        segmentsCount: route?.segments?.length || 0,
      },
    )
    return null
  }

  // Sort segments by segment_order
  const sortedSegments = [...route.segments].sort(
    (a, b) => (a.segment_order || 0) - (b.segment_order || 0),
  )

  type LatLng = [number, number]
  const boundaryLines: { path: LatLng[] }[] = []

  // Get route length from route.distance (in km)
  const routeLengthKm = route.distance || undefined

  // Calculate average segmentation distance from segment lengths
  // Use segment.length if available, otherwise estimate from polyline
  let segmentationDistanceKm: number | undefined = undefined
  const segmentLengths: number[] = []
  for (const segment of sortedSegments) {
    if (segment.length !== null && segment.length !== undefined) {
      segmentLengths.push(segment.length)
    }
  }
  if (segmentLengths.length > 0) {
    // Use average segment length as segmentation distance
    const avgLength =
      segmentLengths.reduce((sum, len) => sum + len, 0) / segmentLengths.length
    segmentationDistanceKm = avgLength
  }

  // Calculate route bounds to determine route size (for fallback calculation)
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  for (const segment of sortedSegments) {
    if (!segment.encoded_polyline) continue

    let coords = polylineDecodeCache.get(segment.encoded_polyline)
    if (!coords) {
      try {
        const decoded = decodePolylineToGeoJSON(segment.encoded_polyline)
        coords = decoded.coordinates
        if (coords) {
          polylineDecodeCache.set(segment.encoded_polyline, coords)
        }
      } catch {
        continue
      }
    }

    if (!coords || coords.length < 2) continue

    for (const coord of coords) {
      const [lng, lat] = coord
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    }
  }

  // Route width in pixels (fixed constant)
  const ROUTE_WIDTH_PIXELS = SELECTED_ROUTE_WIDTH // 7 pixels

  // Calculate zoom-aware multiplier
  // At zoom 5: ~8x, at zoom 10: ~5.5x, at zoom 15: ~3x, at zoom 20: ~1x
  // More aggressive scaling for low zoom levels to make boundaries more visible
  const zoomMultiplier = currentZoom
    ? Math.max(1, (20 - currentZoom) * 0.5 + 1)
    : 5 // Default for unknown zoom (assume zoomed out)

  // Calculate route length factor
  // Normalize route length to a scale factor
  // Very short routes (< 0.5km): 0.5x scale
  // Short routes (0.5-2km): 0.5-0.75x scale
  // Medium routes (2-10km): 0.75-1.0x scale
  // Long routes (10-50km): 1.0-1.5x scale
  // Very long routes (> 50km): 1.5-2.0x scale
  let routeLengthFactor = 1.0
  if (routeLengthKm !== undefined && routeLengthKm > 0) {
    if (routeLengthKm < 0.5) {
      // Very short routes - reduce boundary size significantly
      routeLengthFactor = 0.5
    } else if (routeLengthKm < 2) {
      // Short routes - scale from 0.5 to 0.75
      routeLengthFactor = 0.5 + ((routeLengthKm - 0.5) / 1.5) * 0.25
    } else if (routeLengthKm < 10) {
      // Medium routes - scale from 0.75 to 1.0
      routeLengthFactor = 0.75 + ((routeLengthKm - 2) / 8) * 0.25
    } else if (routeLengthKm < 50) {
      // Long routes - scale from 1.0 to 1.5
      routeLengthFactor = 1.0 + ((routeLengthKm - 10) / 40) * 0.5
    } else {
      // Very long routes - scale from 1.5 to 2.0 (capped)
      routeLengthFactor = Math.min(2.0, 1.5 + ((routeLengthKm - 50) / 50) * 0.5)
    }
  } else {
    // Fallback: use bounding box diagonal if route length not available
    const routeWidth = maxLng - minLng
    const routeHeight = maxLat - minLat
    const routeDiagonal = Math.sqrt(
      routeWidth * routeWidth + routeHeight * routeHeight,
    )
    // Normalize: small routes (< 0.01 degrees) = 0.5x, large routes (> 0.1 degrees) = 1.5x
    routeLengthFactor = Math.max(0.5, Math.min(1.5, routeDiagonal * 15))
  }

  // Calculate segmentation distance factor
  // Smaller segmentation distances → smaller boundaries (to prevent overlap)
  // Larger segmentation distances → larger boundaries (more space available)
  // Very close segments (< 0.05km = 50m): 0.3x scale (very small to prevent overlap)
  // Close segments (0.05-0.1km): 0.3-0.5x scale
  // Medium segments (0.1-0.5km): 0.5-0.8x scale
  // Large segments (0.5-1km): 0.8-1.0x scale
  // Very large segments (> 1km): 1.0-1.2x scale (can be larger since segments are far apart)
  let segmentationDistanceFactor = 1.0
  if (segmentationDistanceKm !== undefined && segmentationDistanceKm > 0) {
    if (segmentationDistanceKm < 0.05) {
      // Very close segments - use very small boundaries to prevent overlap
      segmentationDistanceFactor = 0.3
    } else if (segmentationDistanceKm < 0.1) {
      // Close segments - scale from 0.3 to 0.5
      segmentationDistanceFactor =
        0.3 + ((segmentationDistanceKm - 0.05) / 0.05) * 0.2
    } else if (segmentationDistanceKm < 0.5) {
      // Medium segments - scale from 0.5 to 0.8
      segmentationDistanceFactor =
        0.5 + ((segmentationDistanceKm - 0.1) / 0.4) * 0.3
    } else if (segmentationDistanceKm < 1.0) {
      // Large segments - scale from 0.8 to 1.0
      segmentationDistanceFactor =
        0.8 + ((segmentationDistanceKm - 0.5) / 0.5) * 0.2
    } else {
      // Very large segments - scale from 1.0 to 1.2 (capped)
      segmentationDistanceFactor = Math.min(
        1.2,
        1.0 + ((segmentationDistanceKm - 1.0) / 1.0) * 0.2,
      )
    }
  }
  // If segmentationDistanceKm is not available (e.g., manual mode), use default 1.0

  // Calculate route width factor
  // Wider routes need slightly longer boundaries to be visible
  // Normalize route width (7px) to a factor: 4px = 0.8x, 7px = 1.0x, 10px = 1.2x
  const routeWidthFactor = Math.max(0.8, Math.min(1.2, ROUTE_WIDTH_PIXELS / 7))

  // Base length in degrees (perpendicular distance from route)
  // This represents the base boundary length at maximum zoom (zoom 20)
  const baseLength = 0.0003

  // Combine all factors:
  // 1. Zoom multiplier (affects visibility at different zoom levels)
  // 2. Route length factor (smaller routes get smaller boundaries)
  // 3. Segmentation distance factor (closer segments get smaller boundaries)
  // 4. Route width factor (wider routes get slightly longer boundaries)
  const combinedMultiplier =
    zoomMultiplier *
    routeLengthFactor *
    segmentationDistanceFactor *
    routeWidthFactor

  // Calculate final perpendicular length
  const perpendicularLength = baseLength * combinedMultiplier

  // Calculate minimum boundary length based on preview layer's minimum width
  // Preview layer uses widthMinPixels: 4, so boundary should be at least as visible
  // Convert 4 pixels to degrees: degrees = 360 / (256 * 2^zoom) * pixels
  // At zoom 20: ~0.0000054 degrees per pixel, at zoom 10: ~0.00137 degrees per pixel
  const PREVIEW_LAYER_MIN_WIDTH_PIXELS = 4
  let minBoundaryLengthDegrees = 0.0001 // Fallback minimum
  if (currentZoom !== undefined) {
    // Calculate degrees per pixel at current zoom level
    const degreesPerPixel = 360 / (256 * Math.pow(2, currentZoom))
    // Minimum boundary should extend at least as far as the route is wide (4 pixels)
    // Use 5-6 pixels worth to ensure clear visibility
    minBoundaryLengthDegrees =
      degreesPerPixel * (PREVIEW_LAYER_MIN_WIDTH_PIXELS + 5)
  }

  const finalPerpendicularLength = Math.max(
    minBoundaryLengthDegrees,
    perpendicularLength,
  )

  // Filter segments to only include those with valid encoded_polyline
  const validSegments = sortedSegments.filter((seg) => {
    if (!seg.encoded_polyline) {
      console.warn(
        `🔍 [createSavedRouteBoundariesLayer] Segment ${seg.uuid} missing encoded_polyline, filtering out`,
      )
      return false
    }
    return true
  })

  if (validSegments.length < 2) {
    console.warn(
      "🔍 [createSavedRouteBoundariesLayer] Less than 2 valid segments, cannot create boundaries",
    )
    return null
  }

  // Create boundaries between consecutive segments (use cache for coordinates)
  for (let i = 0; i < validSegments.length - 1; i++) {
    const segmentA = validSegments[i]

    // Use cache - coordinates should already be decoded by main layer
    // segmentA.encoded_polyline is guaranteed to exist because we filtered validSegments
    const segmentAPolyline = segmentA.encoded_polyline!
    let aCoords = polylineDecodeCache.get(segmentAPolyline)

    if (!aCoords) {
      // Fallback: decode if not in cache (shouldn't happen often)
      try {
        const decoded = decodePolylineToGeoJSON(segmentAPolyline)
        aCoords = decoded.coordinates
        polylineDecodeCache.set(segmentAPolyline, aCoords)
      } catch (e) {
        console.error(
          `🔍 [createSavedRouteBoundariesLayer] Failed to decode segment A (${i}):`,
          e,
        )
        continue
      }
    } else {
      console.log(
        `🔍 [createSavedRouteBoundariesLayer] Segment A (${i}) found in cache`,
        {
          coordinatesCount: aCoords.length,
        },
      )
    }

    if (!aCoords || aCoords.length < 2) {
      console.warn(
        `🔍 [createSavedRouteBoundariesLayer] Segment A (${i}) has invalid coordinates, skipping`,
        {
          hasCoords: !!aCoords,
          coordsLength: aCoords?.length || 0,
          segmentUuid: segmentA.uuid,
        },
      )
      continue
    }

    // Get the end point of segment A (where the boundary should be)
    // Try to find a valid point pair for calculating the perpendicular direction
    // Start from the end and work backwards if needed to find non-degenerate points
    let endA: LatLng | null = null
    let prevA: LatLng | null = null
    const MIN_SEGMENT_LENGTH = 0.00001 // ~1 meter in degrees

    // Try to find a valid point pair starting from the end
    for (let j = aCoords.length - 1; j >= 1; j--) {
      const lastCoord = aCoords[j]
      const secondLastCoord = aCoords[j - 1]

      if (!lastCoord || !Array.isArray(lastCoord) || lastCoord.length < 2) {
        continue
      }

      if (
        !secondLastCoord ||
        !Array.isArray(secondLastCoord) ||
        secondLastCoord.length < 2
      ) {
        continue
      }

      // Validate coordinates are finite
      if (
        !Number.isFinite(lastCoord[0]) ||
        !Number.isFinite(lastCoord[1]) ||
        !Number.isFinite(secondLastCoord[0]) ||
        !Number.isFinite(secondLastCoord[1])
      ) {
        continue
      }

      const candidateEndA: LatLng = [lastCoord[0], lastCoord[1]]
      const candidatePrevA: LatLng = [secondLastCoord[0], secondLastCoord[1]]

      // Calculate distance between points
      const dx = candidateEndA[0] - candidatePrevA[0]
      const dy = candidateEndA[1] - candidatePrevA[1]
      const len = Math.sqrt(dx * dx + dy * dy)

      // If this pair is valid (not degenerate), use it
      if (len >= MIN_SEGMENT_LENGTH) {
        endA = candidateEndA
        prevA = candidatePrevA
        break
      }
    }

    // If we couldn't find a valid point pair, skip this boundary
    if (!endA || !prevA) {
      console.warn(
        `🔍 [createSavedRouteBoundariesLayer] Segment A (${i}) has no valid point pair for boundary calculation, skipping`,
        {
          segmentUuid: segmentA.uuid,
          coordinatesCount: aCoords.length,
        },
      )
      continue
    }

    // Calculate perpendicular direction
    const dx = endA[0] - prevA[0]
    const dy = endA[1] - prevA[1]
    const len = Math.sqrt(dx * dx + dy * dy)

    const nx = -dy / len
    const ny = dx / len

    // Create single perpendicular line at boundary point
    const start: LatLng = [
      endA[0] - nx * finalPerpendicularLength * 0.5,
      endA[1] - ny * finalPerpendicularLength * 0.5,
    ]
    const end: LatLng = [
      endA[0] + nx * finalPerpendicularLength * 0.5,
      endA[1] + ny * finalPerpendicularLength * 0.5,
    ]

    // Validate coordinates are finite numbers
    if (
      !Number.isFinite(start[0]) ||
      !Number.isFinite(start[1]) ||
      !Number.isFinite(end[0]) ||
      !Number.isFinite(end[1])
    ) {
      console.error(
        `🔍 [createSavedRouteBoundariesLayer] Invalid boundary coordinates for segment ${i}`,
        {
          start,
          end,
          endA,
          prevA,
          perpendicularLength,
          finalPerpendicularLength,
          nx,
          ny,
        },
      )
      continue
    }

    boundaryLines.push({ path: [start, end] })
  }

  if (boundaryLines.length === 0) {
    console.warn(
      "🔍 [createSavedRouteBoundariesLayer] No boundary lines created, returning null",
    )
    return null
  }

  // Calculate dynamic line thickness based on zoom, segmentation distance, and route length
  const baseWidth = 1
  const maxWidth = 6 // Increased max for longer segments

  // 1. Zoom factor
  const zoomWidthFactor =
    currentZoom !== undefined
      ? Math.max(
          baseWidth,
          Math.min(maxWidth, (currentZoom - 10) * 0.5 + baseWidth),
        )
      : 2

  // 2. Segmentation distance factor
  // Longer segmentation = boundaries are farther apart = need thicker lines for visibility
  // Shorter segmentation = boundaries are close = thinner lines are fine
  let segmentationDistanceWidthFactor = 1.0
  if (segmentationDistanceKm !== undefined && segmentationDistanceKm > 0) {
    if (segmentationDistanceKm < 0.05) {
      // Very close segments (< 50m): thinner lines (0.7x)
      segmentationDistanceWidthFactor = 0.7
    } else if (segmentationDistanceKm < 0.1) {
      // Close segments (50-100m): 0.7 to 0.9
      segmentationDistanceWidthFactor =
        0.7 + ((segmentationDistanceKm - 0.05) / 0.05) * 0.2
    } else if (segmentationDistanceKm < 0.5) {
      // Medium segments (100m-500m): 0.9 to 1.1
      segmentationDistanceWidthFactor =
        0.9 + ((segmentationDistanceKm - 0.1) / 0.4) * 0.2
    } else if (segmentationDistanceKm < 1.0) {
      // Large segments (500m-1km): 1.1 to 1.3
      segmentationDistanceWidthFactor =
        1.1 + ((segmentationDistanceKm - 0.5) / 0.5) * 0.2
    } else if (segmentationDistanceKm < 5.0) {
      // Very large segments (1-5km): 1.3 to 1.5
      segmentationDistanceWidthFactor =
        1.3 + ((segmentationDistanceKm - 1.0) / 4.0) * 0.2
    } else {
      // Extremely large segments (> 5km): 1.5 to 1.8 (capped)
      segmentationDistanceWidthFactor = Math.min(
        1.8,
        1.5 + ((segmentationDistanceKm - 5.0) / 5.0) * 0.3,
      )
    }
  }

  // 3. Route length factor
  // Longer routes might need slightly thicker lines when zoomed out
  let routeLengthWidthFactor = 1.0
  if (routeLengthKm !== undefined && routeLengthKm > 0) {
    if (routeLengthKm < 2) {
      // Short routes: slightly thinner (0.9x)
      routeLengthWidthFactor = 0.9
    } else if (routeLengthKm < 50) {
      // Medium routes: normal (1.0x)
      routeLengthWidthFactor = 1.0
    } else if (routeLengthKm < 100) {
      // Long routes: slightly thicker (1.0 to 1.2)
      routeLengthWidthFactor = 1.0 + ((routeLengthKm - 50) / 50) * 0.2
    } else {
      // Very long routes: thicker (1.2 to 1.4, capped)
      routeLengthWidthFactor = Math.min(
        1.4,
        1.2 + ((routeLengthKm - 100) / 100) * 0.2,
      )
    }
  }

  // Combine all factors
  const finalWidth = Math.max(
    1.25, // Minimum 1 pixel
    Math.min(
      maxWidth,
      zoomWidthFactor *
        segmentationDistanceWidthFactor *
        routeLengthWidthFactor,
    ),
  )

  // Use the same pink color as draw mode segmentation boundaries
  // This matches createSegmentationBoundariesLayer in segment-renderers.ts
  const getBoundaryColor = (): [number, number, number, number] => {
    return [255, 43, 139, 255] // Pink/light orange - same as draw mode boundaries
  }

  // Increase base thickness for boundaries
  const thickerWidth = Math.max(
    2, // Increased minimum from 1.25 to 2
    finalWidth * 1.2, // Make 20% thicker than calculated
  )

  return {
    id: "selected-route-segments-boundaries",
    layer: new PathLayer({
      id: "selected-route-segments-boundaries",
      data: boundaryLines,
      getPath: (d: any) => d.path,
      getColor: getBoundaryColor(),
      getWidth: thickerWidth,
      widthUnits: "pixels",
      widthMinPixels: 2, // Increased minimum from 1.25 to 2
      stroked: false,
      pickable: false,
      parameters: { depthTest: false as any },
      updateTriggers: {
        getWidth: [currentZoom, routeLengthKm, segmentationDistanceKm],
        getPath: [
          currentZoom,
          route?.segments?.length,
          routeLengthKm,
          segmentationDistanceKm,
        ],
      },
    }),
    visible: true,
  }
}

// Helper function to check if segment path intersects with viewport bounds
function isSegmentInViewport(
  segmentPath: number[][],
  viewportBounds?: { north: number; south: number; east: number; west: number },
): boolean {
  if (!viewportBounds) return true // No viewport bounds, include all segments

  // Calculate segment bounding box
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  for (const coord of segmentPath) {
    const [lng, lat] = coord
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
  }

  // Check if segment bbox intersects with viewport bounds
  // Intersection occurs if: segment max > viewport min AND segment min < viewport max
  const intersectsLng =
    maxLng >= viewportBounds.west && minLng <= viewportBounds.east
  const intersectsLat =
    maxLat >= viewportBounds.south && minLat <= viewportBounds.north

  return intersectsLng && intersectsLat
}

export function createSelectedRouteSegmentsLayer(
  route: Route | null,
  selectedRouteHoveredSegmentId: string | null,
  currentZoom?: number,
  mapType: "roadmap" | "hybrid" = "roadmap",
  viewportBounds?: { north: number; south: number; east: number; west: number },
  onSegmentHover?: (segmentId: string | null) => void,
): DeckGLLayer[] {
  const hasSegments = route?.segments && route.segments.length > 0

  if (!route || !route.isSegmented || !hasSegments || !route.segments) {
    return []
  }

  // OPTIMIZATION: Cache processed segment paths based on route ID and segments state
  // Create cache key based on route ID, segment count, and segment UUIDs
  const segmentUuids = route.segments.map((s) => s.uuid).join(",")
  const segmentStates = route.segments
    .map((s) => `${s.uuid}:${s.is_enabled}:${s.sync_status || "unsynced"}`)
    .join("|")
  const cacheKey = `${route.id}-${route.segments.length}-${segmentUuids}-${segmentStates}`

  let cachedPaths = processedSegmentPathsCache.get(cacheKey)

  if (!cachedPaths) {
    // Convert saved segments to preview-like format (decode once, use cache)
    // This matches the fast preview segments rendering approach
    cachedPaths = route.segments
      .filter((segment) => segment.encoded_polyline) // Filter out segments without polyline
      .map((segment) => {
        // Use cache for fast lookup - decode only if not cached
        const polylineKey = segment.encoded_polyline!
        let coordinates = polylineDecodeCache.get(polylineKey)

        if (!coordinates) {
          // Decode and cache (first time only, subsequent renders use cache)
          try {
            const decoded = decodePolylineToGeoJSON(polylineKey)
            coordinates = decoded.coordinates
            polylineDecodeCache.set(polylineKey, coordinates)
          } catch {
            return null
          }
        }

        if (!coordinates || coordinates.length < 2) {
          return null
        }

        // Viewport culling (if bounds provided)
        if (
          viewportBounds &&
          !isSegmentInViewport(coordinates, viewportBounds)
        ) {
          return null
        }

        return {
          id: segment.uuid,
          path: coordinates,
          isEnabled: segment.is_enabled !== false,
          sync_status: segment.sync_status || "unsynced",
          order: segment.segment_order || 0,
          segmentData: segment, // Store segment data for tooltips
        }
      })
      .filter(Boolean) as Array<{
      id: string
      path: number[][]
      isEnabled: boolean
      sync_status: string
      order: number
      segmentData: any
    }>

    // Sort by segment_order
    cachedPaths.sort((a, b) => a.order - b.order)

    // Cache for reuse (only if we have segments)
    if (cachedPaths.length > 0) {
      processedSegmentPathsCache.set(cacheKey, cachedPaths)
    }
  }

  // Add hover state (this changes frequently, so we compute it fresh)
  const segmentPaths = cachedPaths.map((path) => ({
    ...path,
    isHovered: selectedRouteHoveredSegmentId === path.id,
  }))

  if (segmentPaths.length === 0) {
    console.warn(
      "🔍 [createSelectedRouteSegmentsLayer] No valid segment paths, returning empty array",
    )
    return []
  }

  // Lightweight state key (optimized)
  const segments = route.segments
  const segmentCount = segments.length
  const enabledCount = segments.filter((s) => s.is_enabled !== false).length
  const firstUuid = segments[0]?.uuid || ""
  const lastUuid = segments[segments.length - 1]?.uuid || ""
  const segmentStateKey = `${segmentCount}-${enabledCount}-${firstUuid}-${lastUuid}`

  const colors = getColorsForMapType(mapType)

  // Get sync status color (same as saved routes tile layer)
  const getSyncStatusColor = (
    status: string | undefined,
  ): [number, number, number, number] => {
    switch (status) {
      case "unsynced":
        return colors.routeStatusColors.unsynced
      case "validating":
        return colors.routeStatusColors.validating
      case "synced":
        return colors.routeStatusColors.synced
      case "invalid":
        return colors.routeStatusColors.invalid
      case "failed":
        return colors.routeStatusColors.failed
      default:
        return colors.routeStatusColors.unsynced // Default to orange (unsynced)
    }
  }

  const getSegmentColor = (
    segment: (typeof segmentPaths)[number],
  ): [number, number, number, number] => {
    // Disabled segments are always gray (regardless of sync_status)
    if (!segment.isEnabled) {
      if (segment.isHovered) {
        return [120, 120, 120, 255] // Gray for hover when disabled
      }
      return [120, 120, 120, 150] // Gray for disabled
    }

    // Enabled segments use sync_status color
    // When hovered, use same color (will be rendered thicker with white border)
    return getSyncStatusColor(segment.sync_status)
  }

  const getSegmentWidth = (segment: (typeof segmentPaths)[number]) => {
    const baseWidth = segment.isEnabled ? SELECTED_ROUTE_WIDTH : 6

    // Hovered segments are 1.5x thicker
    if (segment.isHovered) {
      return Math.round(baseWidth * 1.5)
    }

    return baseWidth
  }

  const layers: DeckGLLayer[] = []

  // Split segments into non-hovered and hovered for proper z-ordering
  const nonHoveredSegments = segmentPaths.filter((s) => !s.isHovered)
  const hoveredSegments = segmentPaths.filter((s) => s.isHovered)

  // Add non-hovered segments layer first (renders behind)
  // ADD BORDER LAYER FOR ALL NON-HOVERED SEGMENTS for visibility
  if (nonHoveredSegments.length > 0) {
    // Add border layer for non-hovered segments (subtle white border)
    layers.push({
      id: "selected-route-segments-border",
      layer: new PathLayer({
        id: "selected-route-segments-border",
        data: nonHoveredSegments,
        getPath: (d: any) => d.path,
        getColor: colors.pathBorderColor,
        getWidth: (d: any) => getSegmentWidth(d) + 4, // 1px border on each side
        widthUnits: "pixels" as const,
        capRounded: true,
        jointRounded: true,
        pickable: false,
        parameters: { depthTest: false as any },
        widthMinPixels: 6,
        updateTriggers: {
          getWidth: [selectedRouteHoveredSegmentId, segmentStateKey],
        },
      }),
      visible: true,
    })

    // Add colored segments layer on top of border
    layers.push({
      id: "selected-route-segments",
      layer: new PathLayer({
        id: "selected-route-segments",
        data: nonHoveredSegments,
        getPath: (d: any) => d.path,
        getColor: (d: any) => getSegmentColor(d),
        getWidth: (d: any) => getSegmentWidth(d),
        widthUnits: "pixels" as const,
        capRounded: true,
        jointRounded: true,
        pickable: true,
        parameters: { depthTest: false as any },
        widthMinPixels: 4,
        onHover: onSegmentHover
          ? ({ object }) => {
              if (object?.id) {
                onSegmentHover(object.id)
              } else {
                onSegmentHover(null)
              }
            }
          : undefined,
        updateTriggers: {
          getColor: [selectedRouteHoveredSegmentId, segmentStateKey, mapType],
          getWidth: [selectedRouteHoveredSegmentId, segmentStateKey],
        },
      }),
      visible: true,
    })
  }

  // Add hovered segments layer last (renders on top of all other routes)
  // Always create this layer when segments exist (even if empty) so it's always visible in the legend
  // Hovered segments are rendered with white border (3px each side) and thicker line (2x) to "pop more"
  if (segmentPaths.length > 0) {
    // First, render white border layer (thicker border for hovered segments to "pop more")
    const hoveredSegmentsWithBorder = hoveredSegments.map((segment) => ({
      ...segment,
      borderWidth: getSegmentWidth(segment) + 6, // 3px border on each side = 6px total (thicker for more pop)
    }))

    if (hoveredSegmentsWithBorder.length > 0) {
      // White border layer (renders first, behind the colored segment)
      layers.push({
        id: "selected-route-segments-hovered-border",
        layer: new PathLayer({
          id: "selected-route-segments-hovered-border",
          data: hoveredSegmentsWithBorder,
          getPath: (d: any) => d.path,
          getColor: colors.pathBorderColor,
          getWidth: (d: any) => d.borderWidth,
          widthUnits: "pixels" as const,
          capRounded: true,
          jointRounded: true,
          pickable: false,
          parameters: { depthTest: false as any },
          widthMinPixels: 6, // Increased for thicker hover border (3px each side)
          updateTriggers: {
            getWidth: [selectedRouteHoveredSegmentId, segmentStateKey],
          },
        }),
        visible: true,
      })
    }

    // Then, render the colored segment on top (thicker, 1.5x) to "pop more"
    layers.push({
      id: "selected-route-segments-hovered",
      layer: new PathLayer({
        id: "selected-route-segments-hovered",
        data: hoveredSegments, // Can be empty array, layer will still exist
        getPath: (d: any) => d.path,
        getColor: (d: any) => getSegmentColor(d),
        getWidth: (d: any) => getSegmentWidth(d),
        widthUnits: "pixels" as const,
        capRounded: true,
        jointRounded: true,
        pickable: true,
        parameters: { depthTest: false as any },
        widthMinPixels: 8, // Increased for hovered segments (2x thicker)
        onHover: onSegmentHover
          ? ({ object }) => {
              if (object?.id) {
                onSegmentHover(object.id)
              } else {
                onSegmentHover(null)
              }
            }
          : undefined,
        updateTriggers: {
          getColor: [selectedRouteHoveredSegmentId, segmentStateKey, mapType],
          getWidth: [selectedRouteHoveredSegmentId, segmentStateKey],
        },
      }),
      visible: true,
    })
  }

  // Add arrows for each segment (only if <= 100 segments for performance)
  // Skip arrow generation for routes with many segments to avoid performance issues
  if (currentZoom !== undefined && segmentPaths.length <= 100) {
    // Arrow width comparable to segment width (SELECTED_ROUTE_WIDTH = 7)
    const arrowWidth = 6 // Slightly thinner than route for visibility but still prominent
    const arrowBorderWidth = arrowWidth + 3 // Border is 3px wider (1.5px on each side)

    // Generate arrows for non-hovered segments first
    const nonHoveredArrowFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = []
    const nonHoveredBorderArrowFeatures: GeoJSON.Feature<GeoJSON.LineString>[] =
      []

    nonHoveredSegments.forEach((segment) => {
      if (segment.path.length >= 2) {
        // Find corresponding segment to get length
        const segmentData = route.segments?.find((s) => s.uuid === segment.id)
        const lengthMeters = (segmentData?.length ?? 0) * 1000 // km to meters
        // Use 10x route length (or +5km minimum) for border arrows to ensure longer arrow arms through logarithmic calculation
        const borderLengthMeters = Math.max(
          lengthMeters * 10,
          lengthMeters + 5000,
        )

        const segmentColor = getSegmentColor(segment)
        // Main arrows - use longer length (same as border arrows)
        // Use arrows directly from generateArrowsForLineString (no extension needed)
        const arrows = generateArrowsForLineString(
          segment.path,
          currentZoom,
          {
            color: segmentColor,
            width: arrowWidth,
            mode: "regular-layer",
          },
          borderLengthMeters, // Use same length as border arrows
          {
            segment_id: segment.id,
            is_enabled: segment.isEnabled,
          },
        )
        nonHoveredArrowFeatures.push(...arrows)

        // Border arrows - use border color (gray/white) and same length
        // Use arrows directly from generateArrowsForLineString (no extension needed)
        const borderArrows = generateArrowsForLineString(
          segment.path,
          currentZoom,
          {
            color: colors.pathBorderColor, // Use border color (gray/white based on mapType)
            width: arrowBorderWidth,
            mode: "regular-layer",
          },
          borderLengthMeters,
          {
            segment_id: segment.id,
            is_enabled: segment.isEnabled,
            is_border: true,
          },
        ).map((feature) => ({
          ...feature,
          properties: {
            ...feature.properties,
            color: colors.pathBorderColor, // Ensure border color
          },
        }))
        nonHoveredBorderArrowFeatures.push(...borderArrows)
      }
    })

    if (nonHoveredArrowFeatures.length > 0) {
      // Arrow border layer (renders first, behind main arrows)
      // Use borderArrowFeatures with longer arms to fully cover main arrows
      const nonHoveredArrowBorderLayer = new GeoJsonLayer({
        id: "selected-route-segments-arrows-border",
        data: {
          type: "FeatureCollection",
          features:
            nonHoveredBorderArrowFeatures.length > 0
              ? nonHoveredBorderArrowFeatures
              : nonHoveredArrowFeatures, // Fallback to same features if border generation fails
        } as GeoJSON.FeatureCollection,
        getLineColor: colors.pathBorderColor, // Use border color (gray/white based on mapType)
        getLineWidth: (d: any) => d.properties?.width || arrowBorderWidth, // Use width from properties or fallback
        lineWidthUnits: "pixels",
        lineWidthMinPixels: arrowBorderWidth,
        lineWidthMaxPixels: arrowBorderWidth + 2,
        pickable: false,
        updateTriggers: {
          getLineColor: [
            selectedRouteHoveredSegmentId,
            segmentStateKey,
            mapType,
          ], // Update border color when segment state changes
          getLineWidth: [selectedRouteHoveredSegmentId, segmentStateKey], // Trigger width recalculation on hover state changes
          data: [selectedRouteHoveredSegmentId, segmentStateKey, mapType],
        },
      })

      // Main arrow layer (renders on top of border)
      const nonHoveredArrowLayer = new GeoJsonLayer({
        id: "selected-route-segments-arrows",
        data: {
          type: "FeatureCollection",
          features: nonHoveredArrowFeatures,
        } as GeoJSON.FeatureCollection,
        getLineColor: (d: any) => {
          // Use actual color from properties (set during generation with segment's sync status color)
          // Fallback to unsynced color if somehow missing
          return d.properties?.color || colors.routeStatusColors.unsynced
        },
        getLineWidth: (d: any) => d.properties?.width || arrowWidth,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: arrowWidth,
        lineWidthMaxPixels: arrowWidth + 2,
        pickable: false,
        updateTriggers: {
          getLineColor: [
            selectedRouteHoveredSegmentId,
            segmentStateKey,
            mapType,
          ], // Add getLineColor trigger
          getLineWidth: [selectedRouteHoveredSegmentId, segmentStateKey], // Trigger width recalculation on hover state changes
          data: [selectedRouteHoveredSegmentId, segmentStateKey, mapType],
        },
      })

      // Render border first, then main arrows on top
      layers.push(
        {
          id: "selected-route-segments-arrows-border",
          layer: nonHoveredArrowBorderLayer,
          visible: true,
        },
        {
          id: "selected-route-segments-arrows",
          layer: nonHoveredArrowLayer,
          visible: true,
        },
      )
    }

    // Generate arrows for hovered segments last (renders on top)
    // Hovered arrows are slightly thicker (1.2x) to "pop more"
    const hoveredArrowWidth = Math.round(arrowWidth * 1.2) // ~7px for hovered segments
    const hoveredArrowBorderWidth = hoveredArrowWidth + 4 // Border is 4px wider (2px on each side) for more visibility

    const hoveredArrowFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = []
    const hoveredBorderArrowFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = []

    hoveredSegments.forEach((segment) => {
      if (segment.path.length >= 2) {
        // Find corresponding segment to get length
        const segmentData = route.segments?.find((s) => s.uuid === segment.id)
        const lengthMeters = (segmentData?.length ?? 0) * 1000 // km to meters
        // Use 10x route length (or +5km minimum) for border arrows to ensure longer arrow arms through logarithmic calculation
        const borderLengthMeters = Math.max(
          lengthMeters * 10,
          lengthMeters + 5000,
        )

        const segmentColor = getSegmentColor(segment)
        // Main arrows - use longer length (same as border arrows)
        // Use arrows directly from generateArrowsForLineString (no extension needed)
        const arrows = generateArrowsForLineString(
          segment.path,
          currentZoom,
          {
            color: segmentColor,
            width: hoveredArrowWidth,
            mode: "regular-layer",
          },
          borderLengthMeters, // Use same length as border arrows
          {
            segment_id: segment.id,
            is_enabled: segment.isEnabled,
          },
        )
        hoveredArrowFeatures.push(...arrows)

        // Border arrows - use border color (gray/white) and same length
        // Use arrows directly from generateArrowsForLineString (no extension needed)
        const borderArrows = generateArrowsForLineString(
          segment.path,
          currentZoom,
          {
            color: colors.pathBorderColor, // Use border color (gray/white based on mapType)
            width: hoveredArrowBorderWidth,
            mode: "regular-layer",
          },
          borderLengthMeters,
          {
            segment_id: segment.id,
            is_enabled: segment.isEnabled,
            is_border: true,
          },
        ).map((feature) => ({
          ...feature,
          properties: {
            ...feature.properties,
            color: colors.pathBorderColor, // Ensure border color
          },
        }))
        hoveredBorderArrowFeatures.push(...borderArrows)
      }
    })

    if (hoveredArrowFeatures.length > 0) {
      // Arrow border layer for hovered segments (renders first, behind main arrows)
      // Use borderArrowFeatures with longer arms to fully cover main arrows
      const hoveredArrowBorderLayer = new GeoJsonLayer({
        id: "selected-route-segments-arrows-hovered-border",
        data: {
          type: "FeatureCollection",
          features:
            hoveredBorderArrowFeatures.length > 0
              ? hoveredBorderArrowFeatures
              : hoveredArrowFeatures, // Fallback to same features if border generation fails
        } as GeoJSON.FeatureCollection,
        getLineColor: colors.pathBorderColor, // Use border color (gray/white based on mapType)
        getLineWidth: (d: any) =>
          d.properties?.width || hoveredArrowBorderWidth, // Use width from properties or fallback
        lineWidthUnits: "pixels",
        lineWidthMinPixels: hoveredArrowBorderWidth,
        lineWidthMaxPixels: hoveredArrowBorderWidth + 2,
        pickable: false,
        updateTriggers: {
          getLineColor: [
            selectedRouteHoveredSegmentId,
            segmentStateKey,
            mapType,
          ], // Update border color when segment state changes
          getLineWidth: [selectedRouteHoveredSegmentId, segmentStateKey], // Trigger width recalculation on hover state changes
          data: [selectedRouteHoveredSegmentId, segmentStateKey, mapType],
        },
      })

      // Main arrow layer for hovered segments (renders on top of border)
      const hoveredArrowLayer = new GeoJsonLayer({
        id: "selected-route-segments-arrows-hovered",
        data: {
          type: "FeatureCollection",
          features: hoveredArrowFeatures,
        } as GeoJSON.FeatureCollection,
        getLineColor: (d: any) => {
          // Use actual color from properties (set during generation with segment's sync status color)
          // Fallback to unsynced color if somehow missing
          return d.properties?.color || colors.routeStatusColors.unsynced
        },
        getLineWidth: (d: any) => d.properties?.width || hoveredArrowWidth,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: hoveredArrowWidth,
        lineWidthMaxPixels: hoveredArrowWidth + 2,
        pickable: false,
        updateTriggers: {
          getLineColor: [
            selectedRouteHoveredSegmentId,
            segmentStateKey,
            mapType,
          ], // Add getLineColor trigger
          getLineWidth: [selectedRouteHoveredSegmentId, segmentStateKey], // Trigger width recalculation on hover state changes
          data: [selectedRouteHoveredSegmentId, segmentStateKey, mapType],
        },
      })

      // Render border first, then main arrows on top
      layers.push(
        {
          id: "selected-route-segments-arrows-hovered-border",
          layer: hoveredArrowBorderLayer,
          visible: true,
        },
        {
          id: "selected-route-segments-arrows-hovered",
          layer: hoveredArrowLayer,
          visible: true,
        },
      )
    }
  }

  // OPTIMIZATION: Cache boundaries layer creation
  // Reuse segmentCount already declared above
  const boundariesCacheKey = `${route.id}-boundaries-${segmentCount}-${currentZoom || 0}-${mapType}`
  let boundariesLayer = boundariesLayerCache.get(boundariesCacheKey)

  if (!boundariesLayer) {
    boundariesLayer = createSavedRouteBoundariesLayer(
      route,
      mapType,
      currentZoom,
    )
    if (boundariesLayer) {
      boundariesLayerCache.set(boundariesCacheKey, boundariesLayer)
    } else {
      // Cache null to avoid re-checking
      boundariesLayerCache.set(boundariesCacheKey, null)
    }
  }

  if (boundariesLayer) {
    layers.push(boundariesLayer)
  }

  return layers
}

// Clear caches when route changes significantly
export function clearSegmentCaches(routeId?: string) {
  if (routeId) {
    // Clear specific route cache
    for (const key of processedSegmentPathsCache.keys()) {
      if (key.startsWith(routeId)) {
        processedSegmentPathsCache.delete(key)
      }
    }
    for (const key of boundariesLayerCache.keys()) {
      if (key.startsWith(routeId)) {
        boundariesLayerCache.delete(key)
      }
    }
  } else {
    // Clear all caches (use sparingly)
    processedSegmentPathsCache.clear()
    boundariesLayerCache.clear()
  }
}

export function createIndividualPreviewLayer(
  route: Route | null,
  mapType: "roadmap" | "hybrid" = "roadmap",
): DeckGLLayer | null {
  if (!route?.encodedPolyline) return null

  // Handle both JSON array format and encoded polyline string format
  let coordinates: number[][] = []

  if (typeof route.encodedPolyline === "string") {
    try {
      const parsed = JSON.parse(route.encodedPolyline)
      if (
        Array.isArray(parsed) &&
        parsed.length > 1 &&
        Array.isArray(parsed[0]) &&
        typeof parsed[0][0] === "number"
      ) {
        // It's a JSON array of coordinates
        coordinates = parsed
      } else {
        // It's an encoded polyline string
        const decoded = decodePolylineToGeoJSON(route.encodedPolyline)
        coordinates = decoded.coordinates
      }
    } catch {
      // Not JSON, treat as encoded polyline string
      const decoded = decodePolylineToGeoJSON(route.encodedPolyline)
      coordinates = decoded.coordinates
    }
  } else if (
    Array.isArray(route.encodedPolyline) &&
    Array.isArray(route.encodedPolyline[0]) &&
    typeof route.encodedPolyline[0][0] === "number"
  ) {
    // Already an array of coordinates
    coordinates = route.encodedPolyline
  }

  if (coordinates.length < 2) return null

  const pathData = [
    {
      id: route.id,
      path: coordinates,
    },
  ]

  const sharedProps = {
    data: pathData,
    getPath: (d: any) => d.path,
    widthUnits: "pixels" as const,
    capRounded: true,
    jointRounded: true,
    pickable: false,
    parameters: { depthTest: false as any },
  }

  const colors = getColorsForMapType(mapType)

  // Use individual preview color for all routes when editing (same as drawn routes)
  const routeColor = colors.individualPreviewColor
  // const borderColor = colors.pathBorderColorIndividualPreview

  // const borderLayer = new PathLayer({
  //   ...sharedProps,
  //   id: "individual-preview-border",
  //   getColor: borderColor,
  //   getWidth: SELECTED_ROUTE_WIDTH * PATH_BORDER_WIDTH_MULTIPLIER,
  //   widthMinPixels: Math.max(
  //     SELECTED_ROUTE_WIDTH * PATH_BORDER_WIDTH_MULTIPLIER,
  //     PATH_BORDER_MIN_PIXELS,
  //   ),
  // })

  const mainLayer = new PathLayer({
    ...sharedProps,
    id: "individual-preview-main",
    getColor: routeColor,
    getWidth: SELECTED_ROUTE_WIDTH,
    widthMinPixels: SELECTED_ROUTE_WIDTH,
  })

  return {
    id: "individual-preview",
    layer: [mainLayer],
    visible: true,
  }
}

export function createUploadedRoutesLayer(
  uploadedRoutes: UploadedRoute[],
  selectedUploadedRouteId: string | null,
  isVisible: boolean,
  mapType: "roadmap" | "hybrid" = "roadmap",
): DeckGLLayer[] | null {
  if (uploadedRoutes.length === 0) return null

  // Separate visualization routes (from LeftFloatingPanel) from editing routes
  const visualizationRoutes: UploadedRoute[] = []
  const editingRoutes: UploadedRoute[] = []

  uploadedRoutes.forEach((route: UploadedRoute) => {
    // Visualization routes have "(Original)" in the name and should always be visible
    if (route.name.includes("(Original)")) {
      visualizationRoutes.push(route)
    } else {
      // Editing routes should only be visible when selected
      editingRoutes.push(route)
    }
  })

  // If there's a selected route, only show that editing route
  // Otherwise, show all visualization routes
  const routesToShow = selectedUploadedRouteId
    ? editingRoutes.filter((r) => r.id === selectedUploadedRouteId)
    : visualizationRoutes

  if (routesToShow.length === 0) return null

  const selectedFeatures: GeoJSON.Feature[] = []

  routesToShow.forEach((route: UploadedRoute) => {
    if (route.data.type === "FeatureCollection") {
      route.data.features.forEach((feature: GeoJSON.Feature) => {
        const properties = (feature.properties || {}) as Record<string, any>
        const distanceMeters =
          typeof properties["distance in meters"] === "number"
            ? properties["distance in meters"]
            : 0
        selectedFeatures.push({
          ...feature,
          properties: {
            ...properties,
            length: distanceMeters / 1000,
            uploadedRouteId: route.id,
            uploadedRouteName: route.name,
            uploadedRouteType: route.type,
            uploadedRouteColor: route.color,
          },
        })
      })
    } else {
      const featureProps = (route.data.properties || {}) as Record<string, any>
      const distanceMeters =
        typeof featureProps["distance in meters"] === "number"
          ? featureProps["distance in meters"]
          : 0
      selectedFeatures.push({
        ...(route.data as GeoJSON.Feature),
        properties: {
          ...featureProps,
          length: distanceMeters / 1000,
          uploadedRouteId: route.id,
          uploadedRouteName: route.name,
          uploadedRouteType: route.type,
          uploadedRouteColor: route.color,
        },
      })
    }
  })

  const layers: DeckGLLayer[] = []

  if (selectedFeatures.length > 0) {
    const selectedLayer = new GeoJsonLayer({
      id: "uploaded-routes-selected",
      data: {
        type: "FeatureCollection",
        features: selectedFeatures,
      } as GeoJSON.FeatureCollection,
      getLineColor: (d) => {
        // Use route color if available, otherwise default to yellow
        const props = d.properties as Record<string, any>
        const routeColor = props.uploadedRouteColor as
          | [number, number, number, number]
          | undefined
        const colors = getColorsForMapType(mapType)
        return routeColor || colors.uploadedRouteColor
      },
      getLineWidth: () => 10,
      lineWidthMinPixels: 3,
      lineWidthMaxPixels: 10,
      getFillColor: (d) => {
        // Use route color with lower opacity for fill
        const props = d.properties as Record<string, any>
        const routeColor = props.uploadedRouteColor as
          | [number, number, number, number]
          | undefined
        if (routeColor) {
          return [routeColor[0], routeColor[1], routeColor[2], 60] as [
            number,
            number,
            number,
            number,
          ]
        }
        const colors = getColorsForMapType(mapType)
        return [
          colors.uploadedRouteColor[0],
          colors.uploadedRouteColor[1],
          colors.uploadedRouteColor[2],
          60,
        ] as [number, number, number, number]
      },
      filled: true,
      stroked: false,
      pickable: true,
      autoHighlight: false,
      highlightColor: getColorsForMapType(mapType).uploadedRouteColor,
    })
    layers.push({
      id: "uploaded-routes-selected",
      layer: selectedLayer,
      visible: isVisible,
    })
  }

  return layers.length > 0 ? layers : null
}

export function createSnappedRoadsLayer(
  snappedRoads: SnappedRoad[],
  selectedUploadedRouteId: string | null,
  hoveredRouteId: string | null,
  isVisible: boolean,
  mapType: "roadmap" | "hybrid" = "roadmap",
): DeckGLLayer[] | null {
  if (snappedRoads.length === 0) return null

  const nonSelectedFeatures: GeoJSON.Feature[] = []
  const selectedFeatures: GeoJSON.Feature[] = []

  snappedRoads.forEach((road: SnappedRoad) => {
    const isSelected = road.uploadedRouteId === selectedUploadedRouteId
    const feature = {
      ...road.feature,
      properties: {
        ...road.feature.properties,
        snappedRoadId: road.id,
        uploadedRouteId: road.uploadedRouteId,
      },
    }

    if (isSelected) {
      selectedFeatures.push(feature)
    } else {
      nonSelectedFeatures.push(feature)
    }
  })

  const layers: DeckGLLayer[] = []

  if (nonSelectedFeatures.length > 0) {
    const nonSelectedLayer = new GeoJsonLayer({
      id: "snapped-roads",
      data: {
        type: "FeatureCollection",
        features: nonSelectedFeatures,
      } as GeoJSON.FeatureCollection,
      getLineColor: (d: any) => {
        const colors = getColorsForMapType(mapType)
        const routeId = d.properties?.uploadedRouteId
        const isHovered = routeId === hoveredRouteId
        // Use hover color when hovered, otherwise use polygon route color
        if (isHovered) {
          return colors.segmentHoverColor
        }
        return colors.polygonRouteColor
      },
      getLineWidth: (d: any) => {
        const routeId = d.properties?.uploadedRouteId
        const isHovered = routeId === hoveredRouteId
        // Use same width as saved routes (BASE_ROUTE_WIDTH = 4px)
        // Make hovered routes slightly wider for visibility
        return isHovered ? BASE_ROUTE_WIDTH * 2 : BASE_ROUTE_WIDTH
      },
      updateTriggers: {
        getLineColor: [hoveredRouteId, mapType],
        getLineWidth: [hoveredRouteId, mapType],
      },
      stroked: false,
      lineWidthMinPixels: 2,
      lineWidthMaxPixels: 12,
      pickable: false,
      autohighlight: false,
      highlightColor: (() => {
        const colors = getColorsForMapType(mapType)
        return [
          colors.polygonRouteColor[0],
          colors.polygonRouteColor[1],
          colors.polygonRouteColor[2],
          200,
        ] as [number, number, number, number]
      })(),
    })
    layers.push({
      id: "snapped-roads",
      layer: nonSelectedLayer,
      visible: isVisible,
    })
  }

  if (selectedFeatures.length > 0) {
    const selectedLayer = new GeoJsonLayer({
      id: "snapped-roads-selected",
      data: {
        type: "FeatureCollection",
        features: selectedFeatures,
      } as GeoJSON.FeatureCollection,
      getLineColor: () => getColorsForMapType(mapType).polygonRouteColor,
      getLineWidth: () => BASE_ROUTE_WIDTH, // Same width as saved routes
      lineWidthMinPixels: 3,
      lineWidthMaxPixels: 12,
      pickable: true,
      stroked: false,
      autohighlight: false,
      highlightColor: (() => {
        const colors = getColorsForMapType(mapType)
        return [
          colors.polygonRouteColor[0],
          colors.polygonRouteColor[1],
          colors.polygonRouteColor[2],
          200,
        ] as [number, number, number, number]
      })(),
    })
    layers.push({
      id: "snapped-roads-selected",
      layer: selectedLayer,
      visible: isVisible,
    })
  }

  return layers.length > 0 ? layers : null
}
