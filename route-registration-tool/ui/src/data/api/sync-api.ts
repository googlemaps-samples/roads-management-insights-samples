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

export interface SyncToBigQueryRequest {
  db_project_id: number
  project_number: string
  gcp_project_id: string
  dataset_name: string
  tag?: string
  uuid?: string
}

export interface SyncToBigQueryResponse {
  status: "success" | "error"
  message: string
  time_taken_seconds: number
  details: {
    previously_validated_routes?: number
    validating_routes?: number
    fetched_from_api?: number
    skipped_from_api?: number
    bq_updates?: number
    status?: string
    message?: string
  }
}

export const syncApi = {
  syncProject: async (
    db_project_id: number,
    project_number: string,
    gcp_project_id: string,
    dataset_name: string,
  ): Promise<SyncToBigQueryResponse> => {
    const response = await apiClient.post<SyncToBigQueryResponse>(
      "/sync-to-bigquery",
      {
        db_project_id,
        project_number,
        gcp_project_id,
        dataset_name,
      },
    )
    return response
  },

  syncFolder: async (
    db_project_id: number,
    project_number: string,
    gcp_project_id: string,
    dataset_name: string,
    tag: string,
  ): Promise<SyncToBigQueryResponse> => {
    const response = await apiClient.post<SyncToBigQueryResponse>(
      "/sync-to-bigquery",
      {
        db_project_id,
        project_number,
        gcp_project_id,
        dataset_name,
        tag,
      },
    )
    return response
  },

  syncRoute: async (
    db_project_id: number,
    project_number: string,
    gcp_project_id: string,
    dataset_name: string,
    uuid: string,
  ): Promise<SyncToBigQueryResponse> => {
    const response = await apiClient.post<SyncToBigQueryResponse>(
      "/sync-to-bigquery",
      {
        db_project_id,
        project_number,
        gcp_project_id,
        dataset_name,
        uuid,
      },
    )
    return response
  },
}
