import { GeoJsonLayer, PathLayer } from "@deck.gl/layers"

import { Road } from "../../../types/route"
import { decodePolylineToGeoJSON } from "../../../utils/polyline-decoder"
import { Route } from "../../project-workspace-store"
import { SEGMENT_HOVER_WIDTH, SELECTED_ROUTE_WIDTH } from "../constants"
import { useLayerStore } from "../index"
import { DeckGLLayer } from "../types"
import { getColorsForMapType } from "../utils/color-utils"

export function createSegmentationLayers(
  targetRoute: Route | null,
  isActive: boolean,
  previewSegments: Road[],
  hoveredSegmentId: string | null,
  selectedSegmentIds: Set<string>,
  mapType: "roadmap" | "hybrid" = "roadmap",
  currentZoom?: number,
): DeckGLLayer[] {
  if (!isActive || !targetRoute) {
    return []
  }

  const layers: DeckGLLayer[] = []

  const originalLayer = createOriginalRouteDimmedLayer(targetRoute, mapType)
  if (originalLayer) layers.push(originalLayer)

  const { nonHovered: nonHoveredPreviewLayer, hovered: hoveredPreviewLayer } =
    createPreviewSegmentsLayer(
      previewSegments,
      hoveredSegmentId,
      selectedSegmentIds,
      mapType,
    )

  // Add non-hovered preview segments layer
  if (nonHoveredPreviewLayer) {
    layers.push(nonHoveredPreviewLayer)
  }

  // Store hovered preview segments layer to add at the end (after boundaries)
  // This will be handled by the hook to ensure it renders on top
  if (hoveredPreviewLayer) {
    layers.push(hoveredPreviewLayer)
  }

  // Get route length and segmentation distance from segmentation state if available
  const segmentation = useLayerStore.getState().segmentation
  const routeLengthKm = segmentation.calculatedRouteLengthKm
  const segmentationDistanceKm = segmentation.distanceKm // Distance between segments

  const boundaryLayer = createSegmentationBoundariesLayer(
    previewSegments,
    mapType,
    currentZoom,
    routeLengthKm,
    segmentationDistanceKm,
  )
  if (boundaryLayer) layers.push(boundaryLayer)

  return layers
}

export function createOriginalRouteDimmedLayer(
  targetRoute: Route | null,
  mapType: "roadmap" | "hybrid" = "roadmap",
): DeckGLLayer | null {
  if (!targetRoute) return null

  const decoded = decodePolylineToGeoJSON(targetRoute.encodedPolyline)

  return {
    id: "original-route-dimmed",
    layer: new GeoJsonLayer({
      id: "original-route-dimmed",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: decoded.coordinates,
            },
            properties: {},
          },
        ],
      },
      getLineColor: [0, 0, 0, 0],
      getLineWidth: 2,
      stroked: false,
      pickable: false,
    }),
    visible: true,
  }
}

export function createPreviewSegmentsLayer(
  previewSegments: Road[],
  hoveredSegmentId: string | null,
  selectedSegmentIds: Set<string>,
  mapType: "roadmap" | "hybrid" = "roadmap",
): { nonHovered: DeckGLLayer | null; hovered: DeckGLLayer | null } {
  if (previewSegments.length === 0) {
    return { nonHovered: null, hovered: null }
  }

  // Convert to PathLayer format for consistency with saved segments
  const segmentPaths = previewSegments
    .map((segment: any) => {
      const geometry = segment.linestringGeoJson
      if (!geometry?.coordinates || geometry.coordinates.length < 2) {
        return null
      }
      return {
        id: segment.id,
        path: geometry.coordinates,
        isHovered: hoveredSegmentId === segment.id,
        isSelected: selectedSegmentIds.has(segment.id),
      }
    })
    .filter(Boolean) as Array<{
    id: string
    path: number[][]
    isHovered: boolean
    isSelected: boolean
  }>

  if (segmentPaths.length === 0) {
    return { nonHovered: null, hovered: null }
  }

  const colors = getColorsForMapType(mapType)
  const getSegmentColor = (
    segment: (typeof segmentPaths)[number],
  ): [number, number, number, number] => {
    if (segment.isSelected && segment.isHovered) {
      return colors.segmentHoverColor // Purple for hover
    }
    if (segment.isSelected && !segment.isHovered) {
      return colors.individualPreviewColor
    }
    // Grey out unselected segments
    return [150, 150, 150, 120] // Grey with reduced opacity for unselected
  }

  const getSegmentWidth = (segment: (typeof segmentPaths)[number]) => {
    if (segment.isHovered) {
      return SEGMENT_HOVER_WIDTH
    }
    return SELECTED_ROUTE_WIDTH
  }

  const stateKey = [
    Array.from(selectedSegmentIds).sort().join(","),
    hoveredSegmentId,
  ].join("|")

  // Split segments into hovered and non-hovered for proper layering
  const nonHoveredSegments = segmentPaths.filter((s) => !s.isHovered)
  const hoveredSegments = segmentPaths.filter((s) => s.isHovered)

  // Create non-hovered layer
  const nonHoveredLayer: DeckGLLayer | null =
    nonHoveredSegments.length > 0
      ? {
          id: "preview-segments",
          layer: new PathLayer({
            id: "preview-segments",
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
            updateTriggers: {
              getColor: [stateKey],
              getWidth: [stateKey],
            },
          }),
          visible: true,
        }
      : null

  // Create hovered layer
  const hoveredLayer: DeckGLLayer | null =
    hoveredSegments.length > 0
      ? {
          id: "preview-segments-hovered",
          layer: new PathLayer({
            id: "preview-segments-hovered",
            data: hoveredSegments,
            getPath: (d: any) => d.path,
            getColor: (d: any) => getSegmentColor(d),
            getWidth: (d: any) => getSegmentWidth(d),
            widthUnits: "pixels" as const,
            capRounded: true,
            jointRounded: true,
            pickable: true,
            parameters: { depthTest: false as any },
            widthMinPixels: 4,
            updateTriggers: {
              getColor: [stateKey],
              getWidth: [stateKey],
            },
          }),
          visible: true,
        }
      : null

  // If no hovered segments, return all segments in nonHovered layer
  if (hoveredSegments.length === 0 && segmentPaths.length > 0) {
    return {
      nonHovered: {
        id: "preview-segments",
        layer: new PathLayer({
          id: "preview-segments",
          data: segmentPaths,
          getPath: (d: any) => d.path,
          getColor: (d: any) => getSegmentColor(d),
          getWidth: (d: any) => getSegmentWidth(d),
          widthUnits: "pixels" as const,
          capRounded: true,
          jointRounded: true,
          pickable: true,
          parameters: { depthTest: false as any },
          widthMinPixels: 4,
          updateTriggers: {
            getColor: [stateKey],
            getWidth: [stateKey],
          },
        }),
        visible: true,
      },
      hovered: null,
    }
  }

  return { nonHovered: nonHoveredLayer, hovered: hoveredLayer }
}

export function createSegmentationBoundariesLayer(
  previewSegments: Road[],
  mapType: "roadmap" | "hybrid" = "roadmap",
  currentZoom?: number,
  routeLengthKm?: number,
  segmentationDistanceKm?: number,
): DeckGLLayer | null {
  if (previewSegments.length === 0) return null

  type LatLng = [number, number]
  const boundaryLines: { path: LatLng[] }[] = []

  const toLngLat = (coord: any): LatLng => {
    return [coord[0], coord[1]]
  }

  // Calculate route bounds to determine route size (for fallback calculation)
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  for (const segment of previewSegments) {
    const coords = (segment.linestringGeoJson?.coordinates || []) as any[]
    if (coords.length < 2) continue

    for (const coord of coords) {
      const [lng, lat] = toLngLat(coord)
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

  for (let i = 0; i < previewSegments.length - 1; i++) {
    const a = previewSegments[i]
    const b = previewSegments[i + 1]
    const aCoords = (a.linestringGeoJson?.coordinates || []) as any[]
    const bCoords = (b.linestringGeoJson?.coordinates || []) as any[]
    if (aCoords.length < 2 || bCoords.length < 2) continue

    const endA = toLngLat(aCoords[aCoords.length - 1])
    const prevA = toLngLat(aCoords[aCoords.length - 2])

    // Calculate perpendicular direction
    const dx = endA[0] - prevA[0]
    const dy = endA[1] - prevA[1]
    const len = Math.sqrt(dx * dx + dy * dy) || 1
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
    boundaryLines.push({ path: [start, end] })
  }

  if (boundaryLines.length === 0) return null

  // Calculate dynamic line thickness based on zoom, segmentation distance, and route length
  const baseWidth = 1
  const maxWidth = 6 // Increased max for longer segments

  // 1. Zoom factor (already implemented)
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
    1, // Minimum 1 pixel
    Math.min(
      maxWidth,
      zoomWidthFactor *
        segmentationDistanceWidthFactor *
        routeLengthWidthFactor,
    ),
  )

  const layer = new PathLayer({
    id: "segmentation-boundaries",
    data: boundaryLines,
    getPath: (d: any) => d.path,
    getColor: [255, 43, 139, 255], // light orange for both
    getWidth: finalWidth,
    widthUnits: "pixels",
    widthMinPixels: 1,
    stroked: false,
    pickable: false,
    parameters: { depthTest: false as any },
    updateTriggers: {
      getWidth: [currentZoom, routeLengthKm, segmentationDistanceKm], // Add dependencies
      getPath: [
        currentZoom,
        previewSegments.length,
        routeLengthKm,
        segmentationDistanceKm,
      ],
    },
  })

  return { id: "segmentation-boundaries", layer, visible: true }
}
