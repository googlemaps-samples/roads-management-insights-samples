import { useCallback } from "react"

import { useMapNavigation } from "../contexts/map-navigation-context"
import { routesApi } from "../data/api/routes-api"
import { useProjectWorkspaceStore } from "../stores/project-workspace-store"
import { toast } from "../utils/toast"
import { useSelectRoute } from "./use-api"

export interface RouteSelectionOptions {
  source?: "map" | "panel"
  onBeforeSelect?: (routeId: string) => void
  onAfterSelect?: (routeId: string) => void
  onError?: (error: Error) => void
}

/**
 * Shared hook for route selection logic.
 * Handles the complete flow: loader, fetching, geometry check, navigation.
 * Used by both map clicks and panel selections for consistency.
 */
export const useRouteSelection = () => {
  const routes = useProjectWorkspaceStore((state) => state.routes)
  const setIsSelectingRoute = useProjectWorkspaceStore(
    (state) => state.setIsSelectingRoute,
  )
  const setTargetRouteId = useProjectWorkspaceStore(
    (state) => state.setTargetRouteId,
  )
  const currentFolder = useProjectWorkspaceStore((state) => state.currentFolder)
  const setCurrentFolder = useProjectWorkspaceStore(
    (state) => state.setCurrentFolder,
  )
  const setShowSelectedRouteSegments = useProjectWorkspaceStore(
    (state) => state.setShowSelectedRouteSegments,
  )
  const setLeftPanelVisible = useProjectWorkspaceStore(
    (state) => state.setLeftPanelVisible,
  )
  const setLeftPanelExpanded = useProjectWorkspaceStore(
    (state) => state.setLeftPanelExpanded,
  )
  const setActivePanel = useProjectWorkspaceStore(
    (state) => state.setActivePanel,
  )

  const selectRoute = useSelectRoute()
  const { navigateToGeometry } = useMapNavigation()

  /**
   * Select a route with full navigation and loader handling.
   * This is the unified function for both map and panel selections.
   *
   * Flow:
   * 0. Show full-screen loader
   * 1. Check if route is in store by UUID
   * 2. Check if it has geometry (encodedPolyline)
   * 3. If no geometry, fetch the full route data
   * 4. Navigate to route using its geometry
   * 5. Handle segments if route is segmented
   * 6. Set folder context
   * 7. Hide loader after everything completes
   */
  const selectRouteWithNavigation = useCallback(
    async (routeId: string, options: RouteSelectionOptions = {}) => {
      const {
        source = "panel",
        onBeforeSelect,
        onAfterSelect,
        onError,
      } = options

      try {
        // 0. Show full-screen loader
        const currentIsSelectingRoute =
          useProjectWorkspaceStore.getState().isSelectingRoute
        if (source === "map") {
          // Always show for map selections
          setIsSelectingRoute(true)
          // Open left panel when route is selected from map
          setLeftPanelVisible(true)
          setLeftPanelExpanded(true)
          setActivePanel("saved_routes")
        } else if (!currentIsSelectingRoute) {
          // Show for panel selections only if not already shown
          setIsSelectingRoute(true)
        }

        // Call pre-selection hook if provided
        onBeforeSelect?.(routeId)

        // 1. Select route (this will fetch if not in store and update selectedRoute)
        // This calls useSelectRoute which handles store/cache/fetch logic
        await selectRoute(routeId)

        // 2. Get route data from store after selection
        let route = useProjectWorkspaceStore.getState().selectedRoute

        // Fallback: try to find in routes array if not in selectedRoute
        if (!route || route.id !== routeId) {
          route = routes.find((r) => r.id === routeId) || null

          if (!route) {
            // Last resort: fetch directly
            console.log(
              "📡 Route not found after selectRoute, fetching directly",
            )
            const response = await routesApi.getById(routeId)
            if (response.success && response.data) {
              route = response.data
              const { addRoute, selectRoute: selectRouteSync } =
                useProjectWorkspaceStore.getState()
              addRoute(route)
              selectRouteSync(routeId)
            } else {
              const errorMessage = response.message || "Failed to fetch route"
              throw new Error(errorMessage)
            }
          }
        }

        // Ensure we have a route at this point
        if (!route) {
          throw new Error("Route data not available after selection")
        }

        // 3. CRITICAL: Ensure route has geometry (encodedPolyline) before proceeding
        // Routes from list endpoint are metadata-only and don't include encodedPolyline
        // We need full route data (with encodedPolyline) for navigation and layer rendering
        if (
          !route.encodedPolyline ||
          route.encodedPolyline.trim().length === 0
        ) {
          console.log(
            "📍 Route missing geometry, fetching full route data:",
            routeId,
          )
          const response = await routesApi.getById(routeId)
          if (response.success && response.data) {
            const { addRoute, selectRoute: selectRouteSync } =
              useProjectWorkspaceStore.getState()
            // Update route with full data including encodedPolyline
            addRoute(response.data)
            selectRouteSync(routeId)
            // Update local route reference
            route = response.data
          } else {
            const errorMessage =
              response.message || "Failed to fetch route geometry"
            throw new Error(errorMessage)
          }
        }

        // Final check: If route still doesn't have geometry after fetch, it's invalid
        if (
          !route.encodedPolyline ||
          route.encodedPolyline.trim().length === 0
        ) {
          throw new Error("Route has no geometry. Please regenerate the route.")
        }

        // If route is segmented but doesn't have segments loaded, fetch them
        if (
          route.isSegmented &&
          (!route.segments || route.segments.length === 0)
        ) {
          console.log(
            "📡 Route is segmented but segments not loaded, fetching...",
          )
          const response = await routesApi.getById(routeId)
          if (response.success && response.data) {
            const { addRoute, selectRoute: selectRouteSync } =
              useProjectWorkspaceStore.getState()
            // Update route with segments
            addRoute(response.data)
            selectRouteSync(routeId)
            // Update local route reference
            route = response.data
          }
        }

        // Set target route ID for ID-based pagination
        setTargetRouteId(routeId)

        // 4. Navigate to route geometry (geometry is guaranteed to exist at this point)
        if (route && navigateToGeometry) {
          const encodedPolyline = route.encodedPolyline.trim()

          // Check if it's a JSON array format (coordinate pairs)
          try {
            const parsed = JSON.parse(encodedPolyline)
            if (
              Array.isArray(parsed) &&
              parsed.length > 0 &&
              Array.isArray(parsed[0]) &&
              parsed[0].length === 2
            ) {
              const linestring: GeoJSON.LineString = {
                type: "LineString",
                coordinates: parsed as [number, number][],
              }
              navigateToGeometry({ linestring })
            } else {
              navigateToGeometry({ encodedPolyline })
            }
          } catch {
            // Not a JSON array, treat as regular encoded polyline
            navigateToGeometry({ encodedPolyline })
          }
        } else if (route && !navigateToGeometry) {
          console.warn(
            "Route has geometry but navigateToGeometry is not available",
            routeId,
          )
        }

        // 5. Set folder if needed - keep empty string "" and "Untagged" as separate
        if (route && route.tag !== null && route.tag !== undefined) {
          const routeFolder = route.tag
          if (currentFolder !== routeFolder) {
            setCurrentFolder(routeFolder)
          }
        }

        // 6. Handle segments display
        if (
          route?.isSegmented &&
          route?.segments &&
          route.segments.length > 0
        ) {
          setShowSelectedRouteSegments(true)
        } else {
          setShowSelectedRouteSegments(false)
        }

        // Call post-selection hook if provided
        onAfterSelect?.(routeId)

        // 7. Wait for navigation animation and React render cycles
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(() => {
                resolve()
              }, 300) // 300ms for navigation animation and layer rendering
            })
          })
        })
      } catch (error) {
        console.error("Failed to select route:", error)
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to select route. Please try again."

        // Call error hook if provided
        if (onError && error instanceof Error) {
          onError(error)
        } else {
          toast.error(errorMessage)
        }

        throw error // Re-throw so caller can handle if needed
      } finally {
        // 8. Hide loader after all operations complete
        console.log("🔄 [selectRouteWithNavigation] FINALLY - Hiding loader")
        setIsSelectingRoute(false)
        console.log("🔄 [selectRouteWithNavigation] END")
      }
    },
    [
      routes,
      setIsSelectingRoute,
      selectRoute,
      setTargetRouteId,
      navigateToGeometry,
      currentFolder,
      setCurrentFolder,
      setShowSelectedRouteSegments,
      setLeftPanelVisible,
      setLeftPanelExpanded,
      setActivePanel,
    ],
  )

  return {
    selectRouteWithNavigation,
  }
}
