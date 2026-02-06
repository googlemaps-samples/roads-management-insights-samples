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

// PubSub API
export const pubsubApi = {
  // Start PubSub listener
  startListener: async (config: {
    gcp_project_id: string
    project_db_id: number
    gcp_project_number: string
  }): Promise<ApiResponse<{ status: string; message: string }>> => {
    try {
      console.log("🔌 Starting PubSub listener with config:", config)
      const data = await apiClient.post<{ status: string; message: string }>(
        "/start-listener",
        config,
      )
      console.log("✅ PubSub listener started successfully:", data)
      return {
        success: true,
        data: data,
        message: "PubSub listener started successfully",
      }
    } catch (error) {
      console.error("❌ Error starting PubSub listener:", error)
      return {
        success: false,
        data: { status: "error", message: "Failed to start listener" },
        message:
          error instanceof Error
            ? error.message
            : "Failed to start PubSub listener",
      }
    }
  },

  // Stop PubSub listener
  stopListener: async (): Promise<
    ApiResponse<{ status: string; message: string }>
  > => {
    try {
      console.log("🔌 Stopping PubSub listener...")
      const data = await apiClient.post<{ status: string; message: string }>(
        "/stop-listener",
      )
      console.log("✅ PubSub listener stopped successfully:", data)
      return {
        success: true,
        data: data,
        message: "PubSub listener stopped successfully",
      }
    } catch (error) {
      console.error("❌ Error stopping PubSub listener:", error)
      return {
        success: false,
        data: { status: "error", message: "Failed to stop listener" },
        message:
          error instanceof Error
            ? error.message
            : "Failed to stop PubSub listener",
      }
    }
  },
}
