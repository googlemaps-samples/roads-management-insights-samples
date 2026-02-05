// ui/src/components/map/overlays/DeckGLOverlay.tsx
import { GoogleMapsOverlay } from "@deck.gl/google-maps"
import { useMap } from "@vis.gl/react-google-maps"
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  startTransition,
} from "react"
import { createPortal } from "react-dom"

import { useValidateRoadContinuity } from "../../../hooks/use-api"
import { useLayerStore } from "../../../stores"
import { FEATURE_HOVER_MIN_ZOOM } from "../../../stores/layer-store/constants"
import { useProjectWorkspaceStore } from "../../../stores/project-workspace-store"
import { useUserPreferencesStore } from "../../../stores/user-preferences-store"
import { FeatureTooltip } from "../tooltips/FeatureTooltip"

interface DeckGLOverlayProps {
  layers: any[]
  overlayRef: React.MutableRefObject<GoogleMapsOverlay | null>
  projectId: string
}

const DeckGLOverlay: React.FC<DeckGLOverlayProps> = ({
  layers,
  overlayRef,
  projectId,
}) => {
  const map = useMap("main-map")
  const roadSelection = useLayerStore((state) => state.roadSelection)
  const roadImport = useLayerStore((state) => state.roadImport)
  const setHoveredRoadId = useLayerStore((state) => state.setHoveredRoadId)
  const addRoadToSelection = useLayerStore((state) => state.addRoadToSelection)
  const setIsValidating = useLayerStore((state) => state.setIsValidating)
  const setValidationResult = useLayerStore(
    (state) => state.setValidationResult,
  )
  const setValidationStatus = useLayerStore(
    (state) => state.setValidationStatus,
  )
  const setRoadSelectionError = useLayerStore(
    (state) => state.setRoadSelectionError,
  )
  const setSelectedUploadedRouteId = useLayerStore(
    (state) => state.setSelectedUploadedRouteId,
  )
  const setHoveredFeature = useLayerStore((state) => state.setHoveredFeature)
  const currentZoom = useLayerStore((state) => state.currentZoom)
  const showTooltip = useUserPreferencesStore((state) => state.show_tooltip)
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const validateRoadContinuityMutation = useValidateRoadContinuity()

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    feature: any
    x: number
    y: number
  } | null>(null)

  // Use refs to access latest values in onHover handler
  const currentZoomRef = useRef(currentZoom)
  const showTooltipRef = useRef(showTooltip ?? true) // Default to true if not loaded yet
  const mapModeRef = useRef(mapMode)
  
  // Debounce hover updates for imported roads to prevent expensive re-renders
  const hoverDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const lastHoveredRoadIdRef = useRef<string | null>(null)

  // Update refs when values change
  useEffect(() => {
    currentZoomRef.current = currentZoom
  }, [currentZoom])

  useEffect(() => {
    showTooltipRef.current = showTooltip ?? true // Default to true if not loaded yet
  }, [showTooltip])

  useEffect(() => {
    mapModeRef.current = mapMode
  }, [mapMode])

  // Handle uploaded route click to select it
  const handleUploadedRouteClick = useCallback(
    (info: any) => {
      const layerId = info.layer?.id
      if (layerId !== "uploaded-routes") {
        return
      }

      const properties = info.object?.properties
      if (!properties || !properties.uploadedRouteId) {
        return
      }

      console.log("📍 Uploaded route clicked:", properties.uploadedRouteId)
      setSelectedUploadedRouteId(properties.uploadedRouteId)
    },
    [setSelectedUploadedRouteId],
  )

  // Handle road click in multi-select mode
  const handleRoadClick = useCallback(
    async (info: any) => {
      console.log("🎯 handleRoadClick called", {
        mode: roadSelection.mode,
        isValidating: roadSelection.isValidating,
        layerId: info.layer?.id,
      })

      // Check if this is an uploaded route click first
      if (info.layer?.id === "uploaded-routes") {
        handleUploadedRouteClick(info)
        return
      }

      // Only handle if we're in multi-select mode
      if (roadSelection.mode !== "multi-select") {
        console.log("⚠️ Not in multi-select mode, ignoring")
        return
      }

      // Block clicks while validating
      if (roadSelection.isValidating) {
        console.log("⏸️ Validation in progress, blocking click")
        return
      }

      // Check if this is a road layer (network, tile parent, or tile sublayer)
      const layerId = info.layer?.id
      const isRoadLayer =
        layerId === "roads-network" ||
        layerId === "imported-roads" ||
        layerId?.startsWith("imported-roads-") ||
        layerId?.startsWith("imported-roads-") ||
        layerId?.startsWith("roads-network-tile") ||
        layerId?.startsWith("roads-tile-")

      if (!isRoadLayer) {
        console.log("⚠️ Clicked feature is not a road, ignoring:", layerId)
        return
      }

      console.log("✅ Valid road layer clicked:", layerId)

      const clickedRoad = info.object?.properties
      if (!clickedRoad || !clickedRoad.id) {
        console.log("⚠️ No road data found in clicked feature")
        return
      }

      console.log("🎯 Road clicked in multi-select mode:", clickedRoad.id)

      // Check if already selected
      const roadId = parseInt(clickedRoad.id)
      if (roadSelection.selectedRoadIds.includes(roadId)) {
        console.log("⚠️ Road already selected, ignoring")
        return
      }

      // Create road object
      const roadData = {
        id: clickedRoad?.id?.toString(),
        routeId: "",
        name: clickedRoad.name || `Road ${clickedRoad.id}`,
        polyline: "", // Will be populated from geometry if needed
        linestringGeoJson: info.object?.geometry,
        segmentOrder: 0,
        distanceKm: clickedRoad.length || 0,
        createdAt: new Date().toISOString(),
      }

      console.log("📦 Road data prepared:", roadData)

      // Add road to selection
      addRoadToSelection(roadData)

      // Start validation
      const newRoadIds = [...roadSelection.selectedRoadIds, roadId]
      console.log("🔍 Validating roads:", newRoadIds)

      setIsValidating(true)
      setValidationStatus("validating")

      try {
        const result = await validateRoadContinuityMutation.mutateAsync({
          roadIds: newRoadIds,
          projectId,
        })

        console.log("✅ Validation complete:", result)
        setValidationResult(result)
        setValidationStatus(result.is_continuous ? "valid" : "invalid")
      } catch (error) {
        console.error("❌ Validation failed:", error)
        setRoadSelectionError(
          error instanceof Error ? error.message : "Validation failed",
        )
        setValidationStatus("invalid")
      } finally {
        setIsValidating(false)
      }
    },
    [
      roadSelection.mode,
      roadSelection.isValidating,
      roadSelection.selectedRoadIds,
      addRoadToSelection,
      validateRoadContinuityMutation,
      projectId,
      setIsValidating,
      setValidationResult,
      setValidationStatus,
      setRoadSelectionError,
      handleUploadedRouteClick,
    ],
  )

  // Use a ref to store the latest click handler
  const handleRoadClickRef = useRef(handleRoadClick)
  useEffect(() => {
    handleRoadClickRef.current = handleRoadClick
  }, [handleRoadClick])

  useEffect(() => {
    if (!map) return

    // Initialize overlay if it doesn't exist
    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({
        interleaved: true,
        pickingRadius: 1,

        // Global tooltip handler that delegates to each layer's getTooltip
        // This is required for GoogleMapsOverlay to show tooltips from TileLayer sublayers
        getTooltip: (info: any) => {
          const { layer, object, sourceLayer } = info

          // Log ALL tooltip calls to debug
          const layerId = layer?.id || ""
          const sourceLayerId = sourceLayer?.id || ""
          const properties = object?.properties || {}
          const isRoutesLayer =
            layerId.includes("saved-routes-tile") ||
            layerId.includes("-geojson") ||
            layerId.includes("snapped-roads") ||
            sourceLayerId.includes("saved-routes-tile") ||
            sourceLayerId.includes("-geojson") ||
            sourceLayerId.includes("snapped-roads") ||
            // Check properties to identify optimized routes
            properties.source === "google_routes_api" ||
            properties.uploadedRouteId !== undefined ||
            (properties.id && properties.id.includes("-optimized"))

          if (!object) {
            return null
          }

          // For TileLayer, check if sourceLayer exists (sublayer)
          const actualLayer = sourceLayer || layer

          // Delegate to the layer's own getTooltip function
          // For TileLayer sublayers (GeoJsonLayer), check sourceLayer first, then layer
          const layerToCheck = actualLayer || layer
          if (layerToCheck?.props?.getTooltip) {
            try {
              const tooltip = layerToCheck.props.getTooltip(info)

              return tooltip || null
            } catch (error) {
              console.error("❌ Error in layer tooltip:", error, {
                layerId,
                sourceLayerId,
              })
              return null
            }
          }

          // Fallback: try as a method (some DeckGL versions expose it this way)
          if (
            layerToCheck &&
            typeof (layerToCheck as any).getTooltip === "function"
          ) {
            try {
              const tooltip = (layerToCheck as any).getTooltip(info)

              return tooltip || null
            } catch (error) {
              console.error("❌ Error in layer.getTooltip:", error, {
                layerId,
                sourceLayerId,
              })
              return null
            }
          }

          // Disable string-based tooltips for roads and routes - we use React components instead
          // Check if this is a road or route layer
          const isRoadLayer =
            layerId === "roads-network-tile" ||
            layerId?.startsWith("roads-network-tile") ||
            layerId?.startsWith("roads-tile-")

          if ((isRoadLayer || isRoutesLayer) && object?.properties) {
            // Return null to disable string tooltip - React component tooltip will be shown via onHover
            return null
          }

          return null
        },

        onClick: (info) => {
          if (info?.object) {
            console.log("🖱️ Left-clicked:", info.object.properties)
            // Handle multi-select mode using ref to get latest handler
            handleRoadClickRef.current(info)
          }
        },

        onHover: (info) => {
          if (info?.object) {
            const properties = info.object?.properties || {}

            // ⚡ FILTER OUT ARROWS - Don't show tooltip or hover for direction arrows
            if (properties.type === "direction_arrow") {
              setTooltip(null)
              // Don't update hoveredFeature here - we want to keep the main feature highlighted
              return
            }

            const layerId = info.layer?.id || ""
            const sourceLayerId = info.sourceLayer?.id || ""
            const actualLayer = info.sourceLayer || info.layer

            // Get all available info
            const featureType = properties.type || "unknown"
            const geometry = info.object?.geometry

            // Determine if it's a road, route, or segment
            const isRoadLayer =
              layerId === "roads-network-tile" ||
              layerId === "imported-roads" ||
              layerId?.startsWith("imported-roads-") ||
              layerId?.startsWith("imported-roads-") ||
              layerId?.startsWith("roads-network-tile") ||
              layerId?.startsWith("roads-tile-")

            const isRouteLayer =
              layerId.includes("saved-routes-tile") ||
              layerId.includes("-geojson") ||
              layerId.includes("snapped-roads") ||
              sourceLayerId.includes("saved-routes-tile") ||
              sourceLayerId.includes("-geojson") ||
              sourceLayerId.includes("snapped-roads") ||
              // Check properties to identify optimized routes
              properties.source === "google_routes_api" ||
              properties.uploadedRouteId !== undefined ||
              (properties.id && properties.id.includes("-optimized"))

            // ADD: Detect segment layers
            const isSegmentLayer =
              layerId === "selected-route-segments" ||
              layerId === "selected-route-segments-hovered" ||
              layerId?.includes("selected-route-segments")

            // Comprehensive logging (only in development)
            if (process.env.NODE_ENV === "development") {
              console.group("��️ Feature Hovered")
              console.log("Layer Info:", {
                layerId,
                sourceLayerId,
                actualLayerId: actualLayer?.id,
                layerType: actualLayer?.constructor?.name,
              })

              console.log("Feature Type:", {
                isRoad: isRoadLayer,
                isRoute: isRouteLayer,
                featureType,
              })

              console.log("Properties (All):", properties)
              console.log("Properties (Keys):", Object.keys(properties))

              console.log("Geometry:", {
                type: geometry?.type,
                coordinatesCount: geometry?.coordinates?.length,
              })

              console.log("Full Object:", info.object)
              console.groupEnd()
            }

            // Set tooltip if enabled, zoom is sufficient, AND we're in view or road_selection mode
            if (
              (mapModeRef.current === "view" ||
                mapModeRef.current === "road_selection") &&
              showTooltipRef.current &&
              currentZoomRef.current &&
              currentZoomRef.current >= FEATURE_HOVER_MIN_ZOOM
            ) {
              if (isRoadLayer || isRouteLayer || isSegmentLayer) {
                // Prepare feature properties for tooltip
                let featureProperties

                if (isSegmentLayer && info.object) {
                  // Segment-specific tooltip - PathLayer items don't have properties
                  // Access data directly from info.object
                  const segmentData = (info.object as any).segmentData
                  if (segmentData) {
                    featureProperties = {
                      featureType: "route", // Use route tooltip for segments
                      displayName:
                        segmentData.route_name ||
                        segmentData.uuid ||
                        `Segment ${(info.object as any).id || ""}`,
                      sync_status: segmentData.sync_status || "unsynced",
                      is_enabled: segmentData.is_enabled !== false,
                      length: segmentData.length || 0,
                      hasTrafficData: false, // Segments don't have traffic data yet
                    }
                  } else {
                    // Fallback if segmentData not available
                    featureProperties = {
                      featureType: "route",
                      displayName: (info.object as any).id || "Segment",
                      hasTrafficData: false,
                    }
                  }
                } else if (isRoadLayer || isRouteLayer) {
                  // Existing road/route tooltip preparation
                  featureProperties = {
                    ...properties,
                    featureType: isRoadLayer ? "road" : "route",
                    displayName:
                      properties.name ||
                      properties.displayName ||
                      properties.display_name ||
                      "Unknown",
                    hasTrafficData: !!(
                      properties.current_duration_seconds ||
                      properties.static_duration_seconds
                    ),
                  }
                }

                if (featureProperties) {
                  setTooltip({
                    feature: {
                      properties: featureProperties,
                    },
                    x: info.x || 0,
                    y: info.y || 0,
                  })
                  if (process.env.NODE_ENV === "development") {
                    console.log("🔍 Tooltip set:", featureProperties)
                  }
                } else {
                  setTooltip(null)
                }
              } else {
                setTooltip(null)
              }
            } else {
              setTooltip(null)
            }

            // Set hoveredFeature for both roads AND routes (in view or road_selection mode)
            if (
              (mapModeRef.current === "view" ||
                mapModeRef.current === "road_selection") &&
              (isRoadLayer || isRouteLayer)
            ) {
              const coordinates = geometry?.coordinates
              if (coordinates && Array.isArray(coordinates)) {
                setHoveredFeature({
                  layerId:
                    layerId ||
                    (isRoadLayer ? "roads-network-tile" : "saved-routes-tile"),
                  polyline: coordinates,
                  geometry: geometry,
                })

                // Set hoveredRoadId for imported roads in road_selection mode
                // Use debouncing to prevent expensive re-renders when hovering over multiple roads
                if (
                  mapModeRef.current === "road_selection" &&
                  isRoadLayer &&
                  (layerId === "imported-roads" ||
                    layerId?.startsWith("imported-roads-"))
                ) {
                  const roadId =
                    properties?.road_id?.toString() ||
                    properties?.id?.toString()
                  
                  if (roadId) {
                    // Skip if already hovering this road
                    if (lastHoveredRoadIdRef.current === roadId) {
                      return
                    }
                    
                    // Clear any pending hover update
                    if (hoverDebounceRef.current) {
                      clearTimeout(hoverDebounceRef.current)
                    }
                    
                    // Debounce hover updates to reduce expensive map layer re-renders
                    hoverDebounceRef.current = setTimeout(() => {
                      lastHoveredRoadIdRef.current = roadId
                      // Use startTransition to mark hover as non-urgent
                      startTransition(() => {
                        setHoveredRoadId(roadId)
                      })
                    }, 100) // 100ms debounce for map hover
                  }
                }
              }
            } else {
              // Clear hover for other layers or when not in view mode
              setHoveredFeature(null)
              if (mapModeRef.current === "road_selection") {
                // Clear any pending hover update
                if (hoverDebounceRef.current) {
                  clearTimeout(hoverDebounceRef.current)
                  hoverDebounceRef.current = null
                }
                lastHoveredRoadIdRef.current = null
                // Use startTransition for hover clear as well
                startTransition(() => {
                  setHoveredRoadId(null)
                })
              }
            }
          } else {
            // Clear tooltip and hover when not hovering over any object
            setTooltip(null)
            setHoveredFeature(null)
            if (mapModeRef.current === "road_selection") {
              // Clear any pending hover update
              if (hoverDebounceRef.current) {
                clearTimeout(hoverDebounceRef.current)
                hoverDebounceRef.current = null
              }
              lastHoveredRoadIdRef.current = null
              // Use startTransition for hover clear as well
              startTransition(() => {
                setHoveredRoadId(null)
              })
            }
          }
        },
      })
    }

    // Attach overlay to map
    overlayRef.current.setMap(map)
    overlayRef.current.setProps({ layers })

    // Cleanup
    return () => {
      if (overlayRef.current) {
        overlayRef.current.setMap(null)
      }
    }
  }, [map, overlayRef])

  // Update layers when they change
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setProps({ layers })
    }
  }, [layers, overlayRef])

  // Render tooltip via portal
  const tooltipPortal =
    tooltip && typeof document !== "undefined"
      ? createPortal(
          <FeatureTooltip
            feature={tooltip.feature}
            x={tooltip.x}
            y={tooltip.y}
          />,
          document.body,
        )
      : null

  return <>{tooltipPortal}</>
}

export default DeckGLOverlay
