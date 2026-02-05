import React from "react"

import { RoadTooltip } from "./RoadTooltip"
import { RouteBasicTooltip } from "./RouteBasicTooltip"
import { RouteTrafficTooltip } from "./RouteTrafficTooltip"

interface FeatureTooltipProps {
  feature: {
    properties: {
      featureType?: string
      hasTrafficData?: boolean
      [key: string]: any
    }
  }
  x: number
  y: number
}

export function FeatureTooltip({ feature, x, y }: FeatureTooltipProps) {
  const featureType = feature.properties?.featureType

  // Determine which tooltip to render
  let tooltipContent: React.ReactNode = null

  if (featureType === "road") {
    tooltipContent = <RoadTooltip properties={feature.properties as any} />
  } else if (featureType === "route") {
    const hasTrafficData = feature.properties?.hasTrafficData || false

    if (hasTrafficData) {
      tooltipContent = (
        <RouteTrafficTooltip properties={feature.properties as any} />
      )
    } else {
      tooltipContent = (
        <RouteBasicTooltip properties={feature.properties as any} />
      )
    }
  }

  if (!tooltipContent) {
    return null
  }

  return (
    <div
      className="fixed z-[99999] pointer-events-none"
      style={{ left: x + 8, top: y + 8 }}
    >
      {tooltipContent}
    </div>
  )
}
