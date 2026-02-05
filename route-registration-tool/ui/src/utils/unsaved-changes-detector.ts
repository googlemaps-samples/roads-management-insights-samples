import { useLayerStore } from "../stores"
import { useProjectWorkspaceStore } from "../stores/project-workspace-store"

/**
 * Checks if there are any unsaved changes in the current project
 * @returns true if there are unsaved changes, false otherwise
 */
export const hasUnsavedChanges = (): boolean => {
  const layerStore = useLayerStore.getState()
  const projectStore = useProjectWorkspaceStore.getState()

  // Check for uploaded routes with unsaved changes
  const uploadedRoutes = layerStore.uploadedRoutes.routes
  if (uploadedRoutes.length > 0) {
    // Check if any uploaded route has unsaved changes (preview roads or marker changes)
    const hasUnsavedUploadedRoutes = uploadedRoutes.some((route) => {
      return layerStore.hasUnsavedChanges(route.id)
    })
    if (hasUnsavedUploadedRoutes) {
      return true
    }
    // Note: Uploaded routes that exist but haven't been modified are NOT considered
    // unsaved changes. They can be saved later without triggering warnings.
  }

  // Check for drawing states
  const individualRoute = layerStore.individualRoute
  if (individualRoute.points.length > 0) {
    return true
  }

  const polygonDrawing = layerStore.polygonDrawing
  if (polygonDrawing.points.length > 0) {
    return true
  }

  const lassoDrawing = layerStore.lassoDrawing
  if (lassoDrawing.points.length > 0) {
    return true
  }

  // Check for snapped roads with preview roads
  const previewRoads = layerStore.snappedRoads.previewRoads
  if (previewRoads.length > 0) {
    return true
  }

  // Check for editing states
  const editingStates = layerStore.snappedRoads.editingStates
  const hasEditingStates = Object.keys(editingStates).length > 0
  if (hasEditingStates) {
    // Check if any editing state has unsaved changes
    for (const routeId of Object.keys(editingStates)) {
      if (layerStore.hasUnsavedChanges(routeId)) {
        return true
      }
    }
  }

  // Check for pending file upload
  // This is handled in MapControls component state, so we can't check it here
  // But we can check if we're in upload mode
  if (projectStore.mapMode === "upload_routes") {
    return true
  }

  // Check for road import state - unsaved imported roads
  const roadImport = layerStore.roadImport
  if (roadImport) {
    // If there are panel routes (selected roads in the panel), they are unsaved
    if (roadImport.panelRoutes && roadImport.panelRoutes.length > 0) {
      return true
    }
    // If there are lasso filtered roads (temporary selection), consider it unsaved
    if (
      roadImport.lassoFilteredRoadIds &&
      roadImport.lassoFilteredRoadIds.length > 0
    ) {
      return true
    }
  }

  return false
}
