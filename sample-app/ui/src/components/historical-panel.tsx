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

import { Collapse } from "@mui/material"

import { HistoricalContent } from "../pages/demo/historical-content"
import { useAppStore } from "../store"
import { PanelHeader } from "./panel-header"
import { RightCard, ScrollableContent } from "./right-panel-shared"

interface HistoricalPanelProps {
  isMinimized: boolean
  setIsMinimized: (minimized: boolean) => void
}

export const HistoricalPanel = ({
  isMinimized,
  setIsMinimized,
}: HistoricalPanelProps) => {
  const expandPanel = useAppStore((state) => state.expandPanel)
  const collapsePanel = useAppStore((state) => state.collapsePanel)
  const selectedCity = useAppStore((state) => state.selectedCity)

  const handleToggleMinimize = () => {
    const newMinimized = !isMinimized
    setIsMinimized(newMinimized)
    if (newMinimized) {
      collapsePanel("rightPanel")
    } else {
      expandPanel("rightPanel")
    }
  }

  return (
    <RightCard $variant="historical">
      <PanelHeader
        title={`Historical Analysis - ${selectedCity.name}`}
        subTitle={`Overview of historical route delays and performance trends.`}
        isMinimized={isMinimized}
        onToggleMinimize={handleToggleMinimize}
      />

      <Collapse in={!isMinimized}>
        <ScrollableContent>
          <HistoricalContent />
        </ScrollableContent>
      </Collapse>
    </RightCard>
  )
}
