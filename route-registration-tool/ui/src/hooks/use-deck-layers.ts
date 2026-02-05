import { useCallback, useMemo } from "react"

import { useLayerStore } from "../stores/layer-store"
import { FEATURE_HOVER_MIN_ZOOM } from "../stores/layer-store/constants"
import { createLassoSelectedRoadsLayer } from "../stores/layer-store/renderers/drawing-renderers"
import { createFeatureHoverHighlightLayer } from "../stores/layer-store/renderers/drawing-renderers"
import { createJurisdictionBoundaryLayer } from "../stores/layer-store/renderers/drawing-renderers"
import { createImportedRoadsLayers } from "../stores/layer-store/renderers/imported-roads-renderer"
import { createRoadSelectionLayer } from "../stores/layer-store/renderers/road-renderers"
import { createSavedRoutesLayer } from "../stores/layer-store/renderers/route-renderers"
import { createSelectedRouteLayer } from "../stores/layer-store/renderers/route-renderers"
import { createSelectedRouteSegmentsLayer } from "../stores/layer-store/renderers/route-renderers"
import { createIndividualPreviewLayer } from "../stores/layer-store/renderers/route-renderers"
import { createUploadedRoutesLayer } from "../stores/layer-store/renderers/route-renderers"
import { createSnappedRoadsLayer } from "../stores/layer-store/renderers/route-renderers"
import { createSegmentationLayers } from "../stores/layer-store/renderers/segment-renderers"
import { useProjectWorkspaceStore } from "../stores/project-workspace-store"
import { useUserPreferencesStore } from "../stores/user-preferences-store"
import { useRouteSelection } from "./use-route-selection"

export function useDeckLayers(projectId: string) {
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const mapType = useProjectWorkspaceStore((state) => state.mapType)
  const selectedRoute = useProjectWorkspaceStore((state) => state.selectedRoute)
  const showSelectedRouteSegments = useProjectWorkspaceStore(
    (state) => state.showSelectedRouteSegments,
  )
  const { selectRouteWithNavigation } = useRouteSelection()
  const projectData = useProjectWorkspaceStore((state) => state.projectData)
  const boundaryGeoJson = projectData?.boundaryGeoJson
  const projectIdForBoundary = projectData?.id // Use project ID as stable dependency

  const roadSelection = useLayerStore((state) => state.roadSelection)
  const roadImport = useLayerStore((state) => state.roadImport)
  const individualRoute = useLayerStore((state) => state.individualRoute)
  const lassoDrawing = useLayerStore((state) => state.lassoDrawing)
  const segmentation = useLayerStore((state) => state.segmentation)
  const uploadedRoutes = useLayerStore((state) => state.uploadedRoutes)
  const snappedRoads = useLayerStore((state) => state.snappedRoads)
  const hoveredFeature = useLayerStore((state) => state.hoveredFeature)
  const currentZoom = useLayerStore((state) => state.currentZoom)
  const showTileLayerArrows = useLayerStore(
    (state) => state.showTileLayerArrows,
  )
  // console.log("currentZoom: ", currentZoom)
  const selectedRouteHoveredSegmentId = useLayerStore(
    (state) => state.selectedRouteHoveredSegmentId,
  )
  const setSelectedRouteHoveredSegmentId = useLayerStore(
    (state) => state.setSelectedRouteHoveredSegmentId,
  )
  const selectedRouteHovered = useLayerStore(
    (state) => state.selectedRouteHovered,
  )
  const setSelectedRouteHovered = useLayerStore(
    (state) => state.setSelectedRouteHovered,
  )
  const selectedUploadedRouteId = useLayerStore(
    (state) => state.selectedUploadedRouteId,
  )
  const roadsTilesTimestamp = useLayerStore(
    (state) => state.roadsTilesTimestamp,
  )
  const routesTilesTimestamp = useLayerStore(
    (state) => state.routesTilesTimestamp,
  )
  const refreshTrigger = useLayerStore((state) => state.refreshTrigger)
  const routesTileCache = useLayerStore((state) => state.routesTileCache)
  const selectedRoadPriorities = useLayerStore(
    (state) => state.selectedRoadPriorities,
  )
  const routeColorMode = useUserPreferencesStore(
    (state) => state.routeColorMode,
  )
  // Subscribe to layerVisibility reactively
  type LayerStoreState = ReturnType<typeof useLayerStore.getState>
  const layerVisibility = useLayerStore((state: LayerStoreState) => {
    return (
      (state as { layerVisibility?: Record<string, boolean> })
        .layerVisibility ?? {}
    )
  }) as Record<string, boolean>

  const handleRouteClick = useCallback(
    async (routeId: string) => {
      console.log("🗺️ [handleRouteClick] START - Route clicked from map:", {
        routeId,
        timestamp: new Date().toISOString(),
      })

      // Check if this route is already selected
      const currentSelectedRoute =
        useProjectWorkspaceStore.getState().selectedRoute

      console.log("🗺️ [handleRouteClick] Current selection state:", {
        currentSelectedRouteId: currentSelectedRoute?.id,
        clickedRouteId: routeId,
        isAlreadySelected: currentSelectedRoute?.id === routeId,
      })

      if (currentSelectedRoute?.id === routeId) {
        console.log(
          "📍 [handleRouteClick] Route already selected, showing toast:",
          routeId,
        )
        // Show toast to inform user this route is already selected
        const { toast } = await import("../utils/toast")
        toast.info("This route is already selected")
        console.log("📍 [handleRouteClick] Toast shown, returning early")
        return
      }

      console.log(
        "✅ [handleRouteClick] Route is different, proceeding with selection",
      )
      // Use the shared route selection logic for consistent behavior
      // This ensures map clicks work exactly like panel clicks:
      // - Full-screen loader
      // - Route fetching with geometry check
      // - Navigation
      // - Layer rendering
      await selectRouteWithNavigation(routeId, { source: "map" })
      console.log("✅ [handleRouteClick] Selection completed")
    },
    [selectRouteWithNavigation],
  )

  // Subscribe directly to segments state with lightweight key to ensure reactivity
  // Use lightweight hash instead of JSON.stringify for performance
  const selectedRouteSegmentsKey = useProjectWorkspaceStore((state) => {
    if (
      !state.selectedRoute?.segments ||
      state.selectedRoute.segments.length === 0
    ) {
      return null
    }
    const segments = state.selectedRoute.segments
    const segmentCount = segments.length
    const enabledCount = segments.filter((s) => s.is_enabled !== false).length
    const firstUuid = segments[0]?.uuid || ""
    const lastUuid = segments[segments.length - 1]?.uuid || ""
    const key = `${segmentCount}-${enabledCount}-${firstUuid}-${lastUuid}`
    console.log("🔑 [useDeckLayers] Segments key from store:", {
      key,
      segmentsCount: segmentCount,
    })
    return key
  })

  const layers = useMemo(() => {
    const result: any[] = []
    // Store hovered segments separately to add at the end
    const hoveredSegmentsLayers: any[] = []
    // Store boundaries layer separately to add at the end, but before hovered segments
    const boundariesLayerToRender: any[] = []

    // Add jurisdiction boundary layer first (renders behind other features)
    const boundaryLayer = createJurisdictionBoundaryLayer(
      boundaryGeoJson,
      mapType,
    )
    if (boundaryLayer) result.push(boundaryLayer)

    // const roadsNetworkLayer = createRoadsNetworkLayer(
    //   projectId,
    //   roadsTilesTimestamp,
    //   selectedRoadPriorities,
    //   currentZoom,
    //   showTileLayerArrows,
    // )
    // if (roadsNetworkLayer) result.push(roadsNetworkLayer)

    // Hide route layers when in road_selection mode
    if (mapMode !== "road_selection") {
      const savedRoutesLayer = createSavedRoutesLayer(
        projectId,
        routesTilesTimestamp,
        refreshTrigger,
        routesTileCache,
        handleRouteClick,
        currentZoom,
        showTileLayerArrows,
        routeColorMode,
        mapType,
      )
      if (savedRoutesLayer) result.push(savedRoutesLayer)
    }

    // Hide selected route layers when in road_selection mode
    if (mapMode !== "road_selection") {
      if (showSelectedRouteSegments) {
        // Don't show saved route segments when segmentation is active
        // (new preview segments will be shown instead via segmentation layers)
        if (!segmentation.isActive) {
          const segLayers = createSelectedRouteSegmentsLayer(
            selectedRoute,
            selectedRouteHoveredSegmentId,
            currentZoom,
            mapType,
            undefined, // viewportBounds - optional, can be implemented later for viewport culling
            setSelectedRouteHoveredSegmentId, // onSegmentHover callback
          )
          if (segLayers && segLayers.length > 0) {
            // Separate hovered segments from non-hovered segments and extract boundaries
            const boundariesLayer = segLayers.find(
              (l) => l.id === "selected-route-segments-boundaries",
            )
            const nonHoveredLayers = segLayers.filter(
              (l) =>
                l.id !== "selected-route-segments-hovered" &&
                l.id !== "selected-route-segments-hovered-border" &&
                l.id !== "selected-route-segments-arrows-hovered" &&
                l.id !== "selected-route-segments-arrows-hovered-border" &&
                l.id !== "selected-route-segments-boundaries", // Exclude boundaries here (handled separately)
            )
            const hoveredLayers = segLayers.filter(
              (l) =>
                l.id === "selected-route-segments-hovered" ||
                l.id === "selected-route-segments-hovered-border" ||
                l.id === "selected-route-segments-arrows-hovered" ||
                l.id === "selected-route-segments-arrows-hovered-border",
            )
            result.push(...nonHoveredLayers)
            // Store hovered segments to add at the end
            // Always add hovered segments layer (even if empty) so it's always visible in the legend
            hoveredSegmentsLayers.push(...hoveredLayers)
            // Store boundaries layer to add at the end, but before hovered segments
            if (boundariesLayer) {
              boundariesLayerToRender.push(boundariesLayer)
            }
          }
        }
      } else {
        const selectedRouteLayer = createSelectedRouteLayer(
          selectedRoute,
          currentZoom,
          mapType,
          selectedRouteHovered, // Pass hover state
          (routeId) => setSelectedRouteHovered(routeId === selectedRoute?.id), // Pass hover handler
        )
        if (selectedRouteLayer) result.push(selectedRouteLayer)
      }
    }

    if (!segmentation.isActive || segmentation.previewSegments.length === 0) {
      const individualPreviewLayer = createIndividualPreviewLayer(
        individualRoute.generatedRoute,
        mapType,
      )
      if (individualPreviewLayer) result.push(individualPreviewLayer)
    }

    // Polygon drawing layer removed - Terra Draw handles visualization

    if (
      mapMode === "lasso_selection" &&
      lassoDrawing.selectedRoads.length > 0
    ) {
      const lassoLayer = createLassoSelectedRoadsLayer(
        lassoDrawing.selectedRoads,
        currentZoom,
        mapType,
      )
      if (lassoLayer) result.push(lassoLayer)
    }

    if (roadSelection.highlightedRoads.length > 0) {
      const roadSelectionLayers = createRoadSelectionLayer(
        roadSelection.highlightedRoads,
        currentZoom,
        mapType,
      )
      if (roadSelectionLayers) {
        if (Array.isArray(roadSelectionLayers)) {
          result.push(...roadSelectionLayers)
        } else {
          result.push(roadSelectionLayers)
        }
      }
    }

    // When editing a route, only show the selected route
    const isEditingRoute = mapMode === "editing_uploaded_route"
    const routesToShow =
      isEditingRoute && selectedUploadedRouteId
        ? uploadedRoutes.routes.filter((r) => r.id === selectedUploadedRouteId)
        : uploadedRoutes.routes

    const uploadedRoutesLayers = createUploadedRoutesLayer(
      routesToShow,
      selectedUploadedRouteId,
      uploadedRoutes.isVisible,
      mapType,
    )
    if (uploadedRoutesLayers) {
      if (Array.isArray(uploadedRoutesLayers)) {
        const nonSelectedLayers = uploadedRoutesLayers.filter(
          (l) => l.id !== "uploaded-routes-selected",
        )
        const selectedLayers = uploadedRoutesLayers.filter(
          (l) => l.id === "uploaded-routes-selected",
        )
        result.push(...nonSelectedLayers)
        result.push(...selectedLayers)
      } else {
        result.push(uploadedRoutesLayers)
      }
    }

    // Use preview roads for selected route when editing, otherwise use regular roads
    const roadsToShow =
      isEditingRoute && selectedUploadedRouteId
        ? (() => {
            // Check if there are preview roads for the selected route
            const previewRoadsForRoute = snappedRoads.previewRoads.filter(
              (road) => road.uploadedRouteId === selectedUploadedRouteId,
            )
            // If preview roads exist, use them; otherwise use regular roads for this route only
            if (previewRoadsForRoute.length > 0) {
              return previewRoadsForRoute
            }
            // If no preview roads, show regular roads for selected route only
            return snappedRoads.roads.filter(
              (road) => road.uploadedRouteId === selectedUploadedRouteId,
            )
          })()
        : snappedRoads.roads

    const snappedRoadsLayers = createSnappedRoadsLayer(
      roadsToShow,
      selectedUploadedRouteId,
      snappedRoads.hoveredRouteId,
      snappedRoads.isVisible,
      mapType,
    )
    if (snappedRoadsLayers) {
      if (Array.isArray(snappedRoadsLayers)) {
        const nonSelectedLayers = snappedRoadsLayers.filter(
          (l) => l.id !== "snapped-roads-selected",
        )
        const selectedLayers = snappedRoadsLayers.filter(
          (l) => l.id === "snapped-roads-selected",
        )
        // When editing, only show selected layer, hide non-selected
        if (isEditingRoute) {
          result.push(...selectedLayers)
        } else {
          result.push(...nonSelectedLayers)
          result.push(...selectedLayers)
        }
      } else {
        result.push(snappedRoadsLayers)
      }
    }

    const segmentationLayers = createSegmentationLayers(
      segmentation.targetRoute,
      segmentation.isActive,
      segmentation.previewSegments,
      segmentation.hoveredSegmentId,
      segmentation.selectedSegmentIds,
      mapType,
      currentZoom,
    )
    // Separate hovered preview segments from non-hovered segments
    if (segmentationLayers.length > 0) {
      const previewHoveredLayer = segmentationLayers.find(
        (l) => l.id === "preview-segments-hovered",
      )
      const nonHoveredSegmentationLayers = segmentationLayers.filter(
        (l) => l.id !== "preview-segments-hovered",
      )
      result.push(...nonHoveredSegmentationLayers)
      // Store hovered preview segments to add at the end
      if (previewHoveredLayer) {
        hoveredSegmentsLayers.push(previewHoveredLayer)
      }
    }

    // Add imported roads layers if available
    if (roadImport.importedRoads || roadImport.importedPolygon) {
      const selectedRoadPriorities =
        useLayerStore.getState().selectedRoadPriorities
      const importedRoadsLayers = createImportedRoadsLayers(
        roadImport.importedRoads,
        roadImport.importedPolygon,
        roadImport,
        currentZoom,
        selectedRoadPriorities,
        mapType,
      )
      result.push(...importedRoadsLayers)
    }

    // Helper to get base layer ID for visibility check
    const getBaseLayerIdForVisibility = (layerId: string): string => {
      if (layerId.startsWith("saved-routes-tile-t")) return "saved-routes-tile"
      if (layerId.startsWith("roads-network-tile-t"))
        return "roads-network-tile"
      if (layerId === "uploaded-routes-selected") return "uploaded-routes"
      if (layerId === "snapped-roads-selected") return "snapped-roads"
      // Handle imported-roads-* variants - normalize to "imported-roads"
      if (layerId.startsWith("imported-roads-")) return "imported-roads"
      // Handle segment-related layers - keep them separate from selected-route
      if (layerId === "selected-route-segments")
        return "selected-route-segments"
      if (layerId === "selected-route-segments-boundaries")
        return "selected-route-segments-boundaries"
      if (layerId === "selected-route-segments-hovered")
        return "selected-route-segments-hovered"
      if (layerId === "segmentation-boundaries")
        return "segmentation-boundaries"
      if (layerId === "preview-segments") return "preview-segments"
      // Handle selected-route-* variants - but exclude segments which are handled above
      if (layerId.startsWith("selected-route-")) return "selected-route"
      return layerId
    }

    // Filter and flatten all layers first
    const allLayers = result
      .filter((layer) => layer !== null && layer !== undefined)
      .filter((layer) => {
        // First check the layer's own visible property
        if (layer.visible === false) return false

        // Then check the layerVisibility store
        if (layerVisibility) {
          const baseId = getBaseLayerIdForVisibility(layer.id)
          const storeVisibility = layerVisibility[baseId]
          // If explicitly set in store, use that value
          if (storeVisibility !== undefined) {
            return storeVisibility
          }
        }

        // Default to visible if not explicitly hidden
        return true
      })
      .flatMap((layer) =>
        Array.isArray(layer.layer) ? layer.layer : [layer.layer],
      )

    // Add hover highlight layer at the very end to ensure it renders on top of all routes
    const hoverAllowed =
      mapMode === "view" && (currentZoom ?? 0) >= FEATURE_HOVER_MIN_ZOOM
    if (hoverAllowed && hoveredFeature) {
      const hoverHighlightLayer = createFeatureHoverHighlightLayer(
        hoveredFeature,
        currentZoom,
        mapType,
      )
      if (hoverHighlightLayer) {
        // Flatten the hover layer (it may contain multiple layers) and add to the end
        const hoverLayers = Array.isArray(hoverHighlightLayer.layer)
          ? hoverHighlightLayer.layer
          : [hoverHighlightLayer.layer]
        allLayers.push(...hoverLayers)
      }
    }

    // Add boundaries layer at the very end, before hovered segments, to ensure it's always on top of non-hovered routes
    if (boundariesLayerToRender.length > 0) {
      const flattenedBoundaries = boundariesLayerToRender
        .filter((layer) => layer !== null && layer !== undefined)
        .filter((layer) => {
          // First check the layer's own visible property
          if (layer.visible === false) {
            console.warn(
              "🔍 [useDeckLayers] Boundaries layer has visible=false",
              { layerId: layer.id },
            )
            return false
          }
          // Then check the layerVisibility store
          if (layerVisibility) {
            const baseId = getBaseLayerIdForVisibility(layer.id)
            const storeVisibility = layerVisibility[baseId]
            // If explicitly set in store, use that value
            if (storeVisibility !== undefined) {
              return storeVisibility
            }
          }
          // Default to visible if not explicitly hidden
          return true
        })
        .flatMap((layer) =>
          Array.isArray(layer.layer) ? layer.layer : [layer.layer],
        )
      allLayers.push(...flattenedBoundaries)
    }

    // Add hovered segments layers at the very end (after hover highlight and boundaries) to ensure they render on top
    if (hoveredSegmentsLayers.length > 0) {
      const hoveredSegmentsFlattened = hoveredSegmentsLayers
        .filter((layer) => layer !== null && layer !== undefined)
        .filter((layer) => {
          // First check the layer's own visible property
          if (layer.visible === false) return false
          // Default to visible if not explicitly hidden
          return true
        })
        .flatMap((layer) =>
          Array.isArray(layer.layer) ? layer.layer : [layer.layer],
        )
      allLayers.push(...hoveredSegmentsFlattened)
    }

    return allLayers
  }, [
    projectId,
    mapType,
    roadsTilesTimestamp,
    routesTilesTimestamp,
    refreshTrigger,
    routesTileCache,
    selectedRoadPriorities,
    showSelectedRouteSegments,
    selectedRoute,
    selectedRouteSegmentsKey, // Add this to force re-render when segments change
    selectedRouteHoveredSegmentId,
    selectedRouteHovered, // Add this to force re-render when non-segmented route hover state changes
    individualRoute.generatedRoute,
    lassoDrawing.selectedRoads,
    mapMode,
    roadSelection.highlightedRoads,
    uploadedRoutes.routes,
    uploadedRoutes.isVisible,
    selectedUploadedRouteId,
    snappedRoads.roads,
    snappedRoads.previewRoads,
    snappedRoads.isVisible,
    snappedRoads.hoveredRouteId,
    segmentation.targetRoute,
    segmentation.isActive,
    segmentation.previewSegments,
    segmentation.hoveredSegmentId,
    segmentation.selectedSegmentIds,
    hoveredFeature,
    showTileLayerArrows,
    handleRouteClick,
    projectIdForBoundary, // Use project ID as stable dependency - boundary only changes with project
    layerVisibility, // Add layerVisibility to dependencies so layers update when visibility changes
    routeColorMode, // Add routeColorMode to dependencies so layers update when color mode changes
    // Road import dependencies
    roadImport.importedRoads,
    roadImport.importedPolygon,
    roadImport.panelRoutes.length,
    roadImport.hoveredRoadId,
    roadImport.selectionMode,
    roadImport.lassoFilteredRoadIds?.length,
    roadImport.lassoSelectedPriorities,
    currentZoom, // Add currentZoom for arrow generation
  ])

  return layers
}
