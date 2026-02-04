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
import { styled } from "@mui/material/styles"
import { useEffect, useRef, useState } from "react"

import { useAppStore } from "../store"
import CombinedAnalysisPanel from "./combined-analysis-panel"
import DualLayoutAnalysisPanel from "./dual-layout-analysis-panel"
import { HistoricalPanel } from "./historical-panel"
import { LivePanel } from "./live-panel"

const RightFloatingContainer = styled(Box)({
  position: "fixed",
  bottom: "1.5rem",
  right: "1.5rem",
  zIndex: 1000,
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  "@media (max-width: 768px)": {
    right: "auto",
    left: "0.5rem",
    top: "calc(64px + 0.5rem)",
    height: "fit-content",
  },
  maxHeight: "calc(100vh - 48px - 1.5rem)",
  width: "360px", // Static width for all screen sizes
})

const RightFloatingPanel = () => {
  const mode = useAppStore((state) => state.mode)
  const panels = useAppStore((state) => state.panels)
  const usecase = useAppStore((state) => state.usecase)
  const isComparisonMode = useAppStore((state) => state.isComparisonMode)
  const isComparisonApplied = useAppStore((state) => state.isComparisonApplied)

  const [isMinimized, setIsMinimized] = useState(!panels.rightPanel)
  const previousIsComparisonModeRef = useRef(isComparisonMode)

  // Auto-collapse panel only when entering comparison mode, not on every setting change
  useEffect(() => {
    const justEnteredComparisonMode =
      !previousIsComparisonModeRef.current && isComparisonMode

    if (justEnteredComparisonMode) {
      // Only auto-collapse when entering comparison mode
      setIsMinimized(true)
    } else if (!isComparisonMode && previousIsComparisonModeRef.current) {
      // When exiting comparison mode, sync with store state
      setIsMinimized(!panels.rightPanel)
    }

    previousIsComparisonModeRef.current = isComparisonMode
  }, [isComparisonMode, panels.rightPanel])

  if (usecase === "route-reliability") {
    // Show dual-layout panel when in comparison mode, otherwise show regular route analysis
    const shouldShowDualLayout = isComparisonMode && isComparisonApplied

    return (
      <RightFloatingContainer>
        {shouldShowDualLayout ? (
          <DualLayoutAnalysisPanel
            isMinimized={isMinimized}
            setIsMinimized={setIsMinimized}
          />
        ) : (
          <CombinedAnalysisPanel
            isMinimized={isMinimized}
            setIsMinimized={setIsMinimized}
          />
        )}
      </RightFloatingContainer>
    )
  }

  return (
    <RightFloatingContainer>
      {mode === "live" ? (
        <LivePanel isMinimized={isMinimized} setIsMinimized={setIsMinimized} />
      ) : (
        <HistoricalPanel
          isMinimized={isMinimized}
          setIsMinimized={setIsMinimized}
        />
      )}
    </RightFloatingContainer>
  )
}

export default RightFloatingPanel
