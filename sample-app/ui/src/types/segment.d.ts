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

// No imports needed for this file

/**
 * Base interface for all segment types used in the application
 * This provides a common structure for segments across different components
 */
export interface BaseSegment {
  id: string
  delayTime?: number
  delayRatio?: number
  duration?: number
  staticDuration?: number
}

/**
 * Extended segment interface for segments that have averageSpeed property
 * This is used when segments are processed with historical data
 */
export interface SegmentWithSpeed extends BaseSegment {
  averageSpeed?: number
}

/**
 * Interface for segments used in Graph component
 * This matches the current Graph component's expected structure
 */
export interface GraphSegment extends BaseSegment {
  // All properties from BaseSegment are inherited
  // Additional properties can be added here if needed
  [key: string]: unknown
}

/**
 * Interface for segments used in polygon-related components
 * This includes properties needed for polygon analysis
 */
export interface PolygonSegment extends BaseSegment {
  placeId?: string
  averageSpeed?: number
  color?: string
  length?: number
  name?: string
  delayTime?: number
  delayPercentage?: number
  delayRatio?: number
  [key: string]: unknown
}

/**
 * Type alias for backward compatibility
 * This can be used where the exact segment type is not critical
 */
export type AnySegment =
  | BaseSegment
  | SegmentWithSpeed
  | GraphSegment
  | PolygonSegment
