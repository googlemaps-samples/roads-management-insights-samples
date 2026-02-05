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
