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
