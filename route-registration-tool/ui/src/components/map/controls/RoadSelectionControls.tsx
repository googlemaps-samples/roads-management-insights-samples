import BrushIcon from "@mui/icons-material/Brush"
import HighlightAltIcon from "@mui/icons-material/HighlightAlt"
import RedoIcon from "@mui/icons-material/Redo"
import UndoIcon from "@mui/icons-material/Undo"
import { IconButton, Tooltip } from "@mui/material"
import React from "react"

import { useTemporalStore } from "../../../hooks"
import { useLayerStore } from "../../../stores/layer-store"
import { useProjectWorkspaceStore } from "../../../stores/project-workspace-store"

// Single selection mode icon
function MaterialSymbolsArrowSelectorTool(
  props: React.SVGProps<SVGSVGElement>,
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      {...props}
    >
      <path
        fill="currentColor"
        d="m13.775 22l-3.625-7.8L6 20V2l14 11h-7.1l3.6 7.725z"
      />
    </svg>
  )
}

const RoadSelectionControls: React.FC = () => {
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const roadImport = useLayerStore((state) => state.roadImport)
  const setSelectionMode = useLayerStore((state) => state.setSelectionMode)
  const addLassoFilteredRoadsToPanel = useLayerStore(
    (state) => state.addLassoFilteredRoadsToPanel,
  )
  const clearLassoDrawing = useLayerStore((state) => state.clearLassoDrawing)
  const { undo, redo, canUndo, canRedo } = useTemporalStore()

  // Only show in road_selection mode
  if (mapMode !== "road_selection") {
    return null
  }

  const isLassoMode = roadImport.selectionMode === "lasso"
  const isSingleMode = roadImport.selectionMode === "single"
  const hasLassoFilteredRoads =
    roadImport.lassoFilteredRoadIds &&
    roadImport.lassoFilteredRoadIds.length > 0

  const handleModeSwitch = (newMode: "single" | "lasso") => {
    // No confirmation needed - modes can be used one after another
    setSelectionMode(newMode)
    // If switching to lasso mode, start lasso drawing
    if (newMode === "lasso") {
      useLayerStore.getState().startLassoDrawing()
    } else {
      // If switching to single mode, clear lasso drawing and filtered roads
      useLayerStore.getState().clearLassoDrawing()
      useLayerStore.getState().clearLassoFilteredRoads()
    }
  }

  const handleAddAllLassoRoads = () => {
    if (!hasLassoFilteredRoads) return

    // Add all lasso filtered roads to panel as individual routes
    addLassoFilteredRoadsToPanel()

    // Clear lasso drawing and filtered roads
    clearLassoDrawing()
    useLayerStore.getState().clearLassoFilteredRoads()
  }

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-white rounded-full shadow-lg border border-gray-200 px-2 py-2 flex items-center gap-1">
        {/* Undo / Redo controls (share global keyboard shortcuts from MapControls) */}
        <Tooltip title="Undo (Ctrl+Z)" placement="top" arrow>
          <IconButton
            onClick={() => canUndo && undo()}
            size="small"
            disabled={!canUndo}
            className="transition-all duration-200 text-gray-600 hover:bg-gray-100 disabled:text-gray-300"
            sx={{
              width: 36,
              height: 36,
              borderRadius: "50%",
            }}
          >
            <UndoIcon className="w-5 h-5" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Redo (Ctrl+Y / Ctrl+Shift+Z)" placement="top" arrow>
          <IconButton
            onClick={() => canRedo && redo()}
            size="small"
            disabled={!canRedo}
            className="transition-all duration-200 text-gray-600 hover:bg-gray-100 disabled:text-gray-300"
            sx={{
              width: 36,
              height: 36,
              borderRadius: "50%",
            }}
          >
            <RedoIcon className="w-5 h-5" />
          </IconButton>
        </Tooltip>

        <div className="w-px h-6 bg-gray-300 mx-1" />
        {/* Single Selection Mode Button */}
        <Tooltip title="Single Selection" placement="top" arrow>
          <IconButton
            onClick={() => handleModeSwitch("single")}
            size="small"
            className={`transition-all duration-200 ${
              isSingleMode
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
            }}
          >
            <MaterialSymbolsArrowSelectorTool className="w-5 h-5" />
          </IconButton>
        </Tooltip>

        {/* Lasso Selection Mode Button */}
        <Tooltip title="Lasso Selection" placement="top" arrow>
          <IconButton
            onClick={() => handleModeSwitch("lasso")}
            size="small"
            className={`transition-all duration-200 ${
              isLassoMode
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
            }}
          >
            <HighlightAltIcon className="w-5 h-5" />
          </IconButton>
        </Tooltip>

        {/* Lasso Mode: Add All Button */}
        {isLassoMode && hasLassoFilteredRoads && (
          <>
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <Tooltip
              title={`Add All (${roadImport.lassoFilteredRoadIds?.length || 0})`}
              placement="top"
              arrow
            >
              <IconButton
                onClick={handleAddAllLassoRoads}
                size="small"
                className="bg-green-500 text-white hover:bg-green-600 transition-all duration-200"
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              </IconButton>
            </Tooltip>
          </>
        )}

        {/* Single Selection Mode Button */}
        <Tooltip title="Single Selection" placement="top" arrow>
          <IconButton
            onClick={() => handleModeSwitch("single")}
            size="small"
            disabled={true}
            className={`transition-all duration-200 `}
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
            }}
          >
            <BrushIcon className="w-5 h-5" />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  )
}

export default RoadSelectionControls
