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

import { Add, Delete, Edit, Search, Share, UploadFile } from "@mui/icons-material"
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Fade,
  IconButton,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material"
import { alpha } from "@mui/material/styles"
import { useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import React, { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import { noSnapshotFallback } from "../../assets/images"
import {
  PRIMARY_BLUE,
  PRIMARY_BLUE_DARK,
  PRIMARY_BLUE_LIGHT,
  PRIMARY_RED_GOOGLE,
  PRIMARY_RED_HOVER_BG,
} from "../../constants/colors"
import { projectsApi } from "../../data/api/projects-api"
import {
  queryKeys,
  useDeleteProject,
  useUpdateProject,
} from "../../hooks/use-api"
import { Project } from "../../stores/project-workspace-store"
import { clearAllLayers } from "../../utils/clear-all-layers"
import { buildSessionPath } from "../../utils/session"
import { toast } from "../../utils/toast"
import { useSessionId } from "../../hooks/use-session-id"
import Button from "../common/Button"
import Modal from "../common/Modal"
import RenameDialog from "../common/RenameDialog"
import SearchBar from "../common/SearchBar"

function isProjectFromLinkedSession(
  currentSessionId: string | null,
  projectSessionId: string | null | undefined,
): boolean {
  const cur = currentSessionId?.trim()
  const owned = projectSessionId?.trim()
  if (!cur || !owned) return false
  return cur.toLowerCase() !== owned.toLowerCase()
}

/** Short label for cards (full value is in tooltip). */
function truncateSessionIdForCard(id: string): string {
  const s = id.trim()
  if (s.length <= 16) return s
  return `${s.slice(0, 8)}…${s.slice(-4)}`
}

interface ProjectGridProps {
  projects: Project[]
  isLoading?: boolean
  searchQuery: string
  onSearchChange: (value: string) => void
  onLoadMore: () => void
  hasMore: boolean
  isLoadingMore?: boolean
  totalProjects: number
  routeSummaries: Record<string, { total: number; deleted: number; added: number }>
  tourStepId?: string | null
}

// Skeleton Project Card Component
const ProjectCardSkeleton: React.FC = () => {
  return (
    <Card
      elevation={0}
      className="border border-gray-200 overflow-hidden self-start"
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "200px",
        height: "auto",
        position: "relative",
        zIndex: 5,
        backgroundColor: "white",
        width: "100%",
        borderRadius: "24px",
        boxShadow:
          "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)",
      }}
    >
      {/* Map Snapshot Skeleton */}
      <div
        className="relative w-full h-40 bg-gray-100 overflow-hidden flex-shrink-0"
        style={{
          minHeight: "160px",
          borderTopLeftRadius: "24px",
          borderTopRightRadius: "24px",
        }}
      >
        <Skeleton
          variant="rectangular"
          width="100%"
          height="100%"
          className="bg-gray-200"
          sx={{
            borderTopLeftRadius: "24px",
            borderTopRightRadius: "24px",
          }}
        />
      </div>

      {/* Project Info Skeleton */}
      <CardContent
        className="px-4 py-3 bg-white relative z-10 w-full flex-shrink-0"
        sx={{
          "&:last-child": {
            paddingBottom: "12px",
          },
          position: "relative",
          zIndex: 10,
          backgroundColor: "white",
          flexShrink: 0,
          borderBottomLeftRadius: "24px",
          borderBottomRightRadius: "24px",
        }}
      >
        <div className="flex items-center gap-2 w-full">
          <Skeleton variant="text" width="55%" height={20} className="flex-1" />
          <Skeleton
            variant="text"
            width="25%"
            height={16}
            className="ml-auto"
          />
        </div>
      </CardContent>
    </Card>
  )
}

// Individual Project Card Component
interface ProjectCardItemProps {
  project: Project
  routeCount?: number
  isFromLinkedSession: boolean
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  onRename: (e: React.MouseEvent) => void
}

const ProjectCardItem: React.FC<ProjectCardItemProps> = ({
  project,
  routeCount,
  isFromLinkedSession,
  onClick,
  onDelete,
  onRename,
}) => {
  const formatDate = (dateString: string) => {
    try {
      if (!dateString) {
        return "Recently"
      }

      let date: Date

      // Check if the string already has timezone information
      const hasTimezoneIndicator =
        dateString.endsWith("Z") || dateString.match(/[+-]\d{2}:?\d{2}$/)

      // Handle SQL datetime format: "YYYY-MM-DD HH:MM:SS" (without timezone)
      // SQLite stores timestamps in UTC, so we convert to ISO format with 'Z' indicator
      const sqlDateTimePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
      if (sqlDateTimePattern.test(dateString)) {
        // Convert SQL datetime format to ISO format: "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SSZ"
        date = new Date(dateString.replace(" ", "T") + "Z")
      } else if (dateString.includes("T") && !hasTimezoneIndicator) {
        // ISO format without timezone - assume UTC
        date = new Date(`${dateString}Z`)
      } else {
        // Has timezone info or other format - parse as-is
        date = new Date(dateString)
      }

      // Validate the date
      if (isNaN(date.getTime())) {
        return "Recently"
      }

      // formatDistanceToNow will use the local timezone from the Date object
      return formatDistanceToNow(date, { addSuffix: true })
    } catch {
      return "Recently"
    }
  }

  return (
    <Card
      elevation={0}
      className="border border-gray-200 overflow-hidden hover:shadow-lg transition-[box-shadow,border-color] duration-200 cursor-pointer relative group self-start"
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "200px",
        height: "auto",
        position: "relative",
        zIndex: 5,
        backgroundColor: "white",
        width: "100%",
        borderRadius: "24px",
        boxShadow:
          "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)",
        "&:hover": {
          borderColor: "#1967d2",
          zIndex: 15,
          boxShadow:
            "0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)",
        },
      }}
    >
      {/* Action buttons: always visible on touch; fade in on hover for fine pointers */}
      <Box
        className="absolute top-2 right-2 z-20 flex gap-1 transition-opacity"
        sx={{
          opacity: 1,
          "@media (hover: hover) and (pointer: fine)": {
            opacity: 0,
          },
          ".group:hover &": {
            "@media (hover: hover) and (pointer: fine)": {
              opacity: 1,
            },
          },
        }}
      >
        {/* Edit Button */}
        <IconButton
          onClick={onRename}
          size="small"
          sx={{
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(8px)",
            boxShadow:
              "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)",
            borderRadius: "50%",
            width: "36px",
            height: "36px",
            "@media (pointer: coarse)": {
              width: 44,
              height: 44,
            },
            "&:hover": {
              backgroundColor: "rgba(9, 87, 208, 0.08)",
              boxShadow:
                "0 2px 4px rgba(0, 0, 0, 0.16), 0 2px 4px rgba(0, 0, 0, 0.23)",
              "& .MuiSvgIcon-root": {
                color: PRIMARY_BLUE,
              },
            },
            "& .MuiSvgIcon-root": {
              color: "#5f6368",
              fontSize: "18px",
            },
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <Edit />
        </IconButton>

        {/* Delete Button */}
        <IconButton
          onClick={onDelete}
          size="small"
          sx={{
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(8px)",
            boxShadow:
              "0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)",
            borderRadius: "50%",
            width: "36px",
            height: "36px",
            "@media (pointer: coarse)": {
              width: 44,
              height: 44,
            },
            "&:hover": {
              backgroundColor: PRIMARY_RED_HOVER_BG,
              boxShadow:
                "0 2px 4px rgba(0, 0, 0, 0.16), 0 2px 4px rgba(0, 0, 0, 0.23)",
              "& .MuiSvgIcon-root": {
                color: PRIMARY_RED_GOOGLE,
              },
            },
            "& .MuiSvgIcon-root": {
              color: "#5f6368",
              fontSize: "18px",
            },
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <Delete />
        </IconButton>
      </Box>

      <CardActionArea
        onClick={onClick}
        className="flex flex-col flex-1"
        sx={{
          "& .MuiCardActionArea-focusHighlight": {
            opacity: 0,
          },
          // Default hover tint stacks above the map/chip and makes labels hard to read.
          "&:hover .MuiCardActionArea-focusHighlight": {
            opacity: 0,
          },
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          backgroundColor: "white",
          "&:hover": {
            backgroundColor: "white",
          },
        }}
      >
        {/* Map Snapshot Image */}
        <div
          className="relative w-full h-40 bg-gray-100 overflow-hidden flex-shrink-0"
          style={{
            minHeight: "160px",
            borderTopLeftRadius: "24px",
            borderTopRightRadius: "24px",
          }}
        >
          {isFromLinkedSession && project.sessionId && (
            <Tooltip
              arrow
              placement="top"
              title={
                <Box sx={{ maxWidth: 280 }}>
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{ display: "block", mb: 0.75, lineHeight: 1.4 }}
                  >
                    Created by another user you linked. You can open and use it
                    like your own projects.
                  </Typography>
                  <Typography
                    variant="caption"
                    component="code"
                    sx={{
                      display: "block",
                      wordBreak: "break-all",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: "0.7rem",
                      opacity: 0.95,
                    }}
                  >
                    {project.sessionId}
                  </Typography>
                </Box>
              }
            >
              <Box
                component="span"
                aria-label="Project from a linked user"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") e.stopPropagation()
                }}
                sx={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  zIndex: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: "14px",
                  cursor: "default",
                  backgroundColor: "#ffffff",
                  border: `1px solid ${alpha(PRIMARY_BLUE, 0.35)}`,
                  boxShadow:
                    "0 1px 2px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)",
                  transition: "background-color 0.15s ease, border-color 0.15s ease",
                  "&:hover": {
                    backgroundColor: PRIMARY_BLUE_LIGHT,
                    borderColor: alpha(PRIMARY_BLUE, 0.45),
                  },
                }}
              >
                <Share
                  sx={{
                    fontSize: 16,
                    color: PRIMARY_BLUE,
                  }}
                />
              </Box>
            </Tooltip>
          )}
          {project.mapSnapshot ? (
            <img
              src={project.mapSnapshot}
              alt={project.name}
              className="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-110"
              onError={(e) => {
                // Fallback if image fails to load
                const target = e.target as HTMLImageElement
                target.style.display = "none"
                if (target.parentElement) {
                  target.parentElement.className +=
                    " bg-gradient-to-br from-blue-50 to-indigo-100"
                }
              }}
            />
          ) : (
            <img
              src={noSnapshotFallback}
              alt="No snapshot"
              className="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-110 grayscale opacity-60"
            />
          )}
        </div>

        {/* Project Info */}
        <CardContent
          className="px-4 py-3 bg-white relative z-10 w-full flex-shrink-0"
          sx={{
            "&:last-child": {
              paddingBottom: "12px",
            },
            position: "relative",
            zIndex: 10,
            backgroundColor: "white",
            flexShrink: 0,
            borderBottomLeftRadius: "24px",
            borderBottomRightRadius: "24px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.25,
              width: "100%",
              minWidth: 0,
            }}
          >
            {/* Single line: ProjectName (count) time ago */}
            <div
              className="flex items-center gap-2 w-full overflow-hidden"
              title={`${project.name} (${routeCount !== undefined ? routeCount : 0}) ${formatDate(project.updatedAt || project.createdAt)}`}
            >
              {/* Project name and count grouped together */}
              <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
                {/* Project name - can truncate */}
                <span className="font-semibold text-gray-900 text-[0.9375rem] truncate">
                  {project.name}
                </span>
                {/* Count - always visible, doesn't shrink */}
                {routeCount !== undefined && routeCount > 0 && (
                  <span className="font-normal text-gray-600 text-[0.9375rem] flex-shrink-0 whitespace-nowrap">
                    ({routeCount})
                  </span>
                )}
              </div>
              {/* Time - always visible, doesn't shrink */}
              <span className="font-normal text-gray-400 text-xs whitespace-nowrap flex-shrink-0">
                {formatDate(project.updatedAt || project.createdAt)}
              </span>
            </div>
            {project.sessionId ? (
              <Tooltip title={`User ID: ${project.sessionId}`} arrow>
                <Typography
                  variant="caption"
                  component="div"
                  sx={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    color: "#6b7280",
                    fontSize: "0.65rem",
                    lineHeight: 1.35,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: "default",
                  }}
                >
                  User {truncateSessionIdForCard(project.sessionId)}
                </Typography>
              </Tooltip>
            ) : null}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

const ProjectGrid: React.FC<ProjectGridProps> = ({
  projects,
  isLoading = false,
  searchQuery,
  onSearchChange,
  onLoadMore,
  hasMore,
  isLoadingMore = false,
  totalProjects,
  routeSummaries,
  tourStepId = null,
}) => {
  const SCROLL_THRESHOLD_PX = 250

  // Tour behavior: during "Open a project" step, if there are no projects yet,
  // render the normal loading skeleton grid so the user sees what a project card looks like.
  const isTourSkeletonMode = tourStepId === "open-project" && projects.length === 0
  const effectiveIsLoading = isLoading || isTourSkeletonMode

  const navigate = useNavigate()
  const sessionId = useSessionId()
  const queryClient = useQueryClient()
  const deleteProjectMutation = useDeleteProject()
  const updateProjectMutation = useUpdateProject()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [projectToRename, setProjectToRename] = useState<Project | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const projectZipInputRef = useRef<HTMLInputElement>(null)

  const visibleProjects = projects
  const filteredProjects = projects
  const loadMoreRequestedRef = useRef(false)

  useEffect(() => {
    if (effectiveIsLoading) return
    // Reset scroll-request guard whenever result set changes.
    loadMoreRequestedRef.current = false
  }, [effectiveIsLoading, searchQuery, projects.length])

  useEffect(() => {
    // Allow another network page request after render settles.
    loadMoreRequestedRef.current = false
  }, [projects.length, isLoadingMore])

  const handleProjectClick = (projectId: string) => {
    // Clear all layers before navigating to a project
    clearAllLayers()
    navigate(
      sessionId
        ? buildSessionPath(sessionId, `/project/${projectId}`)
        : `/project/${projectId}`,
    )
  }

  const handleAddProjectClick = () => {
    navigate(sessionId ? buildSessionPath(sessionId, "/add-project") : "/add-project")
  }

  const handleImportProjectClick = () => {
    setImportDialogOpen(true)
  }

  const handleImportDialogClose = () => {
    setImportDialogOpen(false)
    if (projectZipInputRef.current) {
      projectZipInputRef.current.value = ""
    }
  }

  const handleImportFileSelect = () => {
    projectZipInputRef.current?.click()
  }

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.endsWith(".zip")) {
      toast.error("Invalid File Type", {
        description: "Please select a .zip file",
      })
      return
    }

    setIsImporting(true)
    try {
      const result = await projectsApi.importProject(file)

      if (result.success && result.data) {
        const { new_project_id, routes_inserted } = result.data
        toast.success(
          `Project imported successfully! ${routes_inserted} routes inserted.`,
        )

        // Invalidate projects query cache so dashboard shows the new project when navigating back
        queryClient.invalidateQueries({ queryKey: queryKeys.projects })

        // Clear all layers before navigating
        clearAllLayers()

        // Navigate to the new project
        navigate(`/project/${new_project_id}`)

        // Close dialog
        handleImportDialogClose()
      } else {
        // Show error toast and keep modal open
        const errorMessage = result.message || "Failed to import project"
        console.error("Import project failed:", errorMessage)
        toast.error("Import Failed", {
          description: errorMessage,
        })
        // Reset file input so user can try again
        if (projectZipInputRef.current) {
          projectZipInputRef.current.value = ""
        }
      }
    } catch (error) {
      console.error("Error importing project:", error)
      const errorMessage =
        error instanceof Error ? error.message : "Failed to import project"
      toast.error("Import Failed", {
        description: errorMessage,
      })
      // Reset file input so user can try again
      if (projectZipInputRef.current) {
        projectZipInputRef.current.value = ""
      }
    } finally {
      setIsImporting(false)
    }
  }

  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation() // Prevent card click
    setProjectToDelete(project)
    setDeleteDialogOpen(true)
  }

  const handleRenameClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation() // Prevent card click
    setProjectToRename(project)
    setRenameDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return

    try {
      await deleteProjectMutation.mutateAsync(projectToDelete.id)
      toast.success(`Project "${projectToDelete.name}" deleted successfully`)
      setDeleteDialogOpen(false)
      setProjectToDelete(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete project",
      )
    }
  }

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false)
    setProjectToDelete(null)
  }

  const handleRenameSave = async (newName: string) => {
    if (!projectToRename) return

    try {
      await updateProjectMutation.mutateAsync({
        projectId: projectToRename.id,
        updates: { name: newName },
      })
      toast.success(`Project renamed to "${newName}" successfully`)
      setRenameDialogOpen(false)
      setProjectToRename(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to rename project",
      )
      throw error // Re-throw to prevent dialog from closing
    }
  }

  const handleRenameCancel = () => {
    setRenameDialogOpen(false)
    setProjectToRename(null)
  }

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 w-full max-w-[100vw] min-[400px]:max-w-[95vw] sm:max-w-[90vw] md:max-w-[85vw] lg:max-w-[95vw] xl:max-w-[90rem] px-2 sm:px-4 z-10 box-border"
      style={{
        top: "max(calc(64px + 1rem), calc(64px + env(safe-area-inset-top, 0px) + 0.75rem))",
        bottom: "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))",
        maxHeight:
          "calc(100vh - 64px - max(2rem, env(safe-area-inset-bottom, 0px) + 1rem) - env(safe-area-inset-top, 0px))",
      }}
    >
      <Fade in timeout={600}>
        <Card
          elevation={10}
          sx={{
            padding: 0,
            height: "100%",
            maxHeight: "100%",
            display: "flex",
            flexDirection: "column",
            "& .MuiCardContent-root": {
              padding: 0,
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
              maxHeight: "100%",
            },
          }}
          className="bg-[#f8f9fa] backdrop-blur-[16px] rounded-[24px] overflow-hidden"
        >
          <CardContent className="pb-0 flex-1 min-h-0 overflow-hidden">
            <div className="flex flex-col h-full min-h-0">
              {/* Header Card with Buttons */}
              <div className="flex-shrink-0">
                <Card
                  elevation={0}
                  sx={{
                    borderTopLeftRadius: "24px",
                    borderTopRightRadius: "24px",
                    borderBottomLeftRadius: "0px",
                    borderBottomRightRadius: "0px",
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                  }}
                  className="overflow-hidden"
                >
                  <div className="px-3 py-3 sm:px-5 sm:py-4">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <Typography
                          variant="h4"
                          className="font-bold text-gray-900 mb-2 text-xl sm:text-2xl md:text-3xl lg:text-4xl"
                        >
                          Projects
                        </Typography>
                        <Typography
                          variant="body2"
                          className="text-gray-700 text-xs sm:text-sm md:text-base mb-2 sm:mb-3"
                        >
                          Manage your road jurisdictions and insights.
                        </Typography>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0 w-full sm:w-auto">
                        <Button
                          onClick={handleImportProjectClick}
                          variant="outlined"
                          startIcon={<UploadFile />}
                          data-tour="import-project"
                          sx={{
                            borderColor: "#dadce0",
                            color: "#5f6368",
                            textTransform: "none",
                            fontSize: "11px",
                            fontWeight: 500,
                            padding: "6px 12px",
                            borderRadius: "24px",
                            flexShrink: 0,
                            width: "100%",
                            "@media (min-width: 640px)": {
                              fontSize: "12px",
                              padding: "8px 16px",
                              width: "auto",
                            },
                            "&:hover": {
                              borderColor: "#bdc1c6",
                              backgroundColor: "#f8f9fa",
                            },
                            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                          }}
                        >
                          Import Project
                        </Button>
                        <Button
                          onClick={handleAddProjectClick}
                          variant="contained"
                          startIcon={<Add />}
                          data-tour="add-project"
                          sx={{
                            backgroundColor: "#0b57d0",
                            color: "#ffffff",
                            textTransform: "none",
                            fontSize: "11px",
                            fontWeight: 500,
                            padding: "6px 12px",
                            borderRadius: "24px",
                            boxShadow:
                              "0 1px 3px rgba(11, 87, 208, 0.4), 0 1px 2px rgba(11, 87, 208, 0.3)",
                            flexShrink: 0,
                            width: "100%",
                            "@media (min-width: 640px)": {
                              fontSize: "12px",
                              padding: "8px 16px",
                              width: "auto",
                            },
                            "&:hover": {
                              backgroundColor: "#0942a0",
                              boxShadow:
                                "0 2px 6px rgba(11, 87, 208, 0.4), 0 2px 4px rgba(11, 87, 208, 0.3)",
                            },
                            "&:active": {
                              boxShadow: "0 1px 3px rgba(11, 87, 208, 0.4)",
                              transform: "translateY(1px)",
                            },
                            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                          }}
                        >
                          New Project
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Projects Grid Section — flex fills space below header (avoids brittle vh math on small screens) */}
              <div
                className="min-w-0 px-3 py-3 sm:px-5 sm:py-4 flex flex-col flex-1 min-h-0"
                data-tour="project-grid"
              >
                <div className="mb-4 flex-shrink-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-4 border-b border-gray-200">
                    <Typography
                      variant="h6"
                      className="font-semibold text-gray-900 text-base sm:text-lg"
                    >
                      All projects{" "}
                      {!effectiveIsLoading && (
                        <span className="text-gray-500 font-normal">
                          ({totalProjects})
                        </span>
                      )}
                    </Typography>
                    <div className="flex items-center gap-3 flex-1 sm:flex-initial sm:justify-end">
                      <Box
                        sx={{
                          width: {
                            xs: "100%",
                            sm: searchQuery.trim().length > 0 ? "320px" : "210px",
                          },
                          maxWidth: "100%",
                          transition: "width 280ms cubic-bezier(0.4, 0, 0.2, 1)",
                          "&:focus-within": {
                            width: { xs: "100%", sm: "320px" },
                          },
                        }}
                      >
                        <div data-tour="project-search">
                          <SearchBar
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={onSearchChange}
                            disabled={false}
                            searchSx={{
                              backgroundColor: "#ffffff",
                              borderRadius: "24px",
                              border: "1px solid #e5e7eb",
                              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                              width: "100%",
                              maxWidth: "100%",
                              minWidth: "180px",
                              transition:
                                "border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                              "&:hover": {
                                backgroundColor: "#ffffff",
                                borderColor: "#d1d5db",
                                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.08)",
                              },
                              "&:focus-within": {
                                borderColor: PRIMARY_BLUE,
                                boxShadow:
                                  "0 0 0 3px rgba(9, 87, 208, 0.1), 0 2px 4px rgba(0, 0, 0, 0.08)",
                              },
                            }}
                          />
                        </div>
                      </Box>
                    </div>
                  </div>
                </div>

                {effectiveIsLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-3 sm:gap-x-4 gap-y-5 sm:gap-y-6 md:gap-y-8 overflow-y-auto pretty-scrollbar items-start flex-1 min-h-0">
                    {[...Array(6)].map((_, index) => (
                      <div
                        key={`skeleton-${index}`}
                        data-tour={index === 0 ? "first-project-card-skeleton" : undefined}
                      >
                        <ProjectCardSkeleton />
                      </div>
                    ))}
                  </div>
                ) : projects.length === 0 ? (
                  <div className="flex flex-1 min-h-0 flex-col items-center justify-center py-3 sm:py-6 md:py-10 overflow-hidden">
                    <div className="text-center max-w-md px-2 sm:px-4 w-full min-h-0 shrink">
                      <Typography
                        variant="h6"
                        className="font-semibold text-gray-900 mb-2 text-base sm:text-lg md:text-xl"
                      >
                        No projects yet
                      </Typography>
                      <Typography
                        variant="body2"
                        className="text-gray-500 mb-4 sm:mb-6 text-xs sm:text-sm md:text-base px-2"
                      >
                        Get started by creating your first project to select and
                        manage roads for your jurisdiction.
                      </Typography>
                      <Button
                        onClick={handleAddProjectClick}
                        variant="contained"
                        startIcon={<Add />}
                        data-tour="add-project-empty"
                        sx={{
                          backgroundColor: "#1967D2",
                          color: "#ffffff",
                          textTransform: "none",
                          fontSize: "14px",
                          fontWeight: 500,
                          padding: "10px 24px",
                          width: "100%",
                          maxWidth: "320px",
                          mx: "auto",
                          display: "block",
                          boxShadow:
                            "0 1px 3px rgba(25, 103, 210, 0.4), 0 1px 2px rgba(25, 103, 210, 0.3)",
                          "@media (min-width: 600px)": {
                            width: "auto",
                            maxWidth: "none",
                            mx: 0,
                            display: "inline-flex",
                          },
                          "&:hover": {
                            backgroundColor: "#1557B0",
                            boxShadow:
                              "0 2px 6px rgba(25, 103, 210, 0.4), 0 2px 4px rgba(25, 103, 210, 0.3)",
                          },
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                      >
                        Create your first project
                      </Button>
                    </div>
                  </div>
                ) : filteredProjects.length === 0 && searchQuery.trim() ? (
                  <div className="flex flex-1 min-h-0 flex-col items-center justify-center py-3 sm:py-6 md:py-10 overflow-hidden">
                    <div className="text-center max-w-md px-2 sm:px-4 w-full min-h-0 shrink">
                      <div className="mb-3 sm:mb-5 flex justify-center">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                          <Search
                            sx={{
                              fontSize: "36px",
                              "@media (min-width: 640px)": {
                                fontSize: "42px",
                              },
                              "@media (min-width: 768px)": {
                                fontSize: "48px",
                              },
                              color: "#5f6368",
                              opacity: 0.6,
                            }}
                          />
                        </div>
                      </div>
                      <Typography
                        variant="h6"
                        className="font-semibold text-gray-900 mb-2 text-base sm:text-lg md:text-xl"
                      >
                        No projects found
                      </Typography>
                      <Typography
                        variant="body2"
                        className="text-gray-500 mb-4 sm:mb-6 text-xs sm:text-sm md:text-base px-2"
                      >
                        No projects match your search query "{searchQuery}". Try
                        a different search term.
                      </Typography>
                    </div>
                  </div>
                ) : (
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-3 sm:gap-x-4 gap-y-5 sm:gap-y-6 md:gap-y-8 overflow-y-auto pretty-scrollbar items-start flex-1 min-h-0"
                    onScroll={(e) => {
                      if (effectiveIsLoading) return
                      if (!hasMore) return
                      if (isLoadingMore) return
                      if (loadMoreRequestedRef.current) return

                      const el = e.currentTarget
                      const distanceFromBottom =
                        el.scrollHeight - el.scrollTop - el.clientHeight

                      if (distanceFromBottom <= SCROLL_THRESHOLD_PX) {
                        loadMoreRequestedRef.current = true
                        onLoadMore()
                      }
                    }}
                  >
                    {visibleProjects.map((project, index) => {
                      const card = (
                        <ProjectCardItem
                          key={project.id}
                          project={project}
                          routeCount={routeSummaries[project.id]?.total}
                          isFromLinkedSession={isProjectFromLinkedSession(
                            sessionId,
                            project.sessionId,
                          )}
                          onClick={() => handleProjectClick(project.id)}
                          onDelete={(e) => handleDeleteClick(e, project)}
                          onRename={(e) => handleRenameClick(e, project)}
                        />
                      )
                      if (index === 0) {
                        return (
                          <div key={project.id} data-tour="first-project-card">
                            {card}
                          </div>
                        )
                      }
                      return card
                    })}

                    {/* Tour-only skeleton placeholder for "Open a project" step */}
                    {tourStepId === "open-project" &&
                      !isLoading &&
                      visibleProjects.length === 0 && (
                        <div data-tour="first-project-card-skeleton">
                          <ProjectCardSkeleton />
                        </div>
                      )}
                    {isLoadingMore && (
                      <div className="col-span-full flex justify-center py-4">
                        <Skeleton
                          variant="rounded"
                          width={180}
                          height={28}
                          sx={{ borderRadius: "9999px" }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </Fade>

      {/* Rename Dialog */}
      <RenameDialog
        open={renameDialogOpen}
        currentName={projectToRename?.name || ""}
        onClose={handleRenameCancel}
        onSave={handleRenameSave}
        title="Rename Project"
        label="Project Name"
        isLoading={updateProjectMutation.isPending}
        formId="rename-project-form"
      />

      {/* Delete Confirmation Dialog */}
      <Modal
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        maxWidth="sm"
        title="Delete Project"
        actions={
          <>
            <Button
              onClick={handleDeleteCancel}
              variant="text"
              sx={{
                color: "#5f6368",
                "&:hover": {
                  backgroundColor: "rgba(95, 99, 104, 0.08)",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              variant="contained"
              disabled={deleteProjectMutation.isPending}
            >
              {deleteProjectMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </>
        }
      >
        <Typography variant="body2" className="text-gray-700">
          Are you sure you want to delete the project{" "}
          <span className="font-semibold text-gray-900">
            "{projectToDelete?.name}"
          </span>
          ? This action cannot be undone and will permanently delete all
          associated routes and data.
        </Typography>
      </Modal>

      {/* Import Project Dialog */}
      <Modal
        open={importDialogOpen}
        onClose={handleImportDialogClose}
        maxWidth="sm"
        title="Import Project from ZIP"
        actions={
          <>
            <Button
              onClick={handleImportDialogClose}
              variant="text"
              disabled={isImporting}
              sx={{
                color: "#5f6368",
                "&:hover": {
                  backgroundColor: "rgba(95, 99, 104, 0.08)",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImportFileSelect}
              variant="contained"
              disabled={isImporting}
              sx={{
                backgroundColor: PRIMARY_BLUE,
                color: "#ffffff",
                boxShadow: "0 1px 3px rgba(9, 87, 208, 0.4)",
                "&:hover": {
                  backgroundColor: PRIMARY_BLUE_DARK,
                  boxShadow: "0 2px 4px rgba(9, 87, 208, 0.4)",
                },
                "&:disabled": {
                  backgroundColor: "rgba(0, 0, 0, 0.12)",
                  color: "rgba(0, 0, 0, 0.26)",
                },
              }}
            >
              {isImporting ? "Importing..." : "Select ZIP File"}
            </Button>
            <input
              ref={projectZipInputRef}
              type="file"
              accept=".zip"
              onChange={handleImportFileChange}
              className="hidden"
            />
          </>
        }
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <Typography variant="body2" sx={{ color: "#5f6368", mb: 1 }}>
            Select a project ZIP file to import. All project information will be
            extracted from the ZIP file.
          </Typography>
        </Box>
      </Modal>
    </div>
  )
}

export default ProjectGrid
