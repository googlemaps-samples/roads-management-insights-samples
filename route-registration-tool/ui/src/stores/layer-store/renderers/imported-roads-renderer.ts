import { GeoJsonLayer } from "@deck.gl/layers"

import { RoadPriority } from "../../../constants/road-priorities"
import {
  calculateLineStringLength,
  generateArrowsForLineString,
} from "../../../utils/arrow-generation"
import { findValidRoadsToAdd } from "../../../utils/multi-select-route"
import {
  DIRECTION_ARROW_WIDTH_PIXELS,
  POLYGON_ROUTE_COLOR,
  ROADS_NETWORK_WIDTH,
} from "../constants"
import { DeckGLLayer, RoadImportState } from "../types"
import { getColorsForMapType } from "../utils/color-utils"

/**
 * Get road color based on state
 * Priority order:
 * 1. Hovered (purple)
 * 2. In routeInMaking (orange)
 * 3. Valid for front (yellow)
 * 4. Valid for back (yellow)
 * 5. In panelRoutes (orange)
 * 6. Lasso filtered (green)
 * 7. Default (grayscale if routeInMaking exists, gray otherwise)
 */
function getRoadColor(
  roadId: string,
  state: RoadImportState,
  validFrontRoadIds: string[] = [],
  validBackRoadIds: string[] = [],
  mapType: "roadmap" | "hybrid" = "roadmap",
  // Pre-computed Sets for faster lookups
  panelRouteRoadIdsSet?: Set<string>,
  hoveredRouteRoadIdsSet?: Set<string>,
): [number, number, number, number] {
  const colors = getColorsForMapType(mapType)

  // Check if this road is part of a hovered route (for stretched routes, highlight all roads in the route)
  // Use Set for O(1) lookup instead of O(n) array iteration
  const isPartOfHoveredRoute =
    state.hoveredRoadId && (hoveredRouteRoadIdsSet?.has(roadId) ?? false)

  if (state.hoveredRoadId === roadId || isPartOfHoveredRoute) {
    return colors.importedRoadsHoveredColor as [number, number, number, number]
  }

  // Check if in routeInMaking (orange)
  if (state.routeInMaking && state.routeInMakingRoadIds?.includes(roadId)) {
    return colors.importedRoadsSelectedColor as [number, number, number, number]
  }

  // Check if valid for front (yellow)
  if (validFrontRoadIds.includes(roadId)) {
    return colors.importedRoadsValidColor as [number, number, number, number]
  }

  // Check if valid for back (yellow)
  if (validBackRoadIds.includes(roadId)) {
    return colors.importedRoadsValidColor as [number, number, number, number]
  }

  // If routeInMaking exists, grayscale all other roads
  if (state.routeInMaking) {
    return colors.importedRoadsDefaultColor as [number, number, number, number]
  }

  // Existing logic for panel routes, lasso, etc.
  // Use Set for O(1) lookup instead of O(n) array iteration
  if (panelRouteRoadIdsSet?.has(roadId) ?? false) {
    return colors.importedRoadsSelectedColor as [number, number, number, number]
  }

  // Lasso filtered roads (temporary green state)
  if (
    state.lassoFilteredRoadIds &&
    state.lassoFilteredRoadIds.includes(roadId)
  ) {
    return colors.importedRoadsLassoColor as [number, number, number, number]
  }

  return colors.importedRoadsDefaultColor as [number, number, number, number]
}

/**
 * Get arrow color based on road state (same logic as road color)
 */
function getArrowColor(
  roadId: string,
  state: RoadImportState,
  validFrontRoadIds: string[] = [],
  validBackRoadIds: string[] = [],
  mapType: "roadmap" | "hybrid" = "roadmap",
  // Pre-computed Sets for faster lookups
  panelRouteRoadIdsSet?: Set<string>,
  hoveredRouteRoadIdsSet?: Set<string>,
): [number, number, number, number] {
  return getRoadColor(
    roadId,
    state,
    validFrontRoadIds,
    validBackRoadIds,
    mapType,
    panelRouteRoadIdsSet,
    hoveredRouteRoadIdsSet,
  )
}

/**
 * Create imported roads layer with color coding and arrows
 * Returns multiple layers for proper z-index ordering
 */
export function createImportedRoadsLayer(
  featureCollection: GeoJSON.FeatureCollection,
  state: RoadImportState,
  zoom?: number,
  selectedRoadPriorities?: RoadPriority[],
  mapType: "roadmap" | "hybrid" = "roadmap",
): DeckGLLayer[] {
  if (!featureCollection || !featureCollection.features) {
    return []
  }

  if (selectedRoadPriorities && selectedRoadPriorities.length === 0) {
    selectedRoadPriorities = ["NO-PRIORITIES-SELECTED"]
  }

  const zoomLevel = zoom ?? 0

  // Calculate valid roads for routeInMaking if it exists
  let validFrontRoadIds: string[] = []
  let validBackRoadIds: string[] = []
  if (state.routeInMaking && state.importedRoads) {
    const validRoads = findValidRoadsToAdd(
      state.routeInMaking,
      state.importedRoads,
    )
    validFrontRoadIds = validRoads.roadsThatCanBeAddedToFront.map(
      (r) => r.properties.road_id,
    )
    validBackRoadIds = validRoads.roadsThatCanBeAddedToBack.map(
      (r) => r.properties.road_id,
    )
  }

  // Pre-compute Sets for faster lookups (O(1) instead of O(n))
  // This dramatically improves performance when hovering over roads
  const panelRouteRoadIdsSet = new Set<string>()
  const hoveredRouteRoadIdsSet = new Set<string>()

  // Build Set of all roads in panel routes
  for (const route of state.panelRoutes) {
    for (const roadId of route.roadIds) {
      panelRouteRoadIdsSet.add(roadId)
    }
  }

  // Build Set of roads in hovered route (if any route contains the hovered road)
  if (state.hoveredRoadId) {
    const hoveredRoute = state.panelRoutes.find((r) =>
      r.roadIds.includes(state.hoveredRoadId!),
    )
    if (hoveredRoute) {
      for (const roadId of hoveredRoute.roadIds) {
        hoveredRouteRoadIdsSet.add(roadId)
      }
    }
  }

  // Separate features into groups for proper z-index ordering:
  // Order: normal (1) < selected (2) < back add route (3) < front add route (4) < route in making (5) < highlighted (6)
  const normalFeatures: GeoJSON.Feature[] = []
  const selectedFeatures: GeoJSON.Feature[] = []
  const backAddRouteFeatures: GeoJSON.Feature[] = []
  const frontAddRouteFeatures: GeoJSON.Feature[] = []
  const routeInMakingFeatures: GeoJSON.Feature[] = []
  const highlightedFeatures: GeoJSON.Feature[] = []

  for (const feature of featureCollection.features) {
    // Filter by priority if priorities are selected
    if (
      selectedRoadPriorities &&
      selectedRoadPriorities.length > 0 &&
      feature.properties?.priority
    ) {
      const roadPriority = feature.properties.priority as RoadPriority
      if (!selectedRoadPriorities.includes(roadPriority)) {
        continue // Skip this road if it doesn't match selected priorities
      }
    }
    if (
      !feature ||
      feature.geometry.type !== "LineString" ||
      !feature.geometry.coordinates ||
      feature.geometry.coordinates.length < 2
    ) {
      continue
    }

    const roadId = feature.properties?.road_id?.toString() || ""
    if (!roadId) continue

    const roadColor = getRoadColor(
      roadId,
      state,
      validFrontRoadIds,
      validBackRoadIds,
      mapType,
      panelRouteRoadIdsSet,
      hoveredRouteRoadIdsSet,
    )
    // Check if this road is part of a hovered route (for stretched routes)
    // Use pre-computed Set for O(1) lookup
    const isHovered =
      state.hoveredRoadId === roadId || hoveredRouteRoadIdsSet.has(roadId)
    const isSelected = panelRouteRoadIdsSet.has(roadId)

    // Add the road feature with color in properties
    const enhancedFeature: GeoJSON.Feature = {
      ...feature,
      properties: {
        ...feature.properties,
        road_id: roadId,
        featureType: "road",
        layerId: "imported-roads",
        color: roadColor,
      },
    }

    // Generate arrows for the road
    // Calculate length from properties or geometry
    let lengthMeters =
      (feature.properties?.distance_km ?? 0) * 1000 || // km to meters
      (feature.properties?.distance ?? 0) || // already in meters
      0

    // If no length in properties, calculate from geometry
    if (lengthMeters === 0 && feature.geometry.coordinates.length >= 2) {
      lengthMeters = calculateLineStringLength(feature.geometry.coordinates)
    }

    let arrowFeatures: GeoJSON.Feature[] = []
    // Generate arrows if we have valid coordinates and length
    if (feature.geometry.coordinates.length >= 2 && lengthMeters > 0) {
      const arrowColor = getArrowColor(
        roadId,
        state,
        validFrontRoadIds,
        validBackRoadIds,
        mapType,
        panelRouteRoadIdsSet,
        hoveredRouteRoadIdsSet,
      )
      arrowFeatures = generateArrowsForLineString(
        feature.geometry.coordinates,
        zoomLevel,
        {
          color: arrowColor,
          width: DIRECTION_ARROW_WIDTH_PIXELS,
          mode: "regular-layer",
        },
        lengthMeters,
        {
          type: "direction_arrow",
          parent_id: roadId,
          road_id: roadId,
          layerId: "imported-roads",
        },
      )

      // Debug logging
      if (
        arrowFeatures.length === 0 &&
        process.env.NODE_ENV === "development"
      ) {
        console.log("⚠️ No arrows generated for road:", {
          roadId,
          lengthMeters,
          coordinatesCount: feature.geometry.coordinates.length,
          hasDistanceKm: !!feature.properties?.distance_km,
          hasDistance: !!feature.properties?.distance,
        })
      }
    }

    // Determine which group this road belongs to (priority order: highlighted > routeInMaking > front add > back add > selected > normal)
    const isInRouteInMaking =
      state.routeInMaking && state.routeInMakingRoadIds?.includes(roadId)
    const isValidForFront = validFrontRoadIds.includes(roadId)
    const isValidForBack = validBackRoadIds.includes(roadId)

    // Add to appropriate group based on state (highest priority first)
    if (isHovered) {
      highlightedFeatures.push(enhancedFeature, ...arrowFeatures)
    } else if (isInRouteInMaking) {
      routeInMakingFeatures.push(enhancedFeature, ...arrowFeatures)
    } else if (isValidForFront) {
      frontAddRouteFeatures.push(enhancedFeature, ...arrowFeatures)
    } else if (isValidForBack) {
      backAddRouteFeatures.push(enhancedFeature, ...arrowFeatures)
    } else if (isSelected) {
      selectedFeatures.push(enhancedFeature, ...arrowFeatures)
    } else {
      normalFeatures.push(enhancedFeature, ...arrowFeatures)
    }
  }

  // Helper function to create a layer from features
  const createLayer = (
    id: string,
    features: GeoJSON.Feature[],
  ): DeckGLLayer | null => {
    if (features.length === 0) {
      return null
    }

    try {
      const layer = new GeoJsonLayer({
        id,
        data: {
          type: "FeatureCollection",
          features,
        } as GeoJSON.FeatureCollection,
        pickable: true,
        autohighlight: false,
        getLineColor: (d: any) => {
          // Use color from properties if available (for arrows or roads)
          if (
            d.properties?.color &&
            Array.isArray(d.properties.color) &&
            d.properties.color.length === 4
          ) {
            return d.properties.color as [number, number, number, number]
          }
          // Fallback to default imported roads color
          const colors = getColorsForMapType(mapType)
          return colors.importedRoadsDefaultColor as [
            number,
            number,
            number,
            number,
          ]
        },
        getLineWidth: (d: any) => {
          // Use arrow width if it's an arrow feature
          if (d.properties?.type === "direction_arrow" && d.properties?.width) {
            return d.properties.width
          }
          const roadId = d.properties?.road_id?.toString()
          // Check if this road is part of a hovered route (for stretched routes)
          const isHovered =
            state.hoveredRoadId === roadId ||
            (state.hoveredRoadId &&
              roadId &&
              state.panelRoutes.some(
                (r) =>
                  r.roadIds.includes(state.hoveredRoadId!) &&
                  r.roadIds.includes(roadId),
              ))
          if (isHovered) {
            return ROADS_NETWORK_WIDTH * 2
          }
          return ROADS_NETWORK_WIDTH
        },
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1.5,
        lineWidthMaxPixels: 6,
        stroked: false,
        parameters: {
          depthTest: true,
          depthFunc: 0x0203, // gl.LEQUAL
        },
        updateTriggers: {
          getLineColor: [
            state.hoveredRoadId,
            state.panelRoutes.length,
            state.lassoFilteredRoadIds?.length,
            state.multiSelectTempSelection.length,
            state.routeInMaking?.properties.road_id,
            state.routeInMakingRoadIds?.length || 0,
            validFrontRoadIds.length,
            validBackRoadIds.length,
            mapType,
          ],
        },
      })

      // Set z-index using layer order (layers are rendered in order, so we add them in z-index order)
      return {
        id,
        layer,
        visible: true,
      }
    } catch (error) {
      console.error(`🛣️ Failed to create imported roads layer ${id}:`, error)
      return null
    }
  }

  // Create layers in z-index order (lower z-index first, so they render behind)
  const layers: DeckGLLayer[] = []

  // Normal roads (z-index: 1) - add first so it renders behind
  const normalLayer = createLayer("imported-roads-normal", normalFeatures)
  if (normalLayer) layers.push(normalLayer)

  // Selected roads (z-index: 2)
  const selectedLayer = createLayer("imported-roads-selected", selectedFeatures)
  if (selectedLayer) layers.push(selectedLayer)

  // Back add route roads (z-index: 3)
  const backAddLayer = createLayer(
    "imported-roads-back-add-route",
    backAddRouteFeatures,
  )
  if (backAddLayer) layers.push(backAddLayer)

  // Front add route roads (z-index: 4)
  const frontAddLayer = createLayer(
    "imported-roads-front-add-route",
    frontAddRouteFeatures,
  )
  if (frontAddLayer) layers.push(frontAddLayer)

  // Route in making roads (z-index: 5)
  const routeInMakingLayer = createLayer(
    "imported-roads-route-in-making",
    routeInMakingFeatures,
  )
  if (routeInMakingLayer) layers.push(routeInMakingLayer)

  // Highlighted roads (z-index: 6) - add last so it renders on top
  const highlightedLayer = createLayer(
    "imported-roads-highlighted",
    highlightedFeatures,
  )
  if (highlightedLayer) layers.push(highlightedLayer)

  return layers
}

/**
 * Create imported polygon boundary layer
 */
export function createImportedPolygonLayer(
  polygon: GeoJSON.Polygon,
): DeckGLLayer | null {
  if (!polygon || polygon.type !== "Polygon") {
    return null
  }

  try {
    const layer = new GeoJsonLayer({
      id: "imported-polygon",
      data: {
        type: "Feature",
        geometry: polygon,
        properties: {},
      } as GeoJSON.Feature,
      pickable: false,
      autohighlight: false,
      getFillColor: [
        POLYGON_ROUTE_COLOR[0],
        POLYGON_ROUTE_COLOR[1],
        POLYGON_ROUTE_COLOR[2],
        30,
      ] as [number, number, number, number], // Violet with transparency
      getLineColor: [
        POLYGON_ROUTE_COLOR[0],
        POLYGON_ROUTE_COLOR[1],
        POLYGON_ROUTE_COLOR[2],
        200,
      ] as [number, number, number, number], // Violet
      getLineWidth: 2,
      lineWidthMinPixels: 2,
      stroked: true,
      filled: true,
      visible: false,
    })

    return {
      id: "imported-polygon",
      layer,
      visible: true,
    }
  } catch (error) {
    console.error("🛣️ Failed to create imported polygon layer:", error)
    return null
  }
}

/**
 * Create all imported roads layers (roads + polygon)
 */
export function createImportedRoadsLayers(
  featureCollection: GeoJSON.FeatureCollection | null,
  polygon: GeoJSON.Polygon | null,
  state: RoadImportState,
  zoom?: number,
  selectedRoadPriorities?: RoadPriority[],
  mapType: "roadmap" | "hybrid" = "roadmap",
): DeckGLLayer[] {
  const layers: DeckGLLayer[] = []

  // Add polygon layer if available
  if (polygon) {
    const polygonLayer = createImportedPolygonLayer(polygon)
    if (polygonLayer) {
      layers.push(polygonLayer)
    }
  }

  // Add roads layers if available (returns array of layers)
  if (featureCollection) {
    const roadsLayers = createImportedRoadsLayer(
      featureCollection,
      state,
      zoom,
      selectedRoadPriorities,
      mapType,
    )
    if (roadsLayers && roadsLayers.length > 0) {
      layers.push(...roadsLayers)
    }
  }

  return layers
}
