import { Tooltip } from "@mui/material"
import { useMemo } from "react"

import { formatDistance, useDistanceUnit } from "../../../utils/distance-utils"
import { calculateRouteLengthFromPolyline } from "../../../utils/polyline-decoder"
import { SyncStatusChip } from "./shared/SyncStatusChip"

interface RouteTrafficTooltipProps {
  properties: {
    displayName?: string
    length?: number // in km
    calculatedLength?: number
    encodedPolyline?: string
    encoded_polyline?: string
    current_duration_seconds?: number
    static_duration_seconds?: number
    traffic_status?: string
    sync_status?: string
    latest_data_updated_time?: string
  }
}

export function RouteTrafficTooltip({ properties }: RouteTrafficTooltipProps) {
  const displayName = properties.displayName || "Unknown Route"
  const syncStatus = properties.sync_status
  const distanceUnit = useDistanceUnit()

  // Calculate route length - prefer calculatedLength (from geometry), then encoded polyline, then length property
  const displayDistance = useMemo(() => {
    // First, use calculatedLength if available (calculated from geometry in renderer)
    if (
      properties.calculatedLength !== null &&
      properties.calculatedLength !== undefined
    ) {
      return properties.calculatedLength
    }

    // Second, try to calculate from encoded polyline if available
    const encodedPolyline =
      properties.encodedPolyline || properties.encoded_polyline
    if (encodedPolyline && encodedPolyline.trim().length > 0) {
      const calculatedLength = calculateRouteLengthFromPolyline(
        encodedPolyline.trim(),
      )
      if (calculatedLength !== null) {
        return calculatedLength
      }
    }

    // Fall back to length property if encoded polyline is not available or calculation failed
    return properties.length || 0
  }, [
    properties.calculatedLength,
    properties.encodedPolyline,
    properties.encoded_polyline,
    properties.length,
  ])

  return (
    <div className="min-w-[260px] max-w-[320px] bg-white rounded-xl shadow-lg border border-gray-200/60 overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-blue-50/50 border-b border-gray-200/60">
        <Tooltip title={displayName} arrow>
          <div className="text-sm font-semibold text-gray-900 truncate">
            {displayName}
          </div>
        </Tooltip>
      </div>

      {/* Content */}
      <div className="px-3.5 py-2.5 space-y-2.5">
        {/* Basic Info */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Length</span>
            <span className="text-sm font-semibold text-gray-900">
              {formatDistance(displayDistance, distanceUnit)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Sync Status</span>
            <SyncStatusChip status={syncStatus} />
          </div>
        </div>
      </div>
    </div>
  )
}
