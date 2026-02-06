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

/**
 * Component that exposes the Google Maps instance to window.googleMap
 * This allows the snapshot utility to access the map instance for idle event listening
 */
import { useMap } from "@vis.gl/react-google-maps"
import { useEffect } from "react"

export const MapInstanceExposer: React.FC = () => {
  const map = useMap()

  useEffect(() => {
    if (map) {
      // Expose map instance to window for snapshot utility
      ;(window as any).googleMap = map
      console.log("✓ Map instance exposed to window.googleMap")

      return () => {
        // Cleanup
        delete (window as any).googleMap
      }
    }
  }, [map])

  return null
}

