import { useState } from "react"

import { useProjectWorkspaceStore } from "../stores"
import { toast } from "../utils/toast"
import { useSyncRoutes } from "./use-api"

/**
 * Hook for handling global route sync functionality
 */
export const useSyncRoutesHandler = () => {
  const [isSyncing, setIsSyncing] = useState(false)
  const syncRoutesMutation = useSyncRoutes()

  const handleGlobalSync = async () => {
    // Get project data from store
    const { projectData } = useProjectWorkspaceStore.getState()

    // Validate project data exists
    if (!projectData) {
      toast.error("Project data not available")
      return
    }

    // Extract db_project_id, project_number, gcp_project_id, and dataset_name
    const db_project_id = parseInt(projectData.id)
    const project_number = projectData.bigQueryColumn?.googleCloudProjectNumber
    const gcp_project_id = projectData.bigQueryColumn?.googleCloudProjectId
    const dataset_name = projectData.datasetName

    // Validate all values exist
    if (!project_number) {
      toast.error(
        "GCP project number not configured. Please configure your GCP credentials.",
      )
      return
    }

    if (!gcp_project_id) {
      toast.error(
        "GCP project ID not configured. Please configure your GCP credentials.",
      )
      return
    }

    if (!dataset_name) {
      toast.error(
        "Dataset name not configured. Please configure your dataset name.",
      )
      return
    }

    if (isNaN(db_project_id)) {
      toast.error("Invalid project ID")
      return
    }

    setIsSyncing(true)
    try {
      await syncRoutesMutation.mutateAsync({
        db_project_id,
        project_number,
        gcp_project_id,
        dataset_name,
      })

      // Show simple success message
      toast.success("Routes synced successfully")
    } catch (error) {
      // Extract error message
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to sync routes. Please check your GCP credentials and try again."

      // Provide helpful guidance for common errors
      if (
        errorMessage.toLowerCase().includes("credential") ||
        errorMessage.toLowerCase().includes("gcp") ||
        errorMessage.toLowerCase().includes("google") ||
        errorMessage.toLowerCase().includes("project")
      ) {
        toast.error(
          `${errorMessage} Please ensure your GCP credentials are correctly configured.`,
        )
      } else {
        toast.error(errorMessage)
      }
    } finally {
      setIsSyncing(false)
    }
  }

  return {
    isSyncing: isSyncing || syncRoutesMutation.isPending,
    handleGlobalSync,
  }
}
