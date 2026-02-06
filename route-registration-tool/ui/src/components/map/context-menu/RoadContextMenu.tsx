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

// ui/src/components/map/context-menu/RoadContextMenu.tsx
import {
  Delete,
  Route as RouteIcon,
  Save,
  ScatterPlot,
} from "@mui/icons-material"
import { Chip } from "@mui/material"
import React, { useEffect } from "react"

import { useDeleteRoad, useStretchRoad } from "../../../hooks"
import { useLayerStore } from "../../../stores"
import { formatDistance, useDistanceUnit } from "../../../utils/distance-utils"
import ConfirmationDialog from "../../common/ConfirmationDialog"
import ContextMenu, { ContextMenuItem } from "../../common/ContextMenu"

interface RoadContextMenuProps {
  x: number
  y: number
  road: any
  projectId: string
  onClose: () => void
}

const RoadContextMenu: React.FC<RoadContextMenuProps> = ({
  x,
  y,
  road,
  projectId,
  onClose,
}) => {
  console.log("🔍 Road in RoadContextMenu:", road)
  const distanceUnit = useDistanceUnit()

  // Hooks
  const deleteRoadMutation = useDeleteRoad()
  const stretchRoadMutation = useStretchRoad()
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const selectedRoadPriorities = useLayerStore(
    (state) => state.selectedRoadPriorities,
  )

  const startStretchMode = useLayerStore((state) => state.startStretchMode)
  const startMultiSelectMode = useLayerStore(
    (state) => state.startMultiSelectMode,
  )
  const exitSelectionMode = useLayerStore((state) => state.exitSelectionMode)

  useEffect(() => {
    // Prepare road data for preview
    let linestringGeoJson = road.linestringGeoJson

    if (!linestringGeoJson && road.polyline) {
      linestringGeoJson = {
        type: "LineString",
        coordinates: road.polyline,
      }
    }

    const roadData = {
      id: road?.id?.toString(),
      routeId: "",
      name: road.name || `Road ${road.id}`,
      linestringGeoJson,
      segmentOrder: 0,
      distanceKm: road.length || 0,
      createdAt: new Date().toISOString(),
    }

    startStretchMode([roadData], { isPreview: true })

    return () => {
      const currentState = useLayerStore.getState().roadSelection
      if (currentState.isPreview) {
        exitSelectionMode()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [road.id])

  const handleDelete = () => {
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    try {
      console.log("Delete road:", road.id)

      await deleteRoadMutation.mutateAsync({
        roadId: road?.id?.toString(),
        projectId,
      })

      console.log("✅ Road soft deleted successfully")
      setDeleteDialogOpen(false)
      onClose()
    } catch (error) {
      console.error("❌ Failed to delete road:", error)
      alert("Failed to delete road. Please try again.")
      setDeleteDialogOpen(false)
    }
  }

  // Save as Route - starts stretch mode which shows SelectionToolbar panel
  const handleSaveAsRoute = () => {
    console.log("💾 Save as Route clicked for road:", road.id)

    // Convert road to format expected by store
    let linestringGeoJson = road.linestringGeoJson

    // If linestringGeoJson is missing, create it from polyline
    if (!linestringGeoJson && road.polyline) {
      linestringGeoJson = {
        type: "LineString",
        coordinates: road.polyline,
      }
    }

    const roadData = {
      id: road?.id?.toString(),
      routeId: "",
      name: road.name || `Road ${road.id}`,
      linestringGeoJson: linestringGeoJson,
      segmentOrder: 0,
      distanceKm: road.length || 0,
      createdAt: new Date().toISOString(),
    }

    // Start stretch mode with this road - this will show SelectionToolbar panel
    startStretchMode([roadData])

    console.log("✅ Started stretch mode - SelectionToolbar should appear")
    onClose()
  }

  const handleStretchToIntersection = async () => {
    try {
      console.log("🛣️ Stretching road to intersection:", road.id)

      // Get selected road priorities from store
      const priorityList =
        selectedRoadPriorities.length > 0 ? selectedRoadPriorities : []

      if (priorityList.length === 0) {
        alert("Please select at least one road priority before stretching")
        onClose()
        return
      }

      // Call stretch API
      const result = await stretchRoadMutation.mutateAsync({
        roadId: road.id,
        projectId,
        priorityList,
      })

      console.log("✅ Stretch successful:", result)
      console.log("🔍 Stretched roads data:", result.stretched_roads)

      // Convert stretched roads to the format expected by the store
      const stretchedRoads = result.stretched_roads.map((r: any) => {
        console.log("🔍 Processing stretched road:", r)

        // Ensure proper linestring format
        let linestringGeoJson = r.linestringGeoJson

        // If linestringGeoJson is missing, try polyline
        if (!linestringGeoJson && r.polyline) {
          linestringGeoJson =
            typeof r.polyline === "string" ? JSON.parse(r.polyline) : r.polyline
        }

        console.log("✅ Linestring for road", r.id, ":", linestringGeoJson)

        return {
          ...r,
          linestringGeoJson,
        }
      })

      console.log("📦 Processed stretched roads:", stretchedRoads)

      // Update store to show highlighted roads (replaces preview)
      startStretchMode(stretchedRoads)

      console.log(`✅ Stretched to ${result.total_count} roads`)
    } catch (error) {
      console.error("❌ Failed to stretch road:", error)
      alert(
        `Failed to stretch road: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
    onClose()
  }

  const handleStartMultiSelect = () => {
    try {
      console.log("🎯 Starting multi-select mode with road:", road.id)
      console.log("🔍 Road data:", road)

      // Convert polyline array to proper GeoJSON LineString format
      let linestringGeoJson = road.linestringGeoJson

      // If linestringGeoJson is missing, create it from polyline
      if (!linestringGeoJson && road.polyline) {
        linestringGeoJson = {
          type: "LineString",
          coordinates: road.polyline,
        }
      }

      // Convert road to format expected by store - ensure all required fields
      const roadData = {
        id: road?.id?.toString(),
        routeId: "",
        name: road.name || `Road ${road.id}`,
        linestringGeoJson: linestringGeoJson,
        segmentOrder: 0,
        distanceKm: road.length || 0,
        createdAt: new Date().toISOString(),
      }

      console.log("📦 Prepared road data for multi-select:", roadData)
      console.log("📦 Linestring data:", roadData.linestringGeoJson)

      // Start multi-select mode (replaces preview)
      startMultiSelectMode(roadData)

      console.log("✅ Multi-select mode activated")
    } catch (error) {
      console.error("❌ Failed to start multi-select mode:", error)
      alert(
        `Failed to start multi-select mode: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
    onClose()
  }

  // Truncate road name if too long
  const roadName = road.name || `Road #${road.id}`
  const displayName =
    roadName.length > 25 ? `${roadName.substring(0, 22)}...` : roadName

  // Build menu items
  const menuItems: ContextMenuItem[] = [
    {
      id: "save-as-route",
      label: "Save as Route",
      icon: <Save sx={{ fontSize: 16 }} />,
      onClick: handleSaveAsRoute,
    },
    {
      id: "stretch",
      label: "Stretch to Intersection",
      icon: <ScatterPlot sx={{ fontSize: 16 }} />,
      onClick: handleStretchToIntersection,
    },
    {
      id: "multi-select",
      label: "Multi-select Mode",
      icon: <RouteIcon sx={{ fontSize: 16 }} />,
      onClick: handleStartMultiSelect,
    },
    {
      id: "delete",
      label: "Delete Road",
      icon: <Delete sx={{ fontSize: 16 }} />,
      onClick: handleDelete,
    },
  ]

  // Map priority to user-friendly category names
  const getRoadCategoryLabel = (priority: string | undefined): string => {
    if (!priority) return "Road"

    // Road priority user-friendly category mapping - generated from road-priorities.ts
    const priorityMap: Record<string, string> = {
      ROAD_PRIORITY_UNSPECIFIED: "Local ",
      ROAD_PRIORITY_NON_TRAFFIC: "Local ",
      ROAD_PRIORITY_TERMINAL: "Local ",
      ROAD_PRIORITY_LOCAL: "Local ",
      ROAD_PRIORITY_MINOR_ARTERIAL: "Arterial ",
      ROAD_PRIORITY_MAJOR_ARTERIAL: "Arterial ",
      ROAD_PRIORITY_SECONDARY_ROAD: "Arterial ",
      ROAD_PRIORITY_PRIMARY_HIGHWAY: "Highway ",
      ROAD_PRIORITY_LIMITED_ACCESS: "Highway ",
      ROAD_PRIORITY_CONTROLLED_ACCESS: "Highway ",
    }

    return priorityMap[priority] || ""
  }

  const priorityLabel = getRoadCategoryLabel(road.priority) + "Road"
  const roadDisplayName = road.name || `Road #${road.id}`

  return (
    <>
      <ContextMenu
        x={x}
        y={y}
        onClose={onClose}
        draggable={true}
        width={200}
        header={{
          title: displayName,
          fullTitle: roadName, // Full name for tooltip
          metadata: (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-gray-600">
                {formatDistance(road.length || 0, distanceUnit)}
              </span>
              <span className="text-xs text-gray-400">•</span>
              <Chip
                label={priorityLabel}
                size="small"
                sx={{
                  height: 18,
                  fontSize: "11px",
                  fontWeight: 500,
                  backgroundColor: "#f5f5f5",
                  color: "#666",
                  "& .MuiChip-label": {
                    padding: "0 6px",
                  },
                }}
              />
            </div>
          ),
        }}
        items={menuItems}
      />
      <ConfirmationDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false)
          onClose()
        }}
        onConfirm={confirmDelete}
        title="Delete Road"
        message={`Delete "${roadDisplayName}"? This action cannot be undone.`}
        confirmText="Delete"
        isLoading={deleteRoadMutation.isPending}
      />
    </>
  )
}

export default RoadContextMenu
