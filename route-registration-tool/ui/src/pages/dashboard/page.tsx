import { useEffect } from "react"

import staticMapImage from "../../assets/images/static_map.png"
import ToastContainer from "../../components/common/ToastContainer"
import ProjectGrid from "../../components/dashboard/ProjectGrid"
import Main from "../../components/layout/Main"
import PageLayout from "../../components/layout/PageLayout"
import { useProjects } from "../../hooks/use-api"
import { clearAllLayers } from "../../utils/clear-all-layers"

export default function DashboardPage() {
  const { data: projects = [], isLoading, error } = useProjects()

  // Clear all layers when dashboard mounts
  useEffect(() => {
    clearAllLayers()
  }, [])

  if (error) {
    return (
      <PageLayout>
        <Main>
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-red-600 mb-4">Failed to load projects</p>
              <p className="text-gray-600">Please try refreshing the page</p>
            </div>
          </div>
        </Main>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <Main>
        <img
          src={staticMapImage}
          alt="World map background"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
        {/* Splash overlay blur */}
        <div className="absolute inset-0 bg-white/30 backdrop-blur-sm z-0" />

        <ProjectGrid projects={projects} isLoading={isLoading} />

        {/* Toast notifications */}
        <ToastContainer />
      </Main>
    </PageLayout>
  )
}
