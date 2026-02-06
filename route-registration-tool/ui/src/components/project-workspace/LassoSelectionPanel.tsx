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

import Close from "@mui/icons-material/Close"
import { Box, IconButton, Stack, Typography } from "@mui/material"
import React from "react"

import { RoadPriority } from "../../constants/road-priorities"
import {
  useBatchSaveRoutesFromSelection,
  useLassoRoadSelection,
  useProjectTags,
} from "../../hooks"
import { useProjectWorkspaceStore } from "../../stores"
import { useLayerStore } from "../../stores/layer-store"
import { extractWaypointsFromLineString } from "../../utils/multi-select-route"
import Button from "../common/Button"
import RoadPrioritySelector from "../common/RoadPrioritySelector"
import TagSelector from "../common/TagSelector"

const LassoSelectionPanel: React.FC = () => {
  const { mapMode, setMapMode, projectId, setActivePanel } =
    useProjectWorkspaceStore()
  const lassoDrawing = useLayerStore((state) => state.lassoDrawing)
  const clearAllDrawing = useLayerStore((state) => state.clearAllDrawing)
  const setLassoSelectedRoads = useLayerStore(
    (state) => state.setLassoSelectedRoads,
  )
  const [isOpen, setIsOpen] = React.useState(false)
  const [selectedPriorities, setSelectedPriorities] = React.useState<
    RoadPriority[]
  >([
    "ROAD_PRIORITY_UNSPECIFIED",
    "ROAD_PRIORITY_NON_TRAFFIC",
    "ROAD_PRIORITY_TERMINAL",
    "ROAD_PRIORITY_LOCAL",
    "ROAD_PRIORITY_MINOR_ARTERIAL",
    "ROAD_PRIORITY_MAJOR_ARTERIAL",
    "ROAD_PRIORITY_SECONDARY_ROAD",
    "ROAD_PRIORITY_PRIMARY_HIGHWAY",
    "ROAD_PRIORITY_LIMITED_ACCESS",
    "ROAD_PRIORITY_CONTROLLED_ACCESS",
  ])
  const [expandedCategories, setExpandedCategories] = React.useState<
    Record<string, boolean>
  >({})
  const [selectedTag, setSelectedTag] = React.useState<string | null>(null)
  const [tagError, setTagError] = React.useState<string>("")
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null)
  const [statusError, setStatusError] = React.useState<string | null>(null)
  const { data: tags = [] } = useProjectTags(projectId || "")
  const batchSaveRoutesMutation = useBatchSaveRoutesFromSelection()

  const lassoConfirmed = useLayerStore((state) => state.lassoDrawing.confirmed)

  const lassoRoadSelection = useLassoRoadSelection({
    projectId: projectId || undefined,
    polygon: lassoDrawing.completedPolygon,
    priorities: selectedPriorities,
    confirmed: lassoConfirmed,
  })

  const displayedRoads = (lassoRoadSelection.data || []).map((road) => ({
    ...road,
    linestringGeoJson: (() => {
      if (typeof road.linestringGeoJson === "string") {
        try {
          return JSON.parse(road.linestringGeoJson)
        } catch {
          return road.linestringGeoJson
        }
      }
      return road.linestringGeoJson
    })(),
  }))

  const lastRoadIdsRef = React.useRef<string[]>([])

  React.useEffect(() => {
    if (!lassoDrawing.completedPolygon) return

    const currentIds = displayedRoads.map((road) => road?.id?.toString())
    const previousIds = lastRoadIdsRef.current

    const idsUnchanged =
      currentIds.length === previousIds.length &&
      currentIds.every((id, index) => id === previousIds[index])

    if (!idsUnchanged) {
      setLassoSelectedRoads(displayedRoads)
      lastRoadIdsRef.current = currentIds
    }
  }, [lassoDrawing.completedPolygon, displayedRoads, setLassoSelectedRoads])

  // Manage panel visibility based on lasso selection state
  // Panel expansion is controlled only by user clicking the toggle button
  React.useEffect(() => {
    if (mapMode === "lasso_selection" && lassoDrawing.completedPolygon) {
      setIsOpen(true)
      // Don't set activePanel for lasso_selection as it's not a valid panel type
    } else if (
      mapMode !== "lasso_selection" ||
      !lassoDrawing.completedPolygon
    ) {
      setIsOpen(false)
      if (mapMode !== "lasso_selection") {
        setActivePanel(null)
      }
    }
  }, [mapMode, lassoDrawing.completedPolygon, setActivePanel])

  if (
    mapMode !== "lasso_selection" ||
    !lassoDrawing.completedPolygon ||
    !isOpen
  ) {
    return null
  }

  const handleConfirm = async () => {
    if (!projectId) return
    const tagValue = selectedTag?.trim() || ""
    if (!tagValue) {
      setTagError("Please select or type a folder")
      return
    }

    const availableRoads = lassoRoadSelection.data || []
    if (availableRoads.length === 0) {
      setStatusError(
        lassoRoadSelection.isFetching
          ? "Still fetching roads. Please wait..."
          : "No roads match the selected priorities.",
      )
      return
    }

    setStatusError(null)
    setTagError("")

    try {
      const normalizeGeoJsonLine = (
        linestring: any,
      ): GeoJSON.LineString | null => {
        if (!linestring) return null
        if (typeof linestring === "string") {
          try {
            return JSON.parse(linestring) as GeoJSON.LineString
          } catch (error) {
            return null
          }
        }
        if (
          typeof linestring === "object" &&
          linestring.type === "LineString"
        ) {
          return linestring as GeoJSON.LineString
        }
        return null
      }

      const payloadRoads = availableRoads
        .map((road, index) => {
          console.log("road----------------", road)
          const normalized = normalizeGeoJsonLine(road.linestringGeoJson)
          if (!normalized) return null

          const coordinates = normalized.coordinates
          if (!coordinates || coordinates.length < 2) return null

          // Extract origin and destination from LineString coordinates
          const origin: [number, number] = [
            coordinates[0][0],
            coordinates[0][1],
          ] // [lng, lat]
          const destination: [number, number] = [
            coordinates[coordinates.length - 1][0],
            coordinates[coordinates.length - 1][1],
          ] // [lng, lat]

          // Extract waypoints from geometry (max 25 waypoints, sampled evenly if more)
          const waypointObjects = extractWaypointsFromLineString(normalized)
          const waypoints: [number, number][] = waypointObjects.map(
            (wp: { lat: number; lng: number }) => [wp.lng, wp.lat], // Convert to [lng, lat] format
          )

          return {
            ...road,
            route_type: "imported_from_road",
            id: road.id,
            name: `${tagValue} - Route ${index + 1}`,
            linestringGeoJson: normalized,
            origin,
            destination,
            length: road.distanceKm,
            waypoints,
          }
        })
        .filter(Boolean) as Array<{
        id: string
        name: string
        linestringGeoJson: GeoJSON.LineString
        origin: [number, number]
        destination: [number, number]
        waypoints: [number, number][]
      }>

      if (payloadRoads.length === 0) {
        setStatusError("No valid road geometries available for batch save.")
        return
      }

      const result = await batchSaveRoutesMutation.mutateAsync({
        projectId,
        tag: tagValue,
        roads: payloadRoads,
      })

      setStatusMessage(
        `Saved ${result.savedCount} route${
          result.savedCount === 1 ? "" : "s"
        } successfully.`,
      )

      if (result.errors.length > 0) {
        setStatusError(
          `Failed to save ${result.errors.length} road${
            result.errors.length === 1 ? "" : "s"
          }: ${result.errors.map((err) => err.message).join("; ")}`,
        )
      }

      clearAllDrawing()
      setMapMode("view")
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Batch save failed",
      )
    }
  }

  const handleCancel = () => {
    clearAllDrawing()
    setMapMode("view")
    setIsOpen(false)
  }

  return (
    <>
      <Box
        className="fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white flex"
        sx={{
          width: "360px",
          fontFamily: "'Google Sans', 'Roboto', sans-serif",
          zIndex: 1000,
        }}
      >
        <Box
          className="h-full flex flex-col border-r border-gray-200 bg-white"
          sx={{
            width: "360px",
            boxShadow:
              "0 4px 16px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1)",
            position: "relative",
            zIndex: 1000,
          }}
        >
          {/* Header Section - Fixed Height */}
          <Box
            className="px-4 pt-3 pb-3 border-b border-gray-200 bg-white"
            sx={{
              flexShrink: 0,
            }}
          >
            <div className="flex items-center justify-between">
              <Typography
                variant="h6"
                className="text-gray-900 font-medium"
                style={{ fontSize: "15px", fontWeight: 500 }}
              >
                Roads Selection
              </Typography>
              <IconButton size="small" onClick={handleCancel}>
                <Close fontSize="small" />
              </IconButton>
            </div>
          </Box>

          {/* Tag Selector - Above road priorities */}
          <Box
            className="px-4 py-3 border-b border-gray-200 bg-white"
            sx={{
              flexShrink: 0,
            }}
          >
            <Typography
              variant="caption"
              className="uppercase"
              color="text.secondary"
              sx={{ mb: 1, display: "block" }}
            >
              Folder
            </Typography>
            <TagSelector
              tags={tags}
              value={selectedTag}
              onChange={(value) => {
                setSelectedTag(value)
                setTagError("")
              }}
              error={tagError}
              helperText={tagError || undefined}
            />
          </Box>

          {/* Road Priorities Selector */}
          <Box
            className="flex-1 overflow-auto pretty-scrollbar px-4 py-3 border-b border-gray-200 bg-white"
            sx={{
              flexShrink: 0,
              minHeight: 0,
            }}
          >
            <RoadPrioritySelector
              selectedPriorities={selectedPriorities}
              onSelectionChange={(priorities) => {
                setSelectedPriorities(priorities)
              }}
              expandedCategories={expandedCategories}
              onExpandedCategoriesChange={setExpandedCategories}
            />
          </Box>

          {/* Footer */}
          <Box
            className="px-4 py-4 border-t border-gray-200 bg-white"
            sx={{
              flexShrink: 0,
              minHeight: "48px",
              position: "relative",
              zIndex: 1001, // Ensure footer is above content
            }}
          >
            <Box className="flex flex-col gap-3">
              {lassoRoadSelection.isFetching && (
                <Typography variant="caption" color="text.secondary">
                  Fetching roads for your lasso selection...
                </Typography>
              )}
              {lassoRoadSelection.error && (
                <Typography variant="caption" color="error">
                  {lassoRoadSelection.error.message ||
                    "Failed to fetch roads from the server."}
                </Typography>
              )}
              {statusError && (
                <Typography variant="caption" color="error">
                  {statusError}
                </Typography>
              )}
              {/* {statusMessage && (
              <Typography variant="caption" color="success.main">
                {statusMessage}
              </Typography>
            )} */}

              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={handleCancel}
                  size="small"
                >
                  Cancel
                </Button>

                <Button
                  variant="contained"
                  fullWidth
                  onClick={handleConfirm}
                  size="small"
                  disabled={
                    batchSaveRoutesMutation.status === "pending" ||
                    !lassoDrawing.completedPolygon ||
                    displayedRoads.length === 0 ||
                    lassoRoadSelection.isFetching ||
                    !selectedTag?.trim()
                  }
                >
                  {batchSaveRoutesMutation.status === "pending"
                    ? "Saving..."
                    : "Save All"}
                </Button>
              </Stack>
            </Box>
          </Box>
        </Box>
      </Box>
    </>
  )
}

export default LassoSelectionPanel
