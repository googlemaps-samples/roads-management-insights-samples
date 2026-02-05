import { Project } from "../../stores/project-workspace-store"

export const transformProject = (dbProject: any): Project => {
  try {
    console.log("Transforming project:", dbProject)

    // Handle geojson parsing
    let boundaryGeoJson
    try {
      // Support both legacy 'geojson' and current 'jurisdiction_boundary_geojson'
      const rawGeo =
        dbProject.jurisdiction_boundary_geojson ?? dbProject.geojson
      boundaryGeoJson = typeof rawGeo === "string" ? JSON.parse(rawGeo) : rawGeo
    } catch (e) {
      console.warn("Failed to parse geojson, using default:", e)
      boundaryGeoJson = {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      }
    }

    // Handle GCP project fields from separate columns
    let bigQueryColumn
    try {
      // Use separate columns directly
      bigQueryColumn = {
        googleCloudProjectId: dbProject.google_cloud_project_id || "",
        googleCloudProjectNumber: dbProject.google_cloud_project_number || "",
        subscriptionId: dbProject.subscription_id || undefined,
      }
    } catch (e) {
      console.warn("Failed to parse GCP project fields, using default:", e)
      bigQueryColumn = {
        googleCloudProjectId: "",
        googleCloudProjectNumber: "",
        subscriptionId: undefined,
      }
    }

    // Handle viewstate parsing
    let viewstate
    if (dbProject.viewstate) {
      try {
        viewstate =
          typeof dbProject.viewstate === "string"
            ? JSON.parse(dbProject.viewstate)
            : dbProject.viewstate
      } catch (e) {
        console.warn("Failed to parse viewstate:", e)
      }
    }

    return {
      id: (dbProject.id ?? dbProject.project_id)?.toString(),
      name: dbProject.project_name || dbProject.name || "Unknown Project",
      boundaryGeoJson,
      bigQueryColumn,
      datasetName: dbProject.dataset_name || undefined,
      viewstate,
      mapSnapshot: dbProject.map_snapshot || undefined,
      createdAt: dbProject.created_at || new Date().toISOString(),
      updatedAt:
        dbProject.updated_at ||
        dbProject.created_at ||
        new Date().toISOString(),
    }
  } catch (error) {
    console.error("Error transforming project:", error, dbProject)
    // Return default values if parsing fails
    return {
      id: dbProject?.id?.toString() || "unknown",
      name: dbProject?.project_name || dbProject?.name || "Unknown Project",
      boundaryGeoJson: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
      bigQueryColumn: {
        googleCloudProjectId: "",
        googleCloudProjectNumber: "",
        subscriptionId: undefined,
      },
      datasetName: dbProject?.dataset_name || undefined,
      createdAt: dbProject.created_at || new Date().toISOString(),
      updatedAt:
        dbProject.updated_at ||
        dbProject.created_at ||
        new Date().toISOString(),
    }
  }
}

