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

import React from "react"

import {
  TYPOGRAPHY_SCALES,
  type TypographyConfig,
  type TypographyScale,
} from "../constants/typography"

/**
 * Get typography scale based on screen width
 */
export function getTypographyScale(width: number): TypographyScale {
  if (width >= 1440) return "large"
  return "medium"
}

/**
 * Get typography configuration for current screen size
 */
export function getTypography(scale?: TypographyScale): TypographyConfig {
  if (!scale) {
    // Detect from window
    const width = typeof window !== "undefined" ? window.innerWidth : 1920
    scale = getTypographyScale(width)
  }

  return TYPOGRAPHY_SCALES[scale]
}

/**
 * React hook to get responsive typography
 * Updates automatically on window resize
 */
export function useResponsiveTypography(): TypographyConfig {
  const [typography, setTypography] = React.useState<TypographyConfig>(() =>
    getTypography(),
  )

  React.useEffect(() => {
    const handleResize = () => {
      const scale = getTypographyScale(window.innerWidth)
      setTypography(TYPOGRAPHY_SCALES[scale])
    }

    // Initial check
    handleResize()

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return typography
}

/**
 * Convert pixel spacing to MUI spacing units (divide by 8)
 */
export function pxToMuiSpacing(px: number): number {
  return px / 8
}
