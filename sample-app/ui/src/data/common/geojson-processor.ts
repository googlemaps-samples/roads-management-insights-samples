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
import * as turf from "@turf/turf"
import { Feature, Geometry } from "geojson"

import { RouteSegment } from "../../types/route-segment"
import { getRouteColor } from "./route-color"

// Extended interface for processed route segments with additional properties
interface ProcessedRouteSegment extends RouteSegment {
  averageSpeed: number
  routeId?: string
  avgStaticDuration: number
  delayScore: number
  delayTime: number
  delayRatio: number
  delayPercentage: number
}

export const processGeoJSONFeature = (
  feature: Feature,
  index: number,
  cityName: string,
): ProcessedRouteSegment[] => {
  const properties = feature.properties || {}
  const geometry = feature.geometry
  const fclass = properties.fclass || "road"

  // Skip features with null or missing geometry
  if (!geometry || !geometry.type) {
    console.warn(
      `⚠️ Skipping feature ${index} - missing or null geometry`,
      feature,
    )
    return []
  }

  // Process coordinates based on geometry type
  let coordinateArrays: number[][][] = []
  if (geometry.type === "MultiLineString") {
    coordinateArrays = geometry.coordinates as number[][][]
  } else if (geometry.type === "LineString") {
    coordinateArrays = [geometry.coordinates as unknown as number[][]]
  }

  const segments: ProcessedRouteSegment[] = []

  coordinateArrays.forEach((coords, segmentIndex) => {
    if (coords && coords.length >= 2) {
      const path = coords
        .filter(
          (coord) =>
            coord &&
            coord.length >= 2 &&
            typeof coord[0] === "number" &&
            typeof coord[1] === "number",
        )
        .map((coord) => ({
          lat: coord[1], // GeoJSON is [lng, lat]
          lng: coord[0],
        }))

      // Skip if we don't have enough valid coordinates
      if (path.length < 2) {
        console.warn(
          `⚠️ Skipping segment ${segmentIndex} - insufficient valid coordinates`,
          { originalCoords: coords, filteredPath: path },
        )
        return
      }

      // Calculate the length of the route segment
      const length = calculateRouteLength(geometry)

      const routeId = properties.selected_route_id
      const duration = parseFloat(
        properties.travel_duration?.duration_in_seconds || "0",
      )
      const staticDuration = parseFloat(
        properties.travel_duration?.static_duration_in_seconds || "0",
      )

      // Calculate average speed (km/h) - only if we have both duration and length
      // Skip routes with static duration of 0 as they don't have valid baseline data
      const averageSpeed =
        duration && length > 0 && staticDuration > 0
          ? length / (duration / 3600)
          : 0
      const delayTime = duration - staticDuration
      const delayScore = 0
      const avgStaticDuration = 0

      const delayRatio = staticDuration > 0 ? duration / staticDuration : 1

      const delayPercentage =
        staticDuration > 0
          ? ((duration - staticDuration) / staticDuration) * 100
          : 0

      let color = "0f53ff" // Default blue

      color = getRouteColor(delayRatio, duration - staticDuration)

      segments.push({
        id: routeId || `${cityName}-${index}-${segmentIndex}`,
        type: fclass,
        color: color,
        path: path,
        length: length, // Length in kilometers
        averageSpeed: averageSpeed, // Average speed in km/h
        routeId: routeId,
        duration: duration,
        staticDuration: staticDuration,
        avgStaticDuration: avgStaticDuration,
        delayScore: delayScore,
        delayTime: delayTime,
        delayRatio: delayRatio,
        delayPercentage: delayPercentage,
      })
    }
  })
  return segments
}

// Function to calculate total length of a route segment
const calculateRouteLength = (geometry: Geometry): number => {
  const feature = turf.feature(geometry)
  const length = turf.length(feature, { units: "kilometers" })
  return length
}
