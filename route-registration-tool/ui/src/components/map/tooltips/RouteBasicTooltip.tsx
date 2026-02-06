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

import { Tooltip } from "@mui/material"
import { useMemo } from "react"

import { formatDistance, useDistanceUnit } from "../../../utils/distance-utils"
import { calculateRouteLengthFromPolyline } from "../../../utils/polyline-decoder"
import { SyncStatusChip } from "./shared/SyncStatusChip"

interface RouteBasicTooltipProps {
  properties: {
    displayName?: string
    length?: number
    calculatedLength?: number
    encodedPolyline?: string
    encoded_polyline?: string
    sync_status?: string
    featureType?: string
    hasTrafficData?: boolean
  }
}

export function RouteBasicTooltip({ properties }: RouteBasicTooltipProps) {
  const displayName = properties.displayName || "Unknown Route"
  const syncStatus = properties.sync_status || "unsynced"
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
    <div className="min-w-[240px] max-w-[300px] bg-white rounded-xl shadow-lg border border-gray-200/60 overflow-hidden">
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
  )
}
