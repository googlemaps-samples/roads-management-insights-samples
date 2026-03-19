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
import { WebMercatorViewport } from "@deck.gl/core"

/**
 * Calculate a zoom that fits a bbox in a given viewport.
 * Uses deck.gl's `WebMercatorViewport.fitBounds` (reliable, no manual math).
 *
 * @param bbox - [minLng, minLat, maxLng, maxLat]
 * @param mapWidth - map/container width in pixels (defaults to window.innerWidth)
 * @param mapHeight - map/container height in pixels (defaults to window.innerHeight)
 * @returns zoom (integer, clamped to [3, 18])
 */
export function calculateZoomWebMercator(
  bbox: [number, number, number, number],
  mapWidth?: number,
  mapHeight?: number,
): number {
  const [minLng, minLat, maxLng, maxLat] = bbox

  const resolvedWidth =
    mapWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1200)
  const resolvedHeight =
    mapHeight ?? (typeof window !== "undefined" ? window.innerHeight : 800)

  try {
    const viewport = new WebMercatorViewport({
      width: resolvedWidth,
      height: resolvedHeight,
    })

    const { zoom } = viewport.fitBounds(
      [
        [minLng, minLat], // SW corner
        [maxLng, maxLat], // NE corner
      ],
      {
        // Don't accept/carry padding through call sites; keep it internal.
        padding: 1,
      },
    )
    return zoom
  } catch (error) {
    console.warn("Error calculating zoom with WebMercatorViewport:", error)

    // Simple fallback based on bounding box size
    const latDiff = maxLat - minLat
    const lngDiff = maxLng - minLng
    const maxDiff = Math.max(latDiff, lngDiff)

    if (maxDiff > 50) return 3
    if (maxDiff > 10) return 5
    if (maxDiff > 5) return 7
    if (maxDiff > 1) return 9
    if (maxDiff > 0.5) return 11
    if (maxDiff > 0.1) return 13
    return 15
  }
}
