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
