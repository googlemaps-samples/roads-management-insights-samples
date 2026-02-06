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

import { useEffect, useState } from "react"

import HelpPanel from "../../components/add-project/HelpPanel"
import NewProjectSidebar from "../../components/add-project/NewProjectSidebar"
import ToastContainer from "../../components/common/ToastContainer"
import Main from "../../components/layout/Main"
import PageLayout from "../../components/layout/PageLayout"
import AddProjectMapView from "../../components/map/AddProjectMapView"
import { useProjectCreationStore } from "../../stores"
import { getGoogleMapsApiKey } from "../../utils/api-helpers"

export default function AddProjectPage() {
  const [helpPanelMinimized, setHelpPanelMinimized] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const geoJsonState = useProjectCreationStore((state) => state.geoJsonState)
  const clearProjectCreationState = useProjectCreationStore(
    (state) => state.clearProjectCreationState,
  )

  // Add useEffect to watch for changes
  useEffect(() => {
    console.log("AddProjectPage - geoJsonState changed:", geoJsonState)
    if (geoJsonState.uploadedGeoJson) {
      console.log(
        "AddProjectPage - GeoJSON ready for map:",
        geoJsonState.uploadedGeoJson,
      )
    }
  }, [geoJsonState])

  // Cleanup effect - clear state when component unmounts (navigating away)
  useEffect(() => {
    // Clear region creation state when leaving the page
    return () => {
      console.log(
        "AddProjectPage - cleaning up project creation state on unmount",
      )
      clearProjectCreationState()
    }
  }, [clearProjectCreationState])

  const apiKey = getGoogleMapsApiKey()

  return (
    <PageLayout>
      <Main>
        <div className="flex-1 relative h-full w-full">
          {/* Map Background */}
          <AddProjectMapView
            apiKey={apiKey}
            boundaryGeoJson={geoJsonState.uploadedGeoJson}
            style={{ width: "100%", height: "100%" }}
          />

          {/* Floating sidebar panel */}
          <NewProjectSidebar onStepChange={setCurrentStep} />

          {/* Help Panel - Always open, content changes based on step */}
          <HelpPanel
            step={currentStep}
            minimized={helpPanelMinimized}
            onToggleMinimize={() => setHelpPanelMinimized(!helpPanelMinimized)}
          />

          {/* Toast notifications */}
          <ToastContainer />
        </div>
      </Main>
    </PageLayout>
  )
}
