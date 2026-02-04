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

import { Box, styled } from "@mui/material"
import React from "react"

import { DeckGLRenderer } from "../deck-gl/deck-gl-renderer"
import { useAppStore } from "../store"

const DualMapContainer = styled(Box)(
  ({ shouldShow }: { shouldShow: boolean }) => ({
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    display: "flex",
    opacity: shouldShow ? 1 : 0,
    pointerEvents: shouldShow ? "auto" : "none",
  }),
)

const MapColumn = styled(Box)({
  flex: 1,
  position: "relative",
  height: "100%",
})

const MapSeparator = styled(Box)(({ theme }) => ({
  position: "absolute",
  top: 0,
  left: "50%",
  transform: "translateX(-50%)",
  width: "2px",
  height: "100%",
  backgroundColor: theme.palette.divider,
  zIndex: 10,
  "&::before": {
    content: '""',
    display: "none",
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: theme.palette.divider,
  },
}))

const SeparatorLabel = styled(Box)(({ theme }) => ({
  position: "absolute",
  top: "calc(64px + 1.5rem)", // Match comparison mode controls alignment
  backgroundColor: "rgba(255, 255, 255, 0.95)",
  backdropFilter: "blur(10px)",
  padding: "8px 16px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  color: theme.palette.text.primary,
  fontFamily: '"Google Sans", Roboto, sans-serif',
  zIndex: 1001,
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  whiteSpace: "nowrap",
  "@media (max-width: 1024px)": {
    display: "none",
  },
}))

const LeftSeparatorLabel = styled(SeparatorLabel)({
  right: "calc(100% + 12px)",
})

const RightSeparatorLabel = styled(SeparatorLabel)({
  left: "calc(100% + 12px)",
})

interface DualMapLayoutProps {
  children?: React.ReactNode
  shouldShowDualLayout: boolean
}

const DualMapLayout: React.FC<DualMapLayoutProps> = ({
  children,
  shouldShowDualLayout,
}) => {
  const selectedCity = useAppStore((state) => state.selectedCity)
  const mode = useAppStore((state) => state.mode)
  const usecase = useAppStore((state) => state.usecase)
  const selectedRouteId = useAppStore((state) => state.selectedRouteId)
  const selectedRouteSegment = useAppStore(
    (state) => state.selectedRouteSegment,
  )
  const mapData = useAppStore((state) => state.mapData)
  const comparisonMapData = useAppStore((state) => state.comparisonMapData)
  const activeComparisonShortcut = useAppStore(
    (state) => state.activeComparisonShortcut,
  )

  // Note: Comparison filters are applied at the data level in the store
  // The comparisonMapData already contains the filtered data based on the active comparison shortcut

  // Generate labels based on active comparison shortcut and actual time periods
  const getMapLabels = () => {
    if (activeComparisonShortcut === "weekdays-vs-weekends") {
      return {
        left: "Weekdays (Mon-Fri)",
        right: "Weekends (Sat-Sun)",
      }
    } else if (activeComparisonShortcut === "last-week-vs-this-week") {
      // Default for last-week-vs-this-week comparison: Last Week on left, This Week on right
      return {
        left: "Last Week",
        right: "This Week",
      }
    }
    return {
      left: "Original Timeline",
      right: "Comparison Timeline",
    }
  }

  const mapLabels = getMapLabels()

  return (
    <DualMapContainer shouldShow={shouldShowDualLayout}>
      {/* Original Map */}
      <MapColumn>
        <DeckGLRenderer
          key={`comparison-map-${comparisonMapData?.features?.features?.length || 0}-${activeComparisonShortcut || "none"}`}
          data={mapData || []}
          selectedCity={selectedCity}
          mode={mode}
          usecase={usecase}
          onSegmentClick={() => {}}
          onHandleClose={() => {}}
          mapId="73a66895f21ab8d13e3c3467"
          selectedRouteId={selectedRouteId}
          selectedRouteSegment={selectedRouteSegment}
          defaultZoom={selectedCity.customZoom?.[usecase] || selectedCity.zoom}
          customLayers={undefined}
          alertsGeojson={null}
          fullRouteData={[]}
          disableRouteSelection={true}
          mapRefName="leftMap"
        />
      </MapColumn>

      {/* Comparison Map */}
      <MapColumn>
        <DeckGLRenderer
          key={`comparison-map-${comparisonMapData?.features?.features?.length || 0}-${activeComparisonShortcut || "none"}`}
          data={comparisonMapData || []}
          selectedCity={selectedCity}
          mode={mode}
          usecase={usecase}
          onSegmentClick={() => {}}
          onHandleClose={() => {}}
          mapId="73a66895f21ab8d13e3c3467"
          selectedRouteId={null}
          selectedRouteSegment={null}
          defaultZoom={selectedCity.customZoom?.[usecase] || selectedCity.zoom}
          customLayers={undefined}
          alertsGeojson={null}
          fullRouteData={[]}
          disableRouteSelection={true}
          mapRefName="rightMap"
        />
      </MapColumn>

      {/* Map Separator */}
      <MapSeparator>
        <LeftSeparatorLabel>{mapLabels.left}</LeftSeparatorLabel>
        <RightSeparatorLabel>{mapLabels.right}</RightSeparatorLabel>
      </MapSeparator>

      {/* Overlay children for additional UI elements */}
      {children}
    </DualMapContainer>
  )
}

export default DualMapLayout
