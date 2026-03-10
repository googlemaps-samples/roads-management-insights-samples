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

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useMemo } from "react"

import { RoadPriority } from "../constants/road-priorities"
import {
  bigqueryApi,
  googleRoutesApi,
  placesApi,
  polygonsApi,
  projectsApi,
  pubsubApi,
  roadsApi,
  routesApi,
  usersApi,
} from "../data/api"
import { syncApi } from "../data/api/sync-api"
import { useLayerStore } from "../stores/layer-store"
import {
  Project,
  Road,
  Route,
  useProjectWorkspaceStore,
} from "../stores/project-workspace-store"
import { useUserPreferencesStore } from "../stores/user-preferences-store"
import { UserPreferencesUpdate } from "../types/user"
import { getGoogleMapsApiKey } from "../utils/api-helpers"
import { captureCompressedMapSnapshot } from "../utils/map-snapshot"
import { toast } from "../utils/toast"

// Query keys
export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  gcpProjects: ["gcpProjects"] as const,
  routes: (projectId: string) => ["routes", projectId] as const,
  route: (id: string) => ["route", id] as const,
  routeTags: (projectId: string) => ["routeTags", projectId] as const,
  routeCount: (projectId: string) => ["routeCount", projectId] as const,
  routeCounts: (projectIds: string[]) =>
    ["routeCounts", projectIds.slice().sort().join(",")] as const,
  routesSummary: (projectId: string) => ["routesSummary", projectId] as const,
  roads: (routeId: string) => ["roads", routeId] as const,
  roadsNetwork: (projectId: string) => ["roadsNetwork", projectId] as const,
  cutPoints: (routeId: string) => ["cutPoints", routeId] as const,
  polygons: (projectId: string) => ["polygons", projectId] as const,
  userPreferences: ["userPreferences"] as const,
  placesAutocomplete: (input: string) =>
    ["places", "autocomplete", input] as const,
  placeDetails: (placeId: string) => ["places", "details", placeId] as const,
  bigqueryDatasets: (projectId: string) =>
    ["bigquery", "datasets", projectId] as const,
}

// Projects hooks
// used
export const useProjects = () => {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: async () => {
      const response = await projectsApi.getAll()
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Get GCP projects list
export const useGcpProjects = () => {
  return useQuery({
    queryKey: queryKeys.gcpProjects,
    queryFn: async () => {
      const response = await projectsApi.getGcpProjects()
      // Don't throw on error - we want to handle it in the component
      // to show manual entry option
      return response
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: false, // Don't retry automatically - let user retry manually
  })
}

// Verify project details
export const useVerifyProjectDetails = () => {
  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await projectsApi.verifyProjectDetails(projectId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
  })
}

// Get BigQuery datasets for a GCP project
export const useBigQueryDatasets = (projectId: string | undefined) => {
  return useQuery({
    queryKey: projectId
      ? queryKeys.bigqueryDatasets(projectId)
      : ["bigquery", "datasets", "disabled"],
    queryFn: async () => {
      if (!projectId) throw new Error("Project ID is required")
      const response = await bigqueryApi.getDatasets(projectId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled: !!projectId && projectId.trim().length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry automatically - let user retry manually
  })
}

// Get routes summary for a project
export const useRoutesSummary = (projectId: string | undefined) => {
  return useQuery({
    queryKey: projectId
      ? queryKeys.routesSummary(projectId)
      : ["routesSummary"],
    queryFn: async () => {
      if (!projectId) throw new Error("Project ID is required")
      const response = await projectsApi.getRoutesSummary(projectId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled: !!projectId,
    staleTime: 30 * 1000, // 30 seconds
  })
}

// Get routes summary for all projects (syncable items)
export const useAllProjectsRoutesSummary = (projectIds: string[]) => {
  return useQuery({
    queryKey: ["routesSummary", projectIds.slice().sort().join(",")],
    queryFn: async () => {
      // Fetch routes-summary for all projects in parallel
      const summaries = await Promise.all(
        projectIds.map(async (projectId) => {
          try {
            const response = await projectsApi.getRoutesSummary(projectId)
            if (response.success) {
              return { projectId, summary: response.data }
            }
            return { projectId, summary: { total: 0, deleted: 0, added: 0 } }
          } catch (error) {
            console.error(
              `Error fetching routes summary for project ${projectId}:`,
              error,
            )
            return { projectId, summary: { total: 0, deleted: 0, added: 0 } }
          }
        }),
      )

      // Convert to a map for easy lookup
      const summaryMap: Record<
        string,
        { total: number; deleted: number; added: number }
      > = {}
      summaries.forEach(({ projectId, summary }) => {
        summaryMap[projectId] = summary
      })

      return summaryMap
    },
    enabled: projectIds.length > 0,
    staleTime: 1 * 60 * 1000, // 1 minute
  })
}

//unused
export const useProject = (projectId: string) => {
  return useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: async () => {
      const response = await projectsApi.getById(projectId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  })
}

//used
export const useCreateProject = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      projectData: Omit<Project, "id" | "createdAt" | "updatedAt">,
    ) => {
      const response = await projectsApi.create(projectData)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.gcpProjects })
    },
  })
}

export const useUpdateProject = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      updates,
    }: {
      projectId: string
      updates: Partial<Project>
    }) => {
      const response = await projectsApi.update(projectId, updates)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({
        queryKey: queryKeys.project(variables.projectId),
      })
    },
  })
}

export const useDeleteProject = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await projectsApi.delete(projectId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.gcpProjects })
    },
  })
}

// Routes hooks
// NOTE: useRoutes has been removed - use useInfiniteRoutes for paginated data,
// useRouteTags for tags/counts, or useRouteCount for simple count checks

// Infinite scroll routes hook with search and tag filtering
export const useInfiniteRoutes = (
  projectId: string,
  searchQuery: string,
  currentFolder: string | null,
  sortBy?: "name" | "distance" | "created_at" | "match_percentage",
  routeTypes?: ("imported" | "drawn" | "uploaded")[],
) => {
  return useInfiniteQuery({
    queryKey: [
      "routes-infinite",
      projectId,
      searchQuery,
      currentFolder,
      sortBy,
      routeTypes,
    ],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await routesApi.getByProjectPaginated(
        projectId,
        pageParam,
        20,
        searchQuery || undefined,
        currentFolder !== null ? currentFolder : undefined,
        sortBy,
        routeTypes,
      )

      if (!response.success) {
        throw new Error(response.message)
      }

      return response.data
    },
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.hasMore
        ? lastPage.pagination.page + 1
        : undefined
    },
    enabled: !!projectId && currentFolder !== null,
    staleTime: 2 * 60 * 1000, // 2 minutes
    initialPageParam: 1,
  })
}

// Infinite scroll routes hook with ID-based pagination (target route first)
export const useInfiniteRoutesById = (
  projectId: string,
  currentFolder: string | null,
  targetRouteId: string | null,
  sortBy?: "name" | "distance" | "created_at" | "match_percentage",
  routeTypes?: ("imported" | "drawn" | "uploaded")[],
) => {
  return useInfiniteQuery({
    queryKey: [
      "routes-infinite-by-id",
      projectId,
      currentFolder,
      targetRouteId,
      sortBy,
      routeTypes,
    ],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await routesApi.getByProjectPaginatedById(
        projectId,
        targetRouteId,
        pageParam,
        20,
        currentFolder !== null ? currentFolder : undefined,
        sortBy,
        routeTypes,
      )

      if (!response.success) {
        throw new Error(response.message)
      }

      return response.data
    },
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.hasMore
        ? lastPage.pagination.page + 1
        : undefined
    },
    enabled: !!projectId && currentFolder !== null,
    staleTime: 2 * 60 * 1000, // 2 minutes
    initialPageParam: 1,
  })
}

// Unified search hook (routes + segments) with infinite scroll
export const useUnifiedSearch = (
  projectId: string,
  searchQuery: string,
  currentFolder: string | null,
  routeTypes?: ("imported" | "drawn" | "uploaded")[],
) => {
  return useInfiniteQuery({
    queryKey: [
      "routes-unified-search",
      projectId,
      searchQuery,
      currentFolder,
      routeTypes,
    ],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await routesApi.searchUnified(
        projectId,
        searchQuery,
        currentFolder !== null ? currentFolder : undefined,
        pageParam,
        20,
        routeTypes,
      )

      if (!response.success) {
        throw new Error(response.message)
      }

      return response.data
    },
    getNextPageParam: (lastPage) => {
      return lastPage.pagination.hasMore
        ? lastPage.pagination.page + 1
        : undefined
    },
    enabled:
      !!projectId &&
      currentFolder !== null &&
      !!searchQuery &&
      searchQuery.trim().length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
    initialPageParam: 1,
  })
}

export const useRoute = (routeId: string) => {
  const data = useQuery({
    queryKey: queryKeys.route(routeId),
    queryFn: async () => {
      const response = await routesApi.getById(routeId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled: !!routeId,
    staleTime: 2 * 60 * 1000,
  })
  return data
}

// Hook to select a route - fetches from API if not in store (for panel selections)
// Routes clicked from map tiles use tile data (handled in UnifiedProjectMap)
export const useSelectRoute = () => {
  const { routes, addRoute, selectRoute } = useProjectWorkspaceStore()
  const queryClient = useQueryClient()

  return async (routeId: string) => {
    try {
      console.log("🔍 Selecting route:", routeId)

      // Always invalidate and refetch to ensure we have the latest data
      // This is especially important after segmentation or save operations
      queryClient.invalidateQueries({
        queryKey: queryKeys.route(routeId),
      })

      // Fetch fresh data from API
      console.log("📡 Fetching route from API to ensure latest data")

      const response = await routesApi.getById(routeId)
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to fetch route")
      }

      const route = response.data

      // Update cache with fresh data
      queryClient.setQueryData(queryKeys.route(routeId), route)

      // Check if route exists in store, update it, otherwise add it
      const existingRoute = routes.find((r) => r.id === routeId)
      if (existingRoute) {
        // Update existing route with fresh data
        const { updateRoute } = useProjectWorkspaceStore.getState()
        updateRoute(routeId, route)
      } else {
        addRoute(route)
      }

      // Now select it - this will trigger the highlighting
      selectRoute(routeId)
    } catch (error) {
      console.error("❌ Failed to fetch route for selection:", error)
      throw error
    }
  }
}

// Get route tags with counts for a project
export const useRouteTags = (projectId: string) => {
  return useQuery({
    queryKey: queryKeys.routeTags(projectId),
    queryFn: async () => {
      const response = await routesApi.getProjectTags(projectId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

// Get route count for a project (lightweight check for splash screen)
export const useRouteCount = (projectId: string) => {
  return useQuery({
    queryKey: queryKeys.routeCount(projectId),
    queryFn: async () => {
      const response = await routesApi.getProjectRouteCount(projectId)
      if (!response.success) throw new Error(response.message)
      return response.data.count
    },
    enabled: !!projectId,
    staleTime: 1 * 60 * 1000, // 1 minute (can be shorter since it's lightweight)
  })
}

export const useAllProjectRouteCounts = (projectIds: string[]) => {
  return useQuery({
    queryKey: queryKeys.routeCounts(projectIds),
    queryFn: async () => {
      const response = await routesApi.getProjectsRouteCounts(projectIds)
      if (!response.success) throw new Error(response.message)
      // Backend returns string keys matching project IDs
      return response.data
    },
    enabled: projectIds.length > 0,
    staleTime: 1 * 60 * 1000, // 1 minute
  })
}

export const useCreateRoute = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      routeData: Omit<Route, "id" | "createdAt" | "updatedAt">,
    ) => {
      const response = await routesApi.create(routeData)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.routes(data.projectId),
      })
    },
  })
}

export const useUpdateRoute = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      routeId,
      updates,
    }: {
      routeId: string
      updates: Partial<Route>
    }) => {
      // If route name is being updated, reset sync_status to 'unsynced'
      const updatesWithSyncStatus = updates.name
        ? { ...updates, sync_status: "unsynced" as const }
        : updates

      const response = await routesApi.update(routeId, updatesWithSyncStatus)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: (data, variables) => {
      if (data) {
        // Invalidate routes list for the project
        queryClient.invalidateQueries({
          queryKey: queryKeys.routes(data.projectId),
        })
        // CRITICAL: Also invalidate infinite routes query (used in routes view)
        queryClient.invalidateQueries({
          queryKey: ["routes-infinite", data.projectId],
        })
        // Invalidate specific route query
        queryClient.invalidateQueries({
          queryKey: queryKeys.route(variables.routeId),
        })

        // Optimistically update the route in the cache
        queryClient.setQueryData(queryKeys.route(variables.routeId), data)

        //invalidate the routes tiles timestamp
        const refreshRoutesTilesTimestamp =
          useLayerStore.getState().refreshRoutesTilesTimestamp
        refreshRoutesTilesTimestamp()

        // Invalidate routes summary if sync status might have changed (e.g., name update)
        if (variables.updates.name || variables.updates.sync_status) {
          queryClient.invalidateQueries({ queryKey: ["routesSummary"] })
        }

        // Also update the routes list cache
        queryClient.setQueryData(
          queryKeys.routes(data.projectId),
          (oldData: Route[] | undefined) => {
            if (!oldData) return oldData
            return oldData.map((route) =>
              route.id === variables.routeId ? { ...route, ...data } : route,
            )
          },
        )

        // Optimistically update infinite routes cache if it exists
        queryClient.setQueriesData<{
          pages: Array<{
            routes: Route[]
            pagination: {
              total: number
              page: number
              limit: number
              hasMore: boolean
            }
          }>
        }>({ queryKey: ["routes-infinite", data.projectId] }, (oldData) => {
          if (!oldData || !oldData.pages) return oldData
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              routes: page.routes.map((route) =>
                route.id === variables.routeId ? { ...route, ...data } : route,
              ),
            })),
          }
        })

        // Show success toast
        if (variables.updates.name) {
          toast.success("Route name updated successfully", { duration: 2000 })
        } else {
          toast.success("Route updated successfully", { duration: 2000 })
        }
      }
    },
  })
}

export const useDeleteRoute = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (routeId: string) => {
      const response = await routesApi.delete(routeId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      // Invalidate all route queries since we don't know which project
      queryClient.invalidateQueries({ queryKey: ["routes"] })
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

      // Refresh tiles timestamp to force tile cache invalidation
      const refreshRoutesTilesTimestamp =
        useLayerStore.getState().refreshRoutesTilesTimestamp
      refreshRoutesTilesTimestamp()

      // Show success toast
      toast.success("Route deleted successfully", { duration: 2000 })
    },
  })
}

export const useBatchDeleteRoutes = (projectId?: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (routeIds: string[]) => {
      const response = await routesApi.batchSoftDelete(routeIds)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      // Invalidate routes-infinite and routeTags queries
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

      // If projectId is provided, also invalidate project-specific queries
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: ["routes-infinite", projectId],
        })
        queryClient.invalidateQueries({
          queryKey: queryKeys.routeTags(projectId),
        })
        queryClient.invalidateQueries({
          queryKey: queryKeys.routesSummary(projectId),
        })
      }

      // invaliddate the route tiles too
      const refreshRoutesTilesTimestamp =
        useLayerStore.getState().refreshRoutesTilesTimestamp
      refreshRoutesTilesTimestamp()
    },
  })
}

export const useBatchMoveRoutes = (projectId?: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      routeIds,
      tag,
    }: {
      routeIds: string[]
      tag: string | null
    }) => {
      const response = await routesApi.batchMove(routeIds, tag)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      // Invalidate routes-infinite and routeTags queries
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

      // If projectId is provided, also invalidate project-specific queries
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: ["routes-infinite", projectId],
        })
        queryClient.invalidateQueries({
          queryKey: queryKeys.routeTags(projectId),
        })
        queryClient.invalidateQueries({
          queryKey: queryKeys.routesSummary(projectId),
        })
      }
    },
  })
}

export const useUnsyncRoute = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (routeId: string) => {
      const response = await routesApi.unsync(routeId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.routes(data.projectId),
        })
        queryClient.invalidateQueries({ queryKey: queryKeys.route(data.id) })
        queryClient.invalidateQueries({ queryKey: ["routesSummary"] })
      }
    },
  })
}

export const useSyncRoutes = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      db_project_id,
      project_number,
      gcp_project_id,
      dataset_name,
    }: {
      db_project_id: number
      project_number: string
      gcp_project_id: string
      dataset_name: string
    }) => {
      const { syncApi } = await import("../data/api/sync-api")
      const response = await syncApi.syncProject(
        db_project_id,
        project_number,
        gcp_project_id,
        dataset_name,
      )

      if (response.status === "error") {
        throw new Error(response.message)
      }

      return response
    },
    onSuccess: (data) => {
      // Invalidate queries if there were any sync operations
      const details = data.details || {}
      const hasSyncOperations =
        (details.bq_updates && details.bq_updates > 0) ||
        (details.validating_routes && details.validating_routes > 0) ||
        (details.previously_validated_routes &&
          details.previously_validated_routes > 0) ||
        (details.fetched_from_api && details.fetched_from_api > 0) ||
        (details.skipped_from_api && details.skipped_from_api > 0)

      if (hasSyncOperations) {
        // Invalidate routes-infinite queries
        queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
        // Invalidate route queries
        queryClient.invalidateQueries({ queryKey: ["route"] })
        queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

        // Refresh tiles timestamp to refresh route tiles
        const refreshRoutesTilesTimestamp =
          useLayerStore.getState().refreshRoutesTilesTimestamp
        refreshRoutesTilesTimestamp()
      }
    },
  })
}

export const useSyncProject = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      db_project_id,
      project_number,
      gcp_project_id,
      dataset_name,
    }: {
      db_project_id: number
      project_number: string
      gcp_project_id: string
      dataset_name: string
    }) => {
      const response = await syncApi.syncProject(
        db_project_id,
        project_number,
        gcp_project_id,
        dataset_name,
      )

      if (response.status === "error") {
        throw new Error(response.message)
      }

      return response
    },
    onSuccess: async (data) => {
      // Invalidate all route queries
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["route"] })
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

      // Refresh tiles timestamp
      const refreshRoutesTilesTimestamp =
        useLayerStore.getState().refreshRoutesTilesTimestamp
      refreshRoutesTilesTimestamp()

      // Show success toast with stats
      const details = data.details
      let message = `Routes synced successfully.`

      if (details.message === "Running in view mode.") {
        toast.info("This project is in view-only mode. Syncing is disabled.", {
          duration: 5000,
        })
      } else {
        toast.success(message, { duration: 5000 })
      }

      // Save snapshot after 2 seconds delay
      const projectId = useProjectWorkspaceStore.getState().projectId
      if (projectId) {
        setTimeout(async () => {
          try {
            console.log("📸 Saving map snapshot after sync...")
            const mapSnapshot = await captureCompressedMapSnapshot("main-map")
            await projectsApi.updateSnapshot(projectId, mapSnapshot)
            await queryClient.invalidateQueries({
              queryKey: queryKeys.projects,
            })
            console.log("✅ Map snapshot saved successfully after sync")
          } catch (error) {
            console.error("❌ Failed to save map snapshot after sync:", error)
            // Don't fail silently, but don't block the UI
          }
        }, 2000)
      }
    },
    onError: (error) => {
      toast.error(
        `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        { duration: 5000 },
      )
    },
  })
}

export const useSyncFolder = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      db_project_id,
      project_number,
      gcp_project_id,
      dataset_name,
      tag,
    }: {
      db_project_id: number
      project_number: string
      gcp_project_id: string
      dataset_name: string
      tag: string
    }) => {
      const response = await syncApi.syncFolder(
        db_project_id,
        project_number,
        gcp_project_id,
        dataset_name,
        tag,
      )

      if (response.status === "error") {
        throw new Error(response.message)
      }

      return response
    },
    onSuccess: async (data) => {
      // Invalidate route queries
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["route"] })
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

      // Refresh tiles timestamp
      const refreshRoutesTilesTimestamp =
        useLayerStore.getState().refreshRoutesTilesTimestamp
      refreshRoutesTilesTimestamp()

      // Show success toast with stats
      const details = data.details
      if (details.message === "Running in view mode.") {
        toast.info("This project is in view-only mode. Syncing is disabled.", {
          duration: 5000,
        })
        return
      }
      let message = "Folder synced."
      if (details.previously_validated_routes !== undefined) {
        message += ` Validated: ${details.previously_validated_routes},`
      }
      if (details.validating_routes !== undefined) {
        message += ` Validating: ${details.validating_routes}`
      }
      toast.success(message, { duration: 5000 })

      // Save snapshot after 2 seconds delay
      const projectId = useProjectWorkspaceStore.getState().projectId
      if (projectId) {
        setTimeout(async () => {
          try {
            console.log("📸 Saving map snapshot after folder sync...")
            const mapSnapshot = await captureCompressedMapSnapshot("main-map")
            await projectsApi.updateSnapshot(projectId, mapSnapshot)
            await queryClient.invalidateQueries({
              queryKey: queryKeys.projects,
            })
            console.log("✅ Map snapshot saved successfully after folder sync")
          } catch (error) {
            console.error(
              "❌ Failed to save map snapshot after folder sync:",
              error,
            )
            // Don't fail silently, but don't block the UI
          }
        }, 2000)
      }
    },
    onError: (error) => {
      toast.error(
        `Folder sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        { duration: 5000 },
      )
    },
  })
}

export const useSyncRoute = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      db_project_id,
      project_number,
      gcp_project_id,
      dataset_name,
      uuid,
    }: {
      db_project_id: number
      project_number: string
      gcp_project_id: string
      dataset_name: string
      uuid: string
    }) => {
      const response = await syncApi.syncRoute(
        db_project_id,
        project_number,
        gcp_project_id,
        dataset_name,
        uuid,
      )

      if (response.status === "error") {
        throw new Error(response.message)
      }

      return response
    },
    onSuccess: async (data) => {
      // Invalidate route queries
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["route"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

      // Refresh tiles timestamp
      const refreshRoutesTilesTimestamp =
        useLayerStore.getState().refreshRoutesTilesTimestamp
      refreshRoutesTilesTimestamp()

      // Show toast based on actual outcome (details may indicate error for single-route sync)
      const details = data.details as { status?: string; message?: string }
      if (details.message === "Running in view mode.") {
        toast.info("This project is in view-only mode. Syncing is disabled.", {
          duration: 5000,
        })
        return
      }

      if (details.status === "error") {
        toast.error(details.message ?? "Route sync failed", { duration: 5000 })
        return
      }

      if (details.message) {
        toast.success(details.message, { duration: 5000 })
      } else {
        toast.success("Route synced successfully", { duration: 5000 })
      }

      // Save snapshot after 2 seconds delay
      const projectId = useProjectWorkspaceStore.getState().projectId
      if (projectId) {
        setTimeout(async () => {
          try {
            console.log("📸 Saving map snapshot after route sync...")
            const mapSnapshot = await captureCompressedMapSnapshot("main-map")
            await projectsApi.updateSnapshot(projectId, mapSnapshot)
            await queryClient.invalidateQueries({
              queryKey: queryKeys.projects,
            })
            console.log("✅ Map snapshot saved successfully after route sync")
          } catch (error) {
            console.error(
              "❌ Failed to save map snapshot after route sync:",
              error,
            )
            // Don't fail silently, but don't block the UI
          }
        }, 2000)
      }
    },
    onError: (error) => {
      toast.error(
        `Route sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        { duration: 5000 },
      )
    },
  })
}

export const useSaveRoute = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: routesApi.save,
    onSuccess: async (_data, variables) => {
      const routeId = variables.uuid
      const projectId = variables.region_id.toString()

      console.log("🔄 Invalidating all route-related caches after save...")

      // Invalidate ALL route-related queries comprehensively
      queryClient.invalidateQueries({ queryKey: ["routes"] })
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["route"] }) // All individual route queries
      queryClient.invalidateQueries({ queryKey: queryKeys.route(routeId) }) // Specific route
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

      // Remove from cache to force fresh fetch
      queryClient.removeQueries({
        queryKey: queryKeys.route(routeId),
      })

      // Refresh tiles timestamp to force tile cache invalidation
      const refreshRoutesTilesTimestamp =
        useLayerStore.getState().refreshRoutesTilesTimestamp
      refreshRoutesTilesTimestamp()

      // CRITICAL: Fetch the updated route and update Zustand store immediately
      // This ensures the store has the latest data (including segments) when route is selected
      try {
        const routeResponse = await routesApi.getById(routeId)
        if (routeResponse.success && routeResponse.data) {
          const { addRoute, updateRoute } = useProjectWorkspaceStore.getState()

          // Update cache with fresh data
          queryClient.setQueryData(queryKeys.route(routeId), routeResponse.data)

          // Check if route exists in store, update it, otherwise add it
          const existingRoute = useProjectWorkspaceStore
            .getState()
            .routes.find((r) => r.id === routeId)

          if (existingRoute) {
            // Update route in store with fresh data (preserves segments if they exist)
            updateRoute(routeId, routeResponse.data)
          } else {
            addRoute(routeResponse.data)
          }

          // If this route is currently selected, update selectedRoute too
          const selectedRoute =
            useProjectWorkspaceStore.getState().selectedRoute
          if (selectedRoute?.id === routeId) {
            updateRoute(routeId, routeResponse.data)
          }

          console.log(
            "✅ Route saved - store and cache updated with fresh data",
          )
        }
      } catch (error) {
        console.error("Failed to refetch route after save:", error)
        // Don't block the flow if refetch fails - invalidation will handle it
      }

      console.log(
        "✅ Route saved successfully - all caches cleared and route updated",
      )

      // Show success toast
      toast.success("Route saved successfully", { duration: 2000 })

      2000 // Save snapshot after 2 seconds delay
      setTimeout(async () => {
        try {
          console.log("📸 Saving map snapshot after route save...")
          const mapSnapshot = await captureCompressedMapSnapshot("main-map")
          await projectsApi.updateSnapshot(projectId, mapSnapshot)
          await queryClient.invalidateQueries({ queryKey: queryKeys.projects })
          console.log("✅ Map snapshot saved successfully after route save")
        } catch (error) {
          console.error(
            "❌ Failed to save map snapshot after route save:",
            error,
          )
          // Don't fail silently, but don't block the UI
        }
      }, 2000)
    },
    onError: (error) => {
      console.error("❌ Failed to save route:", error)
      toast.error(
        `Failed to save route: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    },
  })
}

export interface BatchSaveRoutesRequest {
  projectId: string
  tag: string
  roads: Array<{
    id: string
    name?: string
    length?: number
    linestringGeoJson?: GeoJSON.LineString
    encodedPolyline?: string // Google-encoded polyline string (preferred over linestringGeoJson)
    originalRouteGeoJson?: GeoJSON.Feature | GeoJSON.FeatureCollection
    origin: [number, number] // [lng, lat]
    destination: [number, number] // [lng, lat]
    waypoints?: [number, number][] // [[lng, lat], ...]
    matchPercentage?: number // Similarity/match percentage (0-100)
  }>
}

export interface BatchSaveRoutesResponse {
  savedCount: number
  errors: Array<{ roadId: string; message: string }>
  message?: string
}

export const useBatchSaveRoutesFromSelection = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      tag,
      roads,
    }: BatchSaveRoutesRequest): Promise<BatchSaveRoutesResponse> => {
      if (!projectId) {
        throw new Error("Project ID is required for batch saving routes.")
      }

      const response = await routesApi.batchSave({
        project_id: projectId,
        tag,
        roads,
      })

      if (!response.success) {
        throw new Error(response.message || "Failed to batch save routes.")
      }

      return {
        savedCount: response.data?.savedCount ?? 0,
        errors: response.data?.errors ?? [],
        message: response.message,
      }
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["routes"] })
      queryClient.invalidateQueries({ queryKey: ["roadsNetwork"] })
      queryClient.invalidateQueries({ queryKey: ["roads"] })
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

      // Refresh tiles timestamp to force tile cache invalidation
      const refreshRoutesTilesTimestamp =
        useLayerStore.getState().refreshRoutesTilesTimestamp
      refreshRoutesTilesTimestamp()

      // Show success toast
      const savedCount = _data.savedCount
      const errorCount = _data.errors?.length || 0
      if (savedCount > 0) {
        if (errorCount > 0) {
          toast.success(
            `Batch save completed: ${savedCount} route${savedCount > 1 ? "s" : ""} saved, ${errorCount} error${errorCount > 1 ? "s" : ""}`,
            { duration: 2000 },
          )
        } else {
          toast.success(
            `${savedCount} route${savedCount > 1 ? "s" : ""} saved successfully`,
            { duration: 2000 },
          )
        }
      }

      // Save snapshot after 2 seconds delay
      const projectId = variables.projectId
      if (projectId) {
        setTimeout(async () => {
          try {
            console.log("📸 Saving map snapshot after batch save...")
            const mapSnapshot = await captureCompressedMapSnapshot("main-map")
            await projectsApi.updateSnapshot(projectId, mapSnapshot)
            await queryClient.invalidateQueries({
              queryKey: queryKeys.projects,
            })
            console.log("✅ Map snapshot saved successfully after batch save")
          } catch (error) {
            console.error(
              "❌ Failed to save map snapshot after batch save:",
              error,
            )
            // Don't fail silently, but don't block the UI
          }
        }, 2000)
      }
    },
  })
}

// Project tags hook
export const useProjectTags = (projectId: string) => {
  return useQuery({
    queryKey: ["project-tags", projectId],
    queryFn: async () => {
      const response = await routesApi.getProjectTags(projectId)
      if (!response.success) throw new Error(response.message)
      // Return just the tags array for backward compatibility
      return response.data.tags
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  })
}

export interface LassoRoadSelectionParams {
  projectId?: string
  polygon?: GeoJSON.Polygon | null
  priorities: RoadPriority[]
  confirmed?: boolean // Whether user has confirmed the polygon (clicked Done)
}

export const useLassoRoadSelection = ({
  projectId,
  polygon,
  priorities,
  confirmed = false,
}: LassoRoadSelectionParams) => {
  // Memoize the polygon key to prevent unnecessary recalculations
  const polygonKey = useMemo(() => {
    return polygon ? JSON.stringify(polygon.coordinates) : ""
  }, [polygon?.coordinates])

  // Memoize the priorities key
  const prioritiesKey = useMemo(() => {
    return priorities && priorities.length > 0
      ? [...priorities].sort().join(",")
      : "all"
  }, [priorities])

  return useQuery({
    queryKey: ["lasso-road-selection", projectId, polygonKey, prioritiesKey],
    queryFn: async () => {
      if (!projectId || !polygon) return []
      const response = await roadsApi.selectByPolygon({
        project_id: projectId,
        polygon,
        priorities: priorities.length ? priorities : undefined,
      })
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled:
      !!projectId && !!polygon && polygon.coordinates.length > 0 && confirmed,
    staleTime: 2 * 60 * 1000,
    // Add these to prevent unnecessary refetches
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

// Roads hooks
export const useRoads = (routeId: string) => {
  return useQuery({
    queryKey: queryKeys.roads(routeId),
    queryFn: async () => {
      const response = await roadsApi.getByRoute(routeId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled: !!routeId,
    staleTime: 2 * 60 * 1000,
  })
}

export const useCreateRoad = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (roadData: Omit<Road, "id" | "createdAt">) => {
      const response = await roadsApi.create(roadData)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roads(data.routeId) })
    },
  })
}

export const useUpdateRoad = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      roadId,
      updates,
      projectId,
    }: {
      roadId: string
      updates: Partial<Road>
      projectId?: string
    }) => {
      const response = await roadsApi.update(roadId, updates)
      if (!response.success) throw new Error(response.message)
      return { data: response.data, projectId }
    },
    onSuccess: ({ projectId }) => {
      // Invalidate roads network cache to refresh the map
      if (projectId) {
        console.log("invalidating roads network cache")
        queryClient.invalidateQueries({
          queryKey: queryKeys.roadsNetwork(projectId),
        })
      }
      // Also invalidate general roads queries
      console.log("invalidating general roads queries")
      queryClient.invalidateQueries({ queryKey: ["roads"] })
      console.log("✅ Road updated, cache invalidated")
    },
  })
}

export const useDeleteRoad = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      roadId,
      projectId,
    }: {
      roadId: string
      projectId: string
    }) => {
      const response = await roadsApi.delete(roadId)
      if (!response.success) throw new Error(response.message)
      return { success: response.data, projectId }
    },
    onSuccess: ({ projectId }) => {
      // Invalidate roads network cache to refresh the map
      queryClient.invalidateQueries({
        queryKey: queryKeys.roadsNetwork(projectId),
      })
      // Also invalidate general roads queries
      queryClient.invalidateQueries({ queryKey: ["roads"] })

      // Refresh tiles timestamp to force tile cache invalidation
      const refreshRoadsTilesTimestamp =
        useLayerStore.getState().refreshRoadsTilesTimestamp
      refreshRoadsTilesTimestamp()

      console.log("✅ Road deleted, cache invalidated")
    },
  })
}

// Google Routes API hooks
export const useGenerateRoute = () => {
  return useMutation({
    mutationFn: async (params: {
      origin: { lat: number; lng: number }
      destination: { lat: number; lng: number }
      waypoints?: Array<{ lat: number; lng: number }>
    }) => {
      const response = await googleRoutesApi.generateRoute(
        params.origin,
        params.destination,
        params.waypoints,
      )
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onError: (error: Error) => {
      console.error("❌ Failed to generate route:", error)
      toast.error(`Failed to generate route: ${error.message}`)
      // Reset map mode to view
      // useProjectWorkspaceStore.getState().setMapMode("view")
    },
  })
}

// Roads Network hooks
export const useRoadsNetwork = (projectId: string) => {
  return useQuery({
    queryKey: queryKeys.roadsNetwork(projectId),
    queryFn: async () => {
      const response = await roadsApi.getByProject(projectId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled: !!projectId,
    staleTime: 10 * 60 * 1000, // 10 minutes (roads network changes rarely)
  })
}

// Route Segmentation hooks
export const useGetIntersections = () => {
  return useMutation({
    mutationFn: async (
      encodedPolyline: string,
    ): Promise<GeoJSON.FeatureCollection> => {
      const response = await routesApi.getIntersections(encodedPolyline)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
  })
}

export const useApplySegmentation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      routeId,
      data,
    }: {
      routeId: string
      data: {
        type: "manual" | "distance" | "intersections"
        cutPoints?: number[][]
        distanceKm?: number
        segments: any[]
      }
    }) => {
      const response = await routesApi.applySegmentation(routeId, data)
      if (!response.success) throw new Error(response.message)

      // Get the new UUID from response (backend creates new route and soft-deletes old one)
      const newRouteUuid = response.data?.newRouteUuid || routeId

      // Reset sync_status to 'unsynced' for parent route after segmentation
      // Use new UUID since old route is soft-deleted
      try {
        await routesApi.update(newRouteUuid, { sync_status: "unsynced" })
      } catch (error) {
        console.warn("Failed to reset sync_status after segmentation:", error)
      }

      return { ...response.data, oldRouteUuid: routeId, newRouteUuid }
    },
    onSuccess: async (data, variables) => {
      const oldRouteUuid = variables.routeId
      const newRouteUuid = data.newRouteUuid

      console.log("🔄 Route UUID changed after segmentation:", {
        old: oldRouteUuid,
        new: newRouteUuid,
      })

      // Invalidate cut points for old route
      queryClient.invalidateQueries({
        queryKey: queryKeys.cutPoints(oldRouteUuid),
      })

      // Invalidate OLD route queries (route is soft-deleted, but clear cache anyway)
      queryClient.invalidateQueries({
        queryKey: queryKeys.route(oldRouteUuid),
      })
      queryClient.removeQueries({
        queryKey: queryKeys.route(oldRouteUuid),
      })

      // Invalidate routes list (this will refresh with new UUID)
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["routes"] })
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

      // Refresh route tiles timestamp to force tile cache invalidation
      const refreshRoutesTilesTimestamp =
        useLayerStore.getState().refreshRoutesTilesTimestamp
      refreshRoutesTilesTimestamp()

      // CRITICAL: Fetch the NEW route using NEW UUID and update Zustand store
      // The old route is soft-deleted, so we must use the new UUID
      try {
        const routeResponse = await routesApi.getById(newRouteUuid)
        if (routeResponse.success && routeResponse.data) {
          const { addRoute, removeRoute } = useProjectWorkspaceStore.getState()

          // Remove OLD route from store (it's been soft-deleted)
          removeRoute(oldRouteUuid)

          // Update cache with NEW route data
          queryClient.setQueryData(
            queryKeys.route(newRouteUuid),
            routeResponse.data,
          )

          // Add NEW route to store
          addRoute(routeResponse.data)

          // If old route was selected, select the new one
          const selectedRoute =
            useProjectWorkspaceStore.getState().selectedRoute
          if (selectedRoute?.id === oldRouteUuid) {
            useProjectWorkspaceStore.getState().selectRoute(newRouteUuid)
          }

          console.log("✅ Segmentation applied - store updated with new UUID")
        }
      } catch (error) {
        console.error("Failed to refetch route after segmentation:", error)
        // Don't block the flow if refetch fails - invalidation will handle it
      }

      console.log("✅ Segmentation applied - caches invalidated")
    },
  })
}

export const useClearSegmentation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (routeId: string) => {
      const response = await routesApi.clearSegmentation(routeId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: async (_, variables) => {
      console.log("🔄 Invalidating caches after clearing segmentation...")

      // Remove from cache to force fresh fetch
      queryClient.removeQueries({
        queryKey: queryKeys.route(variables),
      })

      // Invalidate route and routes queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.route(variables),
      })
      // Invalidate route queries
      queryClient.invalidateQueries({ queryKey: ["route"] })

      // Invalidate cut points query
      queryClient.invalidateQueries({
        queryKey: ["cut-points"],
      })

      // Invalidate routes list to refresh any route lists
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["routes"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

      // CRITICAL: Fetch the updated route and update Zustand store immediately
      // This prevents the flash of old segments when route is clicked again
      try {
        const routeResponse = await routesApi.getById(variables)
        if (routeResponse.success && routeResponse.data) {
          const { addRoute, updateRoute } = useProjectWorkspaceStore.getState()

          // Update cache with fresh data
          queryClient.setQueryData(
            queryKeys.route(variables),
            routeResponse.data,
          )

          // Check if route exists in store, update it, otherwise add it
          const existingRoute = useProjectWorkspaceStore
            .getState()
            .routes.find((r) => r.id === variables)

          if (existingRoute) {
            // Update route in store to clear segments
            updateRoute(variables, {
              isSegmented: false,
              segments: undefined, // Clear segments
              segmentCount: 0,
              segmentationType: undefined,
            })
          } else {
            addRoute(routeResponse.data)
          }

          // If this route is currently selected, update selectedRoute too
          const selectedRoute =
            useProjectWorkspaceStore.getState().selectedRoute
          if (selectedRoute?.id === variables) {
            updateRoute(variables, {
              isSegmented: false,
              segments: undefined,
              segmentCount: 0,
              segmentationType: undefined,
            })
          }

          console.log("✅ Segmentation cleared - store and cache updated")
        }
      } catch (error) {
        console.error(
          "Failed to refetch route after clearing segmentation:",
          error,
        )
        // Don't block the flow if refetch fails - invalidation will handle it
      }
    },
  })
}

export const useToggleRouteEnabled = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      routeId,
      parentRouteId,
      isEnabled,
      projectId,
    }: {
      routeId: string
      parentRouteId?: string
      isEnabled: boolean
      projectId?: string
    }) => {
      const response = await routesApi.toggleRouteEnabled(routeId, isEnabled)
      if (!response.success) throw new Error(response.message)
      return { routeId, parentRouteId, projectId, isEnabled }
    },
    onMutate: async ({ routeId, parentRouteId, isEnabled }) => {
      console.log("🚀 [onMutate] Starting optimistic update:", {
        routeId,
        parentRouteId,
        isEnabled,
      })

      // Optimistically update the store immediately for instant UI feedback
      const store = useProjectWorkspaceStore.getState()

      console.log("📦 [onMutate] Store state before update:", {
        routesCount: store.routes.length,
        selectedRouteId: store.selectedRoute?.id,
        parentRouteExists: !!store.routes.find((r) => r.id === parentRouteId),
        parentRouteSegmentsBefore: store.routes
          .find((r) => r.id === parentRouteId)
          ?.segments?.map((s) => ({
            uuid: s.uuid,
            is_enabled: s.is_enabled,
          })),
      })

      // Update the segment in the parent route's segments array
      if (parentRouteId) {
        const parentRoute = store.routes.find((r) => r.id === parentRouteId)
        if (parentRoute) {
          // Update segments array
          if (parentRoute.segments) {
            const updatedSegments = parentRoute.segments.map((segment) =>
              segment.uuid === routeId
                ? { ...segment, is_enabled: isEnabled }
                : segment,
            )
            console.log("🔄 [onMutate] Updated segments:", {
              before: parentRoute.segments.map((s) => ({
                uuid: s.uuid,
                is_enabled: s.is_enabled,
              })),
              after: updatedSegments.map((s) => ({
                uuid: s.uuid,
                is_enabled: s.is_enabled,
              })),
              changedSegment: updatedSegments.find((s) => s.uuid === routeId),
            })
            store.updateRoute(parentRouteId, { segments: updatedSegments })
          }

          // Also update roads array if it exists (used as fallback in layer rendering)
          if (parentRoute.roads) {
            const updatedRoads = parentRoute.roads.map((road) =>
              road.routeId === routeId || road.id === routeId
                ? { ...road, is_enabled: isEnabled }
                : road,
            )
            store.updateRoute(parentRouteId, { roads: updatedRoads })
          }
        }

        // Also update selectedRoute if it's the parent route
        if (store.selectedRoute?.id === parentRouteId) {
          const updates: Partial<Route> = {}

          if (store.selectedRoute.segments) {
            updates.segments = store.selectedRoute.segments.map((segment) =>
              segment.uuid === routeId
                ? { ...segment, is_enabled: isEnabled }
                : segment,
            )
          }

          if (store.selectedRoute.roads) {
            updates.roads = store.selectedRoute.roads.map((road) =>
              road.routeId === routeId || road.id === routeId
                ? { ...road, is_enabled: isEnabled }
                : road,
            )
          }

          if (Object.keys(updates).length > 0) {
            console.log("🔄 [onMutate] Updating selectedRoute:", {
              updates,
              selectedRouteSegmentsBefore: store.selectedRoute?.segments?.map(
                (s) => ({
                  uuid: s.uuid,
                  is_enabled: s.is_enabled,
                }),
              ),
            })
            store.updateRoute(parentRouteId, updates)
            // Refresh selectedRoute from updated routes
            const updatedRoute = store.routes.find(
              (r) => r.id === parentRouteId,
            )
            if (updatedRoute) {
              console.log("✅ [onMutate] Setting selectedRoute:", {
                routeId: updatedRoute.id,
                segments: updatedRoute.segments?.map((s) => ({
                  uuid: s.uuid,
                  is_enabled: s.is_enabled,
                })),
              })
              useProjectWorkspaceStore.setState({ selectedRoute: updatedRoute })
            }
          }
        }
      }

      // Log final state
      const finalStore = useProjectWorkspaceStore.getState()
      const finalParentRoute = finalStore.routes.find(
        (r) => r.id === parentRouteId,
      )
      const finalSelectedRoute = finalStore.selectedRoute
      console.log("📦 [onMutate] Store state after update:", {
        routesCount: finalStore.routes.length,
        selectedRouteId: finalStore.selectedRoute?.id,
        parentRouteSegmentsAfter: finalParentRoute?.segments?.map((s) => ({
          uuid: s.uuid,
          is_enabled: s.is_enabled,
        })),
        selectedRouteSegmentsAfter: finalSelectedRoute?.segments?.map((s) => ({
          uuid: s.uuid,
          is_enabled: s.is_enabled,
        })),
        parentRouteReference: finalParentRoute,
        selectedRouteReference: finalSelectedRoute,
        areSameReference: finalParentRoute === finalSelectedRoute,
      })

      // Also update the route itself if it's in the routes array (for standalone segments)
      const route = store.routes.find((r) => r.id === routeId)
      if (route) {
        store.updateRoute(routeId, {
          sync_status: isEnabled ? "unsynced" : "invalid",
        })
      }
    },
    onSuccess: ({ routeId, parentRouteId, projectId }) => {
      // Invalidate the segment route query (the child route that was toggled)
      queryClient.invalidateQueries({
        queryKey: queryKeys.route(routeId),
      })

      if (parentRouteId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.route(parentRouteId),
        })
      }

      // Invalidate routes list for the project (this will refresh all routes including parent)
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.routes(projectId),
        })

        // CRITICAL: Also invalidate infinite routes query (used in routes view)
        queryClient.invalidateQueries({
          queryKey: ["routes-infinite", projectId],
        })

        // Also invalidate roads network to refresh map
        queryClient.invalidateQueries({
          queryKey: queryKeys.roadsNetwork(projectId),
        })

        // Force refetch to ensure UI updates immediately
        queryClient.refetchQueries({
          queryKey: queryKeys.routes(projectId),
        })

        // Force refetch infinite routes query
        queryClient.refetchQueries({
          queryKey: ["routes-infinite", projectId],
        })
      }

      // Invalidate routes summary since toggling segment affects sync status
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })

      console.log(
        "✅ Route enabled status toggled, cache invalidated and refetched",
      )
    },
  })
}

// Polygon ingestion hooks
export interface PolygonIngestRequest {
  project_id: number
  polygon_name: string
  priority_type?: string[]
  geometry: {
    coordinates: Array<{
      latitude: number
      longitude: number
    }>
  }
}

export interface RoadData {
  road_id: number
  segment_order: number
  distance_km: number
  polyline?: {
    type: string
    coordinates: number[][]
  }
  priority: string
}

export interface PolygonIngestResponse {
  roads_of_required_priority: number
  total_roads: number
  roads_skipped: number
  roads_ingested: number
  polygon_id: number
  polygon_geometry: {
    coordinates: Array<{
      latitude: number
      longitude: number
    }>
  }
  roads: RoadData[]
  message: string
  geojson_feature_collection: GeoJSON.FeatureCollection
}

export const useIngestPolygon = () => {
  const queryClient = useQueryClient()
  const apiBaseUrl = import.meta.env.PROD ? "" : "http://localhost:8000"
  return useMutation({
    mutationFn: async (
      data: PolygonIngestRequest,
    ): Promise<PolygonIngestResponse> => {
      const response = await fetch(`${apiBaseUrl}/polygon/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.detail || `HTTP ${response.status}: ${response.statusText}`,
        )
      }

      return response.json()
    },
    onSuccess: (_, variables) => {
      // Invalidate roads network to refresh the map
      queryClient.invalidateQueries({
        queryKey: queryKeys.roadsNetwork(variables.project_id.toString()),
      })
      // Also refresh polygons list for the project
      queryClient.invalidateQueries({
        queryKey: queryKeys.polygons(variables.project_id.toString()),
      })

      // Refresh tiles timestamp to force tile cache invalidation
      const refreshRoadsTilesTimestamp =
        useLayerStore.getState().refreshRoadsTilesTimestamp
      refreshRoadsTilesTimestamp()
    },
  })
}

// Polygons hooks
export const usePolygons = (projectId: string) => {
  return useQuery({
    queryKey: queryKeys.polygons(projectId),
    queryFn: async () => {
      const response = await polygonsApi.getByProject(projectId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export const useCreatePolygon = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (polygonData: {
      project_id: number
      boundary_geojson: string
    }) => {
      const response = await polygonsApi.create(polygonData)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.polygons(variables.project_id.toString()),
      })
    },
  })
}

export const useUpdatePolygon = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      polygonId,
      updates,
    }: {
      polygonId: number
      updates: { boundary_geojson?: string }
    }) => {
      const response = await polygonsApi.update(polygonId, updates)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      // Invalidate all polygon queries since we don't know the project ID
      queryClient.invalidateQueries({
        queryKey: ["polygons"],
      })
    },
  })
}

export const useDeletePolygon = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (polygonId: number) => {
      const response = await polygonsApi.delete(polygonId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      // Invalidate all polygon queries since we don't know the project ID
      queryClient.invalidateQueries({
        queryKey: ["polygons"],
      })
    },
  })
}

// Road Stretch & Multi-select hooks
export const useStretchRoad = () => {
  return useMutation({
    mutationFn: async ({
      roadId,
      projectId,
      priorityList,
    }: {
      roadId: number
      projectId: string
      priorityList: string[]
    }) => {
      // Convert projectId (string) to db_project_id (number)
      const dbProjectId = parseInt(projectId, 10)
      if (isNaN(dbProjectId)) {
        throw new Error(`Invalid project ID: ${projectId}`)
      }

      const response = await roadsApi.stretch(roadId, dbProjectId, priorityList)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
  })
}

export const useValidateRoadContinuity = () => {
  return useMutation({
    mutationFn: async ({
      roadIds,
      projectId,
      gapToleranceMeters,
    }: {
      roadIds: number[]
      projectId: string
      gapToleranceMeters?: number
    }) => {
      const response = await roadsApi.validateContinuity(
        roadIds,
        projectId,
        gapToleranceMeters,
      )
      if (!response.success) throw new Error(response.message)
      return response.data
    },
  })
}

export const useBatchFetchRoads = () => {
  return useMutation({
    mutationFn: async ({
      roadIds,
      projectId,
    }: {
      roadIds: number[]
      projectId: string
    }) => {
      const response = await roadsApi.batchFetch(roadIds, projectId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
  })
}

// PubSub Listener hooks
export const useStartPubSubListener = () => {
  return useMutation({
    mutationFn: async (config: {
      gcp_project_id: string
      project_db_id: number
      gcp_project_number: string
    }) => {
      const response = await pubsubApi.startListener(config)
      if (!response.success) {
        // Check if it's already running (400 error)
        if (response.message?.includes("already running")) {
          console.log("ℹ️ PubSub listener is already active")
          return response.data
        }
        throw new Error(response.message)
      }
      return response.data
    },
    onError: (error) => {
      console.error("❌ Failed to start PubSub listener:", error)
    },
  })
}

export const useStopPubSubListener = () => {
  return useMutation({
    mutationFn: async () => {
      const response = await pubsubApi.stopListener()
      if (!response.success) {
        // Don't throw error for "not running" status - just log it
        if (response.message?.includes("not currently running")) {
          console.log("ℹ️ PubSub listener was not running")
          return response.data
        }
        throw new Error(response.message)
      }
      return response.data
    },
    onError: (error) => {
      console.error("❌ Failed to stop PubSub listener:", error)
    },
  })
}

// User Preferences hooks
export const useUserPreferences = () => {
  const { loadPreferences } = useUserPreferencesStore()

  return useQuery({
    queryKey: queryKeys.userPreferences,
    queryFn: async () => {
      const response = await usersApi.getPreferences()
      if (!response.success) throw new Error(response.message)

      // Update Zustand store
      loadPreferences(response.data)

      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export const useUpdateUserPreferences = () => {
  const queryClient = useQueryClient()
  const { loadPreferences } = useUserPreferencesStore()

  return useMutation({
    mutationFn: async (updates: UserPreferencesUpdate) => {
      const response = await usersApi.updatePreferences(updates)
      if (!response.success) throw new Error(response.message)

      // Update Zustand store
      loadPreferences(response.data)

      return response.data
    },
    onSuccess: () => {
      // Invalidate and refetch preferences
      queryClient.invalidateQueries({ queryKey: queryKeys.userPreferences })
    },
  })
}

// Tag batch operations hooks
export const useRenameTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      dbProjectId,
      tag,
      newTag,
    }: {
      dbProjectId: number
      tag: string
      newTag: string
    }) => {
      const response = await routesApi.renameTag(dbProjectId, tag, newTag)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      console.log("🔄 Invalidating caches after tag rename...")
      // Invalidate routes list
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["routes"] })
      // Invalidate route tags
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })
      console.log("✅ Tag renamed - caches invalidated")
    },
  })
}

export const useMoveTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      dbProjectId,
      tag,
      newTag,
    }: {
      dbProjectId: number
      tag: string
      newTag: string
    }) => {
      const response = await routesApi.moveTag(dbProjectId, tag, newTag)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      console.log("🔄 Invalidating caches after tag move...")
      // Invalidate routes list
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["routes"] })
      // Invalidate route tags
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })
      console.log("✅ Tag moved - caches invalidated")
    },
  })
}

export const useDeleteTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      dbProjectId,
      tag,
    }: {
      dbProjectId: number
      tag: string
    }) => {
      const response = await routesApi.deleteTag(dbProjectId, tag)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      console.log("🔄 Invalidating caches after tag delete...")
      // Invalidate routes list
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["routes"] })
      // Invalidate route tags
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })
      const refreshRoutesTilesTimestamp =
        useLayerStore.getState().refreshRoutesTilesTimestamp
      refreshRoutesTilesTimestamp()
      console.log("✅ Tag deleted - caches invalidated")
    },
  })
}

export const useSegmentTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      dbProjectId,
      tag,
      distanceKm,
    }: {
      dbProjectId: number
      tag: string
      distanceKm: number
    }) => {
      const response = await routesApi.segmentTag(dbProjectId, tag, distanceKm)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      console.log("🔄 Invalidating caches after tag segmentation...")
      // Invalidate routes list
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["routes"] })
      // Invalidate route tags
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      queryClient.invalidateQueries({ queryKey: ["routesSummary"] })
      console.log("✅ Tag segmented - caches invalidated")
    },
  })
}

export const useStretchTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      dbProjectId,
      tag,
    }: {
      dbProjectId: number
      tag: string
    }) => {
      const response = await routesApi.stretchTag(dbProjectId, tag)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    onSuccess: () => {
      console.log("🔄 Invalidating caches after tag stretch...")
      // Invalidate routes list
      queryClient.invalidateQueries({ queryKey: ["routes-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["routes"] })
      // Invalidate route tags
      queryClient.invalidateQueries({ queryKey: ["routeTags"] })
      queryClient.invalidateQueries({ queryKey: ["project-tags"] })
      console.log("✅ Tag stretched - caches invalidated")
    },
  })
}

// Places API hooks (New Places API REST)
export const usePlacesAutocomplete = (
  input: string,
  options?: {
    bounds?: google.maps.LatLngBounds
    location?: google.maps.LatLng
    radius?: number
    enabled?: boolean
  },
) => {
  return useQuery({
    queryKey: queryKeys.placesAutocomplete(input),
    queryFn: async () => {
      const response = await placesApi.autocomplete(input, {
        bounds: options?.bounds,
        location: options?.location,
        radius: options?.radius,
      })
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled:
      (options?.enabled ?? true) &&
      !!input &&
      input.trim().length >= 3 &&
      !!getGoogleMapsApiKey(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  })
}

export const usePlaceDetails = (placeId: string | null) => {
  return useQuery({
    queryKey: queryKeys.placeDetails(placeId || ""),
    queryFn: async () => {
      if (!placeId) throw new Error("Place ID is required")
      const response = await placesApi.getPlaceDetails(placeId)
      if (!response.success) throw new Error(response.message)
      return response.data
    },
    enabled: !!placeId && !!getGoogleMapsApiKey(),
    staleTime: 30 * 60 * 1000, // 30 minutes - place details don't change often
    gcTime: 60 * 60 * 1000, // 1 hour
  })
}
