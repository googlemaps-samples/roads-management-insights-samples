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

import { Box, Collapse, Typography } from "@mui/material"
import { styled } from "@mui/material/styles"
import { useMemo } from "react"

import { identifyHighDelayRoutes } from "../data/realtime/identify-high-delay-routes"
import { RealtimeAlerts } from "../pages/demo/realtime-alerts"
import { useAppStore } from "../store"
import { isDemoMode } from "../utils"
import { PanelHeader } from "./panel-header"
import { RightCard, ScrollableContent } from "./right-panel-shared"

const LiveInstructions = styled(Box)({
  padding: "2px 24px 0px 24px",
})

const LiveInstructionsText = styled(Typography)({
  color: "#5f6368",
  fontStyle: "italic",
})

interface LivePanelProps {
  isMinimized: boolean
  setIsMinimized: (minimized: boolean) => void
}

export const LivePanel = ({ isMinimized, setIsMinimized }: LivePanelProps) => {
  const expandPanel = useAppStore((state) => state.expandPanel)
  const collapsePanel = useAppStore((state) => state.collapsePanel)
  const selectedCity = useAppStore((state) => state.selectedCity)

  const { data: realtimeData, status } = useAppStore(
    (state) => state.queries.realtimeData,
  )

  const demoMode = isDemoMode()
  const realtimeRoadSegments = realtimeData?.roadSegments

  // Check if there are any alerts
  const hasAlerts = useMemo(() => {
    if (!realtimeRoadSegments) return false
    const alerts = identifyHighDelayRoutes(realtimeRoadSegments)
    return alerts.length > 0
  }, [realtimeRoadSegments])

  // Show instruction only when not loading and there are alerts
  const showInstruction =
    !(!demoMode && (status === "pending" || status === "loading")) && hasAlerts

  const handleToggleMinimize = () => {
    const newMinimized = !isMinimized
    setIsMinimized(newMinimized)
    if (newMinimized) {
      collapsePanel("rightPanel")
    } else {
      expandPanel("rightPanel")
    }
  }

  const infoTooltip = (
    <>
      Alerts show unusual traffic congestion where conditions differ greatly
      from normal, often due to accidents, sudden traffic increases or potential
      future congestion.
    </>
  )

  return (
    <RightCard $variant="live">
      <PanelHeader
        title={`Detected Abnormalities - ${selectedCity.name}`}
        subTitle={selectedCity.subTitle}
        isMinimized={isMinimized}
        onToggleMinimize={handleToggleMinimize}
        infoTooltip={infoTooltip}
      />

      <Collapse in={!isMinimized}>
        {showInstruction && (
          <LiveInstructions>
            <LiveInstructionsText variant="caption">
              Click on an alert to view it on the map.
            </LiveInstructionsText>
          </LiveInstructions>
        )}
        <ScrollableContent>
          <RealtimeAlerts />
        </ScrollableContent>
      </Collapse>
    </RightCard>
  )
}
