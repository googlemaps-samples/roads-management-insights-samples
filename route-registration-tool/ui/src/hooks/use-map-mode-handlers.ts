import { useProjectWorkspaceStore } from "../stores"
import { useLayerStore } from "../stores/layer-store"
import { useMessageStore } from "../stores/message-store"

type MapMode =
  | "view"
  | "individual_drawing"
  | "polygon_drawing"
  | "upload_routes"
  | "lasso_selection"

/**
 * Hook for handling map mode changes
 * Manages mode switching and clearing related state
 */
export const useMapModeHandlers = () => {
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const setMapMode = useProjectWorkspaceStore((state) => state.setMapMode)
  const resetRoadPriorityFilters = useLayerStore(
    (state) => state.resetRoadPriorityFilters,
  )

  const clearAllDrawing = useLayerStore((state) => state.clearAllDrawing)
  const clearUploadedRoutes = useLayerStore(
    (state) => state.clearUploadedRoutes,
  )
  const clearSnappedRoads = useLayerStore((state) => state.clearSnappedRoads)
  const clearAllOptimizedRouteMarkers = useLayerStore(
    (state) => state.clearAllOptimizedRouteMarkers,
  )
  const setSelectedUploadedRouteId = useLayerStore(
    (state) => state.setSelectedUploadedRouteId,
  )
  const dismissAllMessages = useMessageStore((state) => state.dismissAll)

  const handleModeChange = (
    mode: MapMode,
    onRouteOptionsClose?: () => void,
  ) => {
    if (mapMode === mode) {
      // If clicking the same mode, handle differently based on the mode
      if (mode === "individual_drawing") {
        // When clicking "Draw Route" while already in draw mode:
        // - Check if there are unsaved changes first
        // - If editing a saved route with unsaved changes, prompt user
        // - Otherwise, discard changes and start a new route
        const {
          editingSavedRouteId,
          hasUnsavedChanges,
          discardRouteChanges,
          clearPoints,
          clearIndividualRoute,
          setRouteUUID,
          setEditingSavedRouteId,
          individualRoute,
        } = useLayerStore.getState()

        // Check if there are unsaved changes
        const hasUnsavedDrawnRoute =
          individualRoute.points.length > 0 && editingSavedRouteId === null
        const hasUnsavedSavedRouteChanges =
          editingSavedRouteId !== null && hasUnsavedChanges(editingSavedRouteId)

        if (hasUnsavedDrawnRoute || hasUnsavedSavedRouteChanges) {
          // There are unsaved changes - trigger dialog by switching to view mode
          // But mark that we want to return to individual_drawing after clearing
          const { setPendingModeSwitch } = useProjectWorkspaceStore.getState()
          setPendingModeSwitch({
            from: "individual_drawing",
            to: "view",
            returnToMode: "individual_drawing", // Return to draw mode after clearing
          })
          return // Don't continue with the rest of the logic
        }

        // No unsaved changes - proceed with clearing
        if (editingSavedRouteId) {
          // Discard unsaved changes to the saved route (shouldn't happen due to check above, but safe)
          discardRouteChanges(editingSavedRouteId)
          // Clear the editing state to start a new route
          setRouteUUID(null)
          setEditingSavedRouteId(null)
          clearPoints()
          clearIndividualRoute()
        } else {
          // Clear any points from the current drawing
          clearPoints()
          clearIndividualRoute()
        }
        // Clear all drawing state
        clearAllDrawing()
        // Stay in individual_drawing mode - don't switch to view
        // The mode is already set, so we don't need to call setMapMode

        // Clear selected route when starting a new drawing
        const { setSelectedRoute } = useProjectWorkspaceStore.getState()
        setSelectedRoute(null)
      } else {
        // For other modes, switch back to view
        setMapMode("view")
        clearAllDrawing()
      }
    } else {
      setMapMode(mode)

      // Check if mode switch was blocked by checking if pendingModeSwitch was set
      // If pendingModeSwitch is set, the switch was blocked and we shouldn't clear routes
      const pendingModeSwitch =
        useProjectWorkspaceStore.getState().pendingModeSwitch
      const modeSwitchBlocked = pendingModeSwitch !== null

      // Only clear uploaded routes if mode switch was successful (not blocked by dialog)
      if (!modeSwitchBlocked) {
        // Clear uploaded routes and selected route when entering draw, import, or lasso modes
        if (
          mode === "individual_drawing" ||
          mode === "polygon_drawing" ||
          mode === "lasso_selection"
        ) {
          // Clear selected route
          setSelectedUploadedRouteId(null)
          // Clear uploaded routes
          clearUploadedRoutes()
          // Clear snapped roads
          clearSnappedRoads()
          // Clear all optimized route markers
          clearAllOptimizedRouteMarkers()
          // Dismiss any success messages from route uploads to prevent stale messages
          dismissAllMessages()
        }
      }
    }
    // Close the dropdown when an option is selected
    onRouteOptionsClose?.()
    resetRoadPriorityFilters()
  }

  return {
    mapMode,
    setMapMode,
    handleModeChange,
  }
}
