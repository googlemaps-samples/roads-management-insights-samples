// Copyright 2025 Google LLC
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

import { cameraMovement } from "."

interface DronePathPoint {
  lat: number
  lng: number
  routeIndex: number
}

export const createDronePath = (): DronePathPoint[] => {
  const path: DronePathPoint[] = []
  const coordinates = cameraMovement.features[0].geometry.coordinates

  for (let i = 0; i < coordinates.length - 1; i++) {
    const coord = coordinates[i]
    const nextCoord = coordinates[i + 1]

    if (
      Array.isArray(coord) &&
      Array.isArray(nextCoord) &&
      coord.length >= 2 &&
      nextCoord.length >= 2
    ) {
      const lat1 = Number(coord[1])
      const lng1 = Number(coord[0])
      const lat2 = Number(nextCoord[1])
      const lng2 = Number(nextCoord[0])

      if (
        !isNaN(lat1) &&
        !isNaN(lng1) &&
        !isNaN(lat2) &&
        !isNaN(lng2) &&
        isFinite(lat1) &&
        isFinite(lng1) &&
        isFinite(lat2) &&
        isFinite(lng2)
      ) {
        // Use fixed number of points for more uniform spacing
        const numPoints = 15 // Fixed number for consistent spacing

        // Add intermediate points with linear interpolation for uniform speed
        for (let j = 0; j <= numPoints; j++) {
          const t = j / numPoints

          // Linear interpolation for uniform movement
          const lat = lat1 + (lat2 - lat1) * t
          const lng = lng1 + (lng2 - lng1) * t

          path.push({
            lat,
            lng,
            routeIndex: i,
          })
        }
      }
    }
  }

  return path
}
