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

import { useMemo, useState } from "react"

import { useLayerStore } from "../stores/layer-store"
import { getColorsForMapType } from "../stores/layer-store/utils/color-utils"
import { useProjectWorkspaceStore } from "../stores/project-workspace-store"
import { useDeckLayers } from "./use-deck-layers"

// Type helper to access layerVisibility from LayerStore
type LayerStoreState = ReturnType<typeof useLayerStore.getState>

/**
 * Hook for managing layer visibility and display
 */
export const useLayerManagement = (projectId: string) => {
  const [isLayersExpanded, setIsLayersExpanded] = useState(false)
  const [expandedSavedRoutes, setExpandedSavedRoutes] = useState(false)

  const mapType = useProjectWorkspaceStore((state) => state.mapType)
  const deckLayers = useDeckLayers(projectId || "")
  const toggleLayerVisibility = useLayerStore(
    (state) => state.toggleLayerVisibility,
  )
  const layerVisibility = useLayerStore((state: LayerStoreState) => {
    // Access layerVisibility through the state object
    return (
      (state as { layerVisibility?: Record<string, boolean> })
        .layerVisibility ?? {}
    )
  }) as Record<string, boolean>

  // Get hovered states
  const hoveredFeature = useLayerStore((state) => state.hoveredFeature)
  const hoveredRoadId = useLayerStore((state) => state.roadImport.hoveredRoadId)

  // Get selection mode from road import state
  const selectionMode = useLayerStore((state) => state.roadImport.selectionMode)

  // Check if waypoint markers exist
  const individualRoute = useLayerStore((state) => state.individualRoute)
  const snappedRoads = useLayerStore((state) => state.snappedRoads)
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)

  // Waypoint markers exist if:
  // 1. Individual drawing mode has points (origin, waypoints, destination)
  // 2. Optimized routes have markers (origin, waypoints, destination)
  const hasWaypointMarkers = useMemo(() => {
    // Check individual drawing markers
    if (mapMode === "individual_drawing" && individualRoute.points.length > 0) {
      // Has at least origin and destination, may have waypoints
      return true
    }

    // Check optimized route markers (any markers exist - origin, waypoints, or destination)
    return snappedRoads.routeMarkers.length > 0
  }, [mapMode, individualRoute.points.length, snappedRoads.routeMarkers.length])

  // Get colors based on map type
  const colors = useMemo(() => getColorsForMapType(mapType), [mapType])

  // Layer name mapping
  const layerNameMap: Record<string, string> = {
    "jurisdiction-boundary": "Jurisdiction Boundary",
    "roads-network-tile": "Road Network",
    "saved-routes-tile": "Saved Routes",
    "uploaded-routes": "Uploaded Routes",
    "uploaded-routes-selected": "Uploaded Routes",
    "snapped-roads": "Google Routes",
    "snapped-roads-selected": "Google Routes",
    "selected-route": "Selected Route",
    "selected-route-segments": "Selected Route Segments",
    "selected-route-segments-boundaries": "Segmentation Cuts",
    "segmentation-boundaries": "Segmentation Cuts",
    "individual-preview": "Draft Route",
    "saved-polygons": "Saved Polygons",
    "imported-roads": "Imported Roads",
    "imported-polygon": "Imported Polygon",
    "preview-segments": "Enabled Segments",
    "selected-route-segments-hovered": "Hovered Segments",
    "original-route-dimmed": "Disabled Segments",
    "lasso-selected-roads": "Lasso Selected Roads",
    "road-selection-highlight": "Road Selection",
    "feature-hover-highlight": "Hovered Route",
    "waypoint-markers": "Markers",
    segments: "Segments",
  }

  // Layer color mapping
  const rgbaArrayToCss = ([r, g, b, a]: [
    number,
    number,
    number,
    number,
  ]): string => `rgba(${r}, ${g}, ${b}, ${a / 255})`

  const savedRoutesLegend = useMemo(
    () => [
      {
        label: "Running",
        color: rgbaArrayToCss(colors.routeStatusColors.synced),
      },
      {
        label: "Validating",
        color: rgbaArrayToCss(colors.routeStatusColors.validating),
      },
      {
        label: "Unsynced",
        color: rgbaArrayToCss(colors.routeStatusColors.unsynced),
      },
      {
        label: "Invalid",
        color: rgbaArrayToCss(colors.routeStatusColors.invalid),
      },
    ],
    [colors],
  )

  const importedRoadsLegend = useMemo(() => {
    type LegendItem = {
      label: string
      color: string
      showWhen?: (mode: "single" | "lasso" | "multi-select" | null) => boolean
    }

    const legendItems: LegendItem[] = [
      {
        label: "Imported",
        color: rgbaArrayToCss(
          colors.importedRoadsDefaultColor as [number, number, number, number],
        ),
      },
      {
        label: "Selected",
        color: rgbaArrayToCss(
          colors.importedRoadsSelectedColor as [number, number, number, number],
        ),
      },
      {
        label: "Hovered",
        color: rgbaArrayToCss(
          colors.importedRoadsHoveredColor as [number, number, number, number],
        ),
      },
      {
        label: "Valid for Selection",
        color: rgbaArrayToCss(
          colors.importedRoadsValidColor as [number, number, number, number],
        ),
        showWhen: (mode) => mode === "multi-select",
      },
    ]

    // Filter legend items based on selection mode
    return legendItems
      .filter((item) => {
        if (item.showWhen) {
          return item.showWhen(selectionMode)
        }
        return true
      })
      .map(({ showWhen, ...item }) => ({
        label: item.label,
        color: item.color,
      }))
  }, [colors, selectionMode])

  const segmentsLegend = useMemo(
    () => [
      {
        label: "Running",
        color: rgbaArrayToCss(colors.routeStatusColors.synced),
      },
      {
        label: "Validating",
        color: rgbaArrayToCss(colors.routeStatusColors.validating),
      },
      {
        label: "Unsynced",
        color: rgbaArrayToCss(colors.routeStatusColors.unsynced),
      },
      {
        label: "Invalid",
        color: rgbaArrayToCss(colors.routeStatusColors.invalid),
      },
      {
        label: "Disabled",
        color: rgbaArrayToCss([120, 120, 120, 150] as [
          number,
          number,
          number,
          number,
        ]),
      },
    ],
    [colors],
  )

  const layerColorMap: Record<string, string> = useMemo(
    () => ({
      "jurisdiction-boundary": rgbaArrayToCss(
        colors.jurisdictionBoundaryColor as [number, number, number, number],
      ),
      "roads-network-tile": rgbaArrayToCss(
        colors.roadsNetworkColor as [number, number, number, number],
      ),
      // Saved routes use different colors based on sync status, default to unsynced
      "saved-routes-tile": rgbaArrayToCss(colors.routeStatusColors.unsynced),
      // Uploaded routes colors match route-renderers.ts: uses colors.uploadedRouteColor from getColorsForMapType
      // Roadmap: [234, 179, 8, 255] (#eab308), Satellite: [255, 204, 0, 255] (#ffcc00)
      "uploaded-routes": rgbaArrayToCss(
        colors.uploadedRouteColor as [number, number, number, number],
      ),
      "uploaded-routes-selected": rgbaArrayToCss(
        colors.uploadedRouteColor as [number, number, number, number],
      ),
      // Snapped roads (Google Routes) always use purple color
      "snapped-roads": rgbaArrayToCss(
        colors.polygonRouteColor as [number, number, number, number],
      ),
      "snapped-roads-selected": rgbaArrayToCss(colors.polygonRouteColor),
      "selected-route": rgbaArrayToCss(colors.selectedRouteColor),
      "selected-route-segments": rgbaArrayToCss(colors.selectedRouteColor),
      // Boundaries colors match segment-renderers.ts and route-renderers.ts: light orange [255, 43, 139, 255]
      "selected-route-segments-boundaries": rgbaArrayToCss([
        255, 43, 139, 255,
      ] as [number, number, number, number]),
      "segmentation-boundaries": rgbaArrayToCss([255, 43, 139, 255] as [
        number,
        number,
        number,
        number,
      ]),
      "individual-preview": rgbaArrayToCss(colors.individualPreviewColor),
      "saved-polygons": rgbaArrayToCss(
        colors.jurisdictionBoundaryColor as [number, number, number, number],
      ),
      // Imported roads - default gray color (normal state)
      "imported-roads": rgbaArrayToCss(
        colors.importedRoadsDefaultColor as [number, number, number, number],
      ),
      // Imported polygon uses polygon route color (violet)
      "imported-polygon": rgbaArrayToCss(
        colors.polygonRouteColor as [number, number, number, number],
      ),
      // Preview segments use individual preview color (purple/blue)
      "preview-segments": rgbaArrayToCss(colors.individualPreviewColor),
      // Original route dimmed - gray with transparency
      "original-route-dimmed": rgbaArrayToCss([150, 150, 150, 100] as [
        number,
        number,
        number,
        number,
      ]),
      // Lasso selected roads - teal/green
      "lasso-selected-roads": rgbaArrayToCss([16, 185, 129, 220] as [
        number,
        number,
        number,
        number,
      ]),
      // Road selection highlight - blue
      "road-selection-highlight": rgbaArrayToCss(
        colors.roadSelectionColor as [number, number, number, number],
      ),
      // Feature hover highlight - uses segment hover color
      // Waypoint markers - blue color matching waypoint badges
      "waypoint-markers": rgbaArrayToCss([33, 150, 243, 255] as [
        number,
        number,
        number,
        number,
      ]),
      "feature-hover-highlight": rgbaArrayToCss(
        colors.segmentHoverColor as [number, number, number, number],
      ),
      // Segments category - uses selected route color (blue) to differentiate from draft route
      segments: rgbaArrayToCss(colors.selectedRouteColor),
      // Hovered segments - uses segment hover color
      "selected-route-segments-hovered": rgbaArrayToCss(
        colors.segmentHoverColor as [number, number, number, number],
      ),
    }),
    [colors, mapType],
  )

  const getLayerName = (layerId: string): string =>
    layerNameMap[layerId] || layerId

  const getLayerColor = (layerId: string, originalLayerId?: string): string => {
    // If originalLayerId is provided and it's a selected variant, use that color
    if (originalLayerId && originalLayerId.includes("-selected")) {
      return (
        layerColorMap[originalLayerId] || layerColorMap[layerId] || "#000000"
      )
    }
    return layerColorMap[layerId] || "#000000"
  }

  // Helper to get base layer ID (removes timestamp suffixes for tile layers and handles selected variants)
  const getBaseLayerId = (layerId: string): string => {
    // Handle tile layers with timestamp suffixes (e.g., "saved-routes-tile-t123456")
    if (layerId.startsWith("saved-routes-tile-t")) return "saved-routes-tile"
    if (layerId.startsWith("roads-network-tile-t")) return "roads-network-tile"
    // Handle selected variants - normalize to base layer ID
    if (layerId === "uploaded-routes-selected") return "uploaded-routes"
    if (layerId === "snapped-roads-selected") return "snapped-roads"
    // Handle boundaries layers - keep them as separate layers (must come before selected-route- check)
    if (layerId === "selected-route-segments-boundaries")
      return "selected-route-segments-boundaries"
    if (layerId === "segmentation-boundaries") return "segmentation-boundaries"
    // Handle hovered segments - keep as separate layer (must come before selected-route-segments check)
    if (layerId === "selected-route-segments-hovered")
      return "selected-route-segments-hovered"
    // Handle selected-route-segments - keep as separate layer (must come before general selected-route- check)
    if (layerId === "selected-route-segments") return "selected-route-segments"
    // Handle composite layer sub-IDs (e.g., "selected-route-main", "selected-route-border" -> "selected-route")
    // But exclude boundaries and segments which we handle above
    if (layerId.startsWith("selected-route-")) return "selected-route"
    if (layerId.startsWith("individual-preview-")) return "individual-preview"
    // Handle imported-roads-* variants - normalize to "imported-roads"
    if (layerId.startsWith("imported-roads-")) return "imported-roads"
    // Handle road-selection-* variants - normalize to "road-selection-highlight"
    if (layerId.startsWith("road-selection-")) return "road-selection-highlight"
    return layerId
  }

  // Show only layers that have data (are present in deckLayers)
  const visibleLayers = useMemo(() => {
    // Layers that should only show when they have data OR have been toggled
    const conditionalLayers = new Set([
      "selected-route",
      "selected-route-segments",
      "selected-route-segments-boundaries",
      "segmentation-boundaries",
      "individual-preview",
      "uploaded-routes",
      "imported-roads",
      "imported-polygon",
      "preview-segments",
      "selected-route-segments-hovered",
      "lasso-selected-roads",
      "road-selection-highlight",
      "segments",
      // Note: "waypoint-markers" is NOT a deck layer, so it's not in conditionalLayers
      // It's added separately below based on marker existence
    ])

    const allowedLayers = [
      "jurisdiction-boundary",
      "roads-network-tile",
      "saved-routes-tile",
      "uploaded-routes",
      "snapped-roads",
      "selected-route",
      "selected-route-segments",
      "selected-route-segments-boundaries",
      "segmentation-boundaries",
      "individual-preview",
      "saved-polygons",
      "imported-roads",
      "preview-segments",
      "selected-route-segments-hovered",
      "lasso-selected-roads",
      "road-selection-highlight",
      "segments",
      // Note: "waypoint-markers" is NOT a deck layer, so it's not in allowedLayers
      // It's added separately below based on marker existence
    ]

    // Create a map of existing layers from deckLayers by base ID
    const existingLayersMap = new Map<
      string,
      {
        layer: { id: string; visible?: boolean; [key: string]: unknown }
        layerIdToCheck: string
      }
    >()
    const selectedVariants = new Set<string>()

    // First pass: identify selected variants and map existing layers
    deckLayers.forEach((layer) => {
      const layerIdToCheck =
        (layer as { _parentLayerId?: string; id: string })._parentLayerId ||
        (layer as { id: string }).id
      const baseId = getBaseLayerId(layerIdToCheck)
      if (
        layerIdToCheck.includes("-selected") &&
        allowedLayers.includes(baseId)
      ) {
        selectedVariants.add(baseId)
      }
      // Store the layer by base ID (prioritize selected variants, then any variant for imported-roads)
      if (allowedLayers.includes(baseId)) {
        // For imported-roads, any variant (normal, selected, highlighted, etc.) counts as data
        const isImportedRoadsVariant =
          baseId === "imported-roads" &&
          layerIdToCheck.startsWith("imported-roads-")
        if (
          selectedVariants.has(baseId) &&
          layerIdToCheck.includes("-selected")
        ) {
          existingLayersMap.set(baseId, { layer, layerIdToCheck })
        } else if (isImportedRoadsVariant && !existingLayersMap.has(baseId)) {
          // For imported-roads, store first variant we encounter
          existingLayersMap.set(baseId, { layer, layerIdToCheck })
        } else if (
          !selectedVariants.has(baseId) &&
          !existingLayersMap.has(baseId) &&
          !isImportedRoadsVariant
        ) {
          existingLayersMap.set(baseId, { layer, layerIdToCheck })
        }
      }
    })

    // Get all layer IDs that have been toggled (exist in layerVisibility store)
    // This allows us to show layers even when they're hidden
    const toggledLayerIds = new Set(
      Object.keys(layerVisibility).map((layerId) => getBaseLayerId(layerId)),
    )

    // Create a set of layers that should be shown
    const layersToShow = new Set<string>()

    // For conditional layers (selected-route, individual-preview, uploaded-routes):
    // Only show if they have data OR have been explicitly toggled off (so user can toggle back on)
    // For other layers: show if they have data OR have been toggled
    allowedLayers.forEach((baseId) => {
      const hasData = existingLayersMap.has(baseId)
      const hasBeenToggled = toggledLayerIds.has(baseId)
      const toggleState = layerVisibility[baseId]

      if (conditionalLayers.has(baseId)) {
        // Conditional layers: only show if they have data OR have been explicitly toggled off
        // (If toggled to false, show it so user can toggle back on. If toggled to true but no data, don't show)
        if (hasData || (hasBeenToggled && toggleState === false)) {
          layersToShow.add(baseId)
        }
      } else {
        // Other layers: show if they have data OR have been toggled
        if (hasData || hasBeenToggled) {
          layersToShow.add(baseId)
        }
      }
    })

    // Return layers in the order defined by allowedLayers, filtering to only show layers that have data OR have been toggled
    const baseLayers = allowedLayers
      .filter((baseId) => layersToShow.has(baseId))
      .map((baseId) => {
        const existing = existingLayersMap.get(baseId)
        const layerIdToCheck = existing?.layerIdToCheck || baseId

        // Check store visibility state, fall back to layer's default visibility
        const storeVisibility = layerVisibility[baseId]
        // If explicitly set in store, use that value (true or false)
        // If not in store (undefined), use layer's default visibility or true if no layer exists
        const isVisible =
          storeVisibility !== undefined
            ? storeVisibility
            : existing?.layer?.visible !== false

        if (existing) {
          const { id: originalId, ...restLayerData } = existing.layer
          return {
            ...restLayerData,
            id: baseId,
            _originalId: originalId,
            _originalLayerId: layerIdToCheck,
            visible: isVisible,
          }
        } else {
          // Layer was toggled but not currently in deckLayers (hidden)
          return {
            id: baseId,
            _originalId: baseId,
            _originalLayerId: layerIdToCheck,
            visible: isVisible,
          }
        }
      })

    // Add hovered layers if they exist
    const hoveredLayers: Array<{
      id: string
      _originalId?: string
      _originalLayerId?: string
      visible: boolean
    }> = []

    // Always show feature hover highlight layer if saved routes exist
    // (Show it all the time to avoid glitchy UI when hovering)
    const hasSavedRoutes = baseLayers.some((l) => l.id === "saved-routes-tile")
    if (hasSavedRoutes) {
      const storeVisibility = layerVisibility["feature-hover-highlight"]
      const isVisible = storeVisibility !== undefined ? storeVisibility : true
      hoveredLayers.push({
        id: "feature-hover-highlight",
        _originalId: "feature-hover-highlight",
        _originalLayerId: "saved-routes-tile",
        visible: isVisible,
      })
    }

    // Note: Imported roads hovered state (hoveredRoadId) is already shown
    // in the imported-roads layer itself, so no separate layer needed

    // Add waypoint markers layer if markers exist
    const waypointMarkersLayer: Array<{
      id: string
      _originalId?: string
      _originalLayerId?: string
      visible: boolean
    }> = []

    if (hasWaypointMarkers) {
      const storeVisibility = layerVisibility["waypoint-markers"]
      const isVisible = storeVisibility !== undefined ? storeVisibility : true

      waypointMarkersLayer.push({
        id: "waypoint-markers",
        _originalId: "waypoint-markers",
        _originalLayerId: "waypoint-markers",
        visible: isVisible,
      })
    }

    // Check if segment-related layers exist to create "segments" parent category
    // Check both baseLayers and deckLayers (hovered segments might be in deckLayers but not baseLayers)
    // Note: Boundaries are NOT included in segments category - they appear as separate top-level entries
    const hasPreviewSegments = baseLayers.some(
      (l) => l.id === "preview-segments",
    )
    const hasSelectedRouteSegments = baseLayers.some(
      (l) => l.id === "selected-route-segments",
    )
    // Check deckLayers directly for hovered segments (they might not be in baseLayers)
    const hasHoveredSegments =
      baseLayers.some((l) => l.id === "selected-route-segments-hovered") ||
      deckLayers.some(
        (layer) =>
          (layer as { id?: string }).id === "selected-route-segments-hovered",
      )

    // Create segments parent category if any segment-related layers exist (excluding boundaries)
    // Boundaries (Cuts) are shown as separate top-level entries
    const segmentsCategoryLayer: Array<{
      id: string
      _originalId?: string
      _originalLayerId?: string
      visible: boolean
    }> = []

    // Check if we have segment layers (excluding boundaries)
    const hasSegmentLayers =
      hasPreviewSegments || hasSelectedRouteSegments || hasHoveredSegments

    // Check if selected-route exists - if it does, don't show segments category
    // (segments are shown as part of the selected route, not as a separate category)
    const hasSelectedRoute = baseLayers.some((l) => l.id === "selected-route")

    // Always add selected-route-segments-hovered layer if selected-route-segments exists
    // (Show it all the time when any segmented route is selected, not just on hover)
    if (hasSelectedRouteSegments) {
      // Check if it's already in baseLayers (might be filtered out)
      const hoveredSegmentsInBase = baseLayers.find(
        (l) => l.id === "selected-route-segments-hovered",
      )
      if (!hoveredSegmentsInBase) {
        // Add it to hoveredLayers so it always appears
        const storeVisibility =
          layerVisibility["selected-route-segments-hovered"]
        const isVisible = storeVisibility !== undefined ? storeVisibility : true
        hoveredLayers.push({
          id: "selected-route-segments-hovered",
          _originalId: "selected-route-segments-hovered",
          _originalLayerId: "selected-route-segments",
          visible: isVisible,
        })
      }
    }

    // Only create segments category if we have segment layers AND no selected route
    // (When a route is selected, segments are part of that route, not a separate category)
    if (hasSegmentLayers && !hasSelectedRoute) {
      // Check visibility - segments category is visible if any child layer is visible
      // (excluding boundaries which are separate)
      const enabledVisible =
        (hasPreviewSegments &&
          baseLayers.find((l) => l.id === "preview-segments")?.visible) ||
        (hasSelectedRouteSegments &&
          baseLayers.find((l) => l.id === "selected-route-segments")
            ?.visible) ||
        false
      const hoveredSegmentsLayer =
        baseLayers.find((l) => l.id === "selected-route-segments-hovered") ||
        hoveredLayers.find((l) => l.id === "selected-route-segments-hovered")
      const hoveredVisible =
        (hasHoveredSegments || hasSelectedRouteSegments) && // Always consider hovered segments if segments exist
        (hoveredSegmentsLayer?.visible ?? true) // Default to true if it exists

      const storeVisibility = layerVisibility["segments"]
      const isVisible =
        storeVisibility !== undefined
          ? storeVisibility
          : enabledVisible || hoveredVisible

      segmentsCategoryLayer.push({
        id: "segments",
        _originalId: "segments",
        _originalLayerId: "segments",
        visible: isVisible,
      })

      // Filter out individual segment layers from baseLayers (they'll be shown as sub-items)
      // BUT keep boundaries as separate top-level entries
      const filteredBaseLayers = baseLayers.filter(
        (l) =>
          l.id !== "preview-segments" &&
          l.id !== "selected-route-segments" &&
          l.id !== "selected-route-segments-hovered",
      )

      return [
        ...filteredBaseLayers,
        ...segmentsCategoryLayer,
        ...hoveredLayers,
        ...waypointMarkersLayer,
      ]
    }

    return [...baseLayers, ...hoveredLayers, ...waypointMarkersLayer]
  }, [deckLayers, layerVisibility, hoveredFeature, hasWaypointMarkers])

  return {
    isLayersExpanded,
    setIsLayersExpanded,
    expandedSavedRoutes,
    setExpandedSavedRoutes,
    visibleLayers,
    savedRoutesLegend,
    importedRoadsLegend,
    segmentsLegend,
    getLayerName,
    getLayerColor,
    getBaseLayerId,
    toggleLayerVisibility,
  }
}
