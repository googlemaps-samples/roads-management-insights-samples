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

import type { FeatureCollection } from "geojson"

import { isDemoMode } from "../../utils"

// Interface for API response structure
interface RealtimeApiResponse {
  data?: FeatureCollection
  features?: GeoJSON.Feature[]
}

// Union type for realtime data (can be FeatureCollection or API response)
type RealtimeData = FeatureCollection | RealtimeApiResponse

// In-memory cache for demo mode data
const demoDataCache: Map<string, RealtimeData> = new Map()

/**
 * Fetches realtime data from API
 * Note: Caching is handled by React Query for live mode. Demo mode uses in-memory cache.
 * @param cityName - The location to fetch data for (e.g., "paris", "tokyo")
 * @returns Promise that resolves to the realtime data
 */
export const fetchRealtimeData = async (
  cityName: string,
): Promise<RealtimeData> => {
  const demoMode = isDemoMode()

  // Check cache first in demo mode
  if (demoMode && demoDataCache.has(cityName)) {
    console.log(`📦 Using cached demo data for ${cityName}`)
    return demoDataCache.get(cityName) as RealtimeData
  }

  console.log(`🔄 Fetching realtime data for ${cityName}...`)

  const isDevelopment =
    typeof window !== "undefined" && window.location.hostname === "localhost"
  const url =
    demoMode == false
      ? isDevelopment
        ? `http://localhost:8000/api/latest/${cityName}`
        : `/api/latest/${cityName}`
      : isDevelopment
        ? `http://localhost:8000/api/data/realtime-monitoring/live/${cityName}.json`
        : `/api/data/realtime-monitoring/live/${cityName}.json`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(
      `Failed to fetch realtime data for ${cityName}: ${response.status}`,
    )
  }

  const data = await response.json()

  console.log(
    `✅ Successfully fetched realtime data for ${cityName} (${data.features?.length || 0} features)`,
  )

  // Cache data in demo mode
  if (demoMode) {
    demoDataCache.set(cityName, data)
    console.log(`💾 Cached demo data for ${cityName}`)
  }

  return data
}
