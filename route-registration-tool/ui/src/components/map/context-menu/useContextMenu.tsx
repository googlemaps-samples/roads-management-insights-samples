// ui/src/components/map/context-menu/useContextMenu.tsx
import { GoogleMapsOverlay } from "@deck.gl/google-maps"
import { useCallback, useEffect, useState } from "react"

import { useLayerStore } from "../../../stores/layer-store"
import { FEATURE_HOVER_MIN_ZOOM } from "../../../stores/layer-store/constants"
import { useProjectWorkspaceStore } from "../../../stores/project-workspace-store"
import { formatRelativeDate } from "../../../utils/clipboard"
import { canAddRoadToRoute } from "../../../utils/multi-select-route"
import { toast } from "../../../utils/toast"

// Picked feature with display information
export interface PickedFeature {
  layerId: string // 'roads-network-tile', 'saved-routes', etc.
  layerType: string // 'GeoJsonLayer', 'TileLayer'
  object: any // The actual feature object with properties
  displayInfo: {
    icon: string // '🛣️', '🛤️', '📐'
    title: string // 'Road #12345', 'Route: Main Highway'
    subtitle: string // 'Length: 2.3 km', 'Distance: 5.2 km'
  }
  polyline?: any // The actual polyline object
}

interface ContextMenuState {
  x: number
  y: number
  stage: "feature-selection" | "feature-menu"
  isRightClick?: boolean // Indicates if menu was opened via right-click

  // For multiple features
  features?: PickedFeature[]

  // For single selected feature
  selectedFeature?: PickedFeature
}

interface UseContextMenuProps {
  deckOverlayRef: React.RefObject<GoogleMapsOverlay | null>
  mapElementId?: string
  mapMode?: string
  getZoom?: () => number | undefined
}

// Helper to normalize layer ID (remove version suffix for matching)
// e.g., "roads-network-tile-v2" or "roads-network-tile-t1234567890" -> "roads-network-tile"
const normalizeLayerId = (layerId: string): string => {
  // Normalize imported-roads-* layers to "imported-roads"
  if (layerId?.startsWith("imported-roads-")) {
    return "imported-roads"
  }
  // Remove version/timestamp suffix pattern: -v{number} or -t{number}
  return layerId.replace(/-[vt]\d+$/, "")
}

// Helper to get display info based on layer type
const getDisplayInfo = (
  layerId: string,
  properties: any,
): PickedFeature["displayInfo"] => {
  const normalizedId = normalizeLayerId(layerId)

  switch (normalizedId) {
    case "roads-network-tile":
    case "roads-network":
    case "imported-roads":
      return {
        icon: "🛣️",
        title:
          properties.name ||
          `Road #${properties.road_id || properties.id || "Unknown"}`,
        subtitle: properties.distance_km
          ? `Length: ${properties.distance_km.toFixed(2)} km`
          : properties.priority
            ? `Priority: ${properties.priority}`
            : "Road segment",
      }

    case "saved-routes-tile":
    case "saved-routes":
      return {
        icon: "🛤️",
        title: properties.name || `Route #${properties.id}`,
        subtitle: properties.distance
          ? `Distance: ${(properties.distance / 1000).toFixed(2)} km`
          : "Saved route",
      }

    case "saved-polygons":
      return {
        icon: "📐",
        title: `Polygon #${properties.id || "Unknown"}`,
        subtitle: properties.created_at
          ? `Created: ${formatRelativeDate(properties.created_at)}`
          : "Saved polygon",
      }

    case "preview-segments":
      return {
        icon: "✂️",
        title: `Segment ${properties.segmentOrder || ""}`,
        subtitle: properties.distance
          ? `Distance: ${properties.distance.toFixed(2)} km`
          : "Segmentation preview",
      }

    default:
      return {
        icon: "📍",
        title: "Feature",
        subtitle: `ID: ${properties.id || "Unknown"}`,
      }
  }
}

export const useContextMenu = ({
  deckOverlayRef,
  mapElementId = "main-map",
  mapMode,
  getZoom,
}: UseContextMenuProps) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const roadImport = useLayerStore((state) => state.roadImport)
  const toggleSelectedRoad = useLayerStore((state) => state.toggleSelectedRoad)
  const selectedRoute = useProjectWorkspaceStore((state) => state.selectedRoute)
  const setSelectionMode = useLayerStore((state) => state.setSelectionMode)
  const addRoadToMultiSelect = useLayerStore(
    (state) => state.addRoadToMultiSelect,
  )
  const initializeRouteInMaking = useLayerStore(
    (state) => state.initializeRouteInMaking,
  )
  const addRoadToRouteInMaking = useLayerStore(
    (state) => state.addRoadToRouteInMaking,
  )

  // Minimum zoom level to enable left-click context menu in view mode
  const MIN_ZOOM_FOR_LEFT_CLICK = FEATURE_HOVER_MIN_ZOOM

  // Shared function to handle feature picking and menu opening
  const handleFeaturePick = useCallback(
    (e: MouseEvent, isRightClick: boolean = false) => {
      if (isRightClick) {
        e.preventDefault()
      }

      // Check if we have access to the deck.gl overlay
      if (!deckOverlayRef.current) {
        console.warn("Deck.gl overlay not ready")
        return
      }

      const mapElement = document.getElementById(mapElementId)
      if (!mapElement) return

      try {
        // Get the bounding rectangle of the map element
        const rect = mapElement.getBoundingClientRect()

        // Calculate mouse position relative to the map canvas
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        // Access the internal deck instance (GoogleMapsOverlay wraps Deck)
        // @ts-ignore - _deck is a private property but we need to access it
        const deckInstance = deckOverlayRef.current._deck

        if (!deckInstance) {
          console.warn("Deck instance not found")
          return
        }

        const pickMultipleObjectsInfo = deckInstance.pickMultipleObjects({
          x: x,
          y: y,
          radius: 10,
        })

        console.log("Multiple objects picked:", pickMultipleObjectsInfo)

        // Filter and transform picked objects into feature list with display info
        const features: PickedFeature[] = pickMultipleObjectsInfo
          .filter((info: any) => {
            // Only include features with properties and valid layer info
            // ⚡ FILTER OUT ARROWS from context menu picks
            return (
              info.object?.properties &&
              info.layer?.id &&
              info.layer?.constructor?.name &&
              info.object?.properties?.type !== "direction_arrow" &&
              getDisplayInfo(info.layer.id, info.object.properties).title !==
                "Feature"
            )
          })
          .map((info: any) => {
            console.log("info to send in PickedFeature[] : ", info)
            const layerId = info.layer.id
            const layerType = info.layer.constructor.name
            const properties = info.object.properties
            const polyline = info.object.geometry.coordinates

            return {
              layerId,
              layerType,
              object: properties,
              displayInfo: getDisplayInfo(layerId, properties),
              polyline,
            }
          })

        console.log(
          "🔍 All features before filtering:",
          features.map((f) => ({
            layerId: f.layerId,
            roadId: f.object?.road_id,
          })),
        )

        console.log("✨ Processed features:", features)

        // Only open menu if features are detected
        if (features.length === 0) {
          console.log("❌ No valid features found under cursor")
          return
        }

        // Handle road_selection mode with different selection modes
        if (mapMode === "road_selection") {
          const selectionMode = roadImport.selectionMode || "single" // Default to single if not set

          // Filter to only imported roads (exclude arrows and other non-road features)
          const importedRoadFeatures = features.filter((f) => {
            const normalizedId = normalizeLayerId(f.layerId)
            const isImportedRoad = normalizedId === "imported-roads"
            return isImportedRoad
          })

          // Right-click: Always show menu with stretch option (even for 1 feature)
          if (isRightClick) {
            if (importedRoadFeatures.length > 0) {
              if (importedRoadFeatures.length === 1) {
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  stage: "feature-menu",
                  selectedFeature: importedRoadFeatures[0],
                  isRightClick: true,
                })
              } else {
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  stage: "feature-selection",
                  features: importedRoadFeatures,
                  isRightClick: true,
                })
              }
              return
            }
            // Fall through to show menu for non-imported roads
          } else {
            // Left-click: Mode-specific behavior
            // Auto-set to single mode if no selection mode is active (default behavior)
            if (!selectionMode) {
              console.warn(
                "⚠️ No selection mode active. Defaulting to single select mode.",
              )
              setSelectionMode("single")
              // Continue with single mode behavior below
            }
            const effectiveSelectionMode = selectionMode || "single"
            if (effectiveSelectionMode === "multi-select") {
              // Multi-select mode: continuous path logic
              if (importedRoadFeatures.length === 1) {
                const feature = importedRoadFeatures[0]
                const roadId =
                  feature.object?.road_id?.toString() ||
                  feature.object?.properties?.road_id?.toString() ||
                  feature.object?.id?.toString() ||
                  feature.object?.properties?.id?.toString()
                if (roadId) {
                  // Check if routeInMaking exists
                  if (!roadImport.routeInMaking) {
                    // First click: Initialize routeInMaking
                    console.log(
                      "✅ Multi-select: Initializing routeInMaking with road:",
                      roadId,
                    )
                    initializeRouteInMaking(roadId)
                    return // Don't show menu
                  } else {
                    // Subsequent clicks: Check if road can be added
                    if (!roadImport.importedRoads) {
                      return
                    }
                    const validation = canAddRoadToRoute(
                      roadId,
                      roadImport.routeInMaking,
                      roadImport.importedRoads,
                    )
                    if (validation.canAdd && validation.position) {
                      console.log(
                        `✅ Multi-select: Adding road ${roadId} to ${validation.position} of routeInMaking`,
                      )
                      addRoadToRouteInMaking(roadId, validation.position)
                      return // Don't show menu
                    } else {
                      // Road cannot be added - show error
                      toast.error(
                        "This road cannot be added. Only roads that form a continuous path can be added.",
                      )
                      return
                    }
                  }
                }
              } else if (importedRoadFeatures.length > 1) {
                // Multiple roads - check if routeInMaking exists
                if (roadImport.routeInMaking && roadImport.importedRoads) {
                  // Extract routeInMaking and importedRoads to ensure type narrowing
                  const routeInMaking = roadImport.routeInMaking
                  const importedRoads = roadImport.importedRoads

                  // Route in making exists: filter to valid roads that can be added
                  const validFeatures = importedRoadFeatures.filter((f) => {
                    const roadId =
                      f.object?.road_id?.toString() ||
                      f.object?.properties?.road_id?.toString() ||
                      f.object?.id?.toString() ||
                      f.object?.properties?.id?.toString()
                    if (!roadId) return false
                    const validation = canAddRoadToRoute(
                      roadId,
                      routeInMaking,
                      importedRoads,
                    )
                    return validation.canAdd
                  })

                  if (validFeatures.length === 1) {
                    // Exactly one valid road - automatically add it
                    const feature = validFeatures[0]
                    const roadId =
                      feature.object?.road_id?.toString() ||
                      feature.object?.properties?.road_id?.toString() ||
                      feature.object?.id?.toString() ||
                      feature.object?.properties?.id?.toString()
                    if (roadId) {
                      const validation = canAddRoadToRoute(
                        roadId,
                        routeInMaking,
                        importedRoads,
                      )
                      if (validation.canAdd && validation.position) {
                        console.log(
                          `✅ Multi-select: Auto-adding road ${roadId} to ${validation.position} of routeInMaking`,
                        )
                        addRoadToRouteInMaking(roadId, validation.position)
                        return // Don't show menu
                      }
                    }
                  } else if (validFeatures.length > 1) {
                    // Multiple valid roads - show menu for user to choose
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      stage: "feature-selection",
                      features: validFeatures,
                      isRightClick: false,
                    })
                    return
                  } else {
                    // No valid roads
                    toast.error(
                      "No valid roads at this location. Only roads that form a continuous path can be added.",
                    )
                    return
                  }
                } else {
                  // No routeInMaking yet - show menu for user to select starting road
                  // (We're already in the multiple features branch, so always show menu)
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    stage: "feature-selection",
                    features: importedRoadFeatures,
                    isRightClick: false,
                  })
                  return
                }
              }
              // Fall through to show menu if no imported roads found
            } else if (effectiveSelectionMode === "lasso") {
              // Lasso mode: no menu opens on left-click
              return
            } else if (effectiveSelectionMode === "single") {
              // Single selection mode: 1 feature = direct toggle, >1 = menu with Add
              if (importedRoadFeatures.length === 1) {
                // Single imported road - directly toggle selection
                const feature = importedRoadFeatures[0]
                const roadId =
                  feature.object?.road_id?.toString() ||
                  feature.object?.properties?.road_id?.toString() ||
                  feature.object?.id?.toString() ||
                  feature.object?.properties?.id?.toString()
                if (roadId) {
                  console.log(
                    "✅ Single imported road clicked, toggling selection:",
                    roadId,
                  )
                  toggleSelectedRoad(roadId)
                  return // Don't show menu
                }
              } else if (importedRoadFeatures.length > 1) {
                // Multiple imported roads - show selection menu
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  stage: "feature-selection",
                  features: importedRoadFeatures,
                  isRightClick: false,
                })
                return
              }
              // Fall through if no imported roads
            }
          }
        }

        // Always show menu (even for single feature) - removed early return
        if (features.length === 1) {
          const feature = features[0]
          const normalizedLayerId = normalizeLayerId(feature.layerId)

          // Prevent context menu from opening when clicking an already-selected route (left-click only)
          // Right-clicks should still open the menu to allow user to access route actions
          if (
            !isRightClick &&
            (normalizedLayerId === "saved-routes-tile" ||
              normalizedLayerId === "saved-routes")
          ) {
            const routeId =
              feature.object?.uuid ||
              feature.object?.id ||
              feature.object?.properties?.uuid ||
              feature.object?.properties?.id

            if (routeId && selectedRoute?.id === routeId) {
              console.log(
                "📍 Context menu: Route already selected, showing toast and not opening menu",
                routeId,
              )
              // Show toast to inform user this route is already selected
              toast.info("This route is already selected")
              return // Don't open menu
            }
          }

          console.log("✅ Single feature found, showing feature menu")
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            stage: "feature-menu",
            selectedFeature: feature,
            isRightClick,
          })
        } else {
          // Multiple features, show selection menu
          console.log(
            `✅ ${features.length} features found, showing selection menu`,
          )
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            stage: "feature-selection",
            features: features,
            isRightClick,
          })
        }
      } catch (error) {
        console.error("❌ Error picking objects:", error)
      }
    },
    [
      deckOverlayRef,
      mapElementId,
      mapMode,
      roadImport.selectionMode,
      roadImport.routeInMaking,
      roadImport.importedRoads,
      toggleSelectedRoad,
      setSelectionMode,
      addRoadToMultiSelect,
      initializeRouteInMaking,
      addRoadToRouteInMaking,
      selectedRoute,
    ],
  )

  useEffect(() => {
    const mapElement = document.getElementById(mapElementId)
    if (!mapElement) return

    // Right-click handler (always available as fallback)
    const handleContextMenu = (e: MouseEvent) => {
      handleFeaturePick(e, true) // true = isRightClick
    }

    // Left-click handler (only in view or road_selection mode with sufficient zoom)
    const handleClick = (e: MouseEvent) => {
      // Only handle left-click in view or road_selection mode
      if (mapMode !== "view" && mapMode !== "road_selection") {
        return
      }

      // Check zoom level - only open menu if zoomed in enough
      const currentZoom = getZoom?.()
      if (currentZoom === undefined || currentZoom < MIN_ZOOM_FOR_LEFT_CLICK) {
        // Allow normal map interaction (panning) when zoomed out
        return
      }

      // Only open menu if a feature is detected (handled inside handleFeaturePick)
      handleFeaturePick(e, false) // false = isRightClick
    }

    // Add both left-click and right-click listeners in view or road_selection mode
    // For road_selection, handle all modes (single, lasso, multi-select)
    if (
      mapMode === "view" ||
      (mapMode === "road_selection" &&
        (roadImport.selectionMode === "single" ||
          roadImport.selectionMode === "lasso" ||
          roadImport.selectionMode === "multi-select" ||
          roadImport.selectionMode === null))
    ) {
      mapElement.addEventListener("contextmenu", handleContextMenu)
      mapElement.addEventListener("click", handleClick)
    }

    return () => {
      if (
        mapMode === "view" ||
        (mapMode === "road_selection" &&
          (roadImport.selectionMode === "single" ||
            roadImport.selectionMode === "lasso" ||
            roadImport.selectionMode === "multi-select" ||
            roadImport.selectionMode === null))
      ) {
        mapElement.removeEventListener("contextmenu", handleContextMenu)
        mapElement.removeEventListener("click", handleClick)
      }
    }
  }, [deckOverlayRef, mapElementId, mapMode, getZoom, handleFeaturePick])

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  const selectFeature = (feature: PickedFeature) => {
    if (contextMenu) {
      setContextMenu({
        x: contextMenu.x,
        y: contextMenu.y,
        stage: "feature-menu",
        selectedFeature: feature,
        isRightClick: contextMenu.isRightClick,
      })
    }
  }

  return {
    contextMenu,
    closeContextMenu,
    selectFeature,
  }
}
