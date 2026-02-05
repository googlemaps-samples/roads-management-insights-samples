import { Project } from "../../stores/project-workspace-store"
import { GcpProject } from "../../types/region-creation"
import { mapGcpError } from "../../utils/error-mapping"
import { apiClient } from "../api-client"
import { ApiResponse } from "../api-types"
import { transformProject } from "../transformers"

// Projects API
export const projectsApi = {
  // Get all projects
  getAll: async (): Promise<ApiResponse<Project[]>> => {
    try {
      console.log("Fetching all projects...")
      const data = await apiClient.get<any[]>("/projects/list")
      console.log("Raw projects data:", data)
      const transformedData = data.map(transformProject)
      console.log("Transformed projects data:", transformedData)
      return {
        success: true,
        data: transformedData,
        message: "Projects fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching projects:", error)
      return {
        success: false,
        data: [],
        message:
          error instanceof Error ? error.message : "Failed to fetch projects",
      }
    }
  },

  // Get project by ID
  getById: async (projectId: string): Promise<ApiResponse<Project | null>> => {
    try {
      console.log("Fetching project by ID:", projectId)
      const data = await apiClient.get<any>(`/projects/${projectId}`)
      console.log("Raw project data:", data)
      const transformedData = transformProject(data)
      console.log("Transformed project data:", transformedData)
      return {
        success: true,
        data: transformedData,
        message: "Project fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching project:", error)
      if (error instanceof Error && error.message.includes("404")) {
        return {
          success: true,
          data: null,
          message: "Project not found",
        }
      }
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : "Failed to fetch project",
      }
    }
  },

  // Create new project
  create: async (
    projectData: Omit<Project, "id" | "createdAt" | "updatedAt">,
  ): Promise<ApiResponse<Project>> => {
    try {
      const requestData = {
        project_name: projectData.name, // Backend API expects project_name
        jurisdiction_boundary_geojson: JSON.stringify(
          projectData.boundaryGeoJson,
        ),
        google_cloud_project_id:
          projectData.bigQueryColumn.googleCloudProjectId,
        google_cloud_project_number:
          projectData.bigQueryColumn.googleCloudProjectNumber,
        subscription_id:
          projectData.bigQueryColumn.subscriptionId ||
          `rmi-sub-${projectData.bigQueryColumn.googleCloudProjectNumber}`,
        dataset_name: projectData.datasetName,
      }

      // Backend returns the created project object directly
      const created = await apiClient.post<any>("/projects/", requestData)
      if (created && created.id) {
        return {
          success: true,
          data: transformProject(created),
          message: "Project created successfully",
        }
      }

      throw new Error("Failed to create project: invalid response")
    } catch (error) {
      console.error("Error creating project:", error)
      return {
        success: false,
        data: {} as Project,
        message:
          error instanceof Error ? error.message : "Failed to create project",
      }
    }
  },

  // Update project
  update: async (
    projectId: string,
    updates: Partial<Project> & { mapSnapshot?: string },
  ): Promise<ApiResponse<Project | null>> => {
    try {
      const requestData: any = {}

      if (updates.name) requestData.project_name = updates.name
      if (updates.boundaryGeoJson)
        requestData.jurisdiction_boundary_geojson = JSON.stringify(
          updates.boundaryGeoJson,
        )
      if (updates.bigQueryColumn) {
        requestData.google_cloud_project_id =
          updates.bigQueryColumn.googleCloudProjectId
        requestData.google_cloud_project_number =
          updates.bigQueryColumn.googleCloudProjectNumber
        requestData.subscription_id =
          updates.bigQueryColumn.subscriptionId ||
          `rmi-sub-${updates.bigQueryColumn.googleCloudProjectNumber}`
      }

      await apiClient.put(`/projects/${projectId}`, requestData)

      // Fetch updated project
      const updatedProject = await projectsApi.getById(projectId)
      return {
        success: true,
        data: updatedProject.data,
        message: "Project updated successfully",
      }
    } catch (error) {
      console.error("Error updating project:", error)
      return {
        success: false,
        data: null,
        message:
          error instanceof Error ? error.message : "Failed to update project",
      }
    }
  },

  // Update project snapshot
  updateSnapshot: async (
    projectId: string,
    mapSnapshot: string,
  ): Promise<ApiResponse<Project | null>> => {
    try {
      const requestData = {
        map_snapshot: mapSnapshot,
      }

      await apiClient.put(`/projects/${projectId}`, requestData)

      console.log(`✅ Map snapshot updated for project ${projectId}`)

      return {
        success: true,
        data: null,
        message: "Map snapshot updated successfully",
      }
    } catch (error) {
      console.error("Error updating map snapshot:", error)
      return {
        success: false,
        data: null,
        message:
          error instanceof Error
            ? error.message
            : "Failed to update map snapshot",
      }
    }
  },

  // Delete project
  delete: async (projectId: string): Promise<ApiResponse<boolean>> => {
    try {
      await apiClient.delete(`/projects/${projectId}`)
      return {
        success: true,
        data: true,
        message: "Project deleted successfully",
      }
    } catch (error) {
      console.error("Error deleting project:", error)
      return {
        success: false,
        data: false,
        message:
          error instanceof Error ? error.message : "Failed to delete project",
      }
    }
  },

  // Get GCP projects list
  getGcpProjects: async (): Promise<ApiResponse<GcpProject[]>> => {
    try {
      console.log("Fetching GCP projects...")
      const data = await apiClient.get<{ projects: GcpProject[] }>(
        "/gcp-projects-list",
      )
      console.log("Raw GCP projects data:", data)
      return {
        success: true,
        data: data.projects || [],
        message: "GCP projects fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching GCP projects:", error)
      // Map error to user-friendly message
      const friendlyError = mapGcpError(error as Error)
      // Always return empty list on error so manual entry is available
      return {
        success: false,
        data: [],
        message: friendlyError,
      }
    }
  },

  // Verify project details
  verifyProjectDetails: async (
    projectId: string,
  ): Promise<ApiResponse<{ project_number: string; project_id: string }>> => {
    try {
      console.log("Verifying project details for:", projectId)
      const data = await apiClient.post<{
        project_number?: string
        project_id?: string
        error?: string
      }>("/verify-project-details", {
        project_id: projectId,
      })
      console.log("Raw verify project data:", data)

      if (data.error) {
        // Map error to user-friendly message
        const friendlyError = mapGcpError(data.error)
        return {
          success: false,
          data: { project_number: "", project_id: "" },
          message: friendlyError,
        }
      }

      return {
        success: true,
        data: {
          project_number: data.project_number || "",
          project_id: data.project_id || projectId,
        },
        message: "Project verified successfully",
      }
    } catch (error) {
      console.error("Error verifying project details:", error)
      // Map error to user-friendly message
      const friendlyError = mapGcpError(error as Error)
      return {
        success: false,
        data: { project_number: "", project_id: "" },
        message: friendlyError,
      }
    }
  },

  // Export project
  exportProject: async (
    projectId: string,
  ): Promise<{ blob: Blob; filename: string }> => {
    try {
      console.log("Exporting project:", projectId)
      const result = await apiClient.downloadFile(
        `/export_project/${projectId}`,
      )
      return result
    } catch (error) {
      console.error("Error exporting project:", error)
      throw error
    }
  },

  // Export routes as GeoJSON
  exportRoutesGeoJSON: async (
    projectId: string,
  ): Promise<{ blob: Blob; filename: string }> => {
    try {
      console.log("Exporting routes GeoJSON:", projectId)
      const result = await apiClient.downloadFile(
        `/export_routes_geojson/${projectId}`,
      )
      return result
    } catch (error) {
      console.error("Error exporting routes GeoJSON:", error)
      throw error
    }
  },

  // Import project from zip file
  importProject: async (
    file: File,
  ): Promise<
    ApiResponse<{
      new_project_id: number
      routes_inserted: number
      routes_skipped_uuid_exists: number
    }>
  > => {
    try {
      console.log("Importing project from ZIP file:", file.name)
      const result = await apiClient.uploadFile<{
        status: string
        new_project_id: number
        routes_inserted: number
        routes_skipped_uuid_exists: number
      }>("/import_project", file)
      return {
        success: true,
        data: {
          new_project_id: result.new_project_id,
          routes_inserted: result.routes_inserted,
          routes_skipped_uuid_exists: result.routes_skipped_uuid_exists,
        },
        message: `Project imported successfully. ${result.routes_inserted} routes inserted.`,
      }
    } catch (error) {
      console.error("Error importing project:", error)
      // Extract error message - API returns {detail: "..."} format
      let errorMessage = "Failed to import project"
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (
        typeof error === "object" &&
        error !== null &&
        "detail" in error
      ) {
        errorMessage = (error as any).detail
      }
      return {
        success: false,
        data: {
          new_project_id: 0,
          routes_inserted: 0,
          routes_skipped_uuid_exists: 0,
        },
        message: errorMessage,
      }
    }
  },

  // Get routes summary for a project
  getRoutesSummary: async (
    projectId: string,
  ): Promise<
    ApiResponse<{ total: number; deleted: number; added: number }>
  > => {
    try {
      console.log("Fetching routes summary for project:", projectId)
      const data = await apiClient.get<{
        total: number
        deleted: number
        added: number
      }>(`/projects/${projectId}/routes-summary`)
      return {
        success: true,
        data,
        message: "Routes summary fetched successfully",
      }
    } catch (error) {
      console.error("Error fetching routes summary:", error)
      return {
        success: false,
        data: { total: 0, deleted: 0, added: 0 },
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch routes summary",
      }
    }
  },
}
