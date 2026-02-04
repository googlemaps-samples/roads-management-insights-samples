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

/**
 * Google Colors Constants
 * Use these for direct access to Google's brand colors
 */
export const GOOGLE_COLORS = {
  blue: "#4285F4",
  green: "#0F9D58",
  yellow: "#FBBB05",
  red: "#E94335",
} as const

/**
 * Google Color variants with alpha transparency
 */
export const GOOGLE_COLORS_ALPHA = {
  blue: {
    100: "rgba(66, 133, 244, 0.1)",
    200: "rgba(66, 133, 244, 0.2)",
    300: "rgba(66, 133, 244, 0.3)",
    400: "rgba(66, 133, 244, 0.4)",
    500: "rgba(66, 133, 244, 0.5)",
  },
  green: {
    100: "rgba(15, 157, 88, 0.1)",
    200: "rgba(15, 157, 88, 0.2)",
    300: "rgba(15, 157, 88, 0.3)",
    400: "rgba(15, 157, 88, 0.4)",
    500: "rgba(15, 157, 88, 0.5)",
  },
  yellow: {
    100: "rgba(251, 187, 5, 0.1)",
    200: "rgba(251, 187, 5, 0.2)",
    300: "rgba(251, 187, 5, 0.3)",
    400: "rgba(251, 187, 5, 0.4)",
    500: "rgba(251, 187, 5, 0.5)",
  },
  red: {
    100: "rgba(233, 67, 53, 0.1)",
    200: "rgba(233, 67, 53, 0.2)",
    300: "rgba(233, 67, 53, 0.3)",
    400: "rgba(233, 67, 53, 0.4)",
    500: "rgba(233, 67, 53, 0.5)",
  },
} as const

/**
 * Helper function to get Google color with custom alpha
 */
export const getGoogleColorWithAlpha = (
  color: keyof typeof GOOGLE_COLORS,
  alpha: number,
): string => {
  const colorMap = {
    blue: "66, 133, 244",
    green: "15, 157, 88",
    yellow: "251, 187, 5",
    red: "233, 67, 53",
  }

  return `rgba(${colorMap[color]}, ${alpha})`
}
