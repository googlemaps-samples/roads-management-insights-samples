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

import { Route, RouteSegment } from "../../stores/project-workspace-store"

export const transformRoute = (dbRoute: any): Route => {
  try {
    // Parse coordinate data with error handling - handle both old and new schema
    let origin, destination, waypoints
    try {
      // New schema: uses 'origin', 'destination' as JSON strings with {lat, lng} format
      // Old schema: uses 'origin_coordinates', 'destination_coordinates' as [lng, lat] arrays

      // Handle origin
      if (dbRoute.origin) {
        origin =
          typeof dbRoute.origin === "string"
            ? JSON.parse(dbRoute.origin)
            : dbRoute.origin
      } else if (dbRoute.origin_coordinates) {
        origin =
          typeof dbRoute.origin_coordinates === "string"
            ? JSON.parse(dbRoute.origin_coordinates)
            : dbRoute.origin_coordinates
      } else {
        origin = { lat: 0, lng: 0 }
      }

      // Handle destination
      if (dbRoute.destination) {
        destination =
          typeof dbRoute.destination === "string"
            ? JSON.parse(dbRoute.destination)
            : dbRoute.destination
      } else if (dbRoute.destination_coordinates) {
        destination =
          typeof dbRoute.destination_coordinates === "string"
            ? JSON.parse(dbRoute.destination_coordinates)
            : dbRoute.destination_coordinates
      } else {
        destination = { lat: 1, lng: 1 }
      }

      // Handle waypoints
      waypoints =
        typeof dbRoute.waypoints === "string"
          ? JSON.parse(dbRoute.waypoints || "[]")
          : dbRoute.waypoints || []
    } catch (e) {
      console.warn("Failed to parse coordinates, using defaults:", e)
      origin = { lat: 0, lng: 0 }
      destination = { lat: 1, lng: 1 }
      waypoints = []
    }

    // Transform coordinates to {lat, lng} format if they're arrays
    const transformCoords = (coords: any) => {
      // If already in {lat, lng} format, return as is
      if (
        coords &&
        typeof coords === "object" &&
        "lat" in coords &&
        "lng" in coords
      ) {
        return { lat: coords.lat, lng: coords.lng }
      }
      // If in [lng, lat] array format, convert
      if (Array.isArray(coords) && coords.length >= 2) {
        return { lat: coords[1], lng: coords[0] }
      }
      // Fallback
      return { lat: 0, lng: 0 }
    }

    // Default values for missing fields
    const getStatusColor = (status?: string): string => {
      switch (status) {
        case "disabled":
          return "#FF5252"
        case "unsynced":
          return "#FF9800"
        case "synced":
          return "#4CAF50"
        default:
          return "#2196F3"
      }
    }

    return {
      id: dbRoute.uuid || "unknown",
      name: dbRoute.route_name || "Unnamed Route",
      projectId: dbRoute.project_id?.toString() || "unknown",
      type: dbRoute.route_type,
      // Determine source: check route_type first, then fallback to original_route_geo_json
      source: (() => {
        // If route_type is "uploaded", it was uploaded (not manually drawn)
        if (dbRoute.route_type === "uploaded") {
          return "polygon_selection" // Use polygon_selection as catch-all for non-manually-drawn routes
        }
        // If original_route_geo_json exists, the route was uploaded (not manually drawn)
        if (dbRoute.original_route_geo_json) {
          return "polygon_selection" // Use polygon_selection as catch-all for non-manually-drawn routes
        }
        // Otherwise, check route_type
        return dbRoute.route_type === "individual" || !dbRoute.route_type
          ? "individual_drawing"
          : "polygon_selection"
      })(),

      // Geographic data
      origin: transformCoords(origin),
      destination: transformCoords(destination),
      waypoints: waypoints.map(transformCoords),
      encodedPolyline: dbRoute.encoded_polyline || "", // Use encoded polyline from routes table
      distance: dbRoute.length || dbRoute.distance || 0, // New schema uses 'length'
      duration: Math.floor((dbRoute.length || dbRoute.distance || 0) * 2), // Rough calculation

      // Status tracking
      sync_status:
        dbRoute.sync_status &&
        ["unsynced", "validating", "synced", "invalid"].includes(
          dbRoute.sync_status,
        )
          ? (dbRoute.sync_status as
              | "unsynced"
              | "validating"
              | "synced"
              | "invalid")
          : "unsynced",
      route_status:
        dbRoute.routes_status &&
        ["STATUS_RUNNING", "STATUS_VALIDATING", "STATUS_INVALID"].includes(
          dbRoute.routes_status,
        )
          ? (dbRoute.routes_status as
              | "STATUS_RUNNING"
              | "STATUS_VALIDATING"
              | "STATUS_INVALID")
          : undefined,
      createdAt: dbRoute.created_at || new Date().toISOString(),
      updatedAt:
        dbRoute.updated_at || dbRoute.created_at || new Date().toISOString(),
      lastSyncedAt: undefined,

      // Route composition - handle roads if present
      roads: dbRoute.roads
        ? dbRoute.roads.map((road: any) => ({
            id: road?.id?.toString(),
            // Use segment_route_id (child route UUID) if available, otherwise use parent route UUID
            routeId: road.segment_route_id || dbRoute.uuid,
            name: road.name || `Road ${road.id}`,
            linestringGeoJson: road.polyline, // Now GeoJSON LineString format
            segmentOrder: road.segment_order || 0,
            distanceKm: road.length || 0,
            is_enabled:
              typeof road.is_enabled === "boolean"
                ? road.is_enabled
                : road.is_enabled !== undefined
                  ? Boolean(road.is_enabled)
                  : undefined,
            is_selected:
              typeof road.is_selected === "boolean"
                ? road.is_selected
                : road.is_selected !== undefined
                  ? Boolean(road.is_selected)
                  : undefined,
            createdAt: road.created_at || new Date().toISOString(),
          }))
        : [],
      isSegmented: dbRoute.is_segmented || false,
      segmentCount: dbRoute.segments
        ? dbRoute.segments.length
        : dbRoute.roads
          ? dbRoute.roads.length
          : 1,
      segmentationType: dbRoute.segmentation_type as
        | "manual"
        | "distance"
        | undefined,
      // Include segments (child routes) if present
      segments: dbRoute.segments
        ? dbRoute.segments.map(
            (segment: any): RouteSegment => ({
              uuid: segment.uuid,
              project_id: segment.project_id,
              route_name: segment.route_name,
              origin: segment.origin,
              destination: segment.destination,
              waypoints: segment.waypoints,
              center: segment.center,
              route_type: segment.route_type,
              length: segment.length,
              parent_route_id: segment.parent_route_id,
              has_children: segment.has_children || false,
              is_segmented: segment.is_segmented || false,
              segmentation_type: segment.segmentation_type,
              segmentation_points: segment.segmentation_points,
              segmentation_config: segment.segmentation_config,
              sync_status: segment.sync_status || "pending",
              is_enabled:
                segment.is_enabled !== undefined ? segment.is_enabled : true,
              tag: segment.tag,
              encoded_polyline: segment.encoded_polyline || null,
              segment_order: segment.segment_order || null,
              created_at: segment.created_at,
              updated_at: segment.updated_at,
              deleted_at: segment.deleted_at,
            }),
          )
        : undefined,

      // Visual properties - use defaults
      color: getStatusColor(dbRoute.sync_status),
      opacity: 0.8,
      strokeWidth: 3,
      // Categorization
      tag: dbRoute.tag ?? null,
      // Original uploaded route data (if available)
      originalRouteGeoJson: (() => {
        const rawValue = dbRoute.original_route_geo_json

        if (!rawValue) {
          return undefined
        }

        try {
          return typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue
        } catch (error) {
          console.error("Failed to parse original_route_geo_json:", error)
          return undefined
        }
      })(),
      // Match/similarity percentage (0-100)
      matchPercentage: dbRoute.match_percentage ?? undefined,
    }
  } catch (error) {
    console.error("Error transforming route:", error, dbRoute)
    // Return default route if transformation fails
    return {
      id: dbRoute.uuid || "unknown",
      name: dbRoute.route_name || "Unnamed Route",
      projectId: dbRoute.project_id?.toString() || "unknown",
      type: "individual" as const,
      source: "individual_drawing" as const,
      origin: { lat: 0, lng: 0 },
      destination: { lat: 1, lng: 1 },
      waypoints: [],
      encodedPolyline: "",
      distance: 0,
      duration: 0,
      sync_status: "unsynced" as const,
      route_status: "UNSYNCED" as const,
      createdAt: dbRoute.created_at || new Date().toISOString(),
      updatedAt:
        dbRoute.updated_at || dbRoute.created_at || new Date().toISOString(),
      roads: [],
      isSegmented: false,
      segmentCount: 1,
      color: "#2196F3",
      opacity: 0.8,
      strokeWidth: 3,
    }
  }
}
