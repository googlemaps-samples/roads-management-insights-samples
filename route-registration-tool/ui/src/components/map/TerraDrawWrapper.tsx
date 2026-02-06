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

// ui/src/components/map/TerraDrawWrapper.tsx
import React, { useEffect, useRef } from "react"

import { useTerraDraw } from "../../hooks/useTerraDraw"
import { useProjectWorkspaceStore } from "../../stores"
import { useLayerStore } from "../../stores/layer-store"

interface TerraDrawWrapperProps {
  mapId: string
}

const TerraDrawWrapper: React.FC<TerraDrawWrapperProps> = ({ mapId }) => {
  const { mapMode } = useProjectWorkspaceStore()
  const roadImport = useLayerStore((state) => state.roadImport)
  const drawingCompletionMenuPosition = useLayerStore(
    (state) => state.drawingCompletionMenuPosition,
  )
  const hideDrawingCompletionMenu = useLayerStore(
    (state) => state.hideDrawingCompletionMenu,
  )
  const polygonDrawing = useLayerStore((state) => state.polygonDrawing)
  const lassoDrawing = useLayerStore((state) => state.lassoDrawing)
  const prevMapModeRef = useRef<string | null>(null)

  // Initialize Terra Draw when in polygon drawing mode
  // This hook will use useMap internally to get the map instance
  const isPolygonMode = mapMode === "polygon_drawing"
  const isLassoMode = mapMode === "lasso_selection"
  const isRoadSelectionLassoMode =
    mapMode === "road_selection" && roadImport.selectionMode === "lasso"

  // Clear any leftover menu state when ENTERING polygon/lasso mode from a different mode
  // This ensures Terra Draw can activate properly when starting a new drawing
  // BUT we don't clear the menu if we're already in drawing mode (user might have just finished drawing)
  useEffect(() => {
    const isInDrawingMode =
      isPolygonMode || isLassoMode || isRoadSelectionLassoMode
    const wasInDrawingMode =
      prevMapModeRef.current === "polygon_drawing" ||
      prevMapModeRef.current === "lasso_selection" ||
      (prevMapModeRef.current === "road_selection" &&
        roadImport.selectionMode === "lasso")

    // Only clear menu if we're TRANSITIONING into drawing mode from a non-drawing mode
    // This prevents clearing the menu right after user finishes drawing
    if (isInDrawingMode && !wasInDrawingMode && drawingCompletionMenuPosition) {
      const hasActivePoints =
        polygonDrawing.points.length > 0 || lassoDrawing.points.length > 0
      if (!hasActivePoints) {
        // Entering drawing mode with no active points and a menu open = leftover menu
        // console.log("🧹 Clearing leftover menu to enable Terra Draw (entering drawing mode)")
        hideDrawingCompletionMenu()
      }
    }

    prevMapModeRef.current = mapMode
  }, [
    mapMode,
    isPolygonMode,
    isLassoMode,
    isRoadSelectionLassoMode,
    drawingCompletionMenuPosition,
    hideDrawingCompletionMenu,
    polygonDrawing.points.length,
    lassoDrawing.points.length,
    roadImport.selectionMode,
  ])

  // Keep Terra Draw active even when menu is open so the polygon stays visible
  // The warning logic in useTerraDraw will prevent new polygon creation when menu is open
  const shouldBeActive =
    isPolygonMode || isLassoMode || isRoadSelectionLassoMode

  // Debug logging to help diagnose Terra Draw activation issues
  useEffect(() => {
    if (isPolygonMode || isLassoMode || isRoadSelectionLassoMode) {
      const isMenuOpen = drawingCompletionMenuPosition !== null
      // console.log("🔍 Terra Draw Activation Check:", {
      //   mapMode,
      //   isPolygonMode,
      //   isLassoMode,
      //   isRoadSelectionLassoMode,
      //   isMenuOpen,
      //   shouldBeActive,
      //   menuPosition: drawingCompletionMenuPosition,
      // })
    }
  }, [
    mapMode,
    isPolygonMode,
    isLassoMode,
    isRoadSelectionLassoMode,
    shouldBeActive,
    drawingCompletionMenuPosition,
  ])

  useTerraDraw({
    mapId,
    isActive: shouldBeActive,
    mode: "polygon",
  })

  return null // This component doesn't render anything
}

export default TerraDrawWrapper
