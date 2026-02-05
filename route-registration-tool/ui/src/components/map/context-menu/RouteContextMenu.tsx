// ui/src/components/map/context-menu/RouteContextMenu.tsx
import { Delete, Edit } from "@mui/icons-material"
import EditLocationAltIcon from "@mui/icons-material/EditLocationAlt"
import { Chip } from "@mui/material"
import React, { useEffect, useRef, useState } from "react"

import { routesApi } from "../../../data/api/routes-api"
import {
  useDeleteRoute,
  useSelectRoute,
  useUpdateRoute,
} from "../../../hooks/use-api"
import { useLayerStore } from "../../../stores/layer-store"
import {
  Route,
  useProjectWorkspaceStore,
} from "../../../stores/project-workspace-store"
import { formatDistance, useDistanceUnit } from "../../../utils/distance-utils"
import { toast } from "../../../utils/toast"
import ConfirmationDialog from "../../common/ConfirmationDialog"
import ContextMenu, { ContextMenuItem } from "../../common/ContextMenu"
import RenameDialog from "../../common/RenameDialog"

interface RouteContextMenuProps {
  x: number
  y: number
  route: Route
  onClose: () => void
}

// Module-level tracking for recently deselected routes to prevent immediate re-selection
// This persists across component remounts
const recentlyDeselectedRoutes = new Map<string, number>()
const DESELECTION_COOLDOWN_MS = 500 // 500ms cooldown

const RouteContextMenu: React.FC<RouteContextMenuProps> = ({
  x,
  y,
  route,
  onClose,
}) => {
  const distanceUnit = useDistanceUnit()
  const {
    loadRouteForEditing,
    removeRoute,
    setLeftPanelExpanded,
    setCurrentFolder,
    setRouteSearchQuery,
    setSelectedRoute,
    addRoute,
    setIsSelectingRoute,
  } = useProjectWorkspaceStore()
  const deleteRouteMutation = useDeleteRoute()
  const updateRouteMutation = useUpdateRoute()
  const selectRoute = useSelectRoute()
  const loadRoutePoints = useLayerStore((state) => state.loadRoutePoints)
  const setRouteUUID = useLayerStore((state) => state.setRouteUUID)
  const clearPoints = useLayerStore((state) => state.clearPoints)

  // State for rename dialog
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Track if we're performing an action that should keep the route selected
  const keepSelectedRef = useRef(false)
  // Track if component is mounted to prevent stale cleanup from running
  const isMountedRef = useRef(true)
  // Track pending animation frame to cancel if needed
  const pendingAnimationFrameRef = useRef<number | null>(null)
  // Track the route ID that was selected in this mount cycle
  const selectedRouteIdInThisMountRef = useRef<string | null>(null)
  // Track if the route was already selected when menu opened (so we don't deselect in cleanup)
  const wasAlreadySelectedOnMountRef = useRef(false)

  // Select route when menu opens, deselect when it closes
  useEffect(() => {
    console.log("🔵 RouteContextMenu: useEffect START:", { routeId: route.id })

    // Mark as mounted
    isMountedRef.current = true

    // Cancel any pending animation frame from previous mount
    if (pendingAnimationFrameRef.current !== null) {
      cancelAnimationFrame(pendingAnimationFrameRef.current)
      pendingAnimationFrameRef.current = null
    }

    // Check if route was already selected BEFORE we do anything
    // This is crucial: if it was already selected, we should NOT deselect in cleanup
    // IMPORTANT: Capture this value in a const so cleanup closure can use it
    const currentSelectedRouteOnMount =
      useProjectWorkspaceStore.getState().selectedRoute
    const wasAlreadySelectedOnMount =
      currentSelectedRouteOnMount?.id === route.id
    wasAlreadySelectedOnMountRef.current = wasAlreadySelectedOnMount

    // Ensure route is in store before selecting
    const { routes } = useProjectWorkspaceStore.getState()
    const routeInStore = routes.find((r) => r.id === route.id)

    if (!routeInStore) {
      // Add route to store if not present
      console.log("🔵 RouteContextMenu: Adding route to store:", route.id)
      addRoute(route)
    }

    // Check if this route was recently deselected (within cooldown period)
    const now = Date.now()
    const lastDeselectedTime = recentlyDeselectedRoutes.get(route.id)
    const wasRecentlyDeselected =
      lastDeselectedTime && now - lastDeselectedTime < DESELECTION_COOLDOWN_MS

    // Clean up old entries from the map (older than cooldown)
    for (const [routeId, timestamp] of recentlyDeselectedRoutes.entries()) {
      if (now - timestamp >= DESELECTION_COOLDOWN_MS) {
        recentlyDeselectedRoutes.delete(routeId)
      }
    }

    // Check if this route is already selected to avoid unnecessary re-selection
    const currentSelectedRoute =
      useProjectWorkspaceStore.getState().selectedRoute
    console.log("🔵 RouteContextMenu: Selection check:", {
      routeId: route.id,
      currentSelectedRouteId: currentSelectedRoute?.id,
      isAlreadySelected: currentSelectedRoute?.id === route.id,
      wasAlreadySelectedOnMount,
      wasRecentlyDeselected,
      timeSinceDeselection: lastDeselectedTime
        ? now - lastDeselectedTime
        : null,
    })

    if (currentSelectedRoute?.id === route.id || wasRecentlyDeselected) {
      console.log(
        "📍 RouteContextMenu: Route already selected (or recently deselected), showing toast:",
        route.id,
      )
      // Route is already selected or was just deselected, show toast instead of re-selecting
      import("../../../utils/toast").then(({ toast }) => {
        toast.info("This route is already selected")
      })
      selectedRouteIdInThisMountRef.current = route.id
      // Clear the recently deselected flag since we handled it
      recentlyDeselectedRoutes.delete(route.id)
      return () => {
        console.log(
          "🔵 RouteContextMenu: Cleanup (no selection made, wasAlreadySelectedOnMount:",
          wasAlreadySelectedOnMount,
          ")",
        )
        isMountedRef.current = false
        // No cleanup needed if we didn't select
      }
    }

    // Route is not selected, proceed with selection
    // Show loader when selecting from context menu (map selection)
    console.log(
      "✅ RouteContextMenu: Selecting route (not currently selected):",
      route.id,
    )
    setIsSelectingRoute(true)
    setSelectedRoute(route.id)
    selectedRouteIdInThisMountRef.current = route.id
    console.log("✅ RouteContextMenu: Route selected:", route.id)

    // Cleanup: deselect route when menu closes (unless an action keeps it selected)
    // IMPORTANT: Capture wasAlreadySelectedOnMount in closure, don't use ref.current
    // This prevents race conditions where cleanup runs after remount resets the ref
    return () => {
      // Mark as unmounting
      isMountedRef.current = false

      if (!keepSelectedRef.current) {
        // Check synchronously first
        const checkAndDeselect = () => {
          // Don't deselect if component was remounted (menu opened again)
          // If isMountedRef.current is true now, it means the menu was reopened, so don't deselect
          if (isMountedRef.current) {
            console.log(
              "⚠️ RouteContextMenu: Component remounted, skipping deselection",
            )
            return
          }

          const { selectedRoute, mapMode: currentMapMode } =
            useProjectWorkspaceStore.getState()
          const { individualRoute } = useLayerStore.getState()

          // Don't deselect if:
          // 1. Route is being modified (routeUUID matches this route's ID)
          // 2. We're entering edit mode (mapMode is individual_drawing) AND route is still selected
          // This handles the case where "Modify" is clicked from RouteDetailsPanel
          const isEnteringEditMode =
            currentMapMode === "individual_drawing" ||
            individualRoute.routeUUID === route.id

          // Only deselect if:
          // 1. This route is still the selected one
          // 2. We're not entering edit mode
          // 3. This is the route we selected in this mount cycle (not a different route)
          // 4. The route was NOT already selected when menu opened (we actually changed the selection)
          // IMPORTANT: Use captured value from closure, not ref.current (which may be reset by remount)
          if (
            selectedRoute?.id === route.id &&
            !isEnteringEditMode &&
            selectedRouteIdInThisMountRef.current === route.id &&
            !wasAlreadySelectedOnMount // Use captured value, not ref.current
          ) {
            console.log(
              "🔵 RouteContextMenu: Deselecting route in cleanup:",
              route.id,
            )
            // Mark this route as recently deselected to prevent immediate re-selection
            recentlyDeselectedRoutes.set(route.id, Date.now())
            setSelectedRoute(null)
            console.log("✅ RouteContextMenu: Route deselected:", route.id)
          } else if (wasAlreadySelectedOnMount) {
            console.log(
              "✅ RouteContextMenu: Skipping deselection (was already selected on mount):",
              route.id,
            )
          } else if (isEnteringEditMode && selectedRoute?.id === route.id) {
            console.log(
              "✅ RouteContextMenu: Keeping route selected (entering edit mode):",
              route.id,
            )
          }
        }

        // Check immediately (handles most cases)
        // But only if component is still unmounted (not remounted)
        if (!isMountedRef.current) {
          checkAndDeselect()
        }

        // Also check after next frame (handles race conditions where "Modify" is clicked
        // right as the menu closes - loadRouteForEditing might update store after cleanup)
        // Store the frame ID so we can cancel it if menu reopens
        const frameId = requestAnimationFrame(() => {
          // Only run if component is still unmounted (not remounted)
          // If isMountedRef.current is true, the menu was reopened, so skip deselection
          if (!isMountedRef.current) {
            checkAndDeselect()
          }
          pendingAnimationFrameRef.current = null
        })
        pendingAnimationFrameRef.current = frameId
      }
      // Reset flags for next time
      keepSelectedRef.current = false
      selectedRouteIdInThisMountRef.current = null
    }
  }, [route.id, setSelectedRoute, addRoute])

  const handleModify = async () => {
    console.log("✏️ Modify route:", route.name, "Route ID:", route.id)

    try {
      // First, check if route exists in store (might already be loaded)
      const { routes: storeRoutes, addRoute } =
        useProjectWorkspaceStore.getState()
      let routeToLoad = storeRoutes.find((r) => r.id === route.id)

      // If not in store, fetch from API
      if (!routeToLoad) {
        console.log("📡 Route not in cache, fetching from API...", {
          routeId: route.id,
          routeIdType: typeof route.id,
          routeName: route.name,
          projectId: route.projectId,
        })
        let response = await routesApi.getById(route.id)

        // If route not found and we have route name + projectId, try to find by name
        // This handles the case where a route was segmented and got a new UUID
        if (!response.success || !response.data) {
          console.log(
            "⚠️ Route not found by ID, trying to find by name and project...",
            {
              routeName: route.name,
              projectId: route.projectId,
            },
          )

          // Try to find route by name in the project
          if (route.name && route.projectId) {
            try {
              const projectRoutesResponse =
                await routesApi.getByProjectPaginated(
                  route.projectId,
                  1,
                  100, // Get first 100 routes
                  route.name.trim(), // Search by route name
                )

              if (
                projectRoutesResponse.success &&
                projectRoutesResponse.data?.routes
              ) {
                // Find exact match by name (case-insensitive)
                const matchingRoute = projectRoutesResponse.data.routes.find(
                  (r) =>
                    r.name.toLowerCase().trim() ===
                    route.name.toLowerCase().trim(),
                )

                if (matchingRoute) {
                  console.log(
                    "✅ Found route by name, fetching full details...",
                    {
                      oldId: route.id,
                      newId: matchingRoute.id,
                      routeName: matchingRoute.name,
                    },
                  )
                  // Fetch full route details with the new ID
                  response = await routesApi.getById(matchingRoute.id)
                }
              }
            } catch (searchError) {
              console.error(
                "❌ Error searching for route by name:",
                searchError,
              )
            }
          }
        }

        if (response.success && response.data) {
          routeToLoad = response.data
          console.log("✅ Fetched full route data from API", {
            routeId: routeToLoad.id,
            hasOrigin: !!routeToLoad.origin,
            hasDestination: !!routeToLoad.destination,
            waypointsCount: routeToLoad.waypoints?.length || 0,
          })
          // Add to store for future use
          addRoute(routeToLoad)
        } else {
          // Route not found in API
          console.error(
            "❌ Route not found in API:",
            route.id,
            response.message,
          )
          toast.error(
            `Route not found. It may have been deleted or the route ID is invalid.`,
          )
          onClose()
          return
        }
      } else {
        console.log("✅ Route found in cache, using existing data", {
          routeId: routeToLoad.id,
        })
      }

      // Validate that we have a valid route with origin and destination
      if (
        !routeToLoad.origin ||
        !routeToLoad.destination ||
        (routeToLoad.origin.lat === 0 && routeToLoad.origin.lng === 0) ||
        (routeToLoad.destination.lat === 0 && routeToLoad.destination.lng === 0)
      ) {
        console.error("❌ Route has invalid origin/destination:", routeToLoad)
        toast.error(
          "Cannot modify route: missing or invalid origin/destination coordinates.",
        )
        onClose()
        return
      }

      // Select the route (opens right panel) and load it for editing
      // Use routeToLoad.id (the actual route ID, which may be different from route.id if route was segmented)
      await selectRoute(routeToLoad.id)

      // Mark that we should keep the route selected (don't deselect on close)
      keepSelectedRef.current = true

      // Expand left panel and use simple folder + search approach instead of expensive scrolling
      setLeftPanelExpanded(true)

      // Set the folder to the route's tag - keep empty string "" and "Untagged" as separate
      const routeFolder = routeToLoad.tag ?? ""
      setCurrentFolder(routeFolder)

      // Set search query to route name to filter and show only this route
      // This is much simpler than expensive scrolling through paginated routes
      setRouteSearchQuery(routeToLoad.name)

      // Load route for editing with the fetched route data
      loadRouteForEditing(
        routeToLoad,
        loadRoutePoints,
        setRouteUUID,
        clearPoints,
      )
      onClose()
    } catch (error) {
      console.error("❌ Failed to modify route:", error)
      toast.error(
        `Failed to load route for editing: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
      onClose()
    }
  }

  const handleDelete = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    console.log("RouteContextMenu: handleDelete called, opening dialog")
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    console.log("RouteContextMenu: confirmDelete called")
    console.log("🗑️ Soft deleting route:", route.name)
    deleteRouteMutation.mutate(route.id, {
      onSuccess: () => {
        console.log("✅ Route soft deleted successfully")
        removeRoute(route.id)
        setDeleteDialogOpen(false)
        onClose()
      },
      onError: (error: Error) => {
        console.error("❌ Failed to delete route:", error)
        alert(`Failed to delete route: ${error.message}`)
        setDeleteDialogOpen(false)
        onClose()
      },
    })
  }

  const handleRename = () => {
    setRenameDialogOpen(true)
  }

  const handleRenameSave = async (newName: string) => {
    try {
      console.log("💾 Updating route name to:", newName)

      const updatedRoute = await updateRouteMutation.mutateAsync({
        routeId: route.id,
        updates: { name: newName },
      })

      console.log("✅ Route name updated successfully")

      // Update the local store with the new name
      if (updatedRoute) {
        const { updateRoute } = useProjectWorkspaceStore.getState()
        updateRoute(route.id, { name: newName })
      }

      setRenameDialogOpen(false)
      onClose() // Close the context menu after successful rename
    } catch (error) {
      console.error("❌ Failed to update route name:", error)
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to update route name: ${errorMessage}`)
      throw error // Re-throw to prevent dialog from closing
    }
  }

  // Truncate route name if too long
  const routeName = route.name || `Route #${route.id}`
  const displayName =
    routeName.length > 25 ? `${routeName.substring(0, 22)}...` : routeName

  // Build menu items
  const menuItems: ContextMenuItem[] = [
    {
      id: "modify",
      label: "Modify",
      icon: <EditLocationAltIcon sx={{ fontSize: 16 }} />,
      onClick: handleModify,
    },
    {
      id: "rename",
      label: "Rename",
      icon: <Edit sx={{ fontSize: 16 }} />,
      onClick: handleRename,
    },
    {
      id: "delete",
      label: "Delete",
      icon: <Delete sx={{ fontSize: 16 }} />,
      onClick: handleDelete,
    },
  ]

  //NOT SHOWING THE ROUTE CONTEXT MENU ENTIRELYYYYYY !!!! , CODE KEPT FOR FUTURE REFERENCE
  return null

  return (
    <>
      <ContextMenu
        x={x}
        y={y}
        onClose={onClose}
        draggable={true}
        minWidth={200}
        maxWidth={250}
        disableClickOutside={true}
        header={{
          title: displayName,
          fullTitle: routeName, // Full name for tooltip
          showCloseButton: true,
          onClose: onClose,
          metadata: (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-gray-600">
                {route.distance
                  ? formatDistance(route.distance, distanceUnit)
                  : "N/A"}
              </span>
              <span className="text-xs text-gray-400">•</span>
              <Chip
                label="Route"
                size="small"
                sx={{
                  height: 18,
                  fontSize: "11px",
                  fontWeight: 500,
                  backgroundColor: "#f5f5f5",
                  color: "#1976d2",
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
      <RenameDialog
        open={renameDialogOpen}
        currentName={route.name || ""}
        onClose={() => {
          setRenameDialogOpen(false)
          // Optionally close the context menu when rename dialog closes
          // onClose()
        }}
        onSave={handleRenameSave}
        title="Rename Route"
        label="Route Name"
        isLoading={updateRouteMutation.isPending}
        formId="rename-route-context-menu-form"
      />
      <ConfirmationDialog
        open={deleteDialogOpen}
        onClose={() => {
          console.log("RouteContextMenu: Dialog onClose called")
          setDeleteDialogOpen(false)
          // Don't close the context menu when closing the dialog
          // onClose()
        }}
        onConfirm={() => {
          console.log("RouteContextMenu: Dialog onConfirm called")
          confirmDelete()
        }}
        title="Delete Route"
        message={`Delete route "${route.name}"?`}
        confirmText="Delete"
        isLoading={deleteRouteMutation.isPending}
      />
    </>
  )
}

export default RouteContextMenu
