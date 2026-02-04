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

import { RefObject, useEffect } from "react"

/**
 * Custom hook to handle map view reset when certain dependencies change
 *
 * @param mapRef Reference to the Google Maps instance
 * @param resetViewFn Function to reset the map view
 * @param dependencies Array of dependencies that should trigger a view reset when changed
 * @param duration Animation duration in milliseconds
 */
export const useMapReset = (
  mapRef: RefObject<google.maps.Map | null>,
  resetViewFn: (duration?: number) => Promise<void> | undefined,
  dependencies: unknown[],
  duration: number = 800,
): void => {
  useEffect(() => {
    if (mapRef.current) {
      // Reset view to the city center when dependencies change
      resetViewFn(duration)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, resetViewFn])
}

export default useMapReset
