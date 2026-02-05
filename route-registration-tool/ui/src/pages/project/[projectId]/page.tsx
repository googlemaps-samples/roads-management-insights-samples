import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"

import PageLayout from "../../../components/layout/PageLayout"
import ProjectWorkspaceLayout from "../../../components/project-workspace/ProjectWorkspaceLayout"
import { useRouteCount } from "../../../hooks/use-api"
import { useProjectWorkspaceStore } from "../../../stores"
import { getGoogleMapsApiKey } from "../../../utils/api-helpers"

export default function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [showSplash, setShowSplash] = useState(false)
  const { setMapMode } = useProjectWorkspaceStore()

  const { data: routeCount = 0, isLoading: isCountLoading } = useRouteCount(
    projectId || "",
  )

  // Check if routes count is 0 on mount and after loading
  useEffect(() => {
    if (!isCountLoading && routeCount === 0) {
      setShowSplash(true)
    } else {
      setShowSplash(false)
    }
  }, [routeCount, isCountLoading])

  if (!projectId) {
    return (
      <div className="h-screen w-screen bg-gray-50 flex items-center justify-center">
        <p className="text-lg text-gray-600">Invalid project ID</p>
      </div>
    )
  }

  const apiKey = getGoogleMapsApiKey()

  return (
    <PageLayout>
      <ProjectWorkspaceLayout
        projectId={projectId}
        apiKey={apiKey}
        className="h-[calc(100vh-64px)]"
      />
    </PageLayout>
  )
}
