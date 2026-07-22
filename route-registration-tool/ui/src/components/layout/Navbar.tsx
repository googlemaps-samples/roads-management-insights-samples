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

import CenterFocusStrong from "@mui/icons-material/CenterFocusStrong"
import DownloadIcon from "@mui/icons-material/Download"
import InfoIcon from "@mui/icons-material/Info"
import SettingsIcon from "@mui/icons-material/Settings"
import ShareIcon from "@mui/icons-material/Share"
import { Divider, IconButton, Menu, MenuItem, Tooltip } from "@mui/material"
import { useCallback, useState } from "react"
import { useLocation, useParams } from "react-router-dom"

import GoogleMapsLogo from "../../assets/images/google-maps-platform.svg"
import roadmapImage from "../../assets/images/roadmap.png"
import satelliteImage from "../../assets/images/satellite.png"
import { useUnsavedChangesNavigation } from "../../contexts/unsaved-changes-context"
import { projectsApi } from "../../data/api/projects-api"
import { useRoutesSummary } from "../../hooks"
import { useProjectWorkspaceStore } from "../../stores/project-workspace-store"
import { toast } from "../../utils/toast"
import { restoreViewport } from "../../utils/viewport-utils"
import { buildSessionPath } from "../../utils/session"
import { useSessionId } from "../../hooks/use-session-id"
import MapSearchBar from "../common/MapSearchBar"
import SessionManagerDialog from "../session/SessionManagerDialog"
import UserPreferencesDialog from "../user-preferences/UserPreferencesDialog"

export default function Navbar() {
  const { navigateWithCheck } = useUnsavedChangesNavigation()
  const location = useLocation()
  const { projectId } = useParams<{ projectId: string }>()
  const sessionId = useSessionId()
  const projectData = useProjectWorkspaceStore((state) => state.projectData)
  const { mapType, toggleMapType } = useProjectWorkspaceStore()

  const [preferencesDialogOpen, setPreferencesDialogOpen] = useState(false)
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadMenuAnchor, setDownloadMenuAnchor] =
    useState<null | HTMLElement>(null)

  const isProjectPage = Boolean(projectId) && location.pathname.includes("/project/")

  // Fetch routes summary for displaying total count
  const { data: routesSummary } = useRoutesSummary(
    isProjectPage && projectId ? projectId : undefined,
  )

  const handleLogoClick = () => {
    navigateWithCheck(
      sessionId ? buildSessionPath(sessionId, "/dashboard") : "/dashboard",
    )
  }

  const handleHome = useCallback(() => {
    restoreViewport(projectData)
  }, [projectData])

  const handleDownloadMenuOpen = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setDownloadMenuAnchor(event.currentTarget)
    },
    [],
  )

  const handleDownloadMenuClose = useCallback(() => {
    setDownloadMenuAnchor(null)
  }, [])

  const handleDownloadProject = useCallback(async () => {
    if (!projectId || isDownloading) return

    setIsDownloading(true)
    handleDownloadMenuClose()
    try {
      const { blob, filename } = await projectsApi.exportProject(projectId)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      // Use extracted filename or fallback to project name from state
      const downloadFilename =
        filename ||
        (projectData?.name ? `${projectData.name}.zip` : "project.zip")
      link.download = downloadFilename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success("Project download started")
    } catch (error) {
      console.error("Error downloading project:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to download project",
      )
    } finally {
      setIsDownloading(false)
    }
  }, [projectId, isDownloading, handleDownloadMenuClose, projectData])

  const handleDownloadGeoJSON = useCallback(async () => {
    if (!projectId || isDownloading) return

    setIsDownloading(true)
    handleDownloadMenuClose()
    try {
      const { blob, filename } =
        await projectsApi.exportRoutesGeoJSON(projectId)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      // Use extracted filename or fallback to project name from state
      const downloadFilename =
        filename ||
        (projectData?.name ? `${projectData.name}.geojson` : "routes.geojson")
      link.download = downloadFilename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success("GeoJSON download started")
    } catch (error) {
      console.error("Error downloading GeoJSON:", error)
      toast.error(
        error instanceof Error ? error.message : "Failed to download GeoJSON",
      )
    } finally {
      setIsDownloading(false)
    }
  }, [projectId, isDownloading, handleDownloadMenuClose, projectData])

  return (
    <nav className="fixed top-0 left-0 right-0 z-[1001] bg-white border-b border-gray-200">
      <SessionManagerDialog
        open={sessionManagerOpen}
        onClose={() => setSessionManagerOpen(false)}
      />
      <div
        className="
        w-full max-w-full min-w-0 box-border
        max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)_auto] max-sm:grid-rows-[auto_auto]
        max-sm:gap-x-2 max-sm:gap-y-2 max-sm:py-2.5 max-sm:px-3
        sm:relative sm:flex sm:h-16 sm:min-h-16 sm:items-center sm:gap-2 sm:px-4 sm:py-0 md:px-6
      "
      >
        {/* Line 1 (mobile): logo only — line 2: app name. sm+: logo | divider | app name inline */}
        <div
          className={`max-sm:col-start-1 max-sm:row-start-1 flex items-center gap-2 sm:gap-3 min-w-0 shrink-0 cursor-pointer select-none sm:shrink sm:relative sm:z-10 ${isProjectPage ? "sm:max-w-[13rem] md:max-w-[40%] lg:max-w-none" : ""}`}
          onClick={handleLogoClick}
        >
          <img
            src={GoogleMapsLogo}
            alt="Google Maps Platform"
            className="h-5 w-auto sm:h-6 shrink-0 object-contain object-left sm:max-w-[5.5rem] md:max-w-none"
          />
          <Divider
            orientation="vertical"
            flexItem
            className="h-5 sm:h-6 hidden sm:block shrink-0"
          />
          <span className="hidden sm:inline text-sm sm:text-base font-semibold text-[#202124] tracking-tight truncate min-w-0 flex-1 basis-0">
            Roads Selection Tool
          </span>
        </div>

        {/* Mobile: product title — aligned with platform wordmark, clear hierarchy vs GMP row */}
        <div
          className="max-sm:col-span-3 max-sm:row-start-2 min-w-0 sm:hidden cursor-pointer select-none border-t border-gray-200/90 pt-2 px-2"
          onClick={handleLogoClick}
        >
          <div className="flex items-start gap-2 min-w-0">
            <span
              className="mt-0.5 h-5 w-0.5 shrink-0 rounded-full bg-[#1a73e8]"
              aria-hidden
            />
            <span className="text-base font-semibold leading-snug text-[#202124] tracking-tight truncate min-w-0">
              Roads Selection Tool
            </span>
          </div>
        </div>

        {/* Center: project title — viewport-centered on sm+ (flex-1 centering skews when L/R widths differ) */}
        <div
          className="
            max-sm:col-start-2 max-sm:row-start-1 min-w-0 flex justify-center items-center px-1 sm:px-2 overflow-hidden
            sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-max sm:max-w-[min(28rem,calc(100vw-10rem))]
            sm:pointer-events-none sm:overflow-visible sm:z-[5]
          "
        >
          {isProjectPage && projectData?.name ? (
            <div className="flex items-center gap-0.5 min-w-0 max-w-full justify-center sm:pointer-events-auto">
              <span
                className="text-sm sm:text-base font-extrabold text-[#5f6368] truncate text-center"
                title={projectData.name}
              >
                {projectData.name}
              </span>
              {routesSummary && (
                <>
                  <span className="text-sm sm:text-base font-extrabold text-[#5f6368] px-0.5 sm:px-1 py-0.5 shrink-0 whitespace-nowrap">
                    ({routesSummary.total})
                  </span>
                  <Tooltip
                    title="Total number of syncable routes/segments in this project"
                    arrow
                    placement="bottom"
                  >
                    <IconButton
                      size="small"
                      className="text-[#9aa0a6] hover:text-[#5f6368] hover:bg-gray-100 p-0.5 shrink-0"
                      aria-label="Routes summary info"
                      sx={{ padding: "2px" }}
                    >
                      <InfoIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* Right: actions (row 1 on mobile grid); ml-auto on sm+ balances absolute-centered title */}
        <div className="max-sm:col-start-3 max-sm:row-start-1 flex items-center gap-0.5 sm:gap-1 md:gap-2 shrink-0 sm:ml-auto sm:relative sm:z-10">
          {isProjectPage && <MapSearchBar isProjectPage={isProjectPage} />}

          {/* Map Controls: Home View and Satellite Toggle */}
          {isProjectPage && (
            <>
              <Tooltip title="Return to home view" arrow>
                <IconButton
                  size="small"
                  onClick={handleHome}
                  className="text-[#5f6368] hover:bg-gray-100"
                  aria-label="Return to home view"
                  sx={{ padding: "4px" }}
                >
                  <CenterFocusStrong fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip
                title={
                  mapType === "hybrid"
                    ? "Switch to Road Map"
                    : "Switch to Satellite View"
                }
                arrow
              >
                <IconButton
                  size="small"
                  onClick={toggleMapType}
                  className="bg-white hover:bg-gray-100 border border-gray-200"
                  aria-label={
                    mapType === "hybrid"
                      ? "Switch to Road Map"
                      : "Switch to Satellite View"
                  }
                  sx={{
                    padding: "2px",
                    width: "28px",
                    height: "28px",
                    borderRadius: "4px",
                    transition: "all 0.2s ease",
                  }}
                >
                  <img
                    src={mapType === "hybrid" ? roadmapImage : satelliteImage}
                    alt={
                      mapType === "hybrid" ? "Road map view" : "Satellite view"
                    }
                    className="w-full h-full object-cover rounded"
                  />
                </IconButton>
              </Tooltip>
            </>
          )}

          {isProjectPage && projectId && (
            <>
              <Tooltip title="Download" arrow>
                <span>
                  <IconButton
                    size="small"
                    onClick={handleDownloadMenuOpen}
                    disabled={isDownloading}
                    className="text-[#5f6368] hover:bg-gray-100"
                    aria-label="Download"
                    aria-controls={
                      downloadMenuAnchor ? "download-menu" : undefined
                    }
                    aria-haspopup="true"
                    aria-expanded={downloadMenuAnchor ? "true" : undefined}
                  >
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Menu
                id="download-menu"
                anchorEl={downloadMenuAnchor}
                open={Boolean(downloadMenuAnchor)}
                onClose={handleDownloadMenuClose}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "right",
                }}
                transformOrigin={{
                  vertical: "top",
                  horizontal: "right",
                }}
                PaperProps={{
                  className: "rounded-lg",
                }}
              >
                <Tooltip
                  title="Download project as ZIP file"
                  arrow
                  placement="left"
                >
                  <MenuItem
                    onClick={handleDownloadProject}
                    disabled={isDownloading}
                    className="text-sm rounded-t-lg"
                  >
                    Project
                  </MenuItem>
                </Tooltip>
                <Tooltip
                  title="Download routes as GeoJSON file"
                  arrow
                  placement="left"
                >
                  <MenuItem
                    onClick={handleDownloadGeoJSON}
                    disabled={isDownloading}
                    className="text-sm rounded-b-lg"
                  >
                    GeoJSON
                  </MenuItem>
                </Tooltip>
              </Menu>
            </>
          )}

          <Tooltip title="Share projects" arrow>
            <span>
              <IconButton
                onClick={() => setSessionManagerOpen(true)}
                size="small"
                className="text-[#5f6368] hover:bg-gray-100"
                aria-label="Share projects"
                disabled={!sessionId}
                data-tour="session-sharing"
              >
                <ShareIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Settings" arrow>
            <IconButton
              onClick={() => setPreferencesDialogOpen(true)}
              size="small"
              className="text-[#5f6368] hover:bg-gray-100"
              aria-label="User preferences"
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </div>
      <UserPreferencesDialog
        open={preferencesDialogOpen}
        onClose={() => setPreferencesDialogOpen(false)}
      />
    </nav>
  )
}
