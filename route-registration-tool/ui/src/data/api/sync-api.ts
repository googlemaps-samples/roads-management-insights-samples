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
