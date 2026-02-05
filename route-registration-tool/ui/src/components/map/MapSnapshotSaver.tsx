/**
 * Component that saves map snapshot periodically and on zoom changes
 * Only saves when zoom is 14 or less, and saves every 5 minutes
 * Note: Snapshots are also saved after sync operations (with 2-second delay)
 */
import { useQueryClient } from "@tanstack/react-query"
import { useMap } from "@vis.gl/react-google-maps"
import { useEffect, useRef } from "react"

import { projectsApi } from "../../data/api/projects-api"
import { queryKeys } from "../../hooks/use-api"
import { useProjectWorkspaceStore } from "../../stores/project-workspace-store"
import { captureCompressedMapSnapshot } from "../../utils/map-snapshot"

export const MapSnapshotSaver: React.FC = () => {
  const map = useMap()
  const projectId = useProjectWorkspaceStore((state) => state.projectId)
  const queryClient = useQueryClient()

  // Track if we've already saved a snapshot
  const lastSaveTimeRef = useRef<number>(0)
  const isSavingRef = useRef<boolean>(false)
  const zoomChangedListenerRef = useRef<google.maps.MapsEventListener | null>(
    null,
  )
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!map || !projectId) {
      return
    }

    const googleMap = map as unknown as google.maps.Map
    if (!googleMap || typeof googleMap.addListener !== "function") {
      console.warn(
        "⚠️ MapSnapshotSaver: Could not add listeners - map instance not available",
      )
      return
    }

    // Shared function to save snapshot
    const saveSnapshot = async (skipDebounce: boolean = false) => {
      const now = Date.now()
      const DEBOUNCE_MS = 2000

      // Skip if we're already saving
      if (isSavingRef.current) {
        return
      }

      // Apply debounce only if not skipping (for interval)
      if (!skipDebounce && now - lastSaveTimeRef.current < DEBOUNCE_MS) {
        return
      }

      // Check zoom level - only save if zoom is 14 or less
      if (googleMap && typeof googleMap.getZoom === "function") {
        const currentZoom = googleMap.getZoom()
        if (currentZoom !== undefined && currentZoom > 14) {
          console.log(
            `📸 MapSnapshotSaver: Skipping save - zoom level ${currentZoom} is greater than 14`,
          )
          return
        }
      }

      isSavingRef.current = true
      lastSaveTimeRef.current = now

      try {
        console.log("📸 Capturing map snapshot...")

        // Capture snapshot
        const mapSnapshot = await captureCompressedMapSnapshot("main-map")

        // Save snapshot to project
        await projectsApi.updateSnapshot(projectId, mapSnapshot)

        // Invalidate projects query cache to refresh the dashboard
        await queryClient.invalidateQueries({ queryKey: queryKeys.projects })

        console.log("✅ Map snapshot saved successfully")
      } catch (error) {
        console.error("❌ Failed to save map snapshot:", error)
        // Don't fail silently, but don't block the UI
      } finally {
        isSavingRef.current = false
      }
    }

    // Handle zoom changed event - save instantly if zoom is 14 or less
    const handleZoomChanged = async () => {
      await saveSnapshot(true) // Skip debounce for instant save on zoom change
    }

    // Listen for zoom_changed event
    zoomChangedListenerRef.current = googleMap.addListener(
      "zoom_changed",
      handleZoomChanged,
    )

    // Set up 5-minute interval
    const INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
    intervalRef.current = setInterval(() => {
      saveSnapshot()
    }, INTERVAL_MS)

    console.log(
      "📸 MapSnapshotSaver: Listening for zoom_changed events, and saving every 5 minutes",
    )

    return () => {
      if (zoomChangedListenerRef.current) {
        google.maps.event.removeListener(zoomChangedListenerRef.current)
        zoomChangedListenerRef.current = null
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [map, projectId, queryClient])

  return null
}
