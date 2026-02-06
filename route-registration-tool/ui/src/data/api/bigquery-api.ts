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

export interface DatasetInfo {
  datasetId: string
  projectId: string
  location?: string
  friendlyName?: string
}

export interface DatasetsResponse {
  datasets: DatasetInfo[]
}

// BigQuery API
export const bigqueryApi = {
  // Get datasets for a GCP project
  getDatasets: async (
    projectId: string,
  ): Promise<ApiResponse<DatasetInfo[]>> => {
    try {
      console.log("Fetching BigQuery datasets for project:", projectId)
      const data = await apiClient.get<DatasetsResponse>(
        `/bigquery/datasets/${projectId}`,
      )
      console.log("Raw datasets data:", data)
      return {
        success: true,
        data: data.datasets,
        message: "Datasets fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching datasets:", error)
      return {
        success: false,
        data: [],
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch BigQuery datasets",
      }
    }
  },
}
