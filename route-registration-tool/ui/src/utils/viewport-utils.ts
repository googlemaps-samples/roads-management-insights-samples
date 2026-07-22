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
import {
  Project,
  useProjectWorkspaceStore,
} from "../stores/project-workspace-store"

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
      console.log("🏠 Restored map viewport from project viewstate:", {
        center,
        zoom,
      })
    } catch (error) {
      console.warn("Failed to restore viewport:", error)
    }
  }
}

/**
 * Manually triggers viewport calculation from project boundary and applies it to the map
 */
export const calculateAndApplyViewportFromBoundary = () => {
  const { recalculateProjectViewstateFromBoundary } =
    useProjectWorkspaceStore.getState()

  // Get actual map dimensions if available
  const map = (window as any).googleMap as google.maps.Map | undefined
  let mapDimensions: { width: number; height: number } | undefined

  if (map) {
    const mapDiv = map.getDiv()
    if (mapDiv) {
      mapDimensions = {
        width: mapDiv.offsetWidth || window.innerWidth,
        height: mapDiv.offsetHeight || window.innerHeight,
      }
    }
  }

  // Calculate and save to store with actual dimensions
  recalculateProjectViewstateFromBoundary(mapDimensions)

  // Apply to map immediately using the updated projectData.viewstate
  const { projectData } = useProjectWorkspaceStore.getState()
  if (projectData?.viewstate && map) {
    try {
      map.moveCamera({
        center: new google.maps.LatLng(
          projectData.viewstate.center.lat,
          projectData.viewstate.center.lng,
        ),
        zoom: projectData.viewstate.zoom,
      })
    } catch (error) {
      console.warn("Failed to apply calculated viewstate:", error)
    }
  }
}
