import { UserPreferences, UserPreferencesUpdate } from "../../types/user"
import { apiClient } from "../api-client"
import { ApiResponse } from "../api-types"

// Users API
export const usersApi = {
  // Get user preferences
  getPreferences: async (): Promise<ApiResponse<UserPreferences>> => {
    try {
      const data = await apiClient.get<any>("/users/preferences")

      // Transform backend response to frontend format
      const preferences: UserPreferences = {
        id: data.id,
        distanceUnit: data.distance_unit === "miles" ? "miles" : "km",
        googleCloudAccount: data.google_cloud_account || null,
        show_tooltip: data.show_tooltip ?? true, // Default to true if not present
        show_instructions: data.show_instructions ?? true, // Default to true if not present
        route_color_mode: data.route_color_mode || "sync_status", // Default to sync_status if not present
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      }

      return {
        success: true,
        data: preferences,
        message: "User preferences fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching user preferences:", error)
      return {
        success: false,
        data: {
          id: 1,
          distanceUnit: "km",
          googleCloudAccount: null,
          show_tooltip: true,
          show_instructions: true,
          route_color_mode: "sync_status",
        },
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch user preferences",
      }
    }
  },

  // Update user preferences
  updatePreferences: async (
    updates: UserPreferencesUpdate,
  ): Promise<ApiResponse<UserPreferences>> => {
    try {
      const requestData: any = {}

      if (updates.distanceUnit !== undefined) {
        requestData.distance_unit = updates.distanceUnit
      }
      if (updates.googleCloudAccount !== undefined) {
        requestData.google_cloud_account = updates.googleCloudAccount || null
      }
      if (updates.show_tooltip !== undefined) {
        requestData.show_tooltip = updates.show_tooltip
      }
      if (updates.show_instructions !== undefined) {
        requestData.show_instructions = updates.show_instructions
      }

      if (updates.route_color_mode !== undefined) {
        requestData.route_color_mode = updates.route_color_mode
      }
      
      const data = await apiClient.put<any>("/users/preferences", requestData)

      // Transform backend response to frontend format
      const preferences: UserPreferences = {
        id: data.id,
        distanceUnit: data.distance_unit === "miles" ? "miles" : "km",
        googleCloudAccount: data.google_cloud_account || null,
        show_tooltip: data.show_tooltip ?? true,
        show_instructions: data.show_instructions ?? true,
        route_color_mode: data.route_color_mode || "sync_status",
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      }

      return {
        success: true,
        data: preferences,
        message: "User preferences updated successfully",
      }
    } catch (error) {
      console.error("Error updating user preferences:", error)
      return {
        success: false,
        data: {
          id: 1,
          distanceUnit: "km",
          googleCloudAccount: null,
          show_tooltip: true,
          show_instructions: true,
          route_color_mode: "sync_status",
        },
        message:
          error instanceof Error
            ? error.message
            : "Failed to update user preferences",
      }
    }
  },
}
