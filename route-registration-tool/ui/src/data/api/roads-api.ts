import { Road } from "../../stores/project-workspace-store"
import { apiClient } from "../api-client"
import { ApiResponse } from "../api-types"

// Roads API
export const roadsApi = {
  // Get ALL roads in a project (entire road network)
  getByProject: async (projectId: string): Promise<ApiResponse<Road[]>> => {
    try {
      console.log("Fetching all roads for project:", projectId)
      const data = await apiClient.get<any[]>(`/roads/project/${projectId}`)
      console.log("Raw roads data:", data)

      // Transform backend roads to frontend Road type
      const transformedData: Road[] = data.map(
        (road: any) =>
          ({
            id: road?.id?.toString(),
            routeId: "", // Roads in network might not belong to a route
            name: road.name || `Road ${road.id}`,
            linestringGeoJson: road.polyline, // This is GeoJSON LineString format
            is_enabled: road.is_enabled !== undefined ? road.is_enabled : true, // Include is_enabled property
            segmentOrder: 0,
            distanceKm: road.length || 0,
            createdAt: road.created_at || new Date().toISOString(),
          }) as any,
      )

      console.log("Transformed roads data:", transformedData)
      return {
        success: true,
        data: transformedData,
        message: "Roads fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching roads:", error)
      return {
        success: false,
        data: [],
        message:
          error instanceof Error ? error.message : "Failed to fetch roads",
      }
    }
  },

  selectByPolygon: async ({
    project_id,
    polygon,
    priorities,
  }: {
    project_id: string
    polygon: GeoJSON.Polygon
    priorities?: string[]
  }): Promise<ApiResponse<Road[]>> => {
    try {
      console.log(
        "Selecting roads for project:",
        project_id,
        "polygon:",
        polygon,
        "priorities:",
        priorities,
      )

      const payload: Record<string, any> = {
        project_id,
        polygon,
      }
      if (priorities && priorities.length > 0) {
        payload.priorities = priorities
      }

      const data = await apiClient.post<any>("/roads/selection", payload)

      const rawRoads = data.roads || data || []
      const transformedData: Road[] = rawRoads.map(
        (road: any) =>
          ({
            id: road?.id?.toString() || `${Math.random()}`,
            routeId: "",
            name: road.name || `Road ${road.id}`,
            linestringGeoJson: road.polyline || road.linestring_geojson,
            is_enabled: road.is_enabled !== undefined ? road.is_enabled : true,
            segmentOrder: 0,
            distanceKm: road.length || road.distance || 0,
            createdAt: road.created_at || new Date().toISOString(),
          }) as Road,
      )

      console.log(
        "Selected roads count:",
        transformedData.length,
        "for polygon selection",
      )

      return {
        success: true,
        data: transformedData,
        message: "Roads selected successfully",
      }
    } catch (error) {
      console.error("Error selecting roads by polygon:", error)
      return {
        success: false,
        data: [],
        message:
          error instanceof Error ? error.message : "Failed to select roads",
      }
    }
  },

  // Get roads by route ID
  getByRoute: async (routeId: string): Promise<ApiResponse<Road[]>> => {
    try {
      console.log("Requesting roads for route:", routeId)
      // This would need to be implemented in the backend
      return {
        success: true,
        data: [],
        message: "Roads API not implemented yet",
      }
    } catch (error) {
      return {
        success: false,
        data: [],
        message:
          error instanceof Error ? error.message : "Failed to fetch roads",
      }
    }
  },

  // Create new road
  create: async (
    roadData: Omit<Road, "id" | "createdAt">,
  ): Promise<ApiResponse<Road>> => {
    try {
      console.log("Creating road (stub):", roadData)
      // This would need to be implemented in the backend
      return {
        success: false,
        data: {} as Road,
        message: "Road creation not implemented yet",
      }
    } catch (error) {
      return {
        success: false,
        data: {} as Road,
        message:
          error instanceof Error ? error.message : "Failed to create road",
      }
    }
  },

  // Update road
  update: async (
    roadId: string,
    updates: Partial<Road>,
  ): Promise<ApiResponse<Road | null>> => {
    try {
      console.log("Updating road:", roadId, updates)

      // Map frontend Road type to backend update format
      const requestData: any = {}

      // Only send fields that backend accepts
      if (updates.name !== undefined) {
        requestData.name = updates.name
      }

      // Note: Backend RoadOut doesn't have is_enabled in our Road type,
      // but we'll check if it's in the updates object
      if ("is_enabled" in updates) {
        requestData.is_enabled = (updates as any).is_enabled
      }

      // Handle is_selected field
      if ("is_selected" in updates) {
        requestData.is_selected = (updates as any).is_selected
      }

      const data = await apiClient.put<any>(`/roads/${roadId}`, requestData)
      console.log("Raw updated road data:", data)

      // Transform backend road to frontend Road type
      const transformedRoad: Road = {
        id: data?.id?.toString(),
        routeId: "", // Roads in network might not belong to a route
        name: data.name || `Road ${data.id}`,
        linestringGeoJson: data.polyline, // GeoJSON LineString format
        segmentOrder: 0,
        distanceKm: data.length || 0,
        createdAt: data.created_at || new Date().toISOString(),
      }

      return {
        success: true,
        data: transformedRoad,
        message: "Road updated successfully",
      }
    } catch (error) {
      console.error("Error updating road:", error)
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : "Failed to update road",
      }
    }
  },

  // Delete road (soft delete using PUT)
  delete: async (roadId: string): Promise<ApiResponse<boolean>> => {
    try {
      console.log("Deleting road:", roadId)
      await apiClient.put(`/roads/${roadId}/delete`, {})
      console.log("Road deleted successfully:", roadId)
      return {
        success: true,
        data: true,
        message: "Road deleted successfully",
      }
    } catch (error) {
      console.error("Error deleting road:", error)
      return {
        success: false,
        data: false,
        message:
          error instanceof Error ? error.message : "Failed to delete road",
      }
    }
  },

  // Stretch road to intersection
  stretch: async (
    roadId: number,
    dbProjectId: number,
    priorityList: string[],
  ): Promise<
    ApiResponse<{
      stretched_roads: Road[]
      total_length: number
      total_count: number
      endpoints: {
        start: { lat: number; lng: number; type: string }
        end: { lat: number; lng: number; type: string }
      }
      initial_road_id: number
    }>
  > => {
    try {
      console.log(
        "Stretching road:",
        roadId,
        "for project:",
        dbProjectId,
        "with priorities:",
        priorityList,
      )

      const data = await apiClient.post<any>("/roads/stretch", {
        road_id: roadId,
        db_project_id: dbProjectId,
        priority_list: priorityList,
      })

      if (data.success) {
        // Transform roads to frontend format
        const transformedRoads: Road[] = data.data.stretched_roads.map(
          (road: any) => ({
            id: road?.id?.toString(),
            routeId: "",
            name: road.name || `Road ${road.id}`,
            linestringGeoJson:
              typeof road.polyline === "string"
                ? JSON.parse(road.polyline)
                : road.polyline,
            segmentOrder: road.order || 0,
            distanceKm: road.length || 0,
            createdAt: road.created_at || new Date().toISOString(),
          }),
        )

        return {
          success: true,
          data: {
            stretched_roads: transformedRoads,
            total_length: data.data.total_length,
            total_count: data.data.total_count,
            endpoints: data.data.endpoints,
            initial_road_id: data.data.initial_road_id,
          },
          message: "Road stretched successfully",
        }
      }

      throw new Error("Failed to stretch road")
    } catch (error) {
      console.error("Error stretching road:", error)
      return {
        success: false,
        data: {
          stretched_roads: [],
          total_length: 0,
          total_count: 0,
          endpoints: {
            start: { lat: 0, lng: 0, type: "unknown" },
            end: { lat: 0, lng: 0, type: "unknown" },
          },
          initial_road_id: roadId,
        },
        message:
          error instanceof Error ? error.message : "Failed to stretch road",
      }
    }
  },

  // Validate road continuity
  validateContinuity: async (
    roadIds: number[],
    projectId: string,
    gapToleranceMeters?: number,
  ): Promise<
    ApiResponse<{
      is_continuous: boolean
      gaps: Array<{
        from_road_id: number
        to_road_id: number
        distance_meters: number
      }>
      suggested_order: number[]
      total_length: number
      connected_count: number
      total_count: number
      tolerance_meters: number
    }>
  > => {
    try {
      console.log("Validating continuity for roads:", roadIds)
      const requestData: any = {
        road_ids: roadIds,
        project_id: parseInt(projectId),
      }
      if (gapToleranceMeters) {
        requestData.gap_tolerance_meters = gapToleranceMeters
      }

      const data = await apiClient.post<any>(
        "/roads/validate-continuity",
        requestData,
      )

      if (data.success) {
        return {
          success: true,
          data: data.data,
          message: "Validation completed successfully",
        }
      }

      throw new Error("Failed to validate continuity")
    } catch (error) {
      console.error("Error validating continuity:", error)
      return {
        success: false,
        data: {
          is_continuous: false,
          gaps: [],
          suggested_order: roadIds,
          total_length: 0,
          connected_count: 0,
          total_count: roadIds.length,
          tolerance_meters: 5.55,
        },
        message:
          error instanceof Error
            ? error.message
            : "Failed to validate continuity",
      }
    }
  },

  // Batch fetch roads by IDs
  batchFetch: async (
    roadIds: number[],
    projectId: string,
  ): Promise<
    ApiResponse<{
      roads: Road[]
      requested_count: number
      found_count: number
    }>
  > => {
    try {
      console.log("Batch fetching roads:", roadIds)
      const data = await apiClient.post<any>("/roads/batch", {
        road_ids: roadIds,
        project_id: parseInt(projectId),
      })

      if (data.success) {
        // Transform roads to frontend format
        const transformedRoads: Road[] = data.data.roads.map((road: any) => ({
          id: road?.id?.toString(),
          routeId: "",
          name: road.name || `Road ${road.id}`,
          linestringGeoJson:
            typeof road.polyline === "string"
              ? JSON.parse(road.polyline)
              : road.polyline,
          segmentOrder: 0,
          distanceKm: road.length || 0,
          createdAt: road.created_at || new Date().toISOString(),
        }))

        return {
          success: true,
          data: {
            roads: transformedRoads,
            requested_count: data.data.requested_count,
            found_count: data.data.found_count,
          },
          message: "Roads fetched successfully",
        }
      }

      throw new Error("Failed to fetch roads")
    } catch (error) {
      console.error("Error batch fetching roads:", error)
      return {
        success: false,
        data: {
          roads: [],
          requested_count: roadIds.length,
          found_count: 0,
        },
        message:
          error instanceof Error ? error.message : "Failed to fetch roads",
      }
    }
  },
}
