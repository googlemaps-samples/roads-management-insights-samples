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

export const sessionsApi = {
  get: async (
    sessionId: string,
  ): Promise<ApiResponse<{ session_id: string }>> => {
    try {
      const data = await apiClient.get<{
        success: boolean
        data: { session_id: string }
      }>(`/sessions/${sessionId}`)
      return { success: true, data: data.data, message: "Session fetched" }
    } catch (error) {
      return {
        success: false,
        data: { session_id: sessionId },
        message:
          error instanceof Error ? error.message : "Failed to fetch session",
      }
    }
  },

  ensure: async (
    sessionId: string,
  ): Promise<ApiResponse<{ session_id: string }>> => {
    try {
      const data = await apiClient.post<{
        success: boolean
        data: { session_id: string }
      }>(`/sessions/${sessionId}/ensure`)
      return { success: true, data: data.data, message: "Session ensured" }
    } catch (error) {
      return {
        success: false,
        data: { session_id: sessionId },
        message:
          error instanceof Error ? error.message : "Failed to ensure session",
      }
    }
  },

  getLinked: async (
    sessionId: string,
  ): Promise<
    ApiResponse<{ session_id: string; linked_session_ids: string[] }>
  > => {
    try {
      const data = await apiClient.get<{
        session_id: string
        linked_session_ids: string[]
      }>(`/sessions/${sessionId}/linked`)
      return { success: true, data, message: "Linked sessions fetched" }
    } catch (error) {
      return {
        success: false,
        data: { session_id: sessionId, linked_session_ids: [] },
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch linked sessions",
      }
    }
  },

  link: async (
    sessionId: string,
    otherSessionId: string,
  ): Promise<ApiResponse<true>> => {
    try {
      await apiClient.post(`/sessions/${sessionId}/link`, {
        other_session_id: otherSessionId,
      })
      return { success: true, data: true, message: "Session linked" }
    } catch (error) {
      return {
        success: false,
        data: false as unknown as true,
        message:
          error instanceof Error ? error.message : "Failed to link session",
      }
    }
  },

  unlink: async (
    sessionId: string,
    otherSessionId: string,
  ): Promise<ApiResponse<true>> => {
    try {
      await apiClient.delete(`/sessions/${sessionId}/link/${otherSessionId}`)
      return { success: true, data: true, message: "Session unlinked" }
    } catch (error) {
      return {
        success: false,
        data: false as unknown as true,
        message:
          error instanceof Error ? error.message : "Failed to unlink session",
      }
    }
  },
}
