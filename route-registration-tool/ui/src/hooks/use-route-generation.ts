import { useEffect, useRef } from "react"

import { useLayerStore } from "../stores"
import { useProjectWorkspaceStore } from "../stores/project-workspace-store"
import { useGenerateRoute } from "./use-api"

// Helper function to compare points
function arePointsEqual(
  points1: Array<{ coordinates: { lat: number; lng: number } }>,
  points2: Array<{ coordinates: { lat: number; lng: number } }>,
): boolean {
  if (points1.length !== points2.length) return false

  for (let i = 0; i < points1.length; i++) {
    const p1 = points1[i]
    const p2 = points2[i]
    if (
      Math.abs(p1.coordinates.lat - p2.coordinates.lat) > 0.000001 ||
      Math.abs(p1.coordinates.lng - p2.coordinates.lng) > 0.000001
    ) {
      return false
    }
  }
  return true
}

// ui/src/hooks/use-individual-route-generation.ts
export function useRouteGeneration(projectId: string) {
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const individualRoute = useLayerStore((state) => state.individualRoute)
  const generateRoute = useLayerStore((state) => state.generateRoute)
  const setGenerating = useLayerStore((state) => state.setGenerating)
  const setGeneratedRoute = useLayerStore((state) => state.setGeneratedRoute)
  const setRouteUUID = useLayerStore((state) => state.setRouteUUID)
  const generateRouteMutation = useGenerateRoute()

  // Track the points that were loaded when route was set for editing
  const loadedPointsRef = useRef<Array<{
    coordinates: { lat: number; lng: number }
  }> | null>(null)

  // Track when routeUUID changes to detect route loading
  const routeUUIDRef = useRef<string | null>(null)
  // Track if we've already stored the loaded points for the current route
  const hasStoredLoadedPointsRef = useRef<boolean>(false)
  // Track if we've made the initial API call for a loaded route
  const hasMadeInitialApiCallRef = useRef<boolean>(false)

  useEffect(() => {
    // If routeUUID changed, reset tracking
    if (individualRoute.routeUUID !== routeUUIDRef.current) {
      routeUUIDRef.current = individualRoute.routeUUID
      hasStoredLoadedPointsRef.current = false
      hasMadeInitialApiCallRef.current = false
      // Clear loaded points if routeUUID is cleared
      if (!individualRoute.routeUUID) {
        loadedPointsRef.current = null
      }
    }

    // Don't store points here - wait until after initial API call completes
    // This ensures the API is called when route is first loaded for editing
  }, [
    individualRoute.routeUUID,
    individualRoute.generatedRoute,
    individualRoute.points.length, // Only depend on length to avoid unnecessary updates
  ])

  // Update reference after route generation completes
  // This allows us to track subsequent changes from the newly generated route
  useEffect(() => {
    if (
      individualRoute.routeUUID &&
      individualRoute.generatedRoute &&
      individualRoute.points.length >= 2
    ) {
      // Mark that we've made the initial API call
      if (!hasMadeInitialApiCallRef.current) {
        hasMadeInitialApiCallRef.current = true
        console.log("✅ Initial API call completed for loaded route")
      }

      // Only update if points have actually changed (to avoid infinite loops)
      // This updates the reference after a successful route generation
      if (loadedPointsRef.current) {
        const pointsChanged = !arePointsEqual(
          individualRoute.points,
          loadedPointsRef.current,
        )
        if (pointsChanged) {
          // Update reference to the newly generated route's points
          loadedPointsRef.current = individualRoute.points.map((p) => ({
            coordinates: { ...p.coordinates },
          }))
          console.log("✅ Route regenerated - updated points reference")
        }
      } else {
        // First time storing points after initial API call
        loadedPointsRef.current = individualRoute.points.map((p) => ({
          coordinates: { ...p.coordinates },
        }))
        hasStoredLoadedPointsRef.current = true
        console.log("✅ Stored points reference after initial API call")
      }
    }
  }, [individualRoute.generatedRoute?.encodedPolyline]) // Only update when route actually changes

  useEffect(() => {
    if (mapMode !== "individual_drawing") {
      return
    }

    const points = individualRoute.points
    const pointsCount = points.length

    // If we have a route loaded for editing and we've already made the initial API call,
    // check if points have changed before regenerating
    if (
      individualRoute.routeUUID &&
      individualRoute.generatedRoute &&
      loadedPointsRef.current &&
      hasMadeInitialApiCallRef.current
    ) {
      // Compare current points with loaded points
      const pointsChanged = !arePointsEqual(points, loadedPointsRef.current)

      if (!pointsChanged) {
        // Points haven't changed, don't regenerate
        console.log("⏭️ Points unchanged from loaded route - skipping API call")
        return
      } else {
        // Points have changed, allow regeneration
        // The reference will be updated after route generation completes
        console.log("🔄 Points changed - will regenerate route")
      }
    }

    // Generate route if:
    // 1. We have at least 2 points
    // 2. Either we haven't made the initial API call yet (route just loaded for editing),
    //    or points have changed from the stored reference
    if (pointsCount >= 2) {
      generateRoute({
        points,
        projectId,
        generateRouteMutation,
        saveRouteMutation: null,
        setGenerating,
        setGeneratedRoute,
        setRouteUUID,
      })
    } else if (pointsCount < 2 && individualRoute.generatedRoute) {
      setGeneratedRoute(null)
    }
  }, [individualRoute.points, mapMode, projectId])
}
