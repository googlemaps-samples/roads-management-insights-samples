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
