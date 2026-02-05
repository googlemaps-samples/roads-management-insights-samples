import { Project } from "../stores/project-workspace-store"

/**
 * Restores the map viewport to the saved viewstate from project data
 * @param projectData - The project data containing the viewstate
 */
export const restoreViewport = (projectData: Project | null) => {
  if (!projectData?.viewstate) {
    return
  }

  const { center, zoom } = projectData.viewstate
  const map = (window as any).googleMap as google.maps.Map | undefined

  if (map && center && zoom) {
    try {
      // Use moveCamera to restore saved viewstate
      map.moveCamera({
        center: new google.maps.LatLng(center.lat, center.lng),
        zoom: zoom,
      })
      console.log("🏠 Restored map viewport to saved viewstate:", {
        center,
        zoom,
      })
    } catch (error) {
      console.warn("Failed to restore viewport:", error)
    }
  }
}
