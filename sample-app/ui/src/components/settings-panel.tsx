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
import React, { useEffect, useState } from "react"

import { useAppStore } from "../store"
import CityDropdown from "./city-dropdown"
import CollapsibleSection from "./collapsible-section"
import { CustomTooltip } from "./custom-tooltip"
import ExpandButton from "./expand-button"
import { HighlightBorderComponent } from "./highlight-border"
import ModeSelector from "./mode-selector"
import TimeFilters from "./time-filters"
import { TimeReplayControls } from "./time-replay-controls"

const DynamicIsland = styled(Box)({
  position: "fixed",
  left: "1.5rem",
  top: "calc(1.5rem + 48px)",
  backgroundColor: "rgba(255, 255, 255, 0.98)",
  backdropFilter: "blur(12px)",
  borderRadius: "12px",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "4px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
  border: "1px solid rgba(232, 234, 237, 0.8)",
  zIndex: 999,
  overflow: "visible",
  transition: "all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)",
  "@media (max-width: 768px)": {
    left: "0.5rem",
    top: "auto",
    bottom: "5rem",
  },
})

const MainRow = styled(Box)({
  display: "flex",
  alignItems: "center",
  gap: "12px",
  width: "100%",
})

const PanelWrapper = styled(Box)({
  position: "relative",
  display: "inline-block",
})

const SettingsPanel = React.memo(() => {
  const expandPanel = useAppStore((state) => state.expandPanel)
  const collapsePanel = useAppStore((state) => state.collapsePanel)
  const panels = useAppStore((state) => state.panels)
  const mode = useAppStore((state) => state.mode)
  const usecase = useAppStore((state) => state.usecase)

  const isExpanded = panels.settingsPanel

  const setIsExpanded = () => {
    if (panels.settingsPanel) {
      // Only collapse the panel, don't disable comparison mode
      collapsePanel("settingsPanel")
    } else {
      expandPanel("settingsPanel")
      // Hide the highlight overlay once user has clicked the expand button
      setHasSeenHighlight(true)
    }
  }

  const [showStartCalendar, setShowStartCalendar] = useState(false)
  const [showEndCalendar, setShowEndCalendar] = useState(false)
  const [showDaySelector, setShowDaySelector] = useState(false)
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false)
  const [hasSeenHighlight, setHasSeenHighlight] = useState(false)

  // Check if we should show the highlight overlay for data-analytics and route-reliability usecases
  const shouldShowHighlight =
    (usecase === "data-analytics" || usecase === "route-reliability") &&
    mode === "historical" &&
    !hasSeenHighlight

  // Close all popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      const isInsideDateInputs = target.closest(".date-input-container")
      const isInsideDaySelector = target.closest(".day-selector-container")
      const isInsideLocationDropdown = target.closest(".location-dropdown")

      if (
        !isInsideDateInputs &&
        !isInsideDaySelector &&
        !isInsideLocationDropdown
      ) {
        setShowStartCalendar(false)
        setShowEndCalendar(false)
        setShowDaySelector(false)
        setIsLocationMenuOpen(false)
      }
    }

    if (
      showStartCalendar ||
      showEndCalendar ||
      showDaySelector ||
      isLocationMenuOpen
    ) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showStartCalendar, showEndCalendar, showDaySelector, isLocationMenuOpen])

  return (
    <PanelWrapper>
      <DynamicIsland
        sx={{
          width: "360px", // Fixed width for settings panel
          left: "1.5rem", // Keep left position fixed
        }}
      >
        <MainRow
          sx={{
            gap: "16px",
            justifyContent: "space-between",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CityDropdown />
          </Box>
          {/* Right side controls */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: mode === "live" ? "24px" : "16px",
            }}
          >
            <ModeSelector />
            <CustomTooltip
              title={
                shouldShowHighlight
                  ? "Click to expand and analyse different time periods"
                  : ""
              }
              placement="right"
              arrow
            >
              <Box sx={{ position: "relative" }}>
                {shouldShowHighlight && <HighlightBorderComponent />}
                <ExpandButton
                  isExpanded={panels.settingsPanel}
                  onClick={() => setIsExpanded()}
                  disabled={mode === "live"}
                />
              </Box>
            </CustomTooltip>
          </Box>
        </MainRow>
        {mode === "historical" && (
          <CollapsibleSection isExpanded={isExpanded}>
            {mode === "historical" && <TimeFilters />}
          </CollapsibleSection>
        )}

        {/* Time Replay Controls - only show on mobile */}
        <Box
          sx={{
            display: "none", // Hidden by default
            "@media (max-width: 1240px)": {
              display: "block", // Show on mobile
              marginTop: "8px",
            },
          }}
        >
          <TimeReplayControls isVisible={true} isEmbedded={true} />
        </Box>
      </DynamicIsland>
    </PanelWrapper>
  )
})

export default SettingsPanel
