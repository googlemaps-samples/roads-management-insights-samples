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

import { RoadPriority } from "../../../constants/road-priorities"
import { ROAD_PRIORITY_FALLBACK } from "../../../constants/road-priorities"
import { generateArrowsForLineString } from "../../../utils/arrow-generation"
import { getRoadLineString } from "../../../utils/road-selection"
import { Road as ProjectRoad } from "../../project-workspace-store"
import {
  ARROW_SIZE_CONFIG,
  DIRECTION_ARROW_WIDTH_PIXELS,
  EMPTY_FILTER_SENTINEL,
  PATH_BORDER_MIN_PIXELS,
  PATH_BORDER_WIDTH_MULTIPLIER,
  ROADS_NETWORK_WIDTH,
  ROAD_PRIORITY_FILTER_EXTENSION,
  ROAD_SELECTION_WIDTH,
} from "../constants"
import { DeckGLLayer } from "../types"
import { getColorsForMapType } from "../utils/color-utils"

interface RoadSelectionFeature {
  type: "Feature"
  geometry: GeoJSON.LineString
  properties: {
    id: string
    [key: string]: any
  }
}

export function createRoadsNetworkLayer(
  projectId?: string,
  roadsTilesTimestamp?: number,
  selectedRoadPriorities?: RoadPriority[],
  currentZoom?: number,
  showTileLayerArrows?: boolean,
): DeckGLLayer | null {
  const tileLayer = createRoadsNetworkTileLayer(
    projectId || "",
    roadsTilesTimestamp || Date.now(),
    selectedRoadPriorities,
    currentZoom,
    showTileLayerArrows,
  )
  if (tileLayer) return tileLayer

  return null
}

export function createRoadsNetworkTileLayer(
  projectId: string,
  roadsTilesTimestamp: number,
  selectedRoadPriorities?: RoadPriority[],
  currentZoom?: number,
  showTileLayerArrows?: boolean,
): DeckGLLayer | null {
  const apiBaseUrl = import.meta.env.PROD ? "" : "http://localhost:8000"
  const tileUrl = `${apiBaseUrl}/tiles/roads/{z}/{x}/{y}.geojson?project_id=${projectId}&t=${roadsTilesTimestamp}`

  const activePriorityFilters =
    selectedRoadPriorities && selectedRoadPriorities.length > 0
      ? selectedRoadPriorities
      : [EMPTY_FILTER_SENTINEL]

  try {
    const tileLayer = new TileLayer({
      id: `roads-network-tile-t${roadsTilesTimestamp}`,
      data: tileUrl,
      minZoom: 10,
      maxZoom: 10,
      pickable: true,
      autohighlight: false,
      highlightColor: [255, 0, 0, 255],
      updateTriggers: {
        filterCategories: activePriorityFilters,
        getLineColor: currentZoom, // Force sublayer re-render when zoom changes (for arrows at zoom >= 16)
        getLineWidth: currentZoom, // Force sublayer re-render when zoom changes (for arrows at zoom >= 16)
      },
      renderSubLayers: (subLayerProps: any) => {
        const { data, tile } = subLayerProps

        if (!data || !data.features || !Array.isArray(data.features)) {
          return null
        }

        if (
          !tile?.index ||
          typeof tile.index.x !== "number" ||
          typeof tile.index.y !== "number" ||
          typeof tile.index.z !== "number"
        ) {
          return null
        }

        const { z, x, y } = tile.index

        const enhancedFeatures: GeoJSON.Feature[] = []
        // Use actual map zoom level for arrow generation, not tile zoom
        const zoomLevel = currentZoom ?? z ?? 0

        for (const feature of data.features) {
          if (
            !feature ||
            !feature.geometry ||
            !feature.geometry.type ||
            !feature.geometry.coordinates
          ) {
            continue
          }

          const featurePriority =
            feature.properties?.priority || ROAD_PRIORITY_FALLBACK

          const enhancedFeature = {
            ...feature,
            properties: {
              ...feature.properties,
              priority: featurePriority,
              // Add custom properties here
              featureType: "road", // Add type identifier
              // You can add computed properties
              displayName:
                feature.properties?.name || `Road ${feature.properties?.id}`,
              // Or fetch additional data and merge it
            },
          }

          enhancedFeatures.push(enhancedFeature)

          // Generate arrows for road network (zoom >= 16, length-based sizing)
          if (
            feature.geometry?.type === "LineString" &&
            feature.geometry.coordinates.length >= 2
          ) {
            // Extract length from properties (prefer existing data)
            const lengthMeters =
              (feature.properties?.length ?? 0) * 1000 || // km to meters
              (feature.properties?.distance ?? 0) || // already in meters
              0

            // Only generate arrows if we have valid length data
            if (lengthMeters > 0) {
              const arrowFeatures = generateArrowsForLineString(
                feature.geometry.coordinates,
                zoomLevel,
                {
                  color: ROADS_NETWORK_COLOR as [
                    number,
                    number,
                    number,
                    number,
                  ],
                  width: DIRECTION_ARROW_WIDTH_PIXELS,
                  mode: "tile-layer",
                  minZoom: ARROW_SIZE_CONFIG.TILE_LAYER_MIN_ZOOM,
                },
                lengthMeters, // Pass existing length for performance
                {
                  priority: featurePriority,
                  parent_id: feature.properties?.id,
                },
                showTileLayerArrows, // Pass external flag
              )
              enhancedFeatures.push(...arrowFeatures)
            }
          }
        }

        if (enhancedFeatures.length === 0) {
          return null
        }

        return new GeoJsonLayer({
          ...subLayerProps,
          id: `roads-tile-${z}-${x}-${y}`,
          data: {
            type: "FeatureCollection",
            features: enhancedFeatures,
          } as GeoJSON.FeatureCollection,
          pickable: true,
          autohighlight: false,
          extensions: [ROAD_PRIORITY_FILTER_EXTENSION],
          getFilterCategory: (f: any) => {
            return f?.properties?.priority || ROAD_PRIORITY_FALLBACK
          },
          filterCategories: activePriorityFilters,
          getLineColor: (d: any) => {
            // Use arrow color if it's an arrow feature
            if (
              d.properties?.type === "direction_arrow" &&
              d.properties?.color
            ) {
              return d.properties.color
            }
            return ROADS_NETWORK_COLOR as [number, number, number, number]
          },
          getLineWidth: (d: any) => {
            // Use arrow width if it's an arrow feature
            if (
              d.properties?.type === "direction_arrow" &&
              d.properties?.width
            ) {
              return d.properties.width
            }
            return ROADS_NETWORK_WIDTH
          },
          lineWidthMinPixels: 1.5,
          lineWidthMaxPixels: 4,
          stroked: false,
        })
      },
    })

    return {
      id: `roads-network-tile-t${roadsTilesTimestamp}`,
      layer: tileLayer,
      visible: true,
    }
  } catch (error) {
    console.error("🛣️ Failed to create TileLayer:", error)
    return null
  }
}

export function createRoadSelectionLayer(
  highlightedRoads: ProjectRoad[],
  currentZoom?: number,
  mapType: "roadmap" | "hybrid" = "roadmap",
): DeckGLLayer[] | null {
  if (!highlightedRoads || highlightedRoads.length === 0) {
    return null
  }

  const roadFeatures: RoadSelectionFeature[] = highlightedRoads
    .map((road) => {
      const geometry = getRoadLineString(road)
      if (!geometry || geometry.type !== "LineString") {
        return null
      }

      return {
        type: "Feature" as const,
        geometry,
        properties: {
          id: road?.id?.toString(),
        },
      }
    })
    .filter((feature): feature is RoadSelectionFeature => Boolean(feature))

  if (roadFeatures.length === 0) {
    return null
  }

  const pathData = roadFeatures
    .map((feature) => {
      const geometry = feature.geometry
      if (!geometry?.coordinates || geometry.coordinates.length < 2) {
        return null
      }
      return {
        id: feature.properties?.id,
        path: geometry.coordinates,
      }
    })
    .filter(Boolean) as Array<{ id: string; path: number[][] }>

  if (pathData.length === 0) return null

  const sharedPathProps = {
    data: pathData,
    getPath: (d: any) => d.path,
    widthUnits: "pixels" as const,
    capRounded: true,
    jointRounded: true,
    pickable: false,
    parameters: { depthTest: false as any },
  }

  const colors = getColorsForMapType(mapType)
  const selectionBorderLayer = new PathLayer({
    ...sharedPathProps,
    id: "road-selection-highlight-border",
    getColor: colors.pathBorderColor,
    getWidth: ROAD_SELECTION_WIDTH * PATH_BORDER_WIDTH_MULTIPLIER,
    widthMinPixels: Math.max(
      ROAD_SELECTION_WIDTH * PATH_BORDER_WIDTH_MULTIPLIER,
      PATH_BORDER_MIN_PIXELS,
    ),
  })

  const selectionMainLayer = new PathLayer({
    ...sharedPathProps,
    id: "road-selection-highlight-main",
    getColor: colors.roadSelectionColor,
    getWidth: ROAD_SELECTION_WIDTH,
    widthMinPixels: ROAD_SELECTION_WIDTH,
  })

  const layers: DeckGLLayer[] = [
    {
      id: "road-selection-highlight",
      layer: [selectionBorderLayer, selectionMainLayer],
      visible: true,
    },
  ]

  // Generate arrows for road selection (always visible, length+zoom based sizing)
  if (currentZoom !== undefined) {
    const arrowFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = []

    highlightedRoads.forEach((road) => {
      const coords = road.linestringGeoJson?.coordinates || []
      if (coords.length >= 2) {
        // Extract length from road properties
        const lengthMeters = (road.distanceKm ?? 0) * 1000 // km to meters

        const arrows = generateArrowsForLineString(
          coords,
          currentZoom,
          {
            color: colors.roadSelectionColor,
            width: DIRECTION_ARROW_WIDTH_PIXELS,
            mode: "regular-layer",
          },
          lengthMeters,
          {
            road_id: road.id,
          },
        )
        arrowFeatures.push(...arrows)
      }
    })

    if (arrowFeatures.length > 0) {
      const arrowLayer = new GeoJsonLayer({
        id: "road-selection-arrows",
        data: {
          type: "FeatureCollection",
          features: arrowFeatures,
        } as GeoJSON.FeatureCollection,
        getLineColor: (d: any) =>
          d.properties?.color || colors.roadSelectionColor,
        getLineWidth: (d: any) =>
          d.properties?.width || DIRECTION_ARROW_WIDTH_PIXELS,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 3,
        lineWidthMaxPixels: 8,
        pickable: false,
      })

      layers.push({
        id: "road-selection-arrows",
        layer: arrowLayer,
        visible: true,
      })
    }
  }

  return layers
}
