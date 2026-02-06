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
