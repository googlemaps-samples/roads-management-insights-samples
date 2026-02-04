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

import { Box, CircularProgress } from "@mui/material"
import { Suspense, useMemo } from "react"

import {
  CongestionIcon,
  CongestionItemContent,
  CongestionList,
  CongestionListItem,
  CongestionText,
} from "../../components/congestion-list"
import { DelayDisplay } from "../../components/delay-display"
import { identifyHighDelayRoutes } from "../../data/realtime/identify-high-delay-routes"
import { useAppStore } from "../../store"
import { RouteSegment } from "../../types/route-segment"
import { isDemoMode } from "../../utils"

const useTrafficAlerts = (realtimeRoadSegments: RouteSegment[] | undefined) => {
  const trafficAlerts = useMemo(() => {
    if (!realtimeRoadSegments) return []
    const highDelayRoutes = identifyHighDelayRoutes(realtimeRoadSegments)
    return highDelayRoutes
  }, [realtimeRoadSegments])

  return trafficAlerts
}

export const RealtimeAlerts = () => {
  const selectedRouteId = useAppStore((state) => state.selectedRouteId)
  const setSelectedRouteId = useAppStore((state) => state.setSelectedRouteId)

  const { data: realtimeData, status } = useAppStore(
    (state) => state.queries.realtimeData,
  )

  const realtimeRoadSegments = realtimeData?.roadSegments

  const trafficAlerts = useTrafficAlerts(realtimeRoadSegments)
  const handleAlertClick = async (alertId: string) => {
    setSelectedRouteId(alertId)
  }

  const demoMode = isDemoMode()

  const loadingState = () => {
    return (
      <Box
        sx={{
          p: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <CircularProgress size={32} sx={{ color: "#4285F4" }} />
        <Box
          sx={{
            color: "#5f6368",
            fontSize: "14px",
            fontFamily: '"Google Sans", Roboto, sans-serif',
          }}
        >
          Loading alerts...
        </Box>
      </Box>
    )
  }

  const fallback = () => {
    return (
      <Box
        sx={{
          textAlign: "center",
          color: "#5f6368",
          fontSize: "14px",
          fontFamily: '"Google Sans", Roboto, sans-serif',
        }}
      >
        No severe congestion at this time
      </Box>
    )
  }

  // Show loader while fetching (only in non-demo mode)
  if (!demoMode && (status === "pending" || status === "loading")) {
    return <CongestionList>{loadingState()}</CongestionList>
  }

  return (
    <CongestionList>
      <Suspense fallback={fallback()}>
        {trafficAlerts.length === 0
          ? fallback()
          : trafficAlerts.map((alert, index) => (
              <CongestionListItem
                key={alert.id}
                isLast={index === trafficAlerts.length - 1}
                onClick={() => handleAlertClick(alert.id)}
                hoverEffect={true}
                variant="live-alert"
                isSelected={selectedRouteId === alert.id}
                index={index}
              >
                <CongestionItemContent variant="live-alert">
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: "8px" }}
                  >
                    <CongestionIcon
                      color="#e94335"
                      size={16}
                      variant="live-alert"
                    />
                    <CongestionText
                      primary="Severe Congestion"
                      secondary={`on Route ${alert.routeId.slice(0, 8).toUpperCase()}`}
                      variant="live-alert"
                    />
                  </Box>
                  <DelayDisplay
                    delayTime={alert.delayTime}
                    delayPercentage={alert.delayPercentage}
                  />
                </CongestionItemContent>
              </CongestionListItem>
            ))}
      </Suspense>
    </CongestionList>
  )
}
