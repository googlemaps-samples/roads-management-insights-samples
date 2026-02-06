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

import { v4 as uuidv4 } from "uuid"

import { Route, RouteSegment } from "../../stores/project-workspace-store"
import { API_BASE_URL, apiClient } from "../api-client"
import { ApiResponse, RouteSaveRequest, RouteSaveResponse } from "../api-types"
import { transformRoute } from "../transformers"

// Routes API
export const routesApi = {
  // Get routes by project ID
  getByProject: async (projectId: string): Promise<ApiResponse<Route[]>> => {
    try {
      console.log("Fetching routes for project:", projectId)
      const data = await apiClient.get<any[]>(`/routes/project/${projectId}`)
      console.log("Raw routes data:", data)
      const transformedData = data.map(transformRoute)
      console.log("Transformed routes data:", transformedData)
      return {
        success: true,
        data: transformedData,
        message: "Routes fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching routes:", error)
      return {
        success: false,
        data: [],
        message:
          error instanceof Error ? error.message : "Failed to fetch routes",
      }
    }
  },

  // Get route by ID (with roads)
  getById: async (routeId: string): Promise<ApiResponse<Route | null>> => {
    try {
      const data = await apiClient.get<any>(`/routes/uuid/${routeId}`)

      // Transform route
      const transformedRoute = transformRoute(data)

      // Transform roads if present
      if (data.roads && Array.isArray(data.roads)) {
        transformedRoute.roads = data.roads.map((road: any) => ({
          id: road?.id?.toString(),
          // Use segment_route_id (child route UUID) if available, otherwise use parent route ID
          routeId: road.segment_route_id || transformedRoute.id,
          name: road.name || `Road ${road.id}`,
          linestringGeoJson: road.polyline, // Backend sends GeoJSON LineString
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
      }

      return {
        success: true,
        data: transformedRoute,
        message: "Route fetched successfully",
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message.toLowerCase() : ""
      // Check for 404 or "not found" in various formats
      if (
        errorMessage.includes("404") ||
        errorMessage.includes("not found") ||
        errorMessage.includes("endpoint not found")
      ) {
        return {
          success: false,
          data: null,
          message: "Route not found",
        }
      }
      console.error("Error fetching route:", error)
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : "Failed to fetch route",
      }
    }
  },

  // Create new route
  create: async (
    routeData: Omit<Route, "id" | "createdAt" | "updatedAt">,
  ): Promise<ApiResponse<Route>> => {
    try {
      // Transform coordinates from {lat, lng} to [lng, lat]
      const transformCoords = (coords: { lat: number; lng: number }) => [
        coords.lng,
        coords.lat,
      ]

      const requestData = {
        uuid: uuidv4(),
        route_name: routeData.name,
        coordinates: {
          origin: transformCoords(routeData.origin),
          destination: transformCoords(routeData.destination),
          waypoints: routeData.waypoints.map(transformCoords),
        },
        encoded_polyline: routeData.encodedPolyline,
        project_id: parseInt(routeData.projectId),
        polygon_id: null,
      }

      const response = await apiClient.post<{ success: boolean; data: any }>(
        "/routes/save",
        requestData,
      )

      if (response.success) {
        // Transform the response data
        const transformedData = transformRoute(response.data)
        return {
          success: true,
          data: transformedData,
          message: "Route created successfully",
        }
      }

      throw new Error("Failed to create route")
    } catch (error) {
      console.error("Error creating route:", error)
      return {
        success: false,
        data: {} as Route,
        message:
          error instanceof Error ? error.message : "Failed to create route",
      }
    }
  },

  // Update route
  update: async (
    routeId: string,
    updates: Partial<Route>,
  ): Promise<ApiResponse<Route | null>> => {
    try {
      // Map frontend Route fields to backend fields
      const backendUpdates: Record<string, any> = {}

      if (updates.name !== undefined) {
        backendUpdates.route_name = updates.name
      }
      if (updates.sync_status !== undefined) {
        backendUpdates.sync_status = updates.sync_status
      }
      if (updates.type !== undefined) {
        backendUpdates.route_type = updates.type
      }

      const response = await fetch(`${API_BASE_URL}/routes/uuid/${routeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(backendUpdates),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.detail || `HTTP ${response.status}: ${response.statusText}`,
        )
      }

      const backendRoute = await response.json()

      // Transform backend response to frontend Route format
      const frontendRoute = transformRoute(backendRoute)

      return {
        success: true,
        data: frontendRoute,
        message: "Route updated successfully",
      }
    } catch (error) {
      console.error("❌ Route update error:", error)
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : "Failed to update route",
      }
    }
  },

  // Delete route (soft delete)
  delete: async (routeId: string): Promise<ApiResponse<boolean>> => {
    try {
      // Use PUT instead of DELETE to update the deleted_at field
      await apiClient.put(`/routes/uuid/${routeId}/soft-delete`, {
        deleted_at: new Date().toISOString(),
      })
      return {
        success: true,
        data: true,
        message: "Route deleted successfully",
      }
    } catch (error) {
      return {
        success: false,
        data: false,
        message:
          error instanceof Error ? error.message : "Failed to delete route",
      }
    }
  },

  // Sync route to BigQuery
  sync: async (_routeId: string): Promise<ApiResponse<Route | null>> => {
    try {
      // This would need to be implemented in the backend
      return {
        success: false,
        data: null,
        message: "Route sync not implemented yet",
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : "Failed to sync route",
      }
    }
  },

  // Unsync route from BigQuery
  unsync: async (_routeId: string): Promise<ApiResponse<Route | null>> => {
    try {
      // This would need to be implemented in the backend
      return {
        success: false,
        data: null,
        message: "Route unsync not implemented yet",
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : "Failed to unsync route",
      }
    }
  },

  // Apply segmentation to a route
  applySegmentation: async (
    routeId: string,
    segmentationData: {
      type: "manual" | "distance" | "intersections"
      cutPoints?: number[][]
      distanceKm?: number
      segments: any[]
    },
  ): Promise<
    ApiResponse<{
      segmentsCreated: number
      message: string
      newRouteUuid: string
    }>
  > => {
    try {
      console.log("Applying segmentation for route:", routeId, segmentationData)
      console.log(
        "🔍 Segment names being sent:",
        segmentationData.segments.map((s: any) => ({
          id: s.id,
          route_name: s.route_name,
          name: s.name,
        })),
      )

      const response = await apiClient.post<{
        success: boolean
        message: string
        segmentsCreated: number
        newRouteUuid: string
      }>(`/routes/${routeId}/segment`, segmentationData)
      console.log("🔍 Backend response:", response)

      // Backend now returns newRouteUuid in the response
      const newRouteUuid = response.newRouteUuid || routeId

      return {
        success: true,
        data: {
          segmentsCreated: segmentationData.segments.length,
          message: "Segmentation applied successfully",
          newRouteUuid: newRouteUuid,
        },
        message: "Segmentation applied successfully",
      }
    } catch (error) {
      console.error("Error applying segmentation:", error)
      return {
        success: false,
        data: {
          segmentsCreated: 0,
          message: "Failed to apply segmentation",
          newRouteUuid: routeId, // Fallback to old UUID on error
        },
        message:
          error instanceof Error
            ? error.message
            : "Failed to apply segmentation",
      }
    }
  },

  clearSegmentation: async (
    routeId: string,
  ): Promise<ApiResponse<{ message: string }>> => {
    try {
      console.log("Clearing segmentation for route:", routeId)

      const data = await apiClient.post<any>(
        `/routes/${routeId}/clear-segmentation`,
      )

      return {
        success: true,
        data: {
          message: data.message || "Segmentation cleared successfully",
        },
        message: "Segmentation cleared successfully",
      }
    } catch (error) {
      console.error("Error clearing segmentation:", error)
      return {
        success: false,
        data: {
          message: "Failed to clear segmentation",
        },
        message:
          error instanceof Error
            ? error.message
            : "Failed to clear segmentation",
      }
    }
  },

  // Save route (for route save API)
  save: async (routeData: RouteSaveRequest): Promise<RouteSaveResponse> => {
    const response = await apiClient.post<RouteSaveResponse>(
      "/routes/save",
      routeData,
    )
    return response
  },

  // Batch save multiple roads as individual routes
  batchSave: async (payload: {
    project_id: string
    tag: string
    roads: Array<{
      id: string
      name?: string
      length?: number
      linestringGeoJson?: GeoJSON.LineString
      encodedPolyline?: string // Google-encoded polyline string (preferred over linestringGeoJson)
      originalRouteGeoJson?: GeoJSON.Feature | GeoJSON.FeatureCollection
      origin: [number, number] // [lng, lat]
      destination: [number, number] // [lng, lat]
      waypoints?: [number, number][] // [[lng, lat], ...]
      route_type?: string
      matchPercentage?: number // Similarity/match percentage (0-100)
    }>
  }): Promise<
    ApiResponse<{
      savedCount: number
      errors: Array<{ roadId: string; message: string }>
    }>
  > => {
    try {
      console.log(
        "Batch saving roads to routes for project:",
        payload.project_id,
      )

      // Transform frontend format to backend format
      // Track mapping from route UUID to road ID for error reporting
      const uuidToRoadIdMap = new Map<string, string>()

      const routes = payload.roads
        .map((road) => {
          // Validate required fields
          if (!road.origin || !road.destination) {
            return null
          }

          // Prefer encodedPolyline if available, otherwise use linestringGeoJson
          let encodedPolyline: string | null = null

          if (road.encodedPolyline && road.encodedPolyline.trim()) {
            // Use the provided encoded polyline directly (Google-encoded format)
            encodedPolyline = road.encodedPolyline.trim()
          } else if (
            road.linestringGeoJson &&
            road.linestringGeoJson.type === "LineString"
          ) {
            // Fallback: convert LineString coordinates to JSON format
            const coordinates = road.linestringGeoJson.coordinates
            if (!coordinates || coordinates.length < 2) {
              return null
            }
            // The backend's calculate_spatial_fields can handle JSON format
            encodedPolyline = JSON.stringify(coordinates)
          } else {
            // No valid geometry provided
            return null
          }

          // Generate UUID for the route
          const routeUuid = uuidv4()

          // Store mapping for error reporting
          uuidToRoadIdMap.set(routeUuid, road.id)

          // Transform originalRouteGeoJson if present
          let originalRouteGeoJson: any = undefined
          if (road.originalRouteGeoJson) {
            originalRouteGeoJson = road.originalRouteGeoJson
          }

          return {
            uuid: routeUuid,
            route_name: road.name || `Route ${road.id}`,
            coordinates: {
              origin: road.origin,
              destination: road.destination,
              waypoints: road.waypoints || [],
            },
            encoded_polyline: encodedPolyline, // Can be Google-encoded polyline or JSON string
            region_id: parseInt(payload.project_id, 10),
            polygon_id: undefined,
            tag: payload.tag || null,
            length: road.length || undefined,
            route_type: road.route_type || "uploaded", // Mark as uploaded route type
            original_route_geo_json: originalRouteGeoJson,
            match_percentage: road.matchPercentage, // Include match percentage
          }
        })
        .filter((route) => route !== null) as RouteSaveRequest[]

      if (routes.length === 0) {
        throw new Error("No valid roads to save")
      }

      // Send transformed payload to backend
      const response = await apiClient.post<any>("/routes/batch-save", {
        routes,
      })

      // Transform backend response to frontend format
      if (!response.success && response.success !== undefined) {
        throw new Error(response.message || "Batch save failed")
      }

      // Backend returns data as a list of route responses
      // Extract saved count and errors from the response
      const savedCount = response.data?.length || 0
      const errors: Array<{ roadId: string; message: string }> = []

      // Check for any failed routes in the response
      if (Array.isArray(response.data)) {
        response.data.forEach((routeResponse: any) => {
          if (!routeResponse.success) {
            // Match response to road using UUID from response data
            const routeUuid = routeResponse.data?.uuid
            const roadId = routeUuid
              ? uuidToRoadIdMap.get(routeUuid)
              : undefined

            errors.push({
              roadId: roadId || "unknown",
              message: routeResponse.message || "Failed to save route",
            })
          }
        })
      }

      return {
        success: true,
        data: {
          savedCount: savedCount - errors.length, // Only count successful saves
          errors,
        },
        message: response.message || "Batch save completed",
      }
    } catch (error) {
      console.error("Error batch saving routes:", error)
      return {
        success: false,
        data: {
          savedCount: 0,
          errors: [],
        },
        message: error instanceof Error ? error.message : "Batch save failed",
      }
    }
  },

  // Get project tags with counts
  getProjectTags: async (
    projectId: string,
  ): Promise<
    ApiResponse<{
      tags: string[]
      counts: { [tag: string]: number }
      segmentCounts: { [tag: string]: number }
      routeCounts: { [tag: string]: number }
    }>
  > => {
    try {
      const response = await apiClient.get<{
        success: boolean
        data: {
          tags: string[]
          counts: { [tag: string]: number }
          segmentCounts: { [tag: string]: number }
          routeCounts: { [tag: string]: number }
        }
      }>(`/routes/project/${projectId}/tags`)
      return {
        success: true,
        data: response.data || {
          tags: [],
          counts: {},
          segmentCounts: {},
          routeCounts: {},
        },
        message: "Tags fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching project tags:", error)
      return {
        success: false,
        data: { tags: [], counts: {}, segmentCounts: {}, routeCounts: {} },
        message:
          error instanceof Error ? error.message : "Failed to fetch tags",
      }
    }
  },

  // Get project route count
  getProjectRouteCount: async (
    projectId: string,
  ): Promise<ApiResponse<{ count: number }>> => {
    try {
      const response = await apiClient.get<{
        success: boolean
        data: { count: number }
      }>(`/routes/project/${projectId}/count`)
      return {
        success: true,
        data: response.data || { count: 0 },
        message: "Route count fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching route count:", error)
      return {
        success: false,
        data: { count: 0 },
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch route count",
      }
    }
  },

  // Get route counts for multiple projects at once
  getProjectsRouteCounts: async (
    projectIds: string[],
  ): Promise<ApiResponse<Record<string, number>>> => {
    try {
      if (projectIds.length === 0) {
        return {
          success: true,
          data: {},
          message: "No project IDs provided",
        }
      }

      const params = new URLSearchParams({
        project_ids: projectIds.join(","),
      })
      const response = await apiClient.get<{
        success: boolean
        data: Record<string, number>
      }>(`/routes/projects/counts?${params.toString()}`)
      return {
        success: true,
        data: response.data || {},
        message: "Route counts fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching route counts:", error)
      return {
        success: false,
        data: {},
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch route counts",
      }
    }
  },

  // Paginated routes with search and tag filtering
  getByProjectPaginated: async (
    projectId: string,
    page: number,
    limit: number,
    search?: string,
    tag?: string,
    sortBy?: "name" | "distance" | "created_at" | "match_percentage",
    routeTypes?: ("imported" | "drawn" | "uploaded")[],
  ): Promise<
    ApiResponse<{
      routes: Route[]
      pagination: {
        total: number
        page: number
        limit: number
        hasMore: boolean
      }
    }>
  > => {
    try {
      console.log(
        "🔍 Fetching paginated routes:",
        projectId,
        page,
        limit,
        search,
        tag,
      )

      // Build query params
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })

      if (search) {
        params.append("search", search)
      }

      // Allow empty string tags - only skip if tag is undefined or null
      if (tag !== undefined && tag !== null) {
        params.append("tag", tag === "" ? "" : tag)
      }

      if (sortBy) {
        params.append("sort_by", sortBy)
      }

      if (routeTypes && routeTypes.length > 0) {
        // Pass multiple route types as comma-separated values
        params.append("route_types", routeTypes.join(","))
      }

      const data = await apiClient.get<{
        routes: any[]
        pagination: {
          total: number
          page: number
          limit: number
          hasMore: boolean
        }
      }>(`/routes/project/${projectId}/paginated?${params.toString()}`)

      console.log("📦 Raw paginated routes data:", data)

      // Transform routes
      const transformedRoutes = data.routes.map(transformRoute)

      console.log("✅ Transformed paginated routes:", transformedRoutes)

      return {
        success: true,
        data: {
          routes: transformedRoutes,
          pagination: data.pagination,
        },
        message: "Paginated routes fetched successfully",
      }
    } catch (error) {
      console.error("❌ Error fetching paginated routes:", error)
      return {
        success: false,
        data: {
          routes: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 20,
            hasMore: false,
          },
        },
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch paginated routes",
      }
    }
  },

  // Paginated routes with ID-based pagination (target route first)
  getByProjectPaginatedById: async (
    projectId: string,
    targetRouteId: string | null,
    page: number,
    limit: number,
    tag?: string,
    sortBy?: "name" | "distance" | "created_at" | "match_percentage",
    routeTypes?: ("imported" | "drawn" | "uploaded")[],
  ): Promise<
    ApiResponse<{
      routes: Route[]
      pagination: {
        total: number
        page: number
        limit: number
        hasMore: boolean
      }
    }>
  > => {
    try {
      console.log(
        "🔍 Fetching paginated routes by ID:",
        projectId,
        targetRouteId,
        page,
        limit,
        tag,
      )

      // Build query params
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })

      if (targetRouteId) {
        params.append("target_route_id", targetRouteId)
      }

      // Allow empty string tags - only skip if tag is undefined or null
      if (tag !== undefined && tag !== null) {
        params.append("tag", tag)
      }

      if (sortBy) {
        params.append("sort_by", sortBy)
      }

      if (routeTypes && routeTypes.length > 0) {
        params.append("route_types", routeTypes.join(","))
      }

      const data = await apiClient.get<{
        routes: any[]
        pagination: {
          total: number
          page: number
          limit: number
          hasMore: boolean
        }
      }>(`/routes/project/${projectId}/paginated-by-id?${params.toString()}`)

      console.log("📦 Raw paginated routes by ID data:", data)

      // Transform routes
      const transformedRoutes = data.routes.map(transformRoute)

      console.log("✅ Transformed paginated routes by ID:", transformedRoutes)

      return {
        success: true,
        data: {
          routes: transformedRoutes,
          pagination: data.pagination,
        },
        message: "Paginated routes by ID fetched successfully",
      }
    } catch (error) {
      console.error("❌ Error fetching paginated routes by ID:", error)
      return {
        success: false,
        data: {
          routes: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 20,
            hasMore: false,
          },
        },
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch paginated routes by ID",
      }
    }
  },

  // Unified search (routes + segments)
  searchUnified: async (
    projectId: string,
    search: string,
    tag?: string,
    page: number = 1,
    limit: number = 20,
    routeTypes?: ("imported" | "drawn" | "uploaded")[],
  ): Promise<
    ApiResponse<{
      items: Array<{
        type: "route" | "segment"
        route?: Route
        segment?: RouteSegment
        parent_route?: RouteSegment
      }>
      pagination: {
        total: number
        page: number
        limit: number
        hasMore: boolean
      }
    }>
  > => {
    try {
      console.log(
        "🔍 Unified search:",
        projectId,
        page,
        limit,
        search,
        tag,
        routeTypes,
      )

      // Build query params
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search: search,
      })

      // Allow empty string tags - only skip if tag is undefined or null
      if (tag !== undefined && tag !== null) {
        params.append("tag", tag)
      }

      if (routeTypes && routeTypes.length > 0) {
        params.append("route_types", routeTypes.join(","))
      }

      const data = await apiClient.get<{
        items: Array<{
          type: "route" | "segment"
          route?: any
          segment?: any
          parent_route?: any
        }>
        pagination: {
          total: number
          page: number
          limit: number
          hasMore: boolean
        }
      }>(`/routes/project/${projectId}/search-unified?${params.toString()}`)

      console.log("📦 Raw unified search data:", data)

      // Transform items
      const transformedItems = data.items.map((item) => {
        if (item.type === "route" && item.route) {
          return {
            type: "route" as const,
            route: transformRoute(item.route),
            segment: undefined,
            parent_route: undefined,
          }
        } else if (item.type === "segment" && item.segment) {
          // Transform segment and parent_route using the same logic as transformRoute
          // but for segments, we don't need full transformation - just use the data as-is
          // since segments are already in RouteSegment format
          return {
            type: "segment" as const,
            route: undefined,
            segment: item.segment as RouteSegment,
            parent_route: item.parent_route as RouteSegment | undefined,
          }
        }
        return item
      })

      console.log("✅ Transformed unified search items:", transformedItems)

      return {
        success: true,
        data: {
          items: transformedItems,
          pagination: data.pagination,
        },
        message: "Unified search completed successfully",
      }
    } catch (error) {
      console.error("❌ Error in unified search:", error)
      return {
        success: false,
        data: {
          items: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 20,
            hasMore: false,
          },
        },
        message:
          error instanceof Error
            ? error.message
            : "Failed to perform unified search",
      }
    }
  },

  // Toggle route enabled status
  toggleRouteEnabled: async (
    routeId: string,
    isEnabled: boolean,
  ): Promise<ApiResponse<{ success: boolean; message: string }>> => {
    try {
      console.log("Toggling route enabled:", routeId, isEnabled)

      const data = await apiClient.put<{
        success: boolean
        message: string
        route_uuid: string
        is_enabled: boolean
      }>(`/routes/${routeId}/toggle-enabled`, {
        is_enabled: isEnabled,
      })

      console.log("Route enabled status updated:", data)

      return {
        success: true,
        data: {
          success: data.success,
          message: data.message || "Route enabled status updated successfully",
        },
        message: data.message || "Route enabled status updated successfully",
      }
    } catch (error) {
      console.error("Error toggling route enabled status:", error)
      return {
        success: false,
        data: { success: false, message: "Failed to toggle route" },
        message:
          error instanceof Error
            ? error.message
            : "Failed to toggle route enabled status",
      }
    }
  },

  // Get intersections for a route
  getIntersections: async (
    encodedPolyline: string,
  ): Promise<ApiResponse<GeoJSON.FeatureCollection>> => {
    try {
      console.log("Fetching intersections for polyline")
      const data = await apiClient.get<GeoJSON.FeatureCollection>(
        `/intersections?encoded_polyline_str=${encodeURIComponent(encodedPolyline)}`,
      )
      return {
        success: true,
        data: data,
        message: "Intersections fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching intersections:", error)
      return {
        success: false,
        data: {
          type: "FeatureCollection",
          features: [],
        } as GeoJSON.FeatureCollection,
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch intersections",
      }
    }
  },

  // Batch soft delete routes
  batchSoftDelete: async (
    routeIds: string[],
  ): Promise<ApiResponse<{ deleted_count: number }>> => {
    try {
      console.log("Batch soft deleting routes:", routeIds)

      const response = await apiClient.post<{
        success: boolean
        message: string
        deleted_count: number
      }>("/routes/batch/soft-delete", {
        route_ids: routeIds,
      })

      return {
        success: true,
        data: {
          deleted_count: response.deleted_count || routeIds.length,
        },
        message: response.message || "Routes deleted successfully",
      }
    } catch (error) {
      console.error("Error batch soft deleting routes:", error)
      return {
        success: false,
        data: { deleted_count: 0 },
        message:
          error instanceof Error
            ? error.message
            : "Failed to batch delete routes",
      }
    }
  },

  // Batch move routes (update tags)
  batchMove: async (
    routeIds: string[],
    tag: string | null,
  ): Promise<ApiResponse<{ updated_count: number }>> => {
    try {
      console.log("Batch moving routes:", routeIds, "to tag:", tag)

      const response = await apiClient.post<{
        success: boolean
        message: string
        updated_count: number
      }>("/routes/batch/move", {
        route_ids: routeIds,
        tag: tag || null,
      })

      return {
        success: true,
        data: {
          updated_count: response.updated_count || routeIds.length,
        },
        message: response.message || "Routes moved successfully",
      }
    } catch (error) {
      console.error("Error batch moving routes:", error)
      return {
        success: false,
        data: { updated_count: 0 },
        message:
          error instanceof Error
            ? error.message
            : "Failed to batch move routes",
      }
    }
  },

  // Tag batch operations
  // Rename all routes from one tag to another
  renameTag: async (
    dbProjectId: number,
    tag: string,
    newTag: string,
  ): Promise<ApiResponse<{ detail: string }>> => {
    try {
      const response = await apiClient.post<{ detail: string }>("/rename-tag", {
        db_project_id: dbProjectId,
        tag,
        new_tag: newTag,
      })

      return {
        success: true,
        data: response,
        message: response.detail || "Tag renamed successfully",
      }
    } catch (error) {
      console.error("Error renaming tag:", error)
      return {
        success: false,
        data: { detail: "" },
        message:
          error instanceof Error ? error.message : "Failed to rename tag",
      }
    }
  },

  // Move all routes from one tag to another
  moveTag: async (
    dbProjectId: number,
    tag: string,
    newTag: string,
  ): Promise<ApiResponse<{ detail: string }>> => {
    try {
      const response = await apiClient.post<{ detail: string }>("/move-tag", {
        db_project_id: dbProjectId,
        tag,
        new_tag: newTag,
      })

      return {
        success: true,
        data: response,
        message: response.detail || "Tag moved successfully",
      }
    } catch (error) {
      console.error("Error moving tag:", error)
      return {
        success: false,
        data: { detail: "" },
        message: error instanceof Error ? error.message : "Failed to move tag",
      }
    }
  },

  // Delete all routes in a tag (soft delete)
  deleteTag: async (
    dbProjectId: number,
    tag: string,
  ): Promise<ApiResponse<{ detail: string }>> => {
    try {
      const response = await apiClient.post<{ detail: string }>("/delete-tag", {
        db_project_id: dbProjectId,
        tag,
      })

      return {
        success: true,
        data: response,
        message: response.detail || "Tag deleted successfully",
      }
    } catch (error) {
      console.error("Error deleting tag:", error)
      return {
        success: false,
        data: { detail: "" },
        message:
          error instanceof Error ? error.message : "Failed to delete tag",
      }
    }
  },

  // Segment all routes in a tag
  segmentTag: async (
    dbProjectId: number,
    tag: string,
    distanceKm: number,
  ): Promise<ApiResponse<{ detail: string }>> => {
    try {
      const response = await apiClient.post<{ detail: string }>(
        "/segment-tag",
        {
          db_project_id: dbProjectId,
          tag,
          distance_km: distanceKm,
        },
      )

      return {
        success: true,
        data: response,
        message: response.detail || "Routes segmented successfully",
      }
    } catch (error) {
      console.error("Error segmenting tag:", error)
      return {
        success: false,
        data: { detail: "" },
        message:
          error instanceof Error ? error.message : "Failed to segment routes",
      }
    }
  },

  // Stretch all routes in a tag to intersections
  stretchTag: async (
    dbProjectId: number,
    tag: string,
  ): Promise<
    ApiResponse<{ stretched_routes: number; non_stretched_routes: number }>
  > => {
    try {
      const response = await apiClient.post<{
        stretched_routes: number
        non_stretched_routes: number
      }>("/stretch-tag", {
        db_project_id: dbProjectId,
        tag,
      })

      return {
        success: true,
        data: response,
        message: `Stretched ${response.stretched_routes} routes successfully`,
      }
    } catch (error) {
      console.error("Error stretching tag:", error)
      return {
        success: false,
        data: { stretched_routes: 0, non_stretched_routes: 0 },
        message:
          error instanceof Error ? error.message : "Failed to stretch routes",
      }
    }
  },
}
