// Copyright 2025 Google LLC
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

import { Mode, Usecase } from "./common"

export interface City {
  id: string
  name: string
  coords: { lat: number; lng: number }
  availableDateRanges: {
    startDate: Date
    endDate: Date
  }
  subTitle?: string
  boundingBox?: {
    minLng: number
    minLat: number
    maxLng: number
    maxLat: number
  }
  boundaryType?: string
  liveDataDate: Date
  zoom: number
  customZoom?: { [key in Usecase]?: number }
  useCases: Usecase[]
  mode?: Mode
  timezone: string
  landmarks?: Array<{
    name: string
    position: [number, number]
  }>
}
