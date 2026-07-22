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

import React, { useEffect } from "react"

import { MapNavigationProvider } from "../../contexts/map-navigation-context"
import { useProject } from "../../hooks"
import { useWebSocket } from "../../hooks/use-websocket"
import { useLayerStore, useProjectWorkspaceStore } from "../../stores"
import DynamicIsland from "../common/DynamicIsland"
import UnifiedProjectMap from "../map/UnifiedProjectMap"
import IndividualDrawingPanel from "./IndividualDrawingPanel"
import RoutesPanel from "./LeftFloatingPanel"
import MapControls from "./MapControls"
import RouteDetailsPanel from "./RouteDetailsPanel"
import UploadedRoutesPanel from "./UploadedRoutesPanel"

/**
 * Clears uploaded routes and related state when entering a project.
 * This ensures that uploaded routes from previous sessions don't persist.
 */
const clearUploadedRoutesState = () => {
  const layerStore = useLayerStore.getState()

  // Get uploaded routes BEFORE clearing them (so we can discard their changes)
  const uploadedRoutes = layerStore.uploadedRoutes.routes

  // Clear all editing states and preview roads for each uploaded route
  uploadedRoutes.forEach((route) => {
    layerStore.discardRouteChanges(route.id)
  })

  // Clear uploaded routes
  layerStore.clearUploadedRoutes()

  // Clear snapped roads completely - reset all snapped roads state in one operation
  useLayerStore.setState({
    snappedRoads: {
      roads: [],
      isVisible: layerStore.snappedRoads.isVisible, // Preserve visibility setting
      isLoading: false,
      routeMarkers: [],
      isDraggingMarker: false,
      hoveredRouteId: null,
      previewRoads: [],
      editingStates: {},
    },
  })

  // Clear all optimized route markers
  layerStore.clearAllOptimizedRouteMarkers()

  // Clear selected uploaded route
  layerStore.setSelectedUploadedRouteId(null)

  // Clear editing saved route ID
  layerStore.setEditingSavedRouteId(null)

  // Clear waypoint adding mode
  layerStore.setAddingWaypointMode(null)

  // Clear route UUID
  layerStore.setRouteUUID(null)

  // Clear points
  layerStore.clearPoints()
}

interface ProjectWorkspaceLayoutProps {
  projectId: string
  apiKey: string
  className?: string
  style?: React.CSSProperties
}

const ProjectWorkspaceLayout: React.FC<ProjectWorkspaceLayoutProps> = ({
  projectId,
  apiKey,
  className,
  style,
}) => {
  const setProject = useProjectWorkspaceStore((state) => state.setProject)
  const projectData = useProjectWorkspaceStore((state) => state.projectData)
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)

  // Use TanStack Query hooks for data fetching
  const {
    data: project,
    isLoading: isProjectLoading,
    error: projectError,
  } = useProject(projectId)

  // WebSocket connection for live route updates and route status updates
  const projectNumber = project?.bigQueryColumn?.googleCloudProjectNumber
    ? parseInt(project.bigQueryColumn.googleCloudProjectNumber, 10)
    : 0
  // Use projectId from URL params directly - this matches the database project_id
  // The projectId from URL is the same as the database project_id (integer converted to string)
  const wsProjectId = projectId || ""

  // Connect WebSocket to receive route status updates automatically
  useWebSocket({
    projectId: wsProjectId,
    projectNumber: projectNumber,
    enabled: !!project && !!projectId && !!wsProjectId,
  })

  // Clear uploaded routes whenever projectId changes (including when returning to the same project)
  useEffect(() => {
    if (projectId) {
      clearUploadedRoutesState()
    }
  }, [projectId])

  // Update store when data is loaded
  useEffect(() => {
    if (project && project.id !== projectData?.id) {
      setProject(projectId, project)
      // Refresh tile timestamps to force tile refetch when project changes
      const layerStore = useLayerStore.getState()
      layerStore.refreshRoutesTilesTimestamp()
      layerStore.refreshRoadsTilesTimestamp()
    }
  }, [project, projectId, projectData?.id, setProject])

  // Clean up any leftover roads from previous sessions when project data is fetched
  // This handles the case where user refreshed the page without canceling
  // useEffect(() => {
  //   if (project && projectId) {
  //     // Silently clean up any leftover roads - don't show errors if none exist
  //     apiClient
  //       .delete(`/polygon/delete/${projectId}`)
  //       .then(() => {
  //         console.log("✅ Cleaned up leftover roads from previous session")
  //       })
  //       .catch((error) => {
  //         // Silently ignore errors - roads might not exist, which is fine
  //         console.log(
  //           "ℹ️ No leftover roads to clean up (or cleanup failed):",
  //           error,
  //         )
  //       })
  //   }
  // }, [project, projectId])

  // Log WebSocket connection state - DISABLED
  // useEffect(() => {
  //   if (wsConnectionState !== "disconnected") {
  //     console.log("🔌 WebSocket state:", wsConnectionState)
  //   }
  //   if (wsError) {
  //     console.error("❌ WebSocket error:", wsError)
  //   }
  // }, [wsConnectionState, wsError])


  // Show loading state while data is being loaded
  if (isProjectLoading) {
    return (
      <div
        className={`relative w-full h-screen overflow-hidden flex items-center justify-center ${className}`}
        style={style}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-mui-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading project...</p>
        </div>
      </div>
    )
  }

  // Show error state if data failed to load
  if (projectError) {
    return (
      <div
        className={`relative w-full h-screen overflow-hidden flex items-center justify-center ${className}`}
        style={style}
      >
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load project</p>
          <p className="text-gray-600">
            {projectError?.message || "Please try refreshing the page"}
          </p>
        </div>
      </div>
    )
  }

  // Show error state if project data is not available
  if (!projectData) {
    return (
      <div
        className={`relative w-full h-screen overflow-hidden flex items-center justify-center ${className}`}
        style={style}
      >
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load project</p>
          <p className="text-gray-600">Please try refreshing the page</p>
        </div>
      </div>
    )
  }

  return (
    <MapNavigationProvider>
      <div
        className={`relative w-full h-screen overflow-hidden ${className}`}
        style={style}
      >
        {/* Map */}
        <UnifiedProjectMap
          projectId={projectId}
          apiKey={apiKey}
          className="w-full h-full"
        />

        {/* Back to Dashboard Button */}
        {/* <div className="absolute top-20 left-4 z-50">
          <IconButton
            onClick={() => navigate("/dashboard")}
            sx={{
              backgroundColor: "white",
              color: "#5f6368",
              boxShadow:
                "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)",
              "&:hover": {
                backgroundColor: "#f8f9fa",
                boxShadow:
                  "0 2px 4px rgba(0, 0, 0, 0.16), 0 2px 4px rgba(0, 0, 0, 0.23)",
              },
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
            aria-label="Back to dashboard"
          >
            <ArrowBack />
          </IconButton>
        </div> */}

        {/* Map Controls */}
        <MapControls />

        {/* Routes Panel - Folders and Routes List */}
        <RoutesPanel />

        {/* Uploaded Routes Panel - Shows when routes are uploaded */}
        {projectData && <UploadedRoutesPanel />}

        {/* Right Panel */}
        {mapMode === "individual_drawing" && <IndividualDrawingPanel />}

        {/* Route Details Panel - Shows selected route details */}
        <RouteDetailsPanel />

        {/* Dynamic Island - Contextual Instructions */}
        <DynamicIsland />
      </div>
    </MapNavigationProvider>
  )
}

export default ProjectWorkspaceLayout
