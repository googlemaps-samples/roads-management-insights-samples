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

import { Viewport } from "./user"

// API Response types (raw from backend)
export interface RegionApiResponse {
  id: number
  region_name: string
  google_cloud_project_id?: string
  google_cloud_project_number?: string
  subscription_id?: string
  geojson: string // JSON stringified GeoJSON
  viewstate?: string // JSON stringified viewstate
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// Updated types to handle FeatureCollection structure
export interface Region {
  id: string
  name: string
  routeCount: number
  boundaryGeoJson:
    | GeoJSON.FeatureCollection
    | GeoJSON.Polygon
    | GeoJSON.MultiPolygon
  googleBigQueryConfig: BigQueryConfig
  viewstate?: Viewport
  createdAt: string
  updatedAt: string
}

export interface BigQueryConfig {
  projectId: string
  datasetId: string
  tableId: string
  credentials?: Record<string, unknown>
}

export interface CreateRegionRequest {
  name: string
  boundaryGeoJson: GeoJSON.Polygon
  googleBigQueryConfig: BigQueryConfig
}

export interface UpdateRegionRequest {
  name?: string
  boundaryGeoJson?: GeoJSON.Polygon
  googleBigQueryConfig?: BigQueryConfig
}
