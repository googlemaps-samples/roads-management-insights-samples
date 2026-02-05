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
