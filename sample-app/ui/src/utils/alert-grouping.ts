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

interface Point {
  lat: number
  lng: number
}

interface RouteSegment {
  id: string
  path: Point[]
  delayRatio: number
}

export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  return turf.distance([lon1, lat1], [lon2, lat2], { units: "kilometers" })
}

// Helper function to calculate bearing between two points
export const calculateBearing = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  return turf.bearing([lng1, lat1], [lng2, lat2])
}

// Helper function to get point coordinates from various formats
export const getPoint = (point: Point) => {
  if (Array.isArray(point)) {
    return { lat: point[1], lng: point[0] }
  }
  return { lat: point.lat, lng: point.lng }
}

// Helper function to check if two route segments are connected in a straight line
export const areSegmentsConnected = (
  seg1: RouteSegment,
  seg2: RouteSegment,
  maxDistance: number = 0.0, // Increased from 0.1 to 0.3 km for more lenient grouping
): boolean => {
  if (
    !seg1.path ||
    !seg2.path ||
    seg1.path.length === 0 ||
    seg2.path.length === 0
  ) {
    return false
  }

  // Get start and end points of both segments
  const seg1Start = getPoint(seg1.path[0])
  const seg1End = getPoint(seg1.path[seg1.path.length - 1])
  const seg2Start = getPoint(seg2.path[0])
  const seg2End = getPoint(seg2.path[seg2.path.length - 1])

  // Check if segments are connected end-to-start (continuous line)
  const endToStartDistance = calculateDistance(
    seg1End.lat,
    seg1End.lng,
    seg2Start.lat,
    seg2Start.lng,
  )
  const startToEndDistance = calculateDistance(
    seg1Start.lat,
    seg1Start.lng,
    seg2End.lat,
    seg2End.lng,
  )

  // Check if segments are connected in a straight line
  const isEndToStart = endToStartDistance <= maxDistance
  const isStartToEnd = startToEndDistance <= maxDistance

  return isEndToStart || isStartToEnd
}

export const areSegmentsOverlapping = (
  seg1: RouteSegment,
  seg2: RouteSegment,
): boolean => {
  return seg1.path.some((point: Point) =>
    seg2.path.some(
      (otherPoint: Point) =>
        point.lat === otherPoint.lat && point.lng === otherPoint.lng,
    ),
  )
}

// Helper function to group connected route segments in straight lines
export const groupConnectedSegments = (
  segments: RouteSegment[],
): RouteSegment[][] => {
  const groups: RouteSegment[][] = []
  const processed = new Set<string>()

  segments.forEach((segment: RouteSegment) => {
    if (processed.has(segment.id)) return

    const group = [segment]
    processed.add(segment.id)

    // Find all connected segments in a straight line
    let foundNew = true
    while (foundNew) {
      foundNew = false
      segments.forEach((otherSegment) => {
        if (processed.has(otherSegment.id)) return

        // Check if this segment is connected to any segment in the current group
        const isConnected = group.some((groupSegment) =>
          areSegmentsConnected(groupSegment, otherSegment),
        )
        const isOverlapping = group.some((groupSegment) =>
          areSegmentsOverlapping(groupSegment, otherSegment),
        )

        if (isConnected || isOverlapping) {
          group.push(otherSegment)
          processed.add(otherSegment.id)
          foundNew = true
        }
      })
    }
    groups.push(group)
  })

  return groups
}

// Helper function to calculate the center position for a group of segments
// Positions the marker on the heaviest segment (highest delay ratio)
export const calculateGroupCenter = (
  group: RouteSegment[],
): [number, number] | null => {
  if (group.length === 0) return null

  // Find the heaviest segment (highest delay ratio)
  let heaviestSegment = group[0]
  let maxDelayRatio = heaviestSegment.delayRatio || 0

  group.forEach((segment) => {
    const segmentDelayRatio = segment.delayRatio || 0
    if (segmentDelayRatio > maxDelayRatio) {
      maxDelayRatio = segmentDelayRatio
      heaviestSegment = segment
    }
  })

  // Get the path of the heaviest segment
  if (!heaviestSegment.path || heaviestSegment.path.length === 0) {
    return null
  }

  // Calculate the midpoint of the heaviest segment's path
  const pathLength = heaviestSegment.path.length
  const midIndex = Math.floor(pathLength / 2)
  const midPoint = heaviestSegment.path[midIndex]

  // Return coordinates in [lng, lat] format for map positioning
  if (Array.isArray(midPoint)) {
    return [midPoint[0], midPoint[1]]
  }
  return [midPoint.lng, midPoint.lat]
}
