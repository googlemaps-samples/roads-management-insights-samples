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

// ui/src/utils/route-naming.ts

/**
 * Generate route name for multi-select combined routes
 * @param roadCount Number of roads in the combined route
 * @returns Formatted route name
 */
export function generateMultiSelectRouteName(roadCount: number): string {
  if (roadCount === 1) {
    return "Route"
  }
  return `Route (${roadCount} roads)`
}

/**
 * Generate route name for stretched routes
 * @param roadName Original road name
 * @returns Formatted route name
 */
export function generateStretchRouteName(roadName: string): string {
  if (!roadName || roadName.trim() === "") {
    return "Stretched Route"
  }
  return `Stretched Route - ${roadName}`
}
