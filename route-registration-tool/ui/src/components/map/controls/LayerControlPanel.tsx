import {
  ArrowDownward,
  ArrowUpward,
  Layers,
  MyLocation,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material"
import {
  Box,
  Checkbox,
  Divider,
  IconButton,
  List,
  ListItem,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material"
import React, { useCallback, useMemo, useState } from "react"

import { useMapNavigation } from "../../../contexts/map-navigation-context"
import { useDeckLayers } from "../../../hooks/use-deck-layers"
import { useLayerStore } from "../../../stores/layer-store"
import { getColorsForMapType } from "../../../stores/layer-store/utils/color-utils"
import { useProjectWorkspaceStore } from "../../../stores/project-workspace-store"

const NAVIGABLE_LAYER_IDS = [
  "saved-routes",
  "saved-routes-tile",
  "selected-route",
  "selected-route-segments",
  "individual-preview",
  "polygon-routes",
] as const

type NavigableLayerId = (typeof NAVIGABLE_LAYER_IDS)[number]

const isNavigableLayerId = (layerId: string): layerId is NavigableLayerId =>
  (NAVIGABLE_LAYER_IDS as readonly string[]).includes(layerId)

const rgbaArrayToCss = ([r, g, b, a]: [
  number,
  number,
  number,
  number,
]): string => `rgba(${r}, ${g}, ${b}, ${a / 255})`

const LayerControlPanel: React.FC = () => {
  const projectId = useProjectWorkspaceStore((state) => state.projectId)
  const mapType = useProjectWorkspaceStore((state) => state.mapType)
  const deckLayers = useDeckLayers(projectId || "")
  const toggleLayerVisibility = useLayerStore(
    (state) => state.toggleLayerVisibility,
  )
  const moveLayerUp = useLayerStore((state) => state.moveLayerUp)
  const moveLayerDown = useLayerStore((state) => state.moveLayerDown)
  const individualRoute = useLayerStore((state) => state.individualRoute)
  const polygonDrawing = useLayerStore((state) => state.polygonDrawing)

  const routes = useProjectWorkspaceStore((state) => state.routes)
  const selectedRoute = useProjectWorkspaceStore((state) => state.selectedRoute)
  const { navigateToGeometry } = useMapNavigation()
  const [isExpanded, setIsExpanded] = useState(true)

  const colors = useMemo(() => getColorsForMapType(mapType), [mapType])

  const savedRoutesLegend = useMemo(
    () => [
      {
        label: "Synced",
        color: rgbaArrayToCss(colors.routeStatusColors.synced),
      },
      {
        label: "Validating",
        color: rgbaArrayToCss(colors.routeStatusColors.validating),
      },
      {
        label: "Pending",
        color: rgbaArrayToCss(colors.routeStatusColors.pending),
      },
      {
        label: "Failed",
        color: rgbaArrayToCss(colors.routeStatusColors.failed),
      },
    ],
    [colors],
  )

  const savedRoutesBaseColor =
    savedRoutesLegend[1]?.color ||
    rgbaArrayToCss(colors.routeStatusColors.pending)

  const layerNameMap: Record<string, string> = {
    // "roads-network": "Road Network",
    "roads-network-tile": "Road Network",
    // "saved-routes": "My Saved Routes",
    "saved-routes-tile": "Saved Routes",
    "selected-route": "Currently Selected Route",
    // "selected-route-segments": "Route Segments",
    // "segment-boundaries": "Segment Boundaries",
    "individual-preview": "Draft Route Preview",
    // "polygon-drawing": "Polygon Drawing",
    // "polygon-routes": "Polygon Generated Routes",
    "saved-polygons": "Saved Polygons",
    // "polygon-routes-border": "Polygon Generated Routes",
    "original-route-dimmed": "Original Route (Dimmed)",
    // "cut-points": "Cut Points",
    // "preview-segments": "Segmentation Preview",
    // "uploaded-routes": "Uploaded Routes",
    // "snapped-roads": "Optimized Routes",
    // "road-selection-highlight": "Road Selection Preview",
    // "road-selection-arrows": "Road Selection Direction",
  }

  const layerColorMap: Record<string, string> = useMemo(
    () => ({
      "roads-network": rgbaArrayToCss(
        colors.roadsNetworkColor as [number, number, number, number],
      ),
      "roads-network-tile": rgbaArrayToCss(
        colors.roadsNetworkColor as [number, number, number, number],
      ),
      "saved-routes": savedRoutesBaseColor,
      "saved-routes-tile": savedRoutesBaseColor,
      "selected-route": rgbaArrayToCss(colors.selectedRouteColor),
      "selected-route-segments": rgbaArrayToCss(colors.selectedRouteColor),
      "segment-boundaries": mapType === "hybrid" ? "#ffffff" : "#4b5563",
      "individual-preview": rgbaArrayToCss(colors.individualPreviewColor),
      "polygon-drawing": "#FF9800",
      "polygon-routes": rgbaArrayToCss(colors.polygonRouteColor),
      "polygon-routes-border": "#FFFFFF",
      "saved-polygons": rgbaArrayToCss(
        colors.jurisdictionBoundaryColor as [number, number, number, number],
      ),
      "original-route-dimmed": "#969696",
      "cut-points": "#FF5722",
      "preview-segments": "#FFC107",
      "uploaded-routes": rgbaArrayToCss(colors.uploadedRouteColor),
      "snapped-roads": mapType === "hybrid" ? "#34c759" : "#0F9D58",
      "road-selection-highlight": rgbaArrayToCss(colors.roadSelectionColor),
      "road-selection-arrows": rgbaArrayToCss(colors.roadSelectionColor),
    }),
    [colors, mapType, savedRoutesBaseColor],
  )

  const firstSavedRoutePolyline = useMemo(
    () =>
      routes.find((route: any) => route.encodedPolyline)?.encodedPolyline ||
      null,
    [routes],
  )

  const individualPreviewPolyline = useMemo(
    () => individualRoute.generatedRoute?.encodedPolyline || null,
    [individualRoute.generatedRoute?.encodedPolyline],
  )

  const polygonGeneratedPolyline = useMemo(
    () =>
      polygonDrawing.completedPolygon?.coordinates[0].find(
        (route: any) => route.encodedPolyline,
      )?.encodedPolyline || null,
    [polygonDrawing.completedPolygon?.coordinates[0]],
  )

  const selectedRoutePolyline = useMemo(
    () => selectedRoute?.encodedPolyline || null,
    [selectedRoute?.encodedPolyline],
  )

  const navigationGeometryMap = useMemo<
    Record<NavigableLayerId, string | null>
  >(
    () => ({
      "saved-routes": firstSavedRoutePolyline,
      "saved-routes-tile": firstSavedRoutePolyline,
      "selected-route": selectedRoutePolyline,
      "selected-route-segments": selectedRoutePolyline,
      "individual-preview": individualPreviewPolyline,
      "polygon-routes": polygonGeneratedPolyline,
    }),
    [
      firstSavedRoutePolyline,
      individualPreviewPolyline,
      polygonGeneratedPolyline,
      selectedRoutePolyline,
    ],
  )

  const handleNavigate = useCallback(
    (layerId: string) => {
      if (!navigateToGeometry) return
      if (!isNavigableLayerId(layerId)) return
      const geometry = navigationGeometryMap[layerId]
      if (!geometry) return
      navigateToGeometry(geometry, { padding: 120 })
    },
    [navigateToGeometry, navigationGeometryMap],
  )

  // Get a human-readable name for each layer
  const getLayerName = (layerId: string): string =>
    layerNameMap[layerId] || layerId

  // Get color indicator for each layer type
  const getLayerColor = (layerId: string): string =>
    layerColorMap[layerId] || "#000000"

  const savedRouteLayerIds = useMemo(
    () => new Set(["saved-routes", "saved-routes-tile"]),
    [],
  )
  const canNavigateToLayer = useCallback(
    (layerId: string): boolean =>
      isNavigableLayerId(layerId) &&
      Boolean(navigationGeometryMap[layerId] && navigateToGeometry),
    [navigationGeometryMap, navigateToGeometry],
  )

  if (!isExpanded) {
    return (
      <Paper
        elevation={8}
        className="absolute bottom-4 right-16 bg-white/95 backdrop-blur-[10px] rounded-lg z-[1000] max-w-14"
        onClick={() => setIsExpanded(true)}
      >
        <Tooltip title="Show Layers" placement="left">
          <IconButton size="small" className="m-2">
            <Layers />
          </IconButton>
        </Tooltip>
      </Paper>
    )
  }

  return (
    <Paper
      elevation={8}
      className="absolute bottom-4 right-16  w-72 max-h-96 bg-white/95 backdrop-blur-[10px] rounded-lg z-[1000] overflow-hidden"
    >
      {/* Header */}
      <Box className="p-2 border-b border-mui-divider flex items-center justify-between">
        <Box className="flex items-center gap-2">
          <Layers fontSize="small" />
          <Typography variant="subtitle2" className="font-semibold">
            Map Layers
          </Typography>
        </Box>
        <Tooltip title="Collapse" placement="left">
          <IconButton size="small" onClick={() => setIsExpanded(false)}>
            <VisibilityOff fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Layers List */}
      <Box className="max-h-80 overflow-auto pretty-scrollbar">
        {deckLayers.length === 0 ? (
          <Box className="text-center py-6 text-mui-disabled">
            <Typography variant="caption">No layers available</Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {deckLayers
              .filter((layer: any) =>
                [
                  "saved-routes-tile",
                  "selected-route",
                  "individual-preview",
                  "saved-polygons",
                  "roads-network-tile",
                ].includes(layer.id),
              )
              .map((layer: any, index: number) => (
                <React.Fragment key={layer.id}>
                  <ListItem
                    disablePadding
                    className="hover:bg-mui-action-hover transition-colors"
                  >
                    <Box className="w-full px-2 py-2 flex flex-col gap-1.5">
                      <Box className="flex items-center gap-2">
                        <Tooltip
                          title={layer.visible ? "Hide Layer" : "Show Layer"}
                          placement="left"
                        >
                          <Checkbox
                            size="small"
                            checked={layer.visible}
                            onChange={() => toggleLayerVisibility(layer.id)}
                            icon={<VisibilityOff fontSize="small" />}
                            checkedIcon={<Visibility fontSize="small" />}
                            className="p-0"
                          />
                        </Tooltip>
                        {layer.id !== "saved-routes-tile" && (
                          <Box
                            className="w-3 h-3 rounded-full flex-shrink-0 border border-white/50"
                            style={{ backgroundColor: getLayerColor(layer.id) }}
                          />
                        )}

                        <Box className="flex-1">
                          <Typography
                            variant="body2"
                            className={`${!layer.visible ? "text-mui-disabled line-through" : "font-medium"}`}
                          >
                            {getLayerName(layer.id)}
                          </Typography>
                        </Box>

                        <Box className="flex items-center gap-0.5">
                          <Tooltip
                            title="Focus on layer"
                            placement="top"
                            arrow
                            disableHoverListener={!canNavigateToLayer(layer.id)}
                          >
                            <span>
                              <IconButton
                                size="small"
                                className="p-0.5"
                                disabled={!canNavigateToLayer(layer.id)}
                                onClick={() => handleNavigate(layer.id)}
                              >
                                <MyLocation fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Move Up" placement="top">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => moveLayerUp(layer.id)}
                                disabled={index === 0}
                                className="p-0.5"
                              >
                                <ArrowUpward fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Move Down" placement="top">
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => moveLayerDown(layer.id)}
                                disabled={index === deckLayers.length - 1}
                                className="p-0.5"
                              >
                                <ArrowDownward fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </Box>

                      {savedRouteLayerIds.has(layer.id) && (
                        <Box className="flex gap-3 pl-8 flex-wrap">
                          {savedRoutesLegend.map((legend) => (
                            <Box
                              key={`${legend.label}-${legend.color}`}
                              className="flex items-center gap-1"
                            >
                              <Box
                                className="w-3 h-3 rounded-full border border-white/40"
                                style={{ backgroundColor: legend.color }}
                              />
                              <Typography
                                variant="caption"
                                className="text-mui-text-secondary"
                              >
                                {legend.label}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  </ListItem>
                  {index < deckLayers.length - 1 && <Divider />}
                </React.Fragment>
              ))}
          </List>
        )}
      </Box>

      {/* Footer Info */}
      <Divider />
      <Box className="p-2 bg-mui-action-hover/30">
        <Typography
          variant="caption"
          className="text-mui-disabled text-center block"
        >
          {deckLayers.filter((l: any) => l.visible).length} of{" "}
          {deckLayers.length} layers visible
        </Typography>
      </Box>
    </Paper>
  )
}

export default LayerControlPanel
