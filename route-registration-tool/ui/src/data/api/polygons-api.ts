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

import { apiClient } from "../api-client"
import { ApiResponse } from "../api-types"

// Polygons API
export const polygonsApi = {
  // Get all polygons for a project
  getByProject: async (projectId: string): Promise<ApiResponse<any[]>> => {
    try {
      console.log("Fetching polygons for project:", projectId)
      const data = await apiClient.post<any[]>(`/polygons/filter`, {
        project_id: parseInt(projectId),
      })
      console.log("Raw polygons data:", data)

      return {
        success: true,
        data: data,
        message: "Polygons fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching polygons:", error)
      return {
        success: false,
        data: [],
        message:
          error instanceof Error ? error.message : "Failed to fetch polygons",
      }
    }
  },

  // Get all polygons
  getAll: async (): Promise<ApiResponse<any[]>> => {
    try {
      console.log("Fetching all polygons...")
      const data = await apiClient.get<any[]>("/polygons")
      console.log("Raw polygons data:", data)
      return {
        success: true,
        data: data,
        message: "Polygons fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching polygons:", error)
      return {
        success: false,
        data: [],
        message:
          error instanceof Error ? error.message : "Failed to fetch polygons",
      }
    }
  },

  // Create new polygon
  create: async (polygonData: {
    project_id: number
    boundary_geojson: string
  }): Promise<ApiResponse<any>> => {
    try {
      const response = await apiClient.post<{ inserted_ids: number[] }>(
        "/polygons/format-and-create",
        polygonData,
      )

      if (response.inserted_ids && response.inserted_ids.length > 0) {
        return {
          success: true,
          data: { id: response.inserted_ids[0] },
          message: "Polygon created successfully",
        }
      }

      throw new Error("Failed to create polygon")
    } catch (error) {
      console.error("Error creating polygon:", error)
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : "Failed to create polygon",
      }
    }
  },

  // Update polygon
  update: async (
    polygonId: number,
    updates: { boundary_geojson?: string },
  ): Promise<ApiResponse<any>> => {
    try {
      await apiClient.put(`/polygons`, {
        filter: { id: polygonId },
        update: updates,
      })

      return {
        success: true,
        data: { id: polygonId },
        message: "Polygon updated successfully",
      }
    } catch (error) {
      console.error("Error updating polygon:", error)
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : "Failed to update polygon",
      }
    }
  },

  // Delete polygon (soft delete)
  delete: async (polygonId: number): Promise<ApiResponse<boolean>> => {
    try {
      // Use PUT for soft delete, setting deleted_at timestamp
      await apiClient.put(`/polygons/${polygonId}/soft-delete`, {})
      return {
        success: true,
        data: true,
        message: "Polygon deleted successfully",
      }
    } catch (error) {
      console.error("Error deleting polygon:", error)
      return {
        success: false,
        data: false,
        message:
          error instanceof Error ? error.message : "Failed to delete polygon",
      }
    }
  },
}

