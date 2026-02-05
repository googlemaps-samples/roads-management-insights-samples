// ui/src/components/map/context-menu/FeatureSelectionMenu.tsx
import { Add, ArrowUpward, Height, Remove } from "@mui/icons-material"
import {
  Box,
  Chip,
  IconButton,
  ListItemButton,
  Typography,
} from "@mui/material"
import React, { useEffect, useMemo, useRef } from "react"

import { useLayerStore } from "../../../stores"
import { calculateRouteLengthFromCoordinates } from "../../../stores/layer-store/utils/geo-math"
import {
  MapMode,
  useProjectWorkspaceStore,
} from "../../../stores/project-workspace-store"
import { formatDistance, useDistanceUnit } from "../../../utils/distance-utils"
import { canAddRoadToRoute } from "../../../utils/multi-select-route"
import { calculateRouteLengthFromGeometry } from "../../../utils/polyline-decoder"
import ContextMenu from "../../common/ContextMenu"
import { PickedFeature } from "./useContextMenu"

interface FeatureSelectionMenuProps {
  x: number
  y: number
  features: PickedFeature[]
  onSelectFeature: (feature: PickedFeature) => void
  onClose: () => void
  mapMode?: MapMode
  panelRoutes?: Array<{ roadIds: string[] }>
  onToggleRoad?: (roadId: string) => void
  onStretchRoad?: (roadId: string) => void
  onInitializeRouteInMaking?: (roadId: string) => void
}

const FeatureSelectionMenu: React.FC<FeatureSelectionMenuProps> = ({
  x,
  y,
  features,
  onSelectFeature,
  onClose,
  mapMode,
  panelRoutes,
  onToggleRoad,
  onStretchRoad,
  onInitializeRouteInMaking,
}) => {
  const setHoveredFeature = useLayerStore((state) => state.setHoveredFeature)
  const setHoveredRoadId = useLayerStore((state) => state.setHoveredRoadId)
  const hoveredFeatureRef = useRef<string | null>(null)
  const isMountedRef = useRef(true) // Track if component is mounted

  // Preserve selected route when FeatureSelectionMenu opens
  const selectedRoute = useProjectWorkspaceStore((state) => state.selectedRoute)
  const setSelectedRoute = useProjectWorkspaceStore(
    (state) => state.setSelectedRoute,
  )
  const preservedRouteIdRef = useRef<string | null>(null)

  useEffect(() => {
    isMountedRef.current = true

    // Preserve the currently selected route when menu opens
    if (selectedRoute?.id) {
      preservedRouteIdRef.current = selectedRoute.id
      console.log(
        "🔒 FeatureSelectionMenu: Preserving selected route:",
        selectedRoute.id,
      )
    }

    return () => {
      isMountedRef.current = false // Mark as unmounting
      // Always clear hover state on unmount
      setHoveredFeature(null)
      setHoveredRoadId(null)
      hoveredFeatureRef.current = null

      // Restore selected route if it was cleared while menu was open
      const preservedRouteId = preservedRouteIdRef.current
      if (preservedRouteId) {
        const currentSelectedRoute =
          useProjectWorkspaceStore.getState().selectedRoute
        // If route was cleared, restore it
        if (
          !currentSelectedRoute ||
          currentSelectedRoute.id !== preservedRouteId
        ) {
          // Check if route still exists in store before restoring
          const routeExists = useProjectWorkspaceStore
            .getState()
            .routes.find((r) => r.id === preservedRouteId)
          if (routeExists) {
            console.log(
              "🔄 FeatureSelectionMenu: Restoring selected route:",
              preservedRouteId,
            )
            setSelectedRoute(preservedRouteId)
          }
        }
        preservedRouteIdRef.current = null
      }
    }
  }, [setHoveredFeature, setHoveredRoadId, selectedRoute, setSelectedRoute])

  // Monitor selected route and restore if it gets cleared while menu is open
  useEffect(() => {
    const preservedRouteId = preservedRouteIdRef.current
    if (!preservedRouteId) return

    // Check if route was cleared
    const currentSelectedRoute =
      useProjectWorkspaceStore.getState().selectedRoute
    if (!currentSelectedRoute || currentSelectedRoute.id !== preservedRouteId) {
      // Route was cleared - restore it
      const routeExists = useProjectWorkspaceStore
        .getState()
        .routes.find((r) => r.id === preservedRouteId)
      if (routeExists) {
        console.log(
          "🔄 FeatureSelectionMenu: Route was cleared, restoring:",
          preservedRouteId,
        )
        setSelectedRoute(preservedRouteId)
      }
    }
  }, [selectedRoute, setSelectedRoute])

  // Check if we have bi-directional roads (multiple features with same road_id but different directions)
  const hasBidirectionalRoads = useMemo(() => {
    if (features.length < 2) return false
    const roadIds = features
      .map((f) => {
        const id =
          f.object?.road_id?.toString() ||
          f.object?.properties?.road_id?.toString()
        return id
      })
      .filter(Boolean)
    return new Set(roadIds).size < roadIds.length
  }, [features])

  // Determine header title and subtitle
  const headerTitle = hasBidirectionalRoads
    ? "Select Direction"
    : mapMode === "road_selection"
      ? `Select Road${features.length > 1 ? "s" : ""} (${features.length})`
      : `Select Feature (${features.length})`
  const headerSubtitle = hasBidirectionalRoads
    ? "Bi-directional road detected. Select which lanes to track."
    : mapMode === "road_selection"
      ? "Multiple roads at this location"
      : "Multiple features at this location"

  return (
    <ContextMenu
      x={x}
      y={y}
      onClose={onClose}
      draggable={true}
      maxWidth={280}
      minWidth={270}
      maxHeight={450}
      header={{
        title: headerTitle,
        subtitle: headerSubtitle,
      }}
      hideItems={true}
    >
      {/* Feature List */}
      <Box sx={{ pb: "0px" }}>
        {features.map((feature, index) => (
          <React.Fragment key={`${feature.layerId}-${index}`}>
            <FeatureItem
              feature={feature}
              onClick={
                mapMode === "road_selection"
                  ? () => {}
                  : () => {
                      // Clear hover state before selecting feature
                      setHoveredFeature(null)
                      setHoveredRoadId(null)
                      onSelectFeature(feature)
                    }
              }
              index={index}
              mapMode={mapMode}
              panelRoutes={panelRoutes}
              onToggleRoad={onToggleRoad}
              onStretchRoad={onStretchRoad}
              onInitializeRouteInMaking={onInitializeRouteInMaking}
              onClose={onClose}
            />
          </React.Fragment>
        ))}
      </Box>
    </ContextMenu>
  )
}

// Individual Feature Item Component
interface FeatureItemProps {
  feature: PickedFeature
  onClick: () => void
  index: number
  mapMode?: MapMode
  panelRoutes?: Array<{ roadIds: string[] }>
  onToggleRoad?: (roadId: string) => void
  onStretchRoad?: (roadId: string) => void
  onInitializeRouteInMaking?: (roadId: string) => void
  onClose?: () => void
}

const FeatureItem: React.FC<FeatureItemProps> = ({
  feature,
  onClick,
  index,
  mapMode,
  panelRoutes,
  onToggleRoad,
  onStretchRoad,
  onInitializeRouteInMaking,
  onClose,
}) => {
  const distanceUnit = useDistanceUnit()
  const setHoveredFeature = useLayerStore((state) => state.setHoveredFeature)
  const setHoveredRoadId = useLayerStore((state) => state.setHoveredRoadId)
  const roadImport = useLayerStore((state) => state.roadImport)
  const addRoadToRouteInMaking = useLayerStore(
    (state) => state.addRoadToRouteInMaking,
  )

  // Determine if this is a route or road
  const normalizeLayerId = (id: string) => {
    // Normalize imported-roads-* layers to "imported-roads"
    if (id?.startsWith("imported-roads-")) {
      return "imported-roads"
    }
    // Remove version/timestamp suffix pattern: -v{number} or -t{number}
    return id.replace(/-[vt]\d+$/, "")
  }
  const normalizedId = normalizeLayerId(feature.layerId)
  const isRoad =
    normalizedId === "roads-network-tile" ||
    normalizedId === "roads-network" ||
    normalizedId === "imported-roads"

  // Check if this is an imported road and if it's in panel
  // The feature.object might be the properties directly or nested under properties
  const roadId =
    feature.object?.road_id?.toString() ||
    feature.object?.properties?.road_id?.toString() ||
    feature.object?.id?.toString() ||
    feature.object?.properties?.id?.toString()
  const isImportedRoad = normalizedId === "imported-roads"
  // A road is only "selected" if it exists as a standalone route (single road per route)
  // Not if it's part of a multi-road route (like stretched routes)
  const isSelected =
    isImportedRoad &&
    roadId &&
    panelRoutes?.some((r) => r.roadIds.length === 1 && r.roadIds[0] === roadId)

  // Check if this is a "pure" imported road (from API), not a stretched or multi-select route
  // Pure roads are those that don't have isStretched or isMultiSelected flags set
  const isPureImportedRoad =
    roadId &&
    !(feature.object?.isStretched === true) &&
    !(feature.object?.isMultiSelected === true)

  // Check if we're in multi-select mode (works even when routeInMaking is null)
  const isMultiSelectModeActive =
    mapMode === "road_selection" && roadImport.selectionMode === "multi-select"

  // Check if routeInMaking already exists (for subsequent road additions)
  const hasRouteInMaking = roadImport.routeInMaking !== null
  const canAddToRoute =
    isMultiSelectModeActive &&
    hasRouteInMaking &&
    roadId &&
    roadImport.importedRoads &&
    roadImport.routeInMaking
      ? canAddRoadToRoute(
          roadId,
          roadImport.routeInMaking,
          roadImport.importedRoads,
        ).canAdd
      : false

  // Always show both buttons when in road_selection mode and is imported road
  // Stretch button: only enabled for pure imported roads
  // Add/Remove button: always shown, but disabled if can't add to route
  const showButtons =
    mapMode === "road_selection" &&
    isImportedRoad &&
    roadId &&
    (onToggleRoad ||
      onStretchRoad ||
      (isMultiSelectModeActive &&
        (onInitializeRouteInMaking ||
          (hasRouteInMaking && addRoadToRouteInMaking))))

  // Stretch button should be enabled only for pure imported roads
  const canStretch = isPureImportedRoad && onStretchRoad

  // Get direction from properties (in degrees, clockwise from north)
  const directionDegrees =
    feature.object?.properties?.direction ?? feature.object?.direction ?? 40

  // Calculate rotation angle (round to nearest 45° step)
  const rotationAngle = useMemo(() => {
    if (directionDegrees === null || directionDegrees === undefined) return 0
    return Math.round(directionDegrees / 45) * 45
  }, [directionDegrees])

  // Calculate route length from geometry/polyline if available
  const calculatedLength = useMemo(() => {
    // Try to calculate from geometry first (most accurate)
    if (
      feature.object?.geometry?.type === "LineString" &&
      feature.object.geometry.coordinates
    ) {
      const lengthKm = calculateRouteLengthFromGeometry(feature.object.geometry)
      if (lengthKm !== null) {
        return lengthKm
      }
    }

    // Fallback to polyline coordinates
    if (
      feature.polyline &&
      Array.isArray(feature.polyline) &&
      feature.polyline.length >= 2
    ) {
      return calculateRouteLengthFromCoordinates(feature.polyline)
    }

    // Final fallback to object.length if available
    return feature.object?.length || null
  }, [feature.object?.geometry, feature.polyline, feature.object?.length])

  const lengthText =
    calculatedLength !== null
      ? formatDistance(calculatedLength, distanceUnit)
      : null

  const handleMouseEnter = () => {
    // Set hovered feature for map highlighting
    if (feature.polyline && feature.polyline.length >= 2) {
      if (isRoad) {
        setHoveredRoadId(roadId)
      } else {
        setHoveredFeature({
          layerId: feature.layerId,
          polyline: feature.polyline,
          geometry: feature.object?.geometry || null,
        })
      }
    } else {
      console.warn("⚠️ Feature polyline invalid:", {
        hasPolyline: !!feature.polyline,
        polylineLength: feature.polyline?.length,
        polyline: feature.polyline,
      })
    }
  }

  const handleMouseLeave = () => {
    // Clear hovered feature
    setHoveredFeature(null)
    setHoveredRoadId(null)
  }
  return (
    <ListItemButton
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={isMultiSelectModeActive && hasRouteInMaking && !canAddToRoute}
      sx={{
        minHeight: 36,
        height: 36,
        padding: "20px 12px",
        margin: "0px 0px",
        backgroundColor: "#ffffff",
        borderTop: index === 0 ? "1px solid #e0e0e0" : "none",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
        "&:hover": {
          backgroundColor: "#f5f5f5",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
        },
        "&.Mui-disabled": {
          opacity: 0.5,
          backgroundColor: "#ffffff",
        },
      }}
    >
      {/* Single Row Layout: Direction Arrow | Road Name | Length | Stretch | Add/Remove */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          width: "100%",
          minWidth: 0,
        }}
      >
        {/* Direction Arrow (left) */}
        {directionDegrees !== null && directionDegrees !== undefined && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              flexShrink: 0,
            }}
          >
            <ArrowUpward
              sx={{
                fontSize: 16,
                color: "#1976d2",
                transform: `rotate(${rotationAngle}deg)`,
                transition: "transform 0.2s ease",
              }}
            />
          </Box>
        )}

        {/* Road Name (middle, truncated) */}

        <Typography
          variant="caption"
          sx={{
            fontSize: "12px",
            fontWeight: 500,
            lineHeight: 1.2,
            color: "#212121",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
          title={feature.displayInfo.title}
        >
          {feature.displayInfo.title}
        </Typography>

        {/* Right Side: Length | Stretch | Add/Remove */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexShrink: 0,
          }}
        >
          {/* Length Chip */}
          {lengthText && (
            <Chip
              label={lengthText}
              size="small"
              sx={{
                height: "20px",
                backgroundColor: "#f5f5f5",
                color: "#757575",
                fontSize: "10px",
                fontWeight: 400,
                "& .MuiChip-label": {
                  padding: "0 6px",
                },
              }}
            />
          )}

          {/* Action Buttons - Always show both when in road_selection mode */}
          {showButtons && (
            <>
              {/* Stretch Button */}
              {mapMode === "road_selection" && isImportedRoad && (
                <IconButton
                  size="small"
                  title="Stretch till intersections"
                  onClick={(e) => {
                    e.stopPropagation()
                    // Clear hover state before action
                    setHoveredFeature(null)
                    setHoveredRoadId(null)
                    if (onStretchRoad && roadId && canStretch) {
                      onStretchRoad(roadId)
                      if (onClose) {
                        onClose()
                      }
                    }
                  }}
                  disabled={!canStretch}
                  sx={{
                    width: 24,
                    height: 24,
                    padding: 0,
                    minWidth: 24,
                    backgroundColor: "transparent",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    transform: "rotate(90deg)",
                    "&:hover": {
                      backgroundColor: canStretch
                        ? "rgba(25, 118, 210, 0.08)"
                        : "transparent",
                      transform: canStretch
                        ? "scale(1.1) rotate(90deg)"
                        : "rotate(90deg)",
                    },
                    "&:active": {
                      transform: canStretch
                        ? "scale(0.95) rotate(90deg)"
                        : "rotate(90deg)",
                    },
                    "&.Mui-disabled": {
                      opacity: 0.4,
                    },
                  }}
                >
                  <Height
                    sx={{
                      fontSize: 16,
                      color: "#1976d2",
                    }}
                  />
                </IconButton>
              )}

              {/* Add/Remove Button */}
              <IconButton
                size="small"
                title={
                  isSelected ? "Remove from selection" : "Add to selection"
                }
                onClick={(e) => {
                  e.stopPropagation()
                  // Clear hover state before action
                  setHoveredFeature(null)
                  setHoveredRoadId(null)
                  if (isMultiSelectModeActive && roadId) {
                    if (!hasRouteInMaking && onInitializeRouteInMaking) {
                      // First road in multi-select mode: initialize routeInMaking
                      onInitializeRouteInMaking(roadId)
                      // Close menu after initialization
                      if (onClose) {
                        onClose()
                      }
                    } else if (
                      hasRouteInMaking &&
                      canAddToRoute &&
                      addRoadToRouteInMaking
                    ) {
                      // Subsequent roads in multi-select mode: add to routeInMaking
                      const validation = canAddRoadToRoute(
                        roadId,
                        roadImport.routeInMaking!,
                        roadImport.importedRoads!,
                      )
                      if (validation.canAdd && validation.position) {
                        addRoadToRouteInMaking(roadId, validation.position)
                        // Close menu after adding road
                        if (onClose) {
                          onClose()
                        }
                      }
                    }
                  } else if (onToggleRoad && roadId) {
                    // Single mode: toggle selection
                    onToggleRoad(roadId)
                    // Close menu after toggle
                    if (onClose) {
                      onClose()
                    }
                  }
                }}
                disabled={
                  isMultiSelectModeActive && hasRouteInMaking && !canAddToRoute
                }
                sx={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  minWidth: 24,
                  backgroundColor: "transparent",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  "&:hover": {
                    backgroundColor:
                      isMultiSelectModeActive &&
                      hasRouteInMaking &&
                      !canAddToRoute
                        ? "transparent"
                        : isSelected
                          ? "rgba(95, 99, 104, 0.08)"
                          : "rgba(25, 118, 210, 0.08)",
                    transform:
                      isMultiSelectModeActive &&
                      hasRouteInMaking &&
                      !canAddToRoute
                        ? "scale(1)"
                        : "scale(1.1)",
                  },
                  "&:active": {
                    transform: "scale(0.95)",
                  },
                  "&.Mui-disabled": {
                    opacity: 0.4,
                  },
                }}
              >
                {!isMultiSelectModeActive && isSelected ? (
                  <Remove
                    sx={{
                      fontSize: 18,
                      color: "#5f6368",
                    }}
                  />
                ) : (
                  <Add
                    sx={{
                      fontSize: 18,
                      color:
                        isMultiSelectModeActive &&
                        hasRouteInMaking &&
                        !canAddToRoute
                          ? "rgba(0, 0, 0, 0.3)"
                          : "#1976d2",
                    }}
                  />
                )}
              </IconButton>
            </>
          )}
        </Box>
      </Box>
    </ListItemButton>
  )
}

export default FeatureSelectionMenu
