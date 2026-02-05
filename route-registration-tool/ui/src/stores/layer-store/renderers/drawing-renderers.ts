import { GeoJsonLayer, PathLayer } from "@deck.gl/layers"

import { generateArrowsForLineString } from "../../../utils/arrow-generation"
import { getRoadLineString } from "../../../utils/road-selection"
import { Road as ProjectRoad } from "../../project-workspace-store"
import { DIRECTION_ARROW_WIDTH_PIXELS } from "../constants"
import { DeckGLLayer } from "../types"
import { getColorsForMapType } from "../utils/color-utils"

export function createPolygonDrawingLayer(
  points: [number, number][],
): DeckGLLayer | null {
  if (!points || points.length < 2) return null

  const features: GeoJSON.Feature[] = []

  if (points.length >= 2) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: points,
      },
      properties: {
        type: "line",
      },
    })
  }

  if (points.length >= 3) {
    const ring = points
    const isClosed =
      ring.length > 0 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]
    const closedRing = isClosed ? ring : [...ring, ring[0]]

    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [closedRing],
      },
      properties: {
        type: "polygon",
      },
    })
  }

  const mainLayer = new GeoJsonLayer({
    id: "polygon-drawing",
    data: {
      type: "FeatureCollection",
      features: features,
    } as GeoJSON.FeatureCollection,
    getLineColor: (d) => {
      return d.properties.type === "polygon"
        ? [255, 152, 0, 150]
        : [255, 152, 0, 255]
    },
    getFillColor: (d) => {
      return d.properties.type === "polygon" ? [255, 152, 0, 50] : [0, 0, 0, 0]
    },
    getLineWidth: 3,
    lineWidthMinPixels: 2,
    pickable: false,
    filled: true,
    stroked: true,
  })

  // No arrows for polygon drawing layer (removed as per requirements)
  return { id: "polygon-drawing", layer: mainLayer, visible: true }
}

export function createLassoSelectedRoadsLayer(
  roads: ProjectRoad[],
  currentZoom?: number,
  mapType: "roadmap" | "hybrid" = "roadmap",
): DeckGLLayer | null {
  if (!roads || roads.length === 0) return null

  const pathData = roads
    .map((road) => {
      const geometry = getRoadLineString(road)
      const coordinates = geometry?.coordinates
      if (!coordinates || coordinates.length < 2) return null
      return {
        id: road.id,
        path: coordinates,
      }
    })
    .filter((entry): entry is { id: string; path: number[][] } =>
      Boolean(entry),
    )

  if (pathData.length === 0) {
    return null
  }

  const mainLayer = new PathLayer({
    id: "lasso-selected-roads",
    data: pathData,
    getPath: (d: any) => d.path,
    getColor: [16, 185, 129, 220],
    getWidth: 5,
    stroked: false,
    widthUnits: "pixels",
    pickable: false,
    parameters: { depthTest: false as any },
    capRounded: true,
    jointRounded: true,
  })

  const layers: any[] = [mainLayer]

  // Create arrow features for each road path (always visible, length+zoom based sizing)
  if (currentZoom !== undefined) {
    const arrowFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = []
    pathData.forEach((path) => {
      if (path.path.length >= 2) {
        // Calculate length for lasso-selected roads (no pre-existing length)
        const arrows = generateArrowsForLineString(
          path.path,
          currentZoom,
          {
            color: [16, 185, 129, 220] as [number, number, number, number],
            width: 5,
            mode: "regular-layer",
          },
          undefined, // Let it calculate length
          {
            road_id: path.id,
          },
        )
        arrowFeatures.push(...arrows)
      }
    })

    if (arrowFeatures.length > 0) {
      const arrowLayer = new GeoJsonLayer({
        id: "lasso-selected-roads-arrows",
        data: {
          type: "FeatureCollection",
          features: arrowFeatures,
        } as GeoJSON.FeatureCollection,
        getLineColor: (d: any) => d.properties?.color || [16, 185, 129, 220],
        getLineWidth: (d: any) => d.properties?.width || 5,
        lineWidthMinPixels: 3,
        pickable: false,
      })
      layers.push(arrowLayer)
    }
  }

  return { id: "lasso-selected-roads", layer: layers, visible: true }
}

export function createFeatureHoverHighlightLayer(
  feature: {
    layerId: string
    polyline: number[][] | null
    geometry: any
  },
  currentZoom?: number,
  mapType: "roadmap" | "hybrid" = "roadmap",
): DeckGLLayer | null {
  if (!feature || !feature.polyline || feature.polyline.length < 2) {
    return null
  }

  // Check if this is a route layer - use SEGMENT_HOVER_COLOR for routes
  const isRouteLayer =
    feature.layerId.includes("route") ||
    feature.layerId.includes("uploaded-routes") ||
    feature.layerId.includes("-geojson")

  const colors = getColorsForMapType(mapType)
  const hoverColor: [number, number, number, number] = isRouteLayer
    ? colors.segmentHoverColor
    : mapType === "hybrid"
      ? [0, 122, 255, 255]
      : [0, 0, 255, 255]

  const mainLayer = new PathLayer({
    id: "feature-hover-highlight",
    data: [
      {
        id: "hovered-feature",
        path: feature.polyline,
      },
    ],
    getPath: (d: any) => d.path,
    getColor: hoverColor,
    getWidth: 8,
    widthUnits: "pixels",
    pickable: false,
    parameters: { depthTest: false as any },
    capRounded: true,
    jointRounded: true,
  })

  const layers: any[] = [mainLayer]

  // Create arrow features for the hovered feature (always visible, length+zoom based sizing)
  if (currentZoom !== undefined) {
    const arrowFeatures = generateArrowsForLineString(
      feature.polyline,
      currentZoom,
      {
        color: hoverColor,
        width: DIRECTION_ARROW_WIDTH_PIXELS * 2,
        mode: "regular-layer",
      },
      undefined, // Let it calculate length
    )

    if (arrowFeatures.length > 0) {
      const arrowLayer = new GeoJsonLayer({
        id: "feature-hover-highlight-arrows",
        data: {
          type: "FeatureCollection",
          features: arrowFeatures,
        } as GeoJSON.FeatureCollection,
        getLineColor: (d: any) => d.properties?.color || hoverColor,
        getLineWidth: (d: any) =>
          d.properties?.width || DIRECTION_ARROW_WIDTH_PIXELS * 2,
        lineWidthMinPixels: 3,
        lineWidthMaxPixels: 8,
        pickable: false,
      })
      layers.push(arrowLayer)
    }
  }

  return { id: "feature-hover-highlight", layer: layers, visible: true }
}

export function createJurisdictionBoundaryLayer(
  boundaryGeoJson:
    | GeoJSON.Polygon
    | GeoJSON.FeatureCollection
    | GeoJSON.Feature<GeoJSON.Polygon>
    | null
    | undefined,
  mapType: "roadmap" | "hybrid" = "roadmap",
): DeckGLLayer | null {
  if (!boundaryGeoJson) {
    return null
  }

  // Handle FeatureCollection - extract the first feature's geometry
  let polygon: GeoJSON.Polygon | null = null
  if (boundaryGeoJson.type === "FeatureCollection") {
    const featureCollection = boundaryGeoJson as GeoJSON.FeatureCollection
    if (
      featureCollection.features &&
      featureCollection.features.length > 0 &&
      featureCollection.features[0].geometry?.type === "Polygon"
    ) {
      polygon = featureCollection.features[0].geometry as GeoJSON.Polygon
    } else {
      console.warn("FeatureCollection does not contain a valid Polygon")
      return null
    }
  } else if (boundaryGeoJson.type === "Feature") {
    const feature = boundaryGeoJson as GeoJSON.Feature<GeoJSON.Polygon>
    if (feature.geometry?.type === "Polygon") {
      polygon = feature.geometry
    } else {
      console.warn("Feature does not contain a Polygon geometry")
      return null
    }
  } else if (boundaryGeoJson.type === "Polygon") {
    polygon = boundaryGeoJson as GeoJSON.Polygon
  } else {
    console.warn("Unsupported boundaryGeoJson type:", boundaryGeoJson)
    return null
  }

  if (!polygon || !polygon.coordinates || polygon.coordinates.length === 0) {
    return null
  }

  const feature: GeoJSON.Feature<GeoJSON.Polygon> = {
    type: "Feature",
    geometry: polygon,
    properties: {
      type: "jurisdiction_boundary",
    },
  }

  const colors = getColorsForMapType(mapType)
  const mainLayer = new GeoJsonLayer({
    id: "jurisdiction-boundary",
    data: {
      type: "FeatureCollection",
      features: [feature],
    } as GeoJSON.FeatureCollection,
    getLineColor: colors.jurisdictionBoundaryColor, // Slate blue-gray outline or white for satellite
    getFillColor: [0, 0, 0, 0], // Transparent fill
    getLineWidth: 4,
    lineWidthMinPixels: 4,
    pickable: false,
    filled: true,
    parameters: { depthTest: false as any },
  })

  return { id: "jurisdiction-boundary", layer: mainLayer, visible: true }
}
