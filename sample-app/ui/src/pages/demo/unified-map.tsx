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
import React, { useEffect, useMemo } from "react"

import { useMapContext } from "../../contexts/map-context"
import { DeckGLRenderer } from "../../deck-gl/deck-gl-renderer"
import { createLandmarkLabelLayer } from "../../deck-gl/layer-creators"
import { useAppStore } from "../../store"
import { LayersList } from "@deck.gl/core"

// This component now just provides a persistent map container
// Usecase-specific logic and data is handled by the separate usecase components
const UnifiedMap: React.FC = () => {
  const selectedCity = useAppStore((state) => state.selectedCity)
  const mode = useAppStore((state) => state.mode)
  const usecase = useAppStore((state) => state.usecase)
  const selectedRouteId = useAppStore((state) => state.selectedRouteId)
  const selectedRouteSegment = useAppStore(
    (state) => state.selectedRouteSegment,
  )
  const mapData = useAppStore((state) => state.mapData)

  type Landmark = { position: [number, number]; name: string }

  const landmarkData = useMemo<Landmark[]>(
    () => selectedCity.landmarks ?? [],
    [selectedCity],
  )

  const landmarkLabelLayer = useMemo(
    () => createLandmarkLabelLayer(landmarkData),
    [landmarkData],
  )

  const customLayers = useMemo<LayersList>(
    () => (landmarkLabelLayer ? [landmarkLabelLayer] : []),
    [landmarkLabelLayer],
  )

  const {
    setCustomLayers,
    onSegmentClick,
    onHandleClose,
    fullRouteData,
  } = useMapContext()

  useEffect(() => {
    setCustomLayers(customLayers)
    return () => {
      setCustomLayers(undefined)
    }
  }, [customLayers, setCustomLayers])
  // For normal mode, render single map
  // Key includes comparison mode state to force remount when switching between single and dual map layouts
  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <DeckGLRenderer
        data={mapData || []}
        selectedCity={selectedCity}
        mode={mode}
        usecase={usecase}
        onSegmentClick={onSegmentClick}
        onHandleClose={onHandleClose}
        mapId="73a66895f21ab8d13e3c3467"
        selectedRouteId={selectedRouteId}
        selectedRouteSegment={selectedRouteSegment}
        defaultZoom={selectedCity.customZoom?.[usecase] || selectedCity.zoom}
        customLayers={customLayers}
        alertsGeojson={null}
        fullRouteData={fullRouteData}
      />
    </Box>
  )
}

export default UnifiedMap
