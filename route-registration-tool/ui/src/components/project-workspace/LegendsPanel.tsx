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

import {
  ExpandLess,
  ExpandMore,
  Layers,
  SignalCellularNull,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material"
import { Box, Checkbox, IconButton, Paper, Typography } from "@mui/material"
import React, { useMemo, useState } from "react"

import { PRIMARY_RED_GOOGLE } from "../../constants/colors"
import { useLayerStore } from "../../stores/layer-store"
import { useProjectWorkspaceStore } from "../../stores/project-workspace-store"
import {
  pxToMuiSpacing,
  useResponsiveTypography,
} from "../../utils/typography-utils"

interface LegendsPanelProps {
  visibleLayers: Array<{
    id: string
    _parentLayerId?: string
    _originalId?: string
    _originalLayerId?: string
    visible: boolean
  }>
  savedRoutesLegend: Array<{
    label: string
    color: string
  }>
  importedRoadsLegend: Array<{
    label: string
    color: string
  }>
  segmentsLegend: Array<{
    label: string
    color: string
  }>
  getLayerName: (layerId: string) => string
  getLayerColor: (layerId: string, originalLayerId?: string) => string
  getBaseLayerId: (layerId: string) => string
  toggleLayerVisibility: (layerId: string) => void
}

const LegendsPanel: React.FC<LegendsPanelProps> = ({
  visibleLayers,
  savedRoutesLegend,
  importedRoadsLegend,
  segmentsLegend,
  getLayerName,
  getLayerColor,
  getBaseLayerId,
}) => {
  const typo = useResponsiveTypography()
  const [expanded, setExpanded] = useState(true)
  const [expandedSavedRoutes, setExpandedSavedRoutes] = useState(true)
  const [expandedImportedRoads, setExpandedImportedRoads] = useState(true)
  const [expandedSegments, setExpandedSegments] = useState(true)
  const [expandedSegmentsCategory, setExpandedSegmentsCategory] = useState(true)
  const setLayerVisibility = useLayerStore((state) => state.setLayerVisibility)
  const leftPanelExpanded = useProjectWorkspaceStore(
    (state) => state.leftPanelExpanded,
  )
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const priorityFilterPanelExpanded = useProjectWorkspaceStore(
    (state) => state.priorityFilterPanelExpanded,
  )
  const roadPriorityPanelOpen = useProjectWorkspaceStore(
    (state) => state.roadPriorityPanelOpen,
  )
  const mapType = useProjectWorkspaceStore((state) => state.mapType)
  const lassoDrawing = useLayerStore((state) => state.lassoDrawing)
  const polygonDrawing = useLayerStore((state) => state.polygonDrawing)

  // Consistent width for both states - use responsive width
  const panelWidth = typo.legendsPanelWidth
  // Adjust left position to avoid overlapping panels (top-left position)
  // LeftFloatingPanel has responsive width (typo.leftPanelWidth) when expanded
  // Toggle button extends 20px beyond the panel (40px wide, translate-x-1/2)
  // PriorityFilterPanel has responsive width (typo.leftPanelWidth) when expanded
  // PriorityFilterPanel needs spacing to avoid overlap
  const leftPosition = useMemo(() => {
    // Check if LeftFloatingPanel is actually visible (not just expanded)
    // LeftFloatingPanel returns null when these conditions are true
    const isLeftPanelVisible =
      mapMode !== "lasso_selection" &&
      !lassoDrawing.completedPolygon &&
      !roadPriorityPanelOpen &&
      mapMode !== "road_selection" &&
      !polygonDrawing.completedPolygon

    // Check if PriorityFilterPanel is visible and expanded
    const isPriorityFilterPanelVisible =
      mapMode === "road_selection" && priorityFilterPanelExpanded

    const spacing = 15 // Spacing between panels
    const toggleButtonExtension = 20 // Toggle button extends beyond panel

    if (isPriorityFilterPanelVisible) {
      // PriorityFilterPanel is expanded + spacing
      return `${typo.leftPanelWidth + spacing}px`
    } else if (isLeftPanelVisible && leftPanelExpanded) {
      // Left panel is visible and expanded + toggle button extension + spacing
      return `${typo.leftPanelWidth + toggleButtonExtension + spacing}px`
    } else {
      // Left panel is collapsed or not visible
      return "33px" // Position near left edge, avoiding expand button
    }
  }, [
    typo.leftPanelWidth,
    leftPanelExpanded,
    mapMode,
    priorityFilterPanelExpanded,
    roadPriorityPanelOpen,
    lassoDrawing.completedPolygon,
    polygonDrawing.completedPolygon,
  ])

  // Filter to show only one boundary layer at a time
  // Prefer "segmentation-boundaries" over "selected-route-segments-boundaries"
  // Also filter out "selected-route-segments" when "selected-route" exists (to avoid duplicate)
  // "selected-route" is always filtered out (not shown in legend)
  // Also filter out "selected-route-segments" when "segments" exists (to avoid duplicate segments entries)
  // Boundaries (Cuts) are now separate top-level entries, not part of segments category
  // Also deduplicate any layers with the same ID
  // Combine "Hovered Route" and "Hovered Segments" into a single entry when both exist
  // Filter out "feature-hover-highlight" when in drawing or modify mode
  const filteredVisibleLayers = useMemo(() => {
    // First, deduplicate by ID (keep first occurrence)
    const seenIds = new Set<string>()
    const deduplicated = visibleLayers.filter((layer) => {
      if (seenIds.has(layer.id)) {
        return false
      }
      seenIds.add(layer.id)
      return true
    })

    const hasSegmentationBoundaries = deduplicated.some(
      (layer) => layer.id === "segmentation-boundaries",
    )
    const hasSelectedRouteBoundaries = deduplicated.some(
      (layer) => layer.id === "selected-route-segments-boundaries",
    )
    const hasSelectedRoute = deduplicated.some(
      (layer) => layer.id === "selected-route",
    )
    const hasSelectedRouteSegments = deduplicated.some(
      (layer) => layer.id === "selected-route-segments",
    )
    const hasSegments = deduplicated.some((layer) => layer.id === "segments")
    const hasHoveredRoute = deduplicated.some(
      (layer) => layer.id === "feature-hover-highlight",
    )
    const hasHoveredSegments = deduplicated.some(
      (layer) => layer.id === "selected-route-segments-hovered",
    )

    // Filter out "feature-hover-highlight" when in drawing or modify mode
    const isDrawingOrModifyMode =
      mapMode === "individual_drawing" ||
      mapMode === "individual_editing" ||
      mapMode === "route_editing" ||
      mapMode === "editing_uploaded_route"

    let filtered = deduplicated
    if (isDrawingOrModifyMode) {
      filtered = filtered.filter(
        (layer) => layer.id !== "feature-hover-highlight",
      )
    }

    // Priority 1: If "segments" category exists, filter out "selected-route-segments" and related layers
    // (This prevents duplicate segments entries in the legend)
    // Note: Boundaries are NOT filtered out here - they appear as separate top-level entries
    if (hasSegments) {
      filtered = filtered.filter(
        (layer) => layer.id !== "selected-route-segments",
      )
    }

    // Priority 2: If both "selected-route" and "selected-route-segments" exist, filter out "selected-route-segments"
    // (Note: "selected-route" is always filtered out in Priority 6, so this handles the segments case)
    // Note: Boundaries are NOT filtered out here - they appear as separate top-level entries
    if (hasSelectedRoute && hasSelectedRouteSegments) {
      filtered = filtered.filter(
        (layer) => layer.id !== "selected-route-segments",
      )
    }

    // Priority 3: If "selected-route" exists, filter out "segments" category
    // (When a route is selected, segments are shown as part of the selected route, not as a separate category)
    // Note: "selected-route" itself is always filtered out in Priority 6
    if (hasSelectedRoute && hasSegments) {
      filtered = filtered.filter((layer) => layer.id !== "segments")
    }

    // Priority 4: If both boundary types exist, filter out "selected-route-segments-boundaries"
    // (Keep "segmentation-boundaries" as it's the preferred one)
    if (hasSegmentationBoundaries && hasSelectedRouteBoundaries) {
      filtered = filtered.filter(
        (layer) => layer.id !== "selected-route-segments-boundaries",
      )
    }

    // Priority 5: If both "Hovered Route" and "Hovered Segments" exist, combine them into one entry
    if (hasHoveredRoute && hasHoveredSegments) {
      // Find the hovered route layer to get its properties
      const hoveredRouteLayer = deduplicated.find(
        (layer) => layer.id === "feature-hover-highlight",
      )
      const hoveredSegmentsLayer = deduplicated.find(
        (layer) => layer.id === "selected-route-segments-hovered",
      )

      // Create combined layer entry
      // Use the visibility state from both layers (if either is visible, the combined is visible)
      const combinedVisible =
        (hoveredRouteLayer?.visible ?? true) ||
        (hoveredSegmentsLayer?.visible ?? true)

      // Filter out individual hover layers
      filtered = filtered.filter(
        (layer) =>
          layer.id !== "feature-hover-highlight" &&
          layer.id !== "selected-route-segments-hovered",
      )

      // Add combined layer entry
      // filtered.push({
      //   id: "hovered-route-segments-combined",
      //   _originalId: "hovered-route-segments-combined",
      //   _originalLayerId: hoveredRouteLayer?._originalLayerId,
      //   visible: combinedVisible,
      // })
    }

    // Priority 6: Always filter out "selected-route" layer
    filtered = filtered.filter((layer) => layer.id !== "selected-route")

    return filtered
  }, [visibleLayers, mapMode])

  const visibleLayersCount = filteredVisibleLayers.filter(
    (layer) => layer.visible,
  ).length
  const selectionSummary = `Legend (${visibleLayersCount} visible)`

  return (
    <Paper
      elevation={12}
      className="fixed bottom-6 z-[1200] bg-white backdrop-blur-[10px] rounded-2xl overflow-hidden"
      sx={{
        left: leftPosition,
        width: panelWidth,
        pointerEvents: "auto",
        boxShadow: expanded
          ? "0px 12px 24px rgba(15,23,42,0.2), 0px 6px 12px rgba(15,23,42,0.15), 0px 2px 4px rgba(15,23,42,0.1)"
          : "0px 8px 16px rgba(15,23,42,0.15), 0px 4px 8px rgba(15,23,42,0.1)",
        cursor: expanded ? "default" : "pointer",
        transition:
          "left 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onClick={!expanded ? () => setExpanded(true) : undefined}
    >
      {!expanded ? (
        /* Collapsed View */
        <Box
          className="flex items-center justify-between gap-1.5 bg-[#FAFAFA]"
          sx={{
            px: pxToMuiSpacing(typo.spacing.panel.px - 4),
            py: pxToMuiSpacing(typo.spacing.panel.py - 2),
          }}
        >
          <Box className="flex items-center gap-1.5">
            <Layers
              sx={{ fontSize: typo.body.small }}
              className="text-mui-text-secondary"
            />
            <Typography
              variant="caption"
              sx={{ fontSize: typo.body.small, fontWeight: 500 }}
            >
              {selectionSummary}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(true)
            }}
            sx={{
              padding: 0.25,
            }}
          >
            <ExpandLess sx={{ fontSize: typo.body.medium }} />
          </IconButton>
        </Box>
      ) : (
        <>
          {/* Header */}
          <Box
            className="border-b border-mui-divider flex items-center justify-between cursor-pointer bg-[#FAFAFA]"
            sx={{
              px: pxToMuiSpacing(typo.spacing.panel.px - 4),
              py: pxToMuiSpacing(typo.spacing.panel.py - 2),
            }}
            onClick={() => setExpanded(false)}
          >
            <Box className="flex items-center gap-1.5">
              <Layers sx={{ fontSize: typo.body.small }} />
              <Typography
                variant="subtitle2"
                className="font-semibold"
                sx={{ fontSize: typo.body.small, fontWeight: 500 }}
              >
                Legend
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(false)
              }}
              sx={{
                padding: 0.25,
              }}
            >
              <ExpandMore sx={{ fontSize: typo.body.medium }} />
            </IconButton>
          </Box>

          {/* Layers List */}
          <Box className="max-h-96 overflow-auto pretty-scrollbar">
            {filteredVisibleLayers.length === 0 ? (
              <Box className="text-center py-8 px-4">
                <Layers
                  sx={{
                    fontSize: 28,
                    color: "rgba(0,0,0,0.2)",
                    mb: 0.5,
                  }}
                />
                <Typography
                  variant="caption"
                  className="text-gray-500 text-xs"
                  sx={{ display: "block", mt: 0.5 }}
                >
                  No layers available
                </Typography>
              </Box>
            ) : (
              <Box className="py-0.5">
                {filteredVisibleLayers.map((layer, index: number) => (
                  <Box key={layer.id}>
                    <Box
                      className="flex items-center gap-1.5 transition-all duration-150 group"
                      sx={{
                        px: pxToMuiSpacing(typo.spacing.panel.px - 4),
                        pt: pxToMuiSpacing(typo.spacing.panel.py / 2),
                        pb:
                          layer.id === "saved-routes-tile" ||
                          layer.id === "imported-roads" ||
                          layer.id === "selected-route-segments" ||
                          layer.id === "segments"
                            ? pxToMuiSpacing(typo.spacing.panel.py / 4)
                            : pxToMuiSpacing(typo.spacing.panel.py / 2),
                        "&:hover": {
                          backgroundColor: "rgba(249, 250, 251, 0.8)",
                        },
                        // borderLeft: layer.visible
                        //   ? "3px solid transparent"
                        //   : "3px solid transparent",
                        "&:hover .layer-indicator": {
                          boxShadow: `0 0 0 3px ${
                            layer.id === "hovered-route-segments-combined"
                              ? getLayerColor("feature-hover-highlight")
                              : getLayerColor(layer.id, layer._originalLayerId)
                          }20`,
                        },
                      }}
                    >
                      {/* Color Indicator or Dashed Line for Segment Boundaries */}
                      {/* Hide color indicator for saved-routes-tile, imported-roads, segments, and selected-route-segments (main categories with expandable legends) */}
                      {layer.id !== "saved-routes-tile" &&
                      layer.id !== "imported-roads" &&
                      layer.id !== "segments" &&
                      layer.id !== "selected-route-segments" ? (
                        <Box
                          className="flex-shrink-0 transition-all duration-200"
                          sx={{
                            width: "10px",
                            height: "10px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {layer.id === "selected-route-segments-boundaries" ||
                          layer.id === "segmentation-boundaries" ? (
                            <Box
                              className="segment-icon"
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "10px",
                                height: "10px",
                              }}
                            >
                              {/* Render a horizontal line to represent the perpendicular boundary line */}
                              <Box
                                sx={{
                                  width: "10px",
                                  height: "4px",
                                  backgroundColor: "rgba(255, 43, 139, 0.9)",
                                  transition: "all 0.2s ease",
                                  border: "0.5px solid rgba(0, 0, 0, 0.4)",
                                  borderRadius: "0.5px",
                                }}
                              />
                            </Box>
                          ) : layer.id === "waypoint-markers" ? (
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "10px",
                                height: "10px",
                              }}
                            >
                              {/* Destination marker icon (red pin) */}
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 48 72"
                                xmlns="http://www.w3.org/2000/svg"
                                style={{
                                  display: "block",
                                  verticalAlign: "middle",
                                }}
                              >
                                <path
                                  d="M24 0 C13 0 4 9 4 20 C4 34 17 48 22.5 67 C22.8 68 23.3 72 24 72 C24.7 72 25.2 68 25.5 67 C31 48 44 34 44 20 C44 9 35 0 24 0Z"
                                  fill="#ea4335"
                                  stroke="#b11313"
                                  strokeWidth="1"
                                />
                                <circle cx="24" cy="20" r="8" fill="#b11313" />
                              </svg>
                            </Box>
                          ) : (
                            <Box
                              className={`layer-indicator w-2.5 h-2.5 rounded-full transition-all duration-200}`}
                              style={{
                                backgroundColor:
                                  layer.id === "hovered-route-segments-combined"
                                    ? getLayerColor("feature-hover-highlight")
                                    : getLayerColor(
                                        layer.id,
                                        layer._originalLayerId,
                                      ),
                                boxShadow: `0 0 0 2px ${
                                  layer.id === "hovered-route-segments-combined"
                                    ? getLayerColor("feature-hover-highlight")
                                    : getLayerColor(
                                        layer.id,
                                        layer._originalLayerId,
                                      )
                                }30`,
                                // Add border for jurisdiction boundary in satellite mode (white color)
                                border:
                                  (layer.id === "saved-polygons" ||
                                    layer.id === "jurisdiction-boundary") &&
                                  mapType === "hybrid"
                                    ? "1.5px solid rgba(0, 0, 0, 0.4)"
                                    : "none",
                              }}
                            />
                          )}
                        </Box>
                      ) : (
                        <Box className="w-2.5 h-2.5 rounded-full transition-all duration-200" />
                      )}

                      {/* Layer Name */}
                      <Box className="flex-1 min-w-0">
                        <Typography
                          variant="body2"
                          className={`font-medium transition-all duration-150 ${
                            !layer.visible
                              ? "text-gray-400 line-through"
                              : "text-gray-900"
                          }`}
                          sx={{
                            fontSize: typo.body.xsmall,
                            fontWeight: 500,
                            opacity: layer.visible ? 1 : 0.6,
                          }}
                        >
                          {layer.id === "hovered-route-segments-combined"
                            ? "Hovered Route/Segments"
                            : getLayerName(layer.id)}
                        </Typography>
                      </Box>

                      {/* Expand Icon for Saved Routes */}
                      {layer.id === "saved-routes-tile" && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedSavedRoutes(!expandedSavedRoutes)
                          }}
                          className="p-0.5"
                          sx={{
                            color: "rgba(0,0,0,0.54)",
                            "&:hover": {
                              backgroundColor: "rgba(0,0,0,0.08)",
                            },
                          }}
                        >
                          <ExpandMore
                            sx={{
                              fontSize: typo.body.small,
                              transform: expandedSavedRoutes
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                              transition:
                                "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                            }}
                          />
                        </IconButton>
                      )}

                      {/* Expand Icon for Imported Roads */}
                      {layer.id === "imported-roads" && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedImportedRoads(!expandedImportedRoads)
                          }}
                          className="p-0.5"
                          sx={{
                            color: "rgba(0,0,0,0.54)",
                            "&:hover": {
                              backgroundColor: "rgba(0,0,0,0.08)",
                            },
                          }}
                        >
                          <ExpandMore
                            sx={{
                              fontSize: typo.body.small,
                              transform: expandedImportedRoads
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                              transition:
                                "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                            }}
                          />
                        </IconButton>
                      )}

                      {/* Expand Icon for Route Segments */}
                      {layer.id === "selected-route-segments" && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedSegments(!expandedSegments)
                          }}
                          className="p-0.5"
                          sx={{
                            color: "rgba(0,0,0,0.54)",
                            "&:hover": {
                              backgroundColor: "rgba(0,0,0,0.08)",
                            },
                          }}
                        >
                          <ExpandMore
                            sx={{
                              fontSize: typo.body.small,
                              transform: expandedSegments
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                              transition:
                                "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                            }}
                          />
                        </IconButton>
                      )}

                      {/* Expand Icon for Segments Category */}
                      {layer.id === "segments" && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedSegmentsCategory(
                              !expandedSegmentsCategory,
                            )
                          }}
                          className="p-0.5"
                          sx={{
                            color: "rgba(0,0,0,0.54)",
                            "&:hover": {
                              backgroundColor: "rgba(0,0,0,0.08)",
                            },
                          }}
                        >
                          <ExpandMore
                            sx={{
                              fontSize: typo.body.small,
                              transform: expandedSegmentsCategory
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                              transition:
                                "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                            }}
                          />
                        </IconButton>
                      )}

                      {/* Visibility Toggle - Hide for hovered layers (temporary) and selected route layers */}
                      {layer.id !== "feature-hover-highlight" &&
                        layer.id !== "selected-route" &&
                        layer.id !== "selected-route-segments-hovered" && (
                          <Checkbox
                            title={layer.visible ? "Hide Layer" : "Show Layer"}
                            size="small"
                            checked={layer.visible}
                            onChange={(e) => {
                              e.stopPropagation()
                              // Use the base ID for toggling visibility
                              const layerIdToCheck =
                                layer._parentLayerId ||
                                layer._originalId ||
                                layer.id
                              const baseId = getBaseLayerId(layerIdToCheck)
                              // Use the current visibility state from the layer object
                              // This ensures we toggle based on the actual current state,
                              // not the store state which might be undefined on first load
                              const newVisibility = !layer.visible
                              console.log(
                                "🔄 [LegendsPanel] Toggling layer visibility:",
                                {
                                  layerId: layer.id,
                                  layerIdToCheck,
                                  baseId,
                                  currentVisible: layer.visible,
                                  newVisibility,
                                },
                              )

                              // Special handling for segments category - toggle all child layers
                              // (excluding boundaries which are separate top-level entries)
                              if (layer.id === "segments") {
                                const childLayerIds = [
                                  "preview-segments",
                                  "selected-route-segments",
                                  "selected-route-segments-hovered",
                                ]
                                childLayerIds.forEach((childId) => {
                                  setLayerVisibility(childId, newVisibility)
                                })
                                // Also set the parent segments visibility
                                setLayerVisibility("segments", newVisibility)
                              } else if (
                                layer.id === "hovered-route-segments-combined"
                              ) {
                                // Toggle both hovered route and hovered segments
                                setLayerVisibility(
                                  "feature-hover-highlight",
                                  newVisibility,
                                )
                                setLayerVisibility(
                                  "selected-route-segments-hovered",
                                  newVisibility,
                                )
                              } else {
                                setLayerVisibility(baseId, newVisibility)
                              }
                            }}
                            icon={
                              <VisibilityOff
                                sx={{
                                  fontSize: 16,
                                  color: "rgba(0,0,0,0.4)",
                                }}
                              />
                            }
                            checkedIcon={
                              <Visibility
                                sx={{
                                  fontSize: 16,
                                  color: "rgba(37,99,235,0.9)",
                                }}
                              />
                            }
                            className="p-0"
                            sx={{
                              "&:hover": {
                                backgroundColor: "rgba(37,99,235,0.08)",
                              },
                              "&.Mui-checked": {
                                color: "rgba(37,99,235,0.9)",
                              },
                            }}
                          />
                        )}
                    </Box>

                    {/* Expanded Saved Routes Legend */}
                    {layer.id === "saved-routes-tile" &&
                      expandedSavedRoutes && (
                        <Box className="space-y-0 px-3 pb-1 pt-0">
                          {savedRoutesLegend.map((legend) => (
                            <Box
                              key={legend.label}
                              className="flex items-center gap-1.5 group/legend"
                            >
                              <Box
                                className="legend-dot w-2.5 h-2.5 rounded-full transition-transform duration-200 shadow-sm"
                                style={{
                                  backgroundColor: legend.color,
                                  boxShadow: `0 0 0 1px ${legend.color}40`,
                                }}
                              />
                              <Typography
                                variant="caption"
                                className="text-gray-700 font-medium"
                                sx={{
                                  fontSize: typo.body.xxsmall,
                                  fontWeight: 500,
                                }}
                              >
                                {legend.label}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      )}

                    {/* Expanded Imported Roads Legend */}
                    {layer.id === "imported-roads" && expandedImportedRoads && (
                      <Box className="px-3 pb-1 pt-0 space-y-0">
                        {importedRoadsLegend.map((legend) => {
                          // Determine if this is the "Default" legend and satellite mode is on
                          // For this file, assume you have access to `mapType`
                          // `mapType` is assumed to be either "roadmap" or "hybrid" (satellite)
                          const isDefault =
                            legend.label === "Default" ||
                            legend.label === "Imported" // fallback for possible label options
                          const isSatellite = mapType === "hybrid"
                          return (
                            <Box
                              key={legend.label}
                              className="flex items-center gap-1.5 group/legend"
                            >
                              <Box
                                className={
                                  "legend-dot w-2.5 h-2.5 rounded-full transition-transform duration-200 shadow-sm" +
                                  (isDefault && isSatellite
                                    ? " border border-gray-400"
                                    : "")
                                }
                                style={{
                                  backgroundColor: legend.color,
                                  // Optionally boost contrast on the box shadow for default + satellite
                                }}
                              />
                              <Typography
                                variant="caption"
                                className="text-gray-700 font-medium"
                                sx={{
                                  fontSize: typo.body.xxsmall,
                                  fontWeight: 500,
                                }}
                              >
                                {legend.label}
                              </Typography>
                            </Box>
                          )
                        })}
                      </Box>
                    )}

                    {/* Expanded Route Segments Legend */}
                    {layer.id === "selected-route-segments" &&
                      expandedSegments &&
                      segmentsLegend &&
                      segmentsLegend.length > 0 && (
                        <Box className="px-3 pb-1 pt-0 space-y-0">
                          {segmentsLegend.map((legend) => (
                            <Box
                              key={legend.label}
                              className="flex items-center gap-1.5 group/legend"
                            >
                              <Box
                                className="legend-dot w-2.5 h-2.5 rounded-full transition-transform duration-200 shadow-sm"
                                style={{
                                  backgroundColor: legend.color,
                                  boxShadow: `0 0 0 1px ${legend.color}40`,
                                }}
                              />
                              <Typography
                                variant="caption"
                                className="text-gray-700 font-medium"
                                sx={{
                                  fontSize: typo.body.xxsmall,
                                  fontWeight: 500,
                                }}
                              >
                                {legend.label}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      )}

                    {/* Expanded Segments Category Legend */}
                    {layer.id === "segments" &&
                      expandedSegmentsCategory &&
                      segmentsLegend &&
                      segmentsLegend.length > 0 && (
                        <Box className="px-3 pb-1 pt-0 space-y-0">
                          {segmentsLegend.map((legend) => (
                            <Box
                              key={legend.label}
                              className="flex items-center gap-1.5 group/legend"
                            >
                              <Box
                                className="legend-dot w-2.5 h-2.5 rounded-full transition-transform duration-200 shadow-sm"
                                style={{
                                  backgroundColor: legend.color,
                                  boxShadow: `0 0 0 1px ${legend.color}40`,
                                }}
                              />
                              <Typography
                                variant="caption"
                                className="text-gray-700 font-medium"
                                sx={{
                                  fontSize: typo.body.xxsmall,
                                  fontWeight: 500,
                                }}
                              >
                                {legend.label}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      )}

                    {/* Divider between layers - Sharp and distinct */}
                    {index < filteredVisibleLayers.length - 1 && (
                      <Box
                        sx={{
                          height: "1px",
                          backgroundColor: "rgba(0, 0, 0, 0.15)",
                          mx: 0,
                          borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                        }}
                      />
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </>
      )}
    </Paper>
  )
}

export default LegendsPanel
