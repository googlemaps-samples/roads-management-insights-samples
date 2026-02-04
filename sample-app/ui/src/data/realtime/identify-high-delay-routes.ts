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

import { RouteSegment } from "../../types/route-segment"

export interface RouteAlert {
  id: string
  routeId: string
  color: string
  avgStaticDuration: number // seconds; from alerts JSON avg_static_duration
  delayScore: number // Slowness percentage vs baseline
  delayTime: number // Additional delay time in seconds
  delayPercentage: number // Percentage slower than expected baseline
  avgDelayPercentage?: number // Average percentage slower than baseline (optional)
}

export interface RouteAlertWithPosition {
  id: string
  name: string
  position: { lng: number; lat: number }
  color: string
}

// This function identifies high-delay routes in real-time data and returns an array of RouteAlert objects
export const identifyHighDelayRoutes = (
  realtimeRoutes: RouteSegment[],
): RouteAlert[] => {
  const alerts = realtimeRoutes
    .filter(
      (route) =>
        route.delayPercentage &&
        route.delayPercentage > 100 &&
        route.delayTime &&
        route.delayTime > 30 &&
        route.staticDuration &&
        route.staticDuration > 5,
    )
    .sort((a, b) => (b.delayPercentage || 0) - (a.delayPercentage || 0))
    .slice(0, 10)
    .map(
      (route): RouteAlert => ({
        id: route.id,
        routeId: route.routeId || route.id,
        color: route.color || "#f24d42",
        avgStaticDuration: route.avgStaticDuration || 0,
        delayScore: route.delayScore || 0,
        delayTime: route.delayTime || 0,
        delayPercentage: route.delayPercentage || 0,
        avgDelayPercentage: route.delayPercentage, // Use delayPercentage as avgDelayPercentage
      }),
    )
  return alerts
}

// This function identifies high-delay routes and returns them with position coordinates for map rendering
export const identifyHighDelayRoutesWithPosition = (
  realtimeRoutes: RouteSegment[],
): RouteAlertWithPosition[] => {
  const alerts = realtimeRoutes
    .filter(
      (route) =>
        route.delayPercentage &&
        route.delayPercentage > 100 &&
        route.delayTime &&
        route.delayTime > 30 &&
        route.staticDuration &&
        route.staticDuration > 5,
    )
    .sort((a, b) => (b.delayPercentage || 0) - (a.delayPercentage || 0))
    .slice(0, 10)
    .map((route): RouteAlertWithPosition | null => {
      if (!route.path || route.path.length === 0) {
        return null
      }

      // Calculate midpoint of the route path
      const midPoint = route.path[Math.floor(route.path.length / 2)]

      // Handle different coordinate formats
      let lng: number, lat: number
      if (typeof midPoint === "object" && midPoint !== null) {
        if ("lat" in midPoint && "lng" in midPoint) {
          // Handle { lat: number, lng: number } format
          lng =
            typeof midPoint.lng === "function" ? midPoint.lng() : midPoint.lng
          lat =
            typeof midPoint.lat === "function" ? midPoint.lat() : midPoint.lat
        } else {
          return null
        }
      } else {
        return null
      }

      return {
        id: route.id,
        name: route.routeId || route.id,
        position: { lng, lat },
        color: "#e94436",
      }
    })
    .filter((alert): alert is RouteAlertWithPosition => alert !== null)

  return alerts
}
