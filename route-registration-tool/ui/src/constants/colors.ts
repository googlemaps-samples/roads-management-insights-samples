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
 * Primary brand color
 * Used throughout the application for primary actions, links, and interactive elements
 */
export const PRIMARY_BLUE = "#0957d0"

/**
 * Primary blue variants for different states
 */
export const PRIMARY_BLUE_DARK = "#0842a0" // Darker variant for hover states
export const PRIMARY_BLUE_LIGHT = "#e8f0fe" // Light variant for backgrounds

/**
 * Primary red color
 * Used for destructive actions like delete buttons
 */
export const PRIMARY_RED = "#d32f2f"

/**
 * Primary red variants for different states
 */
export const PRIMARY_RED_DARK = "#b71c1c" // Darker variant for hover states
export const PRIMARY_RED_LIGHT = "#ffebee" // Light variant for backgrounds
export const PRIMARY_RED_HOVER_BG = "rgba(234, 67, 53, 0.08)" // Light background for delete button hover states

/**
 * Google red color (used for Google-branded elements and markers)
 */
export const PRIMARY_RED_GOOGLE = "#EA4335" // Google's red color
export const PRIMARY_RED_GOOGLE_DARK = "#d33b2c" // Darker variant for hover states
export const PRIMARY_RED_SHADOW = "rgba(234, 67, 53, 0.4)" // Shadow color for red elements

/**
 * Convert hex color to RGB array for DeckGL
 */
export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : [9, 87, 208] // Fallback to PRIMARY_BLUE
}
