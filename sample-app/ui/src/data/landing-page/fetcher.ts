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

// Polyline data structure
export interface PolylinePoint {
  lat: number
  lng: number
}

export interface PolylineRoute {
  id: string
  coordinates: PolylinePoint[]
  color: string
}

// Cache for polyline data to avoid re-parsing
let cachedRoutes: PolylineRoute[] | null = null

// Read CSV data directly from the file
export const fetchPolylines = async (): Promise<PolylineRoute[]> => {
  // Return cached data if available
  if (cachedRoutes) {
    return cachedRoutes
  }

  try {
    const url =
      process.env.NODE_ENV === "development"
        ? `http://localhost:8000/api/data/paris_polylines.csv`
        : `/api/data/paris_polylines.csv`
    // Fetch the CSV file from the API endpoint with caching headers
    const response = await fetch(url, {
      headers: {
        "Cache-Control": "max-age=3600", // Cache for 1 hour
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.statusText}`)
    }

    const csvData = await response.text()

    // Parse CSV data into polylines
    const lines = csvData.split("\n")
    const polylines: { [key: string]: PolylinePoint[] } = {}

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const [polylineId, lng, lat] = line.split(",")
      const point: PolylinePoint = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      }

      if (!polylines[polylineId]) {
        polylines[polylineId] = []
      }
      polylines[polylineId].push(point)
    }

    // Convert to array format with colors
    const colors = ["#1052ff", "#ffa000", "#bd2a2a"] // Red, Yellow, Blue
    const routes = Object.keys(polylines).map((id, index) => ({
      id,
      coordinates: polylines[id],
      color: colors[index % colors.length],
    }))

    // Cache the routes for future use
    cachedRoutes = routes
    return routes
  } catch (error) {
    console.error("❌ Error loading polyline data:", error)
    return []
  }
}

export const processPolylines = async (): Promise<PolylineRoute[]> => {
  const polylines = await fetchPolylines()
  return polylines
}

export default processPolylines
