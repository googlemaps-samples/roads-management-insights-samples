import CenterFocusStrong from "@mui/icons-material/CenterFocusStrong"
import DownloadIcon from "@mui/icons-material/Download"
import InfoIcon from "@mui/icons-material/Info"
import SettingsIcon from "@mui/icons-material/Settings"
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
import MapSearchBar from "../common/MapSearchBar"
import UserPreferencesDialog from "../user-preferences/UserPreferencesDialog"

export default function Navbar() {
  const { navigateWithCheck } = useUnsavedChangesNavigation()
  const location = useLocation()
  const { projectId } = useParams<{ projectId: string }>()
  const projectData = useProjectWorkspaceStore((state) => state.projectData)
  const { mapType, toggleMapType } = useProjectWorkspaceStore()

  const [preferencesDialogOpen, setPreferencesDialogOpen] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadMenuAnchor, setDownloadMenuAnchor] =
    useState<null | HTMLElement>(null)

  const isProjectPage = location.pathname.startsWith("/project/")

  // Fetch routes summary for displaying total count
  const { data: routesSummary } = useRoutesSummary(
    isProjectPage && projectId ? projectId : undefined,
  )

  const handleLogoClick = () => {
    navigateWithCheck("/dashboard")
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
      <div className="flex items-center justify-between h-16 px-6 relative">
        {/* Left Side: Logo + Divider + App Name */}
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={handleLogoClick}
        >
          <img
            src={GoogleMapsLogo}
            alt="Google Maps Platform"
            className="h-6 w-auto"
          />
          <Divider orientation="vertical" flexItem className="h-6" />
          <span className="text-base font-medium text-[#202124] tracking-tight">
            Roads Selection Tool
          </span>
        </div>

        {/* Center: Project Name with Total Count */}
        {isProjectPage && projectData?.name && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5">
            <span className="text-base font-extrabold text-[#5f6368] max-w-[200px] truncate">
              {projectData.name}
            </span>
            {routesSummary && (
              <>
                <span className="text-base font-extrabold text-[#5f6368] px-1 py-0.5 ">
                  ({routesSummary.total})
                </span>
                <Tooltip
                  title="Total number of syncable routes/segments in this project"
                  arrow
                  placement="right"
                >
                  <IconButton
                    size="small"
                    className="text-[#9aa0a6] hover:text-[#5f6368] hover:bg-gray-100 p-0.5"
                    aria-label="Routes summary info"
                    sx={{ padding: "2px" }}
                  >
                    <InfoIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </div>
        )}

        {/* Right Side: Search Bar (only in project pages) + Utility Icons */}
        <div className="flex items-center gap-2">
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

          <Tooltip title="Settings" arrow>
            <IconButton
              onClick={() => setPreferencesDialogOpen(true)}
              size="small"
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
