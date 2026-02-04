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

import { GeoJsonLayer, IconLayer } from "@deck.gl/layers"
import type { Feature, FeatureCollection, Geometry, LineString } from "geojson"

import { hexToRgb } from "./helpers"
import { alertMarkerSVG, pinMarkerSVG, svgUrl } from "./markers"
import type { AlertPoint, RouteProperties } from "./route-layer-renderer"

/**
 * Creates a main layer for route segments
 */
export function createMainLayer(
  geoJsonData: FeatureCollection,
  mode: string,
  hoveredRouteId: string | null,
  selectedRouteId: string | null,
  pulseValue: number,
  handleOnClick: (
    routeId: string,
    coordinates: number[][],
    object: Feature<Geometry, RouteProperties>,
  ) => void,
  onHover?: (info: { object?: Feature<Geometry, RouteProperties> }) => void,
  shouldUseGreyRoutes: boolean = false,
) {
  // Determine if this is a layer for selected routes or regular routes
  // const isSelectedLayer = mode.includes("-selected")
  return new GeoJsonLayer<RouteProperties>({
    id: `route-segments-${mode}`,
    data: geoJsonData,
    stroked: false,
    filled: false,
    lineWidthMinPixels: 5, // Increased minimum width for urban-congestion
    pickable: true,
    autoHighlight: false, // We'll handle highlighting manually
    highlightColor: [255, 255, 255, 100],
    lineWidthUnits: "pixels",
    lineJointRounded: true, // Rounded joints for smoother appearance
    lineCapRounded: true, // Add rounded caps at the ends of the lines
    lineMiterLimit: 2, // Add miter limit for smoother joints
    pointType: "circle+text",

    getLineColor: (f: Feature<Geometry, RouteProperties>) => {
      // Use color from properties
      const hex = f.properties.color
      const id = f.properties.id

      // Brighter color for selected segment
      if (selectedRouteId && id === selectedRouteId) {
        // Match the opacity pulsing from highlight-route.ts
        const opacity = Math.max(0.6, Math.min(1, pulseValue)) * 255
        return [...hexToRgb(hex), opacity] as [number, number, number, number]
      }

      // Use grey color when shouldUseGreyRoutes is true, otherwise use route color
      if (shouldUseGreyRoutes) {
        return [128, 128, 128, 200] as [number, number, number, number] // Grey with some transparency
      }

      return [...hexToRgb(hex), 255] as [number, number, number, number]
    },
    getText: (f: Feature<Geometry, RouteProperties>) => f.properties.name,
    getLineWidth: (f) => {
      const properties = f.properties

      // Make grey routes thinner
      if (shouldUseGreyRoutes) {
        return 1.5 // Thinner grey routes
      }

      // Make hovered feature thicker
      if (hoveredRouteId && properties.id === hoveredRouteId) {
        return 7 // Wider for urban-congestion
      }

      // Pulsating effect for selected segment
      if (selectedRouteId && properties.id === selectedRouteId) {
        const baseWidth = 8
        return baseWidth * pulseValue // Pulsating width
      }

      // Make high delay routes wider in live mode
      if (mode === "live" && properties.delay) {
        const delay = properties.delay
        const baseWidth = 3
        const maxWidth = 6
        return Math.min(baseWidth + delay / 100, maxWidth) // Scale width based on delay
      }
      return 3 // Increased default width for urban-congestion
    },
    getPointRadius: 4,
    getTextSize: 12,

    onClick: (info: { object?: Feature<Geometry, RouteProperties> }) => {
      if (!info.object) return

      const routeId = info.object.properties?.id
      if (!routeId) {
        console.error(
          "🎯 createMainLayer onClick: No route ID found in clicked object",
          info.object,
        )
        return
      }

      // Don't handle clicks on grey routes
      if (shouldUseGreyRoutes) {
        return
      }

      // Don't handle clicks on routes with no data (grey color)
      const routeColor = info.object.properties?.color
      if (routeColor === COLOR_CATEGORIES.NO_DATA) {
        return
      }

      handleOnClick(
        routeId,
        (info.object.geometry as LineString).coordinates,
        info.object,
      )
      return
    },

    onHover: (info: { object?: Feature<Geometry, RouteProperties> }) => {
      // Don't show hover effects on grey routes
      if (shouldUseGreyRoutes) {
        return
      }

      // Don't show hover effects on routes with no data (grey color)
      const routeColor = info.object?.properties?.color
      if (routeColor === COLOR_CATEGORIES.NO_DATA) {
        return
      }

      // Call the original hover handler for non-grey routes
      if (onHover) {
        onHover(info)
      }
    },

    // Add tooltip for hover
    updateTriggers: {
      getLineColor: [mode, selectedRouteId, pulseValue], // Remove hoveredIndex to reduce updates
      getLineWidth: [mode, selectedRouteId, pulseValue], // Remove hoveredIndex to reduce updates
    },

    // Disable transitions to prevent flickering
    transitions: {
      getLineWidth: 0, // No transition
      getLineColor: 0, // No transition
    },

    // Performance optimizations with WebGL error prevention
    _subLayerProps: {
      "line-strings": {
        parameters: {
          depthTest: false as const,
          blend: true,
          blendFunc: [770, 771, 1, 771], // GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA
          // Disable problematic WebGL features that cause drawBuffers errors
          depthFunc: 519, // GL_LEQUAL
          stencilTest: false,
          colorMask: [true, true, true, true],
        },
        // Add WebGL context error handling
        onError: (error: Error) => {
          console.warn("LineString layer WebGL error (handled):", error.message)
        },
      },
    },
    // Additional performance settings
    extensions: [],
    wrapLongitude: false, // Disable wrapping for better performance
    // Add layer-level error handling
    onError: (error: Error) => {
      console.warn("Main layer WebGL error (handled):", error.message)
    },
  })
}

/**
 * Creates an alert icon layer
 */
export function createAlertIconLayer(
  alertPoints: AlertPoint[],
  handleOnClick: (
    routeId: string,
    coordinates: number[][],
    object: AlertPoint,
  ) => void,
  onHover?: (info: { object?: AlertPoint }) => void,
) {
  // Convert alert points to format needed by IconLayer
  const iconData = alertPoints.map((alert) => ({
    position: Array.isArray(alert.position)
      ? alert.position
      : [alert.position.lng, alert.position.lat],
    name: alert.name,
    id: alert.id,
    color: alert.color || "#e94436",
    routeId: alert.routeId,
    segmentData: alert.segmentData,
    delayRatio: alert.delayRatio,
    placeId: alert.placeId,
  }))

  return new IconLayer({
    id: "alert-icon-layer",
    data: iconData,
    pickable: true,
    getIcon: (d) => ({
      url: svgUrl(alertMarkerSVG(d.color, 32)),
      width: 128,
      height: 128,
      anchorY: 64,
      anchorX: 64,
    }),
    sizeScale: 2,
    getPosition: (d) => d.position,
    getSize: () => 10,
    onClick: (info: {
      object?: {
        position: [number, number] | { lng: number; lat: number }
        routeId?: string
        id?: string
        name?: string
      }
    }) => {
      if (!info.object) return

      const coordinates = Array.isArray(info.object.position)
        ? info.object.position
        : [info.object.position.lng, info.object.position.lat]

      const simulatedCoordinates = [coordinates]

      const routeId =
        info.object.routeId || info.object.id || info.object.name || ""

      handleOnClick(routeId, simulatedCoordinates, info.object as AlertPoint)
    },
    onHover: onHover,
  })
}

/**
 * Creates a pin marker icon layer for selected routes
 */
export function createPinIconLayer(
  selectedObject: Feature<Geometry, RouteProperties>,
  selectedRouteId: string | null,
  pulseValue: number,
  onHover?: (info: {
    object?: { position: [number, number]; name: string }
  }) => void,
) {
  const coordinates = (selectedObject.geometry as LineString).coordinates
  const midPoint = coordinates[Math.floor(coordinates.length / 2)]

  return new IconLayer({
    id: "pin-icon-layer",
    data: [{ position: midPoint, name: selectedObject.properties.id }],
    pickable: true,
    iconAtlas: svgUrl(pinMarkerSVG("#e94436", 10)),
    iconMapping: {
      marker: {
        width: 64,
        height: 64,
        anchorY: 22,
        anchorX: 12,
        x: 0,
        y: 0,
      },
    },
    getIcon: () => "marker",
    sizeScale: 15 * (selectedRouteId ? pulseValue : 1), // Apply pulsating effect to the size
    getPosition: (d) => d.position,
    getSize: () => 5,
    updateTriggers: {
      sizeScale: [selectedRouteId, pulseValue],
    },
    transitions: {
      sizeScale: 120, // Smooth transition for size changes
    },
    onHover: onHover,
  })
}

/**
 * Color categories based on getRouteColor function
 */
export const COLOR_CATEGORIES = {
  NO_DATA: "#9E9E9E", // Grey for no historical data
  GREEN: "#13d68f", // Normal (0-20% slower)
  YELLOW: "#ffcf44", // Medium delay (20-50% slower)
  RED: "#f24d42", // High delay (50% or more slower)
  DARK_RED: "#a82726", // Very high delay (100% or more slower)
} as const

/**
 * Groups GeoJSON features by their color based on delayRatio
 */
export function groupFeaturesByColor(
  geoJsonData: FeatureCollection,
): Record<string, Feature<Geometry, RouteProperties>[]> {
  const groups: Record<string, Feature<Geometry, RouteProperties>[]> = {
    [COLOR_CATEGORIES.NO_DATA]: [],
    [COLOR_CATEGORIES.GREEN]: [],
    [COLOR_CATEGORIES.YELLOW]: [],
    [COLOR_CATEGORIES.RED]: [],
    [COLOR_CATEGORIES.DARK_RED]: [],
  }

  if (!geoJsonData?.features) {
    return groups
  }

  geoJsonData.features.forEach((feature) => {
    const typedFeature = feature as Feature<Geometry, RouteProperties>
    const color = typedFeature.properties?.color

    if (color && groups[color]) {
      groups[color].push(typedFeature)
    } else {
      // Fallback to no-data grey for unknown colors
      groups[COLOR_CATEGORIES.NO_DATA].push(typedFeature)
    }
  })

  return groups
}

/**
 * Creates a color-specific layer for route segments
 */
export function createColorSpecificLayer(
  geoJsonData: FeatureCollection,
  mode: string,
  colorCategory: string,
  hoveredRouteId: string | null,
  selectedRouteId: string | null,
  pulseValue: number,
  handleOnClick: (
    routeId: string,
    coordinates: number[][],
    object: Feature<Geometry, RouteProperties>,
  ) => void,
  onHover?: (info: { object?: Feature<Geometry, RouteProperties> }) => void,
  shouldUseGreyRoutes: boolean = false,
) {
  // Adding new date to fix the issue with route segments giving weird route streaks
  return new GeoJsonLayer<RouteProperties>({
    id: `route-segments-${mode}-${colorCategory.replace("#", "")}+ ${new Date()}`,
    data: geoJsonData,
    stroked: false,
    filled: false,
    lineWidthMinPixels: 0.5,
    lineWidthScale: 1,
    lineWidthMaxPixels: 10,
    pickable: true,
    autoHighlight: false,
    highlightColor: [255, 255, 255, 100],
    lineWidthUnits: "pixels",
    lineJointRounded: true,
    lineCapRounded: true,
    pointType: "circle+text",

    getLineColor: (f: Feature<Geometry, RouteProperties>) => {
      const hex = f.properties.color
      const id = f.properties.id

      // Brighter color for selected segment
      if (selectedRouteId && id === selectedRouteId) {
        const opacity = Math.max(0.6, Math.min(1, pulseValue)) * 255
        return [...hexToRgb(hex), opacity] as [number, number, number, number]
      }

      // Use grey color when shouldUseGreyRoutes is true, otherwise use route color
      if (shouldUseGreyRoutes) {
        return [128, 128, 128, 200] as [number, number, number, number]
      }

      return [...hexToRgb(hex), 255] as [number, number, number, number]
    },

    getText: (f: Feature<Geometry, RouteProperties>) => f.properties.name,

    getLineWidth: (f) => {
      const properties = f.properties

      // Make grey routes thinner
      if (shouldUseGreyRoutes) {
        return 1.5
      }

      // Make hovered feature thicker
      if (hoveredRouteId && properties.id === hoveredRouteId) {
        return 7
      }

      // Pulsating effect for selected segment
      if (selectedRouteId && properties.id === selectedRouteId) {
        const baseWidth = 8
        return baseWidth * pulseValue
      }

      // Make high delay routes wider in live mode
      if (mode === "live" && properties.delay) {
        const delay = properties.delay
        const baseWidth = 3
        const maxWidth = 6
        return Math.min(baseWidth + delay / 100, maxWidth)
      }

      return 3
    },

    getPointRadius: 4,
    getTextSize: 12,

    onClick: (info: { object?: Feature<Geometry, RouteProperties> }) => {
      if (!info.object) return

      const routeId = info.object.properties?.id
      if (!routeId) {
        console.error(
          "🎯 createColorSpecificLayer onClick: No route ID found in clicked object",
          info.object,
        )
        return
      }

      // Don't handle clicks on grey routes
      if (shouldUseGreyRoutes) {
        return
      }

      // Don't handle clicks on routes with no data (grey color)
      const routeColor = info.object.properties?.color
      if (routeColor === COLOR_CATEGORIES.NO_DATA) {
        return
      }

      handleOnClick(
        routeId,
        (info.object.geometry as LineString).coordinates,
        info.object,
      )
    },

    onHover: (info: { object?: Feature<Geometry, RouteProperties> }) => {
      // Don't show hover effects on grey routes
      if (shouldUseGreyRoutes) {
        return
      }

      // Don't show hover effects on routes with no data (grey color)
      const routeColor = info.object?.properties?.color
      if (routeColor === COLOR_CATEGORIES.NO_DATA) {
        return
      }

      // Call the original hover handler for non-grey routes
      if (onHover) {
        onHover(info)
      }
    },

    updateTriggers: {
      getLineColor: [mode, selectedRouteId, pulseValue],
      getLineWidth: [mode, selectedRouteId, pulseValue],
    },

    transitions: {
      getLineWidth: 0,
      getLineColor: 0,
    },

    _subLayerProps: {
      "line-strings": {
        parameters: {
          depthTest: false as const,
          blend: true,
          blendFunc: [770, 771, 1, 771],
        },
      },
    },
    extensions: [],
    wrapLongitude: false,
  })
}

/**
 * Creates multiple layers grouped by color categories
 */
export function createColorBasedLayers(
  geoJsonData: FeatureCollection,
  mode: string,
  hoveredRouteId: string | null,
  selectedRouteId: string | null,
  pulseValue: number,
  handleOnClick: (
    routeId: string,
    coordinates: number[][],
    object: Feature<Geometry, RouteProperties>,
  ) => void,
  onHover?: (info: { object?: Feature<Geometry, RouteProperties> }) => void,
  shouldUseGreyRoutes: boolean = false,
) {
  const colorGroups = groupFeaturesByColor(geoJsonData)
  const layers: GeoJsonLayer<RouteProperties>[] = []

  // Define the order of colors from top to bottom (highest to lowest priority)
  const colorOrder = [
    COLOR_CATEGORIES.NO_DATA,
    COLOR_CATEGORIES.GREEN,
    COLOR_CATEGORIES.YELLOW,
    COLOR_CATEGORIES.RED,
    COLOR_CATEGORIES.DARK_RED,
  ]

  // Create layers in the specified order
  colorOrder.forEach((color) => {
    const features = colorGroups[color]
    if (!features || features.length === 0) return

    // Create GeoJSON data for this color group
    const colorGeoJsonData: FeatureCollection = {
      type: "FeatureCollection",
      features: features,
    }

    // Create main layer for this color
    const mainLayer = createColorSpecificLayer(
      colorGeoJsonData,
      mode,
      color,
      hoveredRouteId,
      selectedRouteId,
      pulseValue,
      handleOnClick,
      onHover,
      shouldUseGreyRoutes,
    )

    layers.push(mainLayer)
  })

  return layers
}

type Landmark = {
  position: [number, number]
  name: string
}

export function createLandmarkLabelLayer(
  landmarks: Landmark[],
  options?: { id?: string },
) {
  if (!landmarks?.length) {
    return null
  }

  const layerId = options?.id ?? "landmark-label-layer"

  const iconCache = new Map<
    string,
    {
      url: string
      width: number
      height: number
      anchorX: number
      anchorY: number
    }
  >()

  const measureContext =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null

  const escapeLabel = (label: string) =>
    label
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")

  const fallbackCharWidth = 8.5
  const primaryFontSize = 22
  const secondaryFontSize = 18
  const minBubbleWidth = 240
  const horizontalPadding = 28
  const pointerHeight = 6
  const pointerBottomMargin = 9
  const cornerRadius = 16
  const pointerBaseWidth = 12
  const verticalMarginTop = 0

  const getTypography = (fontSize: number) =>
    fontSize === primaryFontSize
      ? { lineHeight: 30, verticalPadding: 20 }
      : { lineHeight: 20, verticalPadding: 16 }

  const estimateTextWidth = (text: string, fontSize: number) => {
    if (measureContext) {
      const previousFont = measureContext.font
      measureContext.font = `${fontSize}px "Google Sans", sans-serif`
      const width = measureContext.measureText(text).width
      if (previousFont) {
        measureContext.font = previousFont
      }
      return width
    }
    return text.length * fallbackCharWidth * (fontSize / primaryFontSize)
  }

  const wrapLabel = (
    label: string,
    maxLineWidth: number,
    fontSize: number,
  ): string[] => {
    const words = label.split(/\s+/).filter(Boolean)
    if (!words.length) {
      return [label]
    }

    const lines: string[] = []
    let current = ""

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word
      if (estimateTextWidth(candidate, fontSize) <= maxLineWidth) {
        current = candidate
      } else {
        if (current) {
          lines.push(current)
        }
        current = word
      }
    })

    if (current) {
      lines.push(current)
    }

    return lines.length ? lines : [label]
  }

  const buildLabelIcon = (label: string) => {
    let fontSize = primaryFontSize
    const baseMaxLineWidth = minBubbleWidth - horizontalPadding * 2

    let lines = wrapLabel(label, baseMaxLineWidth, fontSize)

    if (lines.length > 1) {
      fontSize = secondaryFontSize
      lines = wrapLabel(label, baseMaxLineWidth, fontSize)
    }

    let longestLineWidth = Math.max(
      ...lines.map((line) => estimateTextWidth(line, fontSize)),
      0,
    )

    let bubbleWidth = Math.max(
      minBubbleWidth,
      Math.ceil(longestLineWidth) + horizontalPadding * 2,
    )

    const initialMaxLineWidth = bubbleWidth - horizontalPadding * 2

    lines = wrapLabel(label, initialMaxLineWidth, fontSize)
    longestLineWidth = Math.max(
      ...lines.map((line) => estimateTextWidth(line, fontSize)),
      0,
    )
    bubbleWidth = Math.max(
      bubbleWidth,
      Math.ceil(longestLineWidth) + horizontalPadding * 2,
    )

    const { lineHeight, verticalPadding } = getTypography(fontSize)
    const svgWidth = bubbleWidth
    const pointerMidX = svgWidth / 2
    const pointerBaseLeftX = pointerMidX - pointerBaseWidth / 2
    const pointerBaseRightX = pointerMidX + pointerBaseWidth / 2
    const bubbleHeight =
      verticalPadding * 2 + lineHeight * Math.max(lines.length, 1)
    const pointerTipY = bubbleHeight + pointerHeight + verticalMarginTop
    const svgHeight = pointerTipY + pointerBottomMargin

    const baseTextY = verticalMarginTop + bubbleHeight / 2
    const firstLineY = baseTextY - ((lines.length - 1) * lineHeight) / 2

    const safeLines = lines.map((line) =>
      escapeLabel(line).replace(/ /g, "&#160;"),
    )
    const textContent = safeLines
      .map(
        (line, index) =>
          `<tspan x="${pointerMidX}" y="${firstLineY + index * lineHeight}">${line}</tspan>`,
      )
      .join("")

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
        <rect x="0" y="${verticalMarginTop}" width="${svgWidth}" height="${bubbleHeight}" rx="${cornerRadius}" ry="${cornerRadius}" fill="#4285F4" stroke="#4285F4" />
        <text
          font-size="${fontSize}"
          font-family="Google Sans, sans-serif"
          fill="#FFFFFF"
          text-anchor="middle"
          dominant-baseline="middle"
        >${textContent}</text>
        <polygon points="${pointerBaseLeftX},${verticalMarginTop + bubbleHeight} ${pointerBaseRightX},${verticalMarginTop + bubbleHeight} ${pointerMidX},${pointerTipY}" fill="#4285F4" stroke="#4285F4" />
      </svg>
    `

    return {
      url: svgUrl(svg),
      width: Math.round(svgWidth),
      height: Math.round(svgHeight),
      anchorX: Math.round(pointerMidX),
      anchorY: Math.round(pointerTipY),
    }
  }

  const getOrCreateIcon = (name: string) => {
    if (!iconCache.has(name)) {
      iconCache.set(name, buildLabelIcon(name))
    }
    return iconCache.get(name)!
  }

  return new IconLayer<(typeof landmarks)[number]>({
    id: layerId,
    data: landmarks,
    pickable: false,
    sizeUnits: "pixels",
    getIcon: (d) => getOrCreateIcon(d.name),
    getSize: (d) => getOrCreateIcon(d.name).width,
    sizeScale: 0.17,
    getPosition: (d) => d.position,
    getPixelOffset: () => [0, 0],
  })
}
