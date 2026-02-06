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

import MoreVertIcon from "@mui/icons-material/MoreVert"
import {
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material"
import React, { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { PRIMARY_RED } from "../../constants/colors"
import { Project } from "../../stores/project-workspace-store"
import { clearAllLayers } from "../../utils/clear-all-layers"
import { formatRelativeDate } from "../../utils/clipboard"

interface ProjectTableProps {
  projects: Project[]
}

const ProjectTable: React.FC<ProjectTableProps> = ({ projects }) => {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [_selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  )

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects
    const query = searchQuery.toLowerCase()
    return projects.filter((project) =>
      project.name.toLowerCase().includes(query),
    )
  }, [projects, searchQuery])

  // Mock route count - in real app, this would come from API
  const getRouteCount = (_projectId: string) => {
    // For now, return a mock count. In production, fetch from API
    return Math.floor(Math.random() * 20) + 5
  }

  const handleRowClick = (projectId: string) => {
    // Clear all layers before navigating to a project
    clearAllLayers()
    navigate(`/project/${projectId}`)
  }

  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    projectId: string,
  ) => {
    event.stopPropagation()
    setAnchorEl(event.currentTarget)
    setSelectedProjectId(projectId)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
    setSelectedProjectId(null)
  }

  const handleRename = () => {
    // TODO: Implement rename functionality
    handleMenuClose()
  }

  const handleDuplicate = () => {
    // TODO: Implement duplicate functionality
    handleMenuClose()
  }

  const handleDelete = () => {
    // TODO: Implement delete functionality
    handleMenuClose()
  }

  return (
    <div className="w-full">
      {/* Search Bar */}
      <div className="mb-6 w-full">
        <TextField
          fullWidth
          placeholder="Search projects by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-full border-none"
          variant="standard"
        />
      </div>

      {/* Table */}
      <TableContainer className="bg-white rounded-2xl border border-[#dadce0] max-h-[500px] overflow-y-auto pretty-scrollbar">
        <Table>
          <TableHead>
            <TableRow className="bg-[#f8f9fa]">
              <TableCell className="font-medium text-[#202124] text-sm border-b border-[#dadce0]">
                Project Name
              </TableCell>
              <TableCell className="font-medium text-[#202124] text-sm border-b border-[#dadce0]">
                Routes
              </TableCell>
              <TableCell className="font-medium text-[#202124] text-sm border-b border-[#dadce0]">
                Last Modified
              </TableCell>
              <TableCell className="w-12 border-b border-[#dadce0]" />
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredProjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" className="py-8">
                  <span className="text-[#5f6368] text-sm">
                    {searchQuery
                      ? "No projects found matching your search"
                      : "No projects yet"}
                  </span>
                </TableCell>
              </TableRow>
            ) : (
              filteredProjects.map((project) => (
                <TableRow
                  key={project.id}
                  onClick={() => handleRowClick(project.id)}
                  className="cursor-pointer hover:bg-[#f8f9fa] [&:last-child_td]:border-b-0"
                >
                  <TableCell className="font-medium text-[#1A73E8] text-sm border-b border-[#f1f3f4] py-4">
                    {project.name}
                  </TableCell>
                  <TableCell className="text-[#5f6368] text-sm border-b border-[#f1f3f4] py-4">
                    {getRouteCount(project.id)} routes
                  </TableCell>
                  <TableCell className="text-[#5f6368] text-sm border-b border-[#f1f3f4] py-4">
                    {formatRelativeDate(project.updatedAt)}
                  </TableCell>
                  <TableCell
                    className="border-b border-[#f1f3f4] py-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, project.id)}
                      className="text-[#5f6368] hover:bg-gray-100"
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        <MenuItem onClick={handleRename}>Rename</MenuItem>
        <MenuItem onClick={handleDuplicate}>Duplicate</MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: PRIMARY_RED }}>
          Delete
        </MenuItem>
      </Menu>
    </div>
  )
}

export default ProjectTable
