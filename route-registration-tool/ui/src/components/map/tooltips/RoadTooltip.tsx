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

import { ROAD_PRIORITY_LABELS } from "../../../constants/road-priorities"
import { formatDistance, useDistanceUnit } from "../../../utils/distance-utils"

interface RoadTooltipProps {
  properties: {
    displayName?: string
    length?: number
    priority?: string
    featureType?: string
  }
}

export function RoadTooltip({ properties }: RoadTooltipProps) {
  const displayName = properties.displayName || "Unknown Road"
  const length = properties.length || 0
  const priority = properties.priority || "ROAD_PRIORITY_UNSPECIFIED"
  const distanceUnit = useDistanceUnit()

  // Format priority using ROAD_PRIORITY_LABELS
  const formattedPriority =
    ROAD_PRIORITY_LABELS[priority] || priority.replace("ROAD_PRIORITY_", "")

  return (
    <div className="min-w-[200px] max-w-[260px] bg-white rounded-xl shadow-lg border border-gray-200/60 overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-gray-50/50 border-b border-gray-200/60">
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
            {formatDistance(length, distanceUnit)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Priority</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
            {formattedPriority}
          </span>
        </div>
      </div>
    </div>
  )
}
