/**
 * Type definitions for region creation components
 */

export interface CreateRegionRequest {
  region_name: string
  geojson: string // JSON string of the complete GeoJSON
  google_cloud_project_id?: string
  google_cloud_project_number?: string
  subscription_id?: string
}

export interface CreateRegionResponse {
  inserted_ids: number[]
}

export interface RegionCreationError {
  error: string
  item?: CreateRegionRequest
  errors?: Record<string, string[]>
}

export interface GeoJsonUploadState {
  mode: 'file' | 'paste'
  text: string
  dragActive: boolean
  error: string | null
  uploadedGeoJson: any | null
  validationResult: {
    isValid: boolean
    error?: string
    geometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon
  } | null
}

export interface FormState {
  isLoading: boolean
  error: string | null
  success: boolean
}

export interface GcpProject {
  project_id: string
  project_number: string
}

export interface RegionCreationFormData {
  name: string
  googleCloudProjectId: string
  googleCloudProjectNumber: string
  subscriptionId?: string
  datasetName: string
}
