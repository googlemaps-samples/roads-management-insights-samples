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

import { useMediaQuery } from "@mui/material"
import { useEffect, useRef } from "react"

import { useAppStore } from "../store"

/**
 * Custom hook to manage panel states based on mobile view
 * Automatically collapses all panels (including left panel) when switching to mobile view
 * and restores them when switching back to desktop/tablet view
 */
export const useMobilePanelManager = () => {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isTablet = useMediaQuery("(max-width: 1024px) and (min-width: 769px)")
  const collapsePanel = useAppStore((state) => state.collapsePanel)
  const expandPanel = useAppStore((state) => state.expandPanel)
  const panels = useAppStore((state) => state.panels)

  // Store previous panel states when switching to mobile
  const previousPanelStatesRef = useRef<{
    settingsPanel: boolean
    leftPanel: boolean
    rightPanel: boolean
  } | null>(null)

  useEffect(() => {
    if (isMobile) {
      // Only save and collapse if we haven't already saved states for mobile
      if (!previousPanelStatesRef.current) {
        // Save current panel states before collapsing
        previousPanelStatesRef.current = {
          settingsPanel: panels.settingsPanel,
          leftPanel: panels.leftPanel,
          rightPanel: panels.rightPanel,
        }

        // Collapse all panels for mobile view
        // Left panel should start collapsed on mobile for better UX
        collapsePanel("settingsPanel")
        collapsePanel("leftPanel")
        collapsePanel("rightPanel")
      }
    } else if (isTablet) {
      // For tablet screens, restore panels but don't force collapse left panel
      if (previousPanelStatesRef.current) {
        const { settingsPanel, leftPanel, rightPanel } =
          previousPanelStatesRef.current

        if (settingsPanel) {
          expandPanel("settingsPanel")
        }
        if (leftPanel) {
          expandPanel("leftPanel")
        }
        if (rightPanel) {
          expandPanel("rightPanel")
        }

        // Clear the saved states
        previousPanelStatesRef.current = null
      }
    } else {
      // Desktop: restore previous panel states when switching back to desktop
      if (previousPanelStatesRef.current) {
        const { settingsPanel, leftPanel, rightPanel } =
          previousPanelStatesRef.current

        if (settingsPanel) {
          expandPanel("settingsPanel")
        }
        if (leftPanel) {
          expandPanel("leftPanel")
        }
        if (rightPanel) {
          expandPanel("rightPanel")
        }

        // Clear the saved states
        previousPanelStatesRef.current = null
      }
    }
  }, [isMobile, isTablet, collapsePanel, expandPanel])

  return {
    isMobile,
    isTablet,
    previousPanelStates: previousPanelStatesRef.current,
  }
}
