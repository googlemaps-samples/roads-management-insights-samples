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

import { Box } from "@mui/material"
import { keyframes, styled } from "@mui/material/styles"
import React, { useEffect, useState } from "react"

import ComparisonModeControls from "../../components/comparison-mode-controls"
import FloatingPanel from "../../components/left-panel"
import QuickCompareButton from "../../components/quick-compare-button"
import RightFloatingPanel from "../../components/right-panel"
import MapViewController from "../../components/settings-panel"
import { TimeReplayControls } from "../../components/time-replay-controls"
import { MapProvider, useMapContext } from "../../contexts/map-context"
import { useAutoZoom } from "../../hooks/use-auto-zoom"
import {
  useHistoricalData,
  useRawHistoricalData,
} from "../../hooks/use-historical-data"
import { useMobilePanelManager } from "../../hooks/use-mobile-panel-manager"
import { useRealtimeData } from "../../hooks/use-realtime-data"
import { useAppStore } from "../../store"
import RealtimeMonitoringPage from "../../usecases/realtime-monitoring/page"
import { RouteReliabilityPage } from "../../usecases/route-reliability/page"
import Loader from "./loader"
import UnifiedMap from "./unified-map"

const mapReveal = keyframes`
  0% {
    opacity: 0;
    transform: scale(1.1);
    filter: blur(8px);
  }
  100% {
    opacity: 1;
    transform: scale(1);
    filter: blur(0px);
  }
`

const DemoContainer = styled(Box)({
  height: "100vh",
  width: "100vw",
  position: "relative",
  overflow: "hidden",
})

const MapContainer = styled(Box)({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  opacity: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  transform: "scale(1.1)",
  filter: "blur(8px)",
  animation: `${mapReveal} 1.2s cubic-bezier(0.4, 0, 0.2, 1) 0.3s forwards`,
})

const UsecaseOverlay = styled(Box)({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: "none", // Allow clicks to pass through to the map
  "& > *": {
    pointerEvents: "auto", // Re-enable pointer events for child components
  },
})

// Inner component that has access to the map context
const DemoContent: React.FC = () => {
  const usecase = useAppStore((state) => state.usecase)
  const selectedCity = useAppStore((state) => state.selectedCity)
  const timeFilters = useAppStore((state) => state.timeFilters)
  const { resetMapData, resetSelectedRoute } = useMapContext()
  const [isResetting, setIsResetting] = useState(false)

  useRealtimeData(selectedCity?.id ?? "", !!selectedCity)
  useHistoricalData(selectedCity, timeFilters)
  useRawHistoricalData(selectedCity, timeFilters)
  // Calculate and set zoom level if city doesn't have one
  useAutoZoom(selectedCity)

  // Reset map data and selected route when usecase or city changes
  useEffect(() => {
    setIsResetting(true)

    // Reset map data and selected route
    resetMapData()
    resetSelectedRoute()
    setIsResetting(false)

    // return () => clearTimeout(timer)
  }, [usecase, selectedCity.id, resetMapData, resetSelectedRoute])

  return (
    <DemoContainer>
      <MapContainer>
        {/* Persistent map container */}
        <UnifiedMap />

        {/* Usecase-specific components as overlays for additional UI/logic */}
        {!isResetting && (
          <UsecaseOverlay>
            {(usecase === "realtime-monitoring" ||
              usecase === "data-analytics") && <RealtimeMonitoringPage />}
            {usecase === "route-reliability" && <RouteReliabilityPage />}
          </UsecaseOverlay>
        )}
      </MapContainer>
      <FloatingPanel />
      <RightFloatingPanel />
      <MapViewController />
      <QuickCompareButton />
      <ComparisonModeControls />
      <Box
        sx={{
          display: "block",
          "@media (max-width: 1240px)": {
            display: "none", // Hide on mobile since it's now in settings panel
          },
        }}
      >
        <TimeReplayControls isVisible={true} />
      </Box>
    </DemoContainer>
  )
}

const Demo: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true)

  // Mobile panel management at page level
  useMobilePanelManager()

  if (isLoading) {
    return <Loader onComplete={() => setIsLoading(false)} />
  }

  return (
    <MapProvider>
      <DemoContent />
    </MapProvider>
  )
}

export default Demo
