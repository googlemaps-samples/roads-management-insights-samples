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

import type { RouteSegment } from "../../types/route-segment"
import type { HistoricalData } from "../../types/store-data"

export const selectRoute = ({
  routeId,
  setSelectedRouteSegment,
  mode,
  data,
}: {
  routeId: string
  setSelectedRouteSegment: (route: RouteSegment | null) => void
  mode: "historical" | "live"
  data: HistoricalData | RouteSegment[]
}) => {
  if (!routeId || !data) {
    setSelectedRouteSegment(null)
    return
  }
  if (mode === "historical") {
    const historicalData = data as HistoricalData
    const selectedData = historicalData.stats.routeDelays.find(
      (route: RouteSegment) => route.routeId === routeId,
    )
    if (selectedData) {
      const segmentColor = historicalData.routeColors.get(routeId)?.color
      setSelectedRouteSegment({
        ...selectedData,
        color: segmentColor,
      })
    }
    // Don't clear selectedRouteSegment if route not found in filtered data
    // This prevents tooltip from closing when filters change
    return
  } else {
    const routeData = data as RouteSegment[]
    const selectedData = routeData.find(
      (route: RouteSegment) => route.id === routeId,
    )
    if (selectedData) {
      setSelectedRouteSegment(selectedData)
    }
    // Don't clear selectedRouteSegment if route not found in filtered data
    return
  }
}
