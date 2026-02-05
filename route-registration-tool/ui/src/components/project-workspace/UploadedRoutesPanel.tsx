import { CheckBox, CheckBoxOutlineBlank, Delete } from "@mui/icons-material"
import {
  Box,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material"
import { TextField } from "@mui/material"
import React from "react"

import { AddRowIcon } from "../../assets/images"
import { PRIMARY_RED, PRIMARY_RED_LIGHT } from "../../constants/colors"
import { googleRoutesApi } from "../../data/api/google-routes-api"
import {
  useBatchSaveRoutesFromSelection,
  useDeleteRoute,
  useProjectTags,
} from "../../hooks"
import { useProjectWorkspaceStore } from "../../stores"
import {
  type RouteMarkers,
  type SnappedRoad,
  type UploadedRoute,
  useLayerStore,
} from "../../stores/layer-store"
import { calculateRouteLengthFromCoordinates } from "../../stores/layer-store/utils/geo-math"
import { isPointInBoundary } from "../../utils/boundary-validation"
import {
  convertKmToMiles,
  formatDistance,
  useDistanceUnit,
} from "../../utils/distance-utils"
import { decodePolylineToGeoJSON } from "../../utils/polyline-decoder"
import { calculateRouteSimilarity } from "../../utils/route-similarity"
import { cancelFileProcessing } from "../../utils/route-upload-handler"
import { toast } from "../../utils/toast"
import Button from "../common/Button"
import FloatingSheet from "../common/FloatingSheet"
import Modal from "../common/Modal"
import SearchBar from "../common/SearchBar"
import TagSelector from "../common/TagSelector"
import RouteFilter from "./RouteFilter"
import SelectedRoutePanel from "./SelectedRoutePanel"

interface UploadedRoutesPanelProps {
  className?: string
  style?: React.CSSProperties
}

const UploadedRoutesPanel: React.FC<UploadedRoutesPanelProps> = ({
  className,
  style,
}) => {
  const distanceUnit = useDistanceUnit()
  const {
    projectId,
    setMapMode,
    leftPanelExpanded,
    setLeftPanelExpanded,
    activePanel,
    setActivePanel,
    setSelectedRoutePanelVisible,
    projectData,
    setCurrentFolder,
  } = useProjectWorkspaceStore()
  const batchSaveRoutesMutation = useBatchSaveRoutesFromSelection()
  const deleteRouteMutation = useDeleteRoute()
  const { data: tags = [] } = useProjectTags(projectId || "")

  // Check if we're editing an existing saved route
  const editingSavedRouteId = useLayerStore(
    (state) => state.editingSavedRouteId,
  )
  const setEditingSavedRouteId = useLayerStore(
    (state) => state.setEditingSavedRouteId,
  )

  // Use individual selectors WITHOUT shallow comparison to prevent infinite re-renders
  const uploadedRoutes = useLayerStore((state) => state.uploadedRoutes)

  const routeMarkersLength = useLayerStore(
    (state) => state.snappedRoads.routeMarkers.length,
  )
  const roadsCount = useLayerStore((state) => state.snappedRoads.roads.length)
  const previewRoadsCount = useLayerStore(
    (state) => state.snappedRoads.previewRoads.length,
  )
  const isLoadingSnappedRoads = useLayerStore(
    (state) => state.snappedRoads.isLoading,
  )
  // Track road data hash to detect changes in distance/duration when routes are regenerated
  // Optimized: Track per-route hashes to avoid recalculating all routes when one changes
  // This uses a Map-based approach for O(1) lookups instead of O(n) string concatenation
  const roadsDataHash = useLayerStore((state) => {
    const roads = state.snappedRoads.roads
    const previewRoads = state.snappedRoads.previewRoads

    // Create a Map of routeId -> hash of that route's roads
    // This allows us to detect which specific route changed
    const routeHashes = new Map<string, string>()
    roads.forEach((road) => {
      const routeId = road.uploadedRouteId
      if (!routeId) return
      const existing = routeHashes.get(routeId) || ""
      const roadHash = `${road.id}-${road.feature.properties?.distance || 0}-${road.feature.properties?.duration || 0}`
      routeHashes.set(routeId, existing ? `${existing}|${roadHash}` : roadHash)
    })

    // Create a lightweight hash from the Map
    // Only include route IDs and their hash counts, not full details
    const routeHashEntries = Array.from(routeHashes.entries())
      .map(([routeId, hash]) => `${routeId}:${hash.split("|").length}`)
      .join(",")

    // Preview roads hash - include distance and duration to detect changes
    const previewRouteHashes = new Map<string, string>()
    previewRoads.forEach((road) => {
      const routeId = road.uploadedRouteId
      if (!routeId) return
      const existing = previewRouteHashes.get(routeId) || ""
      const roadHash = `${road.id}-${road.feature.properties?.distance || 0}-${road.feature.properties?.duration || 0}`
      previewRouteHashes.set(
        routeId,
        existing ? `${existing}|${roadHash}` : roadHash,
      )
    })
    const previewHashEntries = Array.from(previewRouteHashes.entries())
      .map(([routeId, hash]) => `${routeId}:${hash.split("|").length}:${hash}`)
      .join(",")

    return `${roads.length}-${previewRoads.length}-${routeHashEntries}-${previewHashEntries}`
  })
  const hasUnsavedChanges = useLayerStore((state) => state.hasUnsavedChanges)
  // Track total waypoints count to detect waypoint changes
  const totalWaypointsCount = useLayerStore((state) => {
    return state.snappedRoads.routeMarkers.reduce(
      (total, marker) => total + (marker.waypoints?.length || 0),
      0,
    )
  })
  const focusOnUploadedRoutes = useLayerStore(
    (state) => state.focusOnUploadedRoutes,
  )
  const setHoveredRouteId = useLayerStore((state) => state.setHoveredRouteId)
  const removeUploadedRoute = useLayerStore(
    (state) => state.removeUploadedRoute,
  )
  const updateUploadedRoute = useLayerStore(
    (state) => state.updateUploadedRoute,
  )
  const removeSnappedRoadsForRoute = useLayerStore(
    (state) => state.removeSnappedRoadsForRoute,
  )
  const removeOptimizedRouteMarkers = useLayerStore(
    (state) => state.removeOptimizedRouteMarkers,
  )
  const clearUploadedRoutes = useLayerStore(
    (state) => state.clearUploadedRoutes,
  )
  const clearSnappedRoads = useLayerStore((state) => state.clearSnappedRoads)
  const clearAllOptimizedRouteMarkers = useLayerStore(
    (state) => state.clearAllOptimizedRouteMarkers,
  )
  const removeWaypoint = useLayerStore((state) => state.removeWaypoint)
  const moveWaypointUp = useLayerStore((state) => state.moveWaypointUp)
  const moveWaypointDown = useLayerStore((state) => state.moveWaypointDown)
  const moveOriginDown = useLayerStore((state) => state.moveOriginDown)
  const moveDestinationUp = useLayerStore((state) => state.moveDestinationUp)
  const selectedUploadedRouteId = useLayerStore(
    (state) => state.selectedUploadedRouteId,
  )
  const setSelectedUploadedRouteId = useLayerStore(
    (state) => state.setSelectedUploadedRouteId,
  )
  const setAddingWaypointMode = useLayerStore(
    (state) => state.setAddingWaypointMode,
  )
  const isAddingWaypoint = useLayerStore((state) => state.isAddingWaypoint)
  const waypointAddingRouteId = useLayerStore(
    (state) => state.waypointAddingRouteId,
  )
  const cancelAddingWaypoint = useLayerStore(
    (state) => state.cancelAddingWaypoint,
  )
  const swapRouteStartEnd = useLayerStore((state) => state.swapRouteStartEnd)
  const addSnappedRoads = useLayerStore((state) => state.addSnappedRoads)
  const setOptimizedRouteMarkers = useLayerStore(
    (state) => state.setOptimizedRouteMarkers,
  )
  const saveRouteChanges = useLayerStore((state) => state.saveRouteChanges)
  const discardRouteChanges = useLayerStore(
    (state) => state.discardRouteChanges,
  )
  const initializeRouteEditing = useLayerStore(
    (state) => state.initializeRouteEditing,
  )

  const [isOpen, setIsOpen] = React.useState(false)
  const [selectedTag, setSelectedTag] = React.useState<string | null>(null)
  const [tagError, setTagError] = React.useState("")
  const [isSaving, setIsSaving] = React.useState(false)
  const [saveSuccess, setSaveSuccess] = React.useState(false)
  const savingToastIdRef = React.useRef<string | number | null>(null)
  const [sortBy, setSortBy] = React.useState<
    "difference" | "distance" | "alphabetical"
  >("difference")
  const [reverseOrder, setReverseOrder] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedRouteIds, setSelectedRouteIds] = React.useState<Set<string>>(
    new Set(),
  )
  const [reversedRouteDialogOpen, setReversedRouteDialogOpen] =
    React.useState(false)
  const [reversedRouteName, setReversedRouteName] = React.useState("")
  const [reversingRouteId, setReversingRouteId] = React.useState<string | null>(
    null,
  )
  const [folderDialogOpen, setFolderDialogOpen] = React.useState(false)
  const [removeOutOfBoundaryDialogOpen, setRemoveOutOfBoundaryDialogOpen] =
    React.useState(false)
  const [removeOver80KmDialogOpen, setRemoveOver80KmDialogOpen] =
    React.useState(false)

  // Function to regenerate route with waypoints
  const regenerateRoute = React.useCallback(async (routeId: string) => {
    // Use requestAnimationFrame to ensure state has updated
    await new Promise((resolve) =>
      requestAnimationFrame(() => resolve(undefined)),
    )

    // Get latest state from store only when needed
    const currentState = useLayerStore.getState()

    // Check if we're in edit mode - use temporary markers if available
    // After saveRouteChanges, editingState should be null, so we'll use regular markers
    const editingState = currentState.getEditingState(routeId)
    const markers =
      editingState?.temporaryMarkers ||
      currentState.snappedRoads.routeMarkers.find((m) => m.routeId === routeId)

    if (!markers) {
      console.warn("No markers found for route:", routeId)
      return
    }

    try {
      // Build waypoints array if they exist
      const waypoints =
        markers.waypoints.length > 0
          ? markers.waypoints
              .sort((a, b) => a.order - b.order)
              .map((wp) => ({
                lat: wp.position.lat,
                lng: wp.position.lng,
              }))
          : []

      // Call Google Routes API using consolidated API
      const apiResponse = await googleRoutesApi.generateRoute(
        markers.startMarker,
        markers.endMarker,
        waypoints,
      )

      if (!apiResponse.success || !apiResponse.data) {
        throw new Error(apiResponse.message || "Failed to generate route")
      }

      const { encodedPolyline, distance, duration } = apiResponse.data
      const decodedGeometry = decodePolylineToGeoJSON(encodedPolyline)

      const routeFeature: GeoJSON.Feature = {
        type: "Feature",
        geometry: decodedGeometry,
        properties: {
          id: `${routeId}-optimized`,
          name: "Optimized Route",
          source: "google_routes_api",
          distance: distance.toFixed(2),
          duration: duration.toFixed(0),
          traffic_aware: true,
          encodedPolyline: encodedPolyline,
        },
      }

      // Validate route is within boundary
      const projectData = useProjectWorkspaceStore.getState().projectData
      const boundary = projectData?.boundaryGeoJson
      if (boundary) {
        // Extract all coordinates from the route
        const coordinates: [number, number][] = []
        if (decodedGeometry.type === "LineString") {
          // LineString coordinates are Position[] which is number[][]
          decodedGeometry.coordinates.forEach((coord) => {
            if (Array.isArray(coord) && coord.length >= 2) {
              coordinates.push([coord[0] as number, coord[1] as number])
            }
          })
        } else if (decodedGeometry.type === "MultiLineString") {
          // MultiLineString coordinates are Position[][]
          decodedGeometry.coordinates.forEach((line) => {
            if (Array.isArray(line)) {
              line.forEach((coord) => {
                if (Array.isArray(coord) && coord.length >= 2) {
                  coordinates.push([coord[0] as number, coord[1] as number])
                }
              })
            }
          })
        }

        // Check if all coordinates are within the boundary
        const { isPointInBoundary } = await import(
          "../../utils/boundary-validation"
        )
        const allWithinBoundary = coordinates.every(([lng, lat]) =>
          isPointInBoundary(lat, lng, boundary),
        )

        if (!allWithinBoundary) {
          // Remove any existing preview roads since validation failed
          if (editingState) {
            currentState.removePreviewRoadsForRoute(routeId)
          }
          toast.error("Route is outside the jurisdiction boundary")
          return
        }
      }

      // Check if we're in edit mode - if so, add to preview roads instead
      // After saveRouteChanges, editingState should be null, so we add regular roads
      if (editingState) {
        // Remove old preview roads and add new one as preview
        currentState.removePreviewRoadsForRoute(routeId)
        currentState.addPreviewRoads(routeId, [routeFeature])
        console.log("🎉 Preview route regenerated successfully!")
      } else {
        // Remove old snapped roads and add new one
        // Also ensure any remaining preview roads are removed (shouldn't happen, but safety check)
        currentState.removePreviewRoadsForRoute(routeId)
        currentState.removeSnappedRoadsForRoute(routeId)
        currentState.addSnappedRoads(routeId, [routeFeature])
        console.log("🎉 Route regenerated successfully!")
      }
    } catch (error) {
      console.error("❌ Failed to regenerate route:", error)
    }
  }, [])

  // Reconstruct snappedRoads object ONLY when lengths/counts change
  // Don't subscribe to the full arrays - fetch them fresh each time from the store
  // This prevents re-renders on every addSnappedRoads call during batch uploads
  const snappedRoads = React.useMemo(() => {
    const currentState = useLayerStore.getState().snappedRoads
    return {
      routeMarkers: currentState.routeMarkers,
      roads: currentState.roads,
      previewRoads: currentState.previewRoads,
      isLoading: currentState.isLoading,
      isVisible: currentState.isVisible,
      isDraggingMarker: currentState.isDraggingMarker,
      hoveredRouteId: currentState.hoveredRouteId,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeMarkersLength,
    roadsCount,
    previewRoadsCount,
    isLoadingSnappedRoads,
    totalWaypointsCount,
    roadsDataHash, // Include roadsDataHash to detect changes in preview roads content (distance/duration)
  ])

  // Show panel when routes are uploaded (only on first routes upload)
  const routesLength = uploadedRoutes.routes.length
  const prevRoutesLengthRef = React.useRef(0)

  // Check if all routes are display-only (e.g., "(Original)" routes for visualization)
  const allRoutesAreDisplayOnly = React.useMemo(
    () =>
      routesLength > 0 &&
      uploadedRoutes.routes.every((route) => route.name.includes("(Original)")),
    [routesLength, uploadedRoutes.routes],
  )

  React.useEffect(() => {
    // Manage panel visibility and active panel state
    // Panel expansion is controlled only by user clicking the toggle button

    // Don't interfere if activePanel is set to saved_routes (user wants to see saved routes)
    if (activePanel === "saved_routes" && routesLength === 0) {
      setIsOpen(false)
      prevRoutesLengthRef.current = 0
      return
    }

    if (
      routesLength === 0 &&
      !editingSavedRouteId &&
      !selectedUploadedRouteId &&
      activePanel === "uploaded_routes"
    ) {
      setIsOpen(false)
      setActivePanel(null)
      prevRoutesLengthRef.current = 0
      return
    }

    if (selectedUploadedRouteId && routesLength > 0) {
      setIsOpen(true)
      setActivePanel("uploaded_routes")
      prevRoutesLengthRef.current = routesLength
      return
    }

    // Keep panel open when going back from selected route (if panel was open and routes exist)
    if (
      !selectedUploadedRouteId &&
      routesLength > 0 &&
      isOpen &&
      !editingSavedRouteId &&
      !allRoutesAreDisplayOnly
    ) {
      setIsOpen(true)
      setActivePanel("uploaded_routes")
    }

    // Open panel if editing a saved route
    if (editingSavedRouteId && routesLength > 0 && !allRoutesAreDisplayOnly) {
      setIsOpen(true)
      setActivePanel("uploaded_routes")
    }
    // Only open if transitioning from 0 to >0 routes and panel is not already open
    // Skip if all routes are display-only (don't open panel for visualization routes)
    if (
      routesLength > 0 &&
      prevRoutesLengthRef.current === 0 &&
      !isOpen &&
      !editingSavedRouteId &&
      !selectedUploadedRouteId &&
      !allRoutesAreDisplayOnly
    ) {
      setIsOpen(true)
      setActivePanel("uploaded_routes")
      setLeftPanelExpanded(true) // Expand panel when routes are first uploaded
    }
    // Keep panel open when routes are added (e.g., when creating reversed routes)
    // Only if panel was already open and routes increased
    if (
      routesLength > prevRoutesLengthRef.current &&
      isOpen &&
      routesLength > 0
    ) {
      setIsOpen(true)
      setActivePanel("uploaded_routes")
    }
    // Keep panel open when routes are deleted (but not to 0)
    // If panel was open and routes decreased (but not to 0), keep it open
    if (
      routesLength < prevRoutesLengthRef.current &&
      isOpen &&
      routesLength > 0 &&
      prevRoutesLengthRef.current > 0
    ) {
      setIsOpen(true)
      setActivePanel("uploaded_routes")
    }
    prevRoutesLengthRef.current = routesLength
  }, [
    routesLength,
    isOpen,
    activePanel,
    setActivePanel,
    setLeftPanelExpanded,
    editingSavedRouteId,
    selectedUploadedRouteId,
    allRoutesAreDisplayOnly,
  ])

  // Clean up abort controllers when routes finish generating
  React.useEffect(() => {
    const currentRoutes = uploadedRoutes.routes.map((r) => r.id)
    const currentSnappedRoads = snappedRoads.roads.map((r) => r.uploadedRouteId)

    // Remove abort controllers for routes that have finished generating (have snapped roads)
    abortControllersRef.current.forEach((_controller, routeId) => {
      if (currentSnappedRoads.includes(routeId)) {
        // Route has finished generating, clean up controller
        abortControllersRef.current.delete(routeId)
      } else if (!currentRoutes.includes(routeId)) {
        // Route was removed, clean up controller
        abortControllersRef.current.delete(routeId)
      }
    })
  }, [uploadedRoutes.routes, snappedRoads.roads])

  // Optimized: Cache route info per routeId to avoid recalculating all routes
  // This uses a ref to store cached route info and only recalculates changed routes
  const routeInfoCacheRef = React.useRef<
    Map<
      string,
      {
        routeId: string
        routeName: string
        distanceKm: number
        calculatedRouteLengthKm: number
        durationMinutes: number
        segmentCount: number
        similarityPercentage: number
        differencePercentage: number
        waypoints: Array<{
          id: string
          position: { lat: number; lng: number }
          order: number
        }>
        isOptimizedRouteWithinBoundary: boolean
        hash: string // Hash to detect changes
      }
    >
  >(new Map())

  // Create a stable hash for route data to detect changes
  const getRouteHash = React.useCallback(
    (
      routeId: string,
      marker: RouteMarkers | undefined,
      googleRoads: SnappedRoad[],
      uploadedRoute: UploadedRoute | undefined,
    ): string => {
      const markerHash = marker
        ? `${marker.startMarker.lat},${marker.startMarker.lng},${marker.endMarker.lat},${marker.endMarker.lng},${(
            marker.waypoints || []
          )
            .sort((a, b) => a.order - b.order)
            .map((wp) => `${wp.position.lat},${wp.position.lng}`)
            .join("|")}`
        : ""
      const roadsHash = googleRoads
        .map(
          (r) =>
            `${r.id}-${r.feature.properties?.distance || 0}-${r.feature.properties?.duration || 0}`,
        )
        .join("|")
      const routeNameHash = uploadedRoute?.name || ""
      return `${routeId}:${markerHash}:${roadsHash}:${routeNameHash}`
    },
    [],
  )

  // Calculate route info for a single route (extracted for reuse)
  const calculateRouteInfo = React.useCallback(
    (
      routeId: string,
      marker: RouteMarkers | undefined,
      googleRoads: SnappedRoad[],
      uploadedRoute: UploadedRoute | undefined,
      boundary:
        | GeoJSON.Polygon
        | GeoJSON.FeatureCollection
        | GeoJSON.Feature<GeoJSON.Polygon>
        | null
        | undefined,
    ) => {
      // Calculate total distance and duration from Google routes
      let totalDistanceKm = 0
      let totalDurationMinutes = 0
      let calculatedRouteLengthKm = 0

      // Extract all coordinates from Google roads to calculate actual route length
      const allRouteCoordinates: [number, number][] = []
      googleRoads.forEach((road) => {
        const distanceStr = road.feature.properties?.distance
        const distanceKm = distanceStr ? parseFloat(distanceStr) : 0
        totalDistanceKm += distanceKm

        const durationStr = road.feature.properties?.duration
        const durationMinutes = durationStr ? parseFloat(durationStr) : 0
        totalDurationMinutes += durationMinutes

        const geometry = road.feature.geometry
        if (geometry.type === "LineString") {
          allRouteCoordinates.push(
            ...(geometry.coordinates as [number, number][]),
          )
        } else if (geometry.type === "MultiLineString") {
          geometry.coordinates.forEach((line) => {
            allRouteCoordinates.push(...(line as [number, number][]))
          })
        }
      })

      // Calculate route length from actual coordinates
      if (allRouteCoordinates.length >= 2) {
        calculatedRouteLengthKm =
          calculateRouteLengthFromCoordinates(allRouteCoordinates)
      } else {
        calculatedRouteLengthKm = totalDistanceKm
      }

      // If no Google roads yet, calculate from uploaded route
      if (googleRoads.length === 0 && uploadedRoute) {
        const extractCoordinates = (
          data: GeoJSON.Feature | GeoJSON.FeatureCollection,
        ): [number, number][] => {
          if (data.type === "FeatureCollection") {
            const allCoords: [number, number][] = []
            data.features.forEach((feature) => {
              if (feature.geometry.type === "LineString") {
                allCoords.push(
                  ...(feature.geometry.coordinates as [number, number][]),
                )
              } else if (feature.geometry.type === "MultiLineString") {
                feature.geometry.coordinates.forEach((line) => {
                  allCoords.push(...(line as [number, number][]))
                })
              }
            })
            return allCoords
          } else {
            if (data.geometry.type === "LineString") {
              return data.geometry.coordinates as [number, number][]
            } else if (data.geometry.type === "MultiLineString") {
              const allCoords: [number, number][] = []
              data.geometry.coordinates.forEach((line) => {
                allCoords.push(...(line as [number, number][]))
              })
              return allCoords
            }
          }
          return []
        }

        const coordinates = extractCoordinates(uploadedRoute.data)
        if (coordinates.length >= 2) {
          totalDistanceKm = calculateRouteLengthFromCoordinates(coordinates)
          calculatedRouteLengthKm = totalDistanceKm
          totalDurationMinutes = (totalDistanceKm / 50) * 60
        }
      }

      // Calculate similarity percentage (defer expensive calculation)
      let similarityPercentage = 0
      if (uploadedRoute && googleRoads.length > 0) {
        const allCoordinates: [number, number][] = []
        googleRoads.forEach((road) => {
          const geometry = road.feature.geometry
          if (geometry.type === "LineString") {
            allCoordinates.push(...(geometry.coordinates as [number, number][]))
          }
        })

        if (allCoordinates.length > 0) {
          const combinedLineString: GeoJSON.LineString = {
            type: "LineString",
            coordinates: allCoordinates,
          }
          try {
            similarityPercentage = calculateRouteSimilarity(
              uploadedRoute.data,
              combinedLineString,
            )
            similarityPercentage = Math.max(
              0,
              Math.min(100, similarityPercentage),
            )
          } catch (error) {
            console.error(
              `❌ Error calculating similarity for route ${routeId}:`,
              error,
            )
            similarityPercentage = 0
          }
        }
      }

      const waypoints = marker?.waypoints || []

      // Check if optimized route is within boundary (defer expensive check)
      let isOptimizedRouteWithinBoundary = true
      if (boundary && googleRoads.length > 0) {
        for (const road of googleRoads) {
          const geometry = road.feature.geometry
          if (geometry.type === "LineString") {
            const coordinates = geometry.coordinates
            for (const coord of coordinates) {
              if (Array.isArray(coord) && coord.length >= 2) {
                const [lng, lat] = [coord[0] as number, coord[1] as number]
                if (!isPointInBoundary(lat, lng, boundary)) {
                  isOptimizedRouteWithinBoundary = false
                  break
                }
              }
            }
            if (!isOptimizedRouteWithinBoundary) break
          } else if (geometry.type === "MultiLineString") {
            for (const line of geometry.coordinates) {
              if (Array.isArray(line)) {
                for (const coord of line) {
                  if (Array.isArray(coord) && coord.length >= 2) {
                    const [lng, lat] = [coord[0] as number, coord[1] as number]
                    if (!isPointInBoundary(lat, lng, boundary)) {
                      isOptimizedRouteWithinBoundary = false
                      break
                    }
                  }
                }
                if (!isOptimizedRouteWithinBoundary) break
              }
            }
            if (!isOptimizedRouteWithinBoundary) break
          }
        }
      }

      return {
        routeId,
        routeName: uploadedRoute?.name || "Unknown Route",
        distanceKm: totalDistanceKm,
        calculatedRouteLengthKm,
        durationMinutes: totalDurationMinutes,
        segmentCount: googleRoads.length,
        similarityPercentage,
        differencePercentage: 100 - similarityPercentage,
        waypoints,
        isOptimizedRouteWithinBoundary,
      }
    },
    [],
  )

  // Get Google routes info with incremental updates - only recalculate changed routes
  // This reads fresh data from store inside the memo to avoid stale closures
  const googleRoutesInfo = React.useMemo(() => {
    // Read fresh data from store to ensure we have latest state
    const currentState = useLayerStore.getState()
    const currentMarkers = currentState.snappedRoads.routeMarkers
    const currentRoads = currentState.snappedRoads.roads
    const currentUploadedRoutes = currentState.uploadedRoutes.routes
    const boundary = projectData?.boundaryGeoJson

    // Get current route IDs
    const currentRouteIds = new Set(currentMarkers.map((m) => m.routeId))

    // Remove cached routes that no longer exist
    routeInfoCacheRef.current.forEach((_cached, routeId) => {
      if (!currentRouteIds.has(routeId)) {
        routeInfoCacheRef.current.delete(routeId)
      }
    })

    // Calculate or update route info for each route
    const routes = currentMarkers.map((marker) => {
      const uploadedRoute = currentUploadedRoutes.find(
        (r) => r.id === marker.routeId,
      )
      const googleRoads = currentRoads.filter(
        (road) => road.uploadedRouteId === marker.routeId,
      )

      // Calculate hash for this route
      const routeHash = getRouteHash(
        marker.routeId,
        marker,
        googleRoads,
        uploadedRoute,
      )

      // Check if we can reuse cached data
      const cached = routeInfoCacheRef.current.get(marker.routeId)
      if (cached && cached.hash === routeHash) {
        // Return cached data without hash (hash is internal)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { hash, ...cachedWithoutHash } = cached
        return cachedWithoutHash
      }

      // Calculate new route info
      const routeInfo = calculateRouteInfo(
        marker.routeId,
        marker,
        googleRoads,
        uploadedRoute,
        boundary,
      )

      // Store in cache with hash
      routeInfoCacheRef.current.set(marker.routeId, {
        ...routeInfo,
        hash: routeHash,
      })

      return routeInfo
    })

    // Apply sorting based on selected option
    const sortedRoutes = [...routes]
    const sortMultiplier = reverseOrder ? -1 : 1
    switch (sortBy) {
      case "difference":
        sortedRoutes.sort(
          (a, b) =>
            (b.differencePercentage - a.differencePercentage) * sortMultiplier,
        )
        break
      case "distance":
        sortedRoutes.sort(
          (a, b) => (a.distanceKm - b.distanceKm) * sortMultiplier,
        )
        break
      case "alphabetical":
        sortedRoutes.sort((a, b) => {
          const comparison = a.routeName.localeCompare(b.routeName, undefined, {
            sensitivity: "base",
          })
          return comparison * sortMultiplier
        })
        break
      default:
        sortedRoutes.sort(
          (a, b) =>
            (b.differencePercentage - a.differencePercentage) * sortMultiplier,
        )
        break
    }

    return sortedRoutes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeMarkersLength, // Use length instead of full array
    roadsCount, // Use count instead of full array
    uploadedRoutes.routes.length, // Use length instead of full array
    sortBy,
    reverseOrder,
    projectData?.boundaryGeoJson,
    roadsDataHash, // Still use hash to detect content changes
    totalWaypointsCount, // Detect waypoint changes
    calculateRouteInfo,
    getRouteHash,
  ])

  // Filter routes based on search query
  const displayedRoutes = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return googleRoutesInfo
    }
    const query = searchQuery.trim().toLowerCase()
    return googleRoutesInfo.filter((route) =>
      route.routeName.toLowerCase().includes(query),
    )
  }, [googleRoutesInfo, searchQuery])

  // Get selected route info with preview roads when there are unsaved changes
  // This is separate from googleRoutesInfo to show preview values only in SelectedRoutePanel
  const selectedRouteInfo = React.useMemo(() => {
    if (!selectedUploadedRouteId) return null

    const currentState = useLayerStore.getState()
    const previewRoads = currentState.snappedRoads.previewRoads
    const routeHasPreview = hasUnsavedChanges(selectedUploadedRouteId)
    const routePreviewRoads = previewRoads.filter(
      (road) => road.uploadedRouteId === selectedUploadedRouteId,
    )

    // Use preview roads if route has unsaved changes and preview exists, otherwise use regular roads
    const googleRoads =
      routeHasPreview && routePreviewRoads.length > 0
        ? routePreviewRoads
        : snappedRoads.roads.filter(
            (road) => road.uploadedRouteId === selectedUploadedRouteId,
          )

    const uploadedRoute = uploadedRoutes.routes.find(
      (r) => r.id === selectedUploadedRouteId,
    )

    if (!uploadedRoute) return null

    // Calculate total distance and duration from Google routes
    let totalDistanceKm = 0
    let totalDurationMinutes = 0
    let calculatedRouteLengthKm = 0

    // Extract all coordinates from Google roads to calculate actual route length
    const allRouteCoordinates: [number, number][] = []
    googleRoads.forEach((road) => {
      // Distance - check both 'distance' and 'length' properties
      const distanceStr =
        road.feature.properties?.distance || road.feature.properties?.length
      const distanceKm = distanceStr ? parseFloat(distanceStr) : 0

      totalDistanceKm += distanceKm

      // Duration
      const durationStr = road.feature.properties?.duration
      const durationMinutes = durationStr ? parseFloat(durationStr) : 0
      totalDurationMinutes += durationMinutes

      // Extract coordinates for length calculation
      const geometry = road.feature.geometry
      if (geometry.type === "LineString") {
        allRouteCoordinates.push(
          ...(geometry.coordinates as [number, number][]),
        )
      } else if (geometry.type === "MultiLineString") {
        geometry.coordinates.forEach((line) => {
          allRouteCoordinates.push(...(line as [number, number][]))
        })
      }
    })

    // Calculate route length from actual coordinates (more accurate)
    if (allRouteCoordinates.length >= 2) {
      calculatedRouteLengthKm =
        calculateRouteLengthFromCoordinates(allRouteCoordinates)
    } else {
      // Fallback to API distance if no coordinates available
      calculatedRouteLengthKm = totalDistanceKm
    }

    // If no Google roads yet (route is still generating), calculate from uploaded route
    if (googleRoads.length === 0 && uploadedRoute) {
      // Extract coordinates from uploaded route
      const extractCoordinates = (
        data: GeoJSON.Feature | GeoJSON.FeatureCollection,
      ): [number, number][] => {
        if (data.type === "FeatureCollection") {
          const allCoords: [number, number][] = []
          data.features.forEach((feature) => {
            if (feature.geometry.type === "LineString") {
              allCoords.push(
                ...(feature.geometry.coordinates as [number, number][]),
              )
            } else if (feature.geometry.type === "MultiLineString") {
              feature.geometry.coordinates.forEach((line) => {
                allCoords.push(...(line as [number, number][]))
              })
            }
          })
          return allCoords
        } else {
          if (data.geometry.type === "LineString") {
            return data.geometry.coordinates as [number, number][]
          } else if (data.geometry.type === "MultiLineString") {
            const allCoords: [number, number][] = []
            data.geometry.coordinates.forEach((line) => {
              allCoords.push(...(line as [number, number][]))
            })
            return allCoords
          }
        }
        return []
      }

      const coordinates = extractCoordinates(uploadedRoute.data)
      if (coordinates.length >= 2) {
        // Calculate distance using calculateRouteLengthFromCoordinates (more accurate)
        totalDistanceKm = calculateRouteLengthFromCoordinates(coordinates)
        calculatedRouteLengthKm = totalDistanceKm

        // Estimate duration: assume average speed of 50 km/h (urban driving)
        totalDurationMinutes = (totalDistanceKm / 50) * 60
      }
    }

    // Calculate similarity percentage
    let similarityPercentage = 0
    if (uploadedRoute && googleRoads.length > 0) {
      // Combine all Google route segments into a single LineString
      const allCoordinates: [number, number][] = []
      googleRoads.forEach((road) => {
        const geometry = road.feature.geometry
        if (geometry.type === "LineString") {
          allCoordinates.push(...(geometry.coordinates as [number, number][]))
        }
      })

      if (allCoordinates.length > 0) {
        const combinedLineString: GeoJSON.LineString = {
          type: "LineString",
          coordinates: allCoordinates,
        }
        try {
          similarityPercentage = calculateRouteSimilarity(
            uploadedRoute.data,
            combinedLineString,
          )

          // Ensure similarity is at least 0 and at most 100
          similarityPercentage = Math.max(
            0,
            Math.min(100, similarityPercentage),
          )
        } catch (error) {
          console.error(
            `❌ Error calculating similarity for route ${selectedUploadedRouteId}:`,
            error,
          )
          similarityPercentage = 0
        }
      }
    }

    // Get waypoints for this route - use temporary markers if editing, otherwise regular markers
    // This ensures we show the latest waypoint changes immediately
    // Read fresh state from store to ensure we get the latest markers
    const editingState = currentState.getEditingState(selectedUploadedRouteId)
    const routeMarkers = currentState.snappedRoads.routeMarkers.find(
      (m) => m.routeId === selectedUploadedRouteId,
    )
    // Use temporary markers if editing, otherwise use regular markers
    const displayMarkers = editingState?.temporaryMarkers || routeMarkers
    const waypoints = displayMarkers?.waypoints || []

    return {
      routeId: selectedUploadedRouteId,
      routeName: uploadedRoute.name || "Unknown Route",
      distanceKm: totalDistanceKm,
      calculatedRouteLengthKm, // Calculated length from coordinates (for 80km validation)
      durationMinutes: totalDurationMinutes,
      segmentCount: googleRoads.length,
      similarityPercentage,
      differencePercentage: 100 - similarityPercentage,
      waypoints,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedUploadedRouteId,
    snappedRoads.routeMarkers,
    snappedRoads.roads,
    snappedRoads.previewRoads, // Include preview roads to detect changes when waypoints are moved
    uploadedRoutes.routes,
    roadsDataHash,
    hasUnsavedChanges,
    // totalWaypointsCount is needed to detect waypoint changes even when array reference doesn't change
    totalWaypointsCount,
  ])

  // Only show loading in routes list if it's initial batch generation (no routes displayed yet)
  // Don't show loading when a single route is being regenerated
  const shouldShowLoadingInList = React.useMemo(() => {
    if (!snappedRoads.isLoading) return false
    // Only show loading if we have uploaded routes but no displayed routes yet (initial generation)
    return (
      uploadedRoutes.routes.length > 0 &&
      displayedRoutes.length === 0 &&
      snappedRoads.routeMarkers.length === 0
    )
  }, [
    snappedRoads.isLoading,
    uploadedRoutes.routes.length,
    displayedRoutes.length,
    snappedRoads.routeMarkers.length,
  ])

  // Check if all routes have finished loading (all uploaded routes have corresponding snapped roads)
  const allRoutesLoaded = React.useMemo(() => {
    if (uploadedRoutes.routes.length === 0) {
      return true
    }
    // If loading is true, routes are still being generated
    if (snappedRoads.isLoading) {
      return false
    }

    // Check if all uploaded routes have corresponding snapped roads
    const routeStatuses = uploadedRoutes.routes.map((uploadedRoute) => {
      const hasMarkers = snappedRoads.routeMarkers.some(
        (marker) => marker.routeId === uploadedRoute.id,
      )
      const hasRegularRoads = snappedRoads.roads.some(
        (road) => road.uploadedRouteId === uploadedRoute.id,
      )
      const hasPreviewRoads = snappedRoads.previewRoads.some(
        (road) => road.uploadedRouteId === uploadedRoute.id,
      )
      const isLoaded = hasMarkers && (hasRegularRoads || hasPreviewRoads)

      return {
        routeId: uploadedRoute.id,
        routeName: uploadedRoute.name,
        hasMarkers,
        hasRegularRoads,
        hasPreviewRoads,
        isLoaded,
      }
    })

    const allRoutesHaveRoads = routeStatuses.every((status) => status.isLoaded)
    const missingRoutes = routeStatuses.filter((status) => !status.isLoaded)

    // If loading is complete but some routes are missing markers/roads,
    // they likely failed to generate. Allow saving anyway since the user
    // might want to save the routes that did generate successfully.
    // Only block saving if we're still actively loading routes.
    if (!snappedRoads.isLoading && missingRoutes.length > 0) {
      console.warn(
        "⚠️ [allRoutesLoaded] Some routes failed to generate:",
        missingRoutes.map((r) => r.routeName),
      )
      // Consider routes loaded if we're not actively loading anymore
      // This allows saving even if some routes failed
      return true
    }

    return allRoutesHaveRoads
  }, [
    uploadedRoutes.routes,
    snappedRoads.isLoading,
    snappedRoads.routeMarkers,
    snappedRoads.roads,
    snappedRoads.previewRoads,
  ])

  // Check if routes are currently being loaded/uploaded
  const isRoutesLoading = React.useMemo(() => {
    return snappedRoads.isLoading || !allRoutesLoaded
  }, [snappedRoads.isLoading, allRoutesLoaded])

  const handleBackToAllRoutes = React.useCallback(() => {
    // IMPORTANT: When closing SelectedRoutePanel, we ALWAYS discard unsaved changes silently
    // without showing any dialog. This is intentional - users can use the Save/Discard buttons
    // in the panel if they want to save changes before closing.
    if (selectedUploadedRouteId) {
      const currentState = useLayerStore.getState()
      const hasUnsaved = currentState.hasUnsavedChanges(selectedUploadedRouteId)

      // Always discard changes when closing - no checks, no dialogs
      if (hasUnsaved) {
        discardRouteChanges(selectedUploadedRouteId)
      }

      // Clear editingSavedRouteId if it's set for this uploaded route
      // This prevents LeftFloatingPanel from showing UnsavedRoutesDialog
      // when we're just closing the SelectedRoutePanel for an uploaded route
      if (editingSavedRouteId === selectedUploadedRouteId) {
        setEditingSavedRouteId(null)
      }
    }

    setSelectedUploadedRouteId(null)
    setSelectedRoutePanelVisible(false)
    setMapMode("view")
    // Cancel waypoint adding mode if active
    if (isAddingWaypoint) {
      cancelAddingWaypoint()
    }
    // Explicitly focus on all routes when going back
    const currentState = useLayerStore.getState()
    const allRouteIds = currentState.uploadedRoutes.routes.map((r) => r.id)
    if (allRouteIds.length > 0) {
      focusOnUploadedRoutes(allRouteIds)
    }
  }, [
    setSelectedUploadedRouteId,
    setSelectedRoutePanelVisible,
    setMapMode,
    isAddingWaypoint,
    cancelAddingWaypoint,
    focusOnUploadedRoutes,
    selectedUploadedRouteId,
    discardRouteChanges,
    editingSavedRouteId,
    setEditingSavedRouteId,
  ])

  // Initialize editing state when a route is selected
  React.useEffect(() => {
    if (selectedUploadedRouteId) {
      initializeRouteEditing(selectedUploadedRouteId)

      // Ensure uploaded route has yellow color when selected for editing
      const uploadedRoute = uploadedRoutes.routes.find(
        (r) => r.id === selectedUploadedRouteId,
      )
      if (
        uploadedRoute &&
        (!uploadedRoute.color ||
          uploadedRoute.color[0] !== 255 ||
          uploadedRoute.color[1] !== 235 ||
          uploadedRoute.color[2] !== 59)
      ) {
        updateUploadedRoute(selectedUploadedRouteId, {
          color: [255, 235, 59, 255] as [number, number, number, number],
        })
      }
    }
  }, [
    selectedUploadedRouteId,
    initializeRouteEditing,
    uploadedRoutes.routes,
    updateUploadedRoute,
  ])

  // Auto-focus map when a route is selected or deselected
  React.useEffect(() => {
    if (selectedUploadedRouteId) {
      // Focus map on the selected route (includes both uploaded route and Google routes)
      focusOnUploadedRoutes([selectedUploadedRouteId])
    } else {
      // When coming back from a selected route, focus on all uploaded routes and their Google routes
      const allRouteIds = uploadedRoutes.routes.map((r) => r.id)
      if (allRouteIds.length > 0) {
        focusOnUploadedRoutes(allRouteIds)
      }
    }
  }, [
    selectedUploadedRouteId,
    focusOnUploadedRoutes,
    uploadedRoutes.routes,
    editingSavedRouteId,
  ])

  // Track SelectedRoutePanel visibility
  React.useEffect(() => {
    const isVisible = Boolean(
      (isOpen || editingSavedRouteId) &&
        selectedUploadedRouteId !== null &&
        selectedRouteInfo !== null,
    )
    setSelectedRoutePanelVisible(isVisible)
  }, [
    isOpen,
    editingSavedRouteId,
    selectedUploadedRouteId,
    selectedRouteInfo,
    setSelectedRoutePanelVisible,
  ])

  const handleToggleCollapse = React.useCallback(() => {
    // Prevent collapsing while routes are loading
    // Check loading state directly from store
    const currentState = useLayerStore.getState()
    const isLoading = currentState.snappedRoads.isLoading

    if (isLoading) {
      return // Block collapsing while loading
    }

    // Check if all routes are loaded (same logic as allRoutesLoaded)
    const routesCount = uploadedRoutes.routes.length
    if (routesCount > 0) {
      const markers = currentState.snappedRoads.routeMarkers
      const roads = currentState.snappedRoads.roads
      const previewRoads = currentState.snappedRoads.previewRoads

      // Check if all routes have markers and roads
      const allRoutesHaveData = uploadedRoutes.routes.every((route) => {
        const hasMarkers = markers.some((m) => m.routeId === route.id)
        const hasRegularRoads = roads.some(
          (r) => r.uploadedRouteId === route.id,
        )
        const hasPreviewRoads = previewRoads.some(
          (r) => r.uploadedRouteId === route.id,
        )
        return hasMarkers && (hasRegularRoads || hasPreviewRoads)
      })

      if (!allRoutesHaveData) {
        return // Block collapsing if routes aren't fully loaded
      }
    }

    // Use shared leftPanelExpanded state
    const newExpanded = !leftPanelExpanded
    setLeftPanelExpanded(newExpanded)
    setActivePanel(
      newExpanded && uploadedRoutes.routes.length > 0
        ? "uploaded_routes"
        : null,
    )
  }, [
    leftPanelExpanded,
    setLeftPanelExpanded,
    setActivePanel,
    uploadedRoutes.routes,
  ])

  const handleClearAll = React.useCallback(() => {
    // Abort all ongoing route generation requests
    abortControllersRef.current.forEach((controller) => {
      controller.abort()
    })
    abortControllersRef.current.clear()

    // Clear hover state
    setHoveredRouteId(null)

    // Clear selected route
    setSelectedUploadedRouteId(null)
    setSelectedRoutePanelVisible(false)

    // Clear all uploaded routes
    clearUploadedRoutes()

    // Clear all Google routes
    clearSnappedRoads()

    // Clear all markers
    clearAllOptimizedRouteMarkers()

    // Reset folder selection
    setSelectedTag(null)
    setTagError("")

    // Reset save success message
    setSaveSuccess(false)

    // Reset map mode to "view" to show getting started instruction
    setMapMode("view")
    setActivePanel("saved_routes") // Set to saved_routes so LeftFloatingPanel shows when panel expands
    setSelectedRoutePanelVisible(false)
    setLeftPanelExpanded(false) // Close panel when cancel is clicked
    setIsOpen(false) // Ensure UploadedRoutesPanel is closed
  }, [
    setHoveredRouteId,
    setSelectedUploadedRouteId,
    clearUploadedRoutes,
    clearSnappedRoads,
    clearAllOptimizedRouteMarkers,
    setMapMode,
    setActivePanel,
    setSelectedRoutePanelVisible,
    setLeftPanelExpanded,
  ])

  // Multi-select mode state
  const [multiSelectEnabled, setMultiSelectEnabled] = React.useState(false)

  // When disabling multi-select, clear all selections
  React.useEffect(() => {
    if (!multiSelectEnabled) {
      setSelectedRouteIds(new Set())
    }
  }, [multiSelectEnabled, setSelectedRouteIds])

  // Batch selection helpers
  const toggleRouteSelection = React.useCallback((routeId: string) => {
    setSelectedRouteIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(routeId)) {
        newSet.delete(routeId)
      } else {
        newSet.add(routeId)
      }
      return newSet
    })
  }, [])

  const selectAllRoutes = React.useCallback(() => {
    const allRouteIds = new Set(displayedRoutes.map((r) => r.routeId))
    setSelectedRouteIds(allRouteIds)
  }, [displayedRoutes])

  const deselectAllRoutes = React.useCallback(() => {
    setSelectedRouteIds(new Set())
  }, [])

  // Batch create reversed routes
  const validateTag = (tagValue: string | null): string => {
    if (!tagValue || !tagValue.trim()) {
      return "Folder is required"
    }

    const trimmed = tagValue.trim().toLowerCase()
    const existingTagLower = tags.map((t) => t.toLowerCase())

    if (existingTagLower.includes(trimmed)) {
      // Tag exists, which is fine if selected from dropdown
      return ""
    }

    if (trimmed.length > 100) {
      return "Folder name must not exceed 100 characters"
    }

    return ""
  }

  const handleTagChange = React.useCallback(
    (newValue: string | null) => {
      setSelectedTag(newValue)
      if (tagError) {
        setTagError("")
      }
      // Don't close dialog automatically - let user click Save or Cancel
    },
    [tagError],
  )

  const handleTagInputChange = React.useCallback(
    (newInputValue: string) => {
      setSelectedTag(newInputValue)
      if (tagError) {
        setTagError("")
      }
    },
    [tagError],
  )

  const handleOpenFolderDialog = React.useCallback(() => {
    setFolderDialogOpen(true)
  }, [])

  const handleCancelFolderDialog = React.useCallback(() => {
    // Clear selected folder when canceling
    setSelectedTag(null)
    setTagError("")
    // Close the dialog
    setFolderDialogOpen(false)
  }, [])

  const handleSaveFromDialog = React.useCallback(async () => {
    // Validate tag before saving
    if (!selectedTag || !selectedTag.trim()) {
      setTagError("Please select a folder or create a new one")
      return
    }

    const tagValidation = validateTag(selectedTag)
    if (tagValidation) {
      setTagError(tagValidation)
      return
    }

    // Close dialog first
    setFolderDialogOpen(false)

    // Then call handleSaveAll which will save and close the panel
    await handleSaveAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTag])

  const handleSaveAll = async () => {
    if (!projectId) {
      return
    }

    // Tag is required
    if (!selectedTag || !selectedTag.trim()) {
      setTagError("Please select a folder or create a new one")
      return
    }

    // Validate tag
    const tagValidation = validateTag(selectedTag)
    if (tagValidation) {
      setTagError(tagValidation)
      return
    }

    // Validate all route names and distances before saving
    const routesOver80Km: Array<{ name: string; distance: number }> = []
    for (const routeInfo of googleRoutesInfo) {
      // Skip routes with optimized routes outside boundary
      if (!routeInfo.isOptimizedRouteWithinBoundary) {
        continue
      }
      const routeName = routeInfo.routeName || `Route ${routeInfo.routeId}`
      if (!routeName.trim()) {
        toast.error("Route name cannot be empty")
        return
      }
      if (routeName.trim().length > 100) {
        toast.error("Route name must not exceed 100 characters")
        return
      }
      // Check if route distance exceeds 80km (use calculated route length)
      const routeLengthToCheck =
        routeInfo.calculatedRouteLengthKm || routeInfo.distanceKm
      if (routeLengthToCheck > 80) {
        routesOver80Km.push({
          name: routeName,
          distance: routeLengthToCheck,
        })
      }
    }

    // Prevent saving if any route exceeds 80km
    if (routesOver80Km.length > 0) {
      const routeNames = routesOver80Km.map((r) => r.name).join(", ")
      const limitKm = 80
      const limitInUserUnit =
        distanceUnit === "miles" ? convertKmToMiles(limitKm) : limitKm
      const limitDisplay =
        distanceUnit === "miles"
          ? `${limitInUserUnit.toFixed(1)} mi`
          : `${limitKm} km`
      toast.error(
        `Cannot save routes longer than ${limitDisplay}. Please adjust the following route${
          routesOver80Km.length > 1 ? "s" : ""
        }: ${routeNames}`,
      )
      return
    }

    // Store current routes state before saving (for restoration on failure)
    const routesToSave = [...uploadedRoutes.routes]
    const currentSnappedRoads = {
      roads: [...snappedRoads.roads],
      routeMarkers: [...snappedRoads.routeMarkers],
    }

    // Close UploadedRoutesPanel and show loading message
    setIsOpen(false)
    setIsSaving(true)
    setSaveSuccess(false)

    // Dismiss any previous error toast
    if (savingToastIdRef.current) {
      toast.dismiss(savingToastIdRef.current)
    }

    // Show loading toast
    savingToastIdRef.current = toast.loading(
      editingSavedRouteId
        ? "Route is being updated..."
        : "Routes are being saved...",
    )

    // Capture the tag before saving (for navigation after save)
    // Keep empty string "" and "Untagged" as separate - use tag value as-is
    const savedTag = selectedTag?.trim() ?? ""

    try {
      // Keep empty string "" and "Untagged" as separate - use tag value as-is
      const tag = selectedTag?.trim() ?? ""

      // If editing, delete the old route first
      if (editingSavedRouteId) {
        await deleteRouteMutation.mutateAsync(editingSavedRouteId)
      }

      // Prepare roads array for batch save
      const roadsToSave: Array<{
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
      }> = []

      for (const routeInfo of googleRoutesInfo) {
        // Skip routes with optimized routes outside boundary
        if (!routeInfo.isOptimizedRouteWithinBoundary) {
          console.log(
            `⚠️ Skipping route ${routeInfo.routeName} - optimized route is outside boundary`,
          )
          continue
        }

        // Find the original uploaded route
        const uploadedRoute = uploadedRoutes.routes.find(
          (r) => r.id === routeInfo.routeId,
        )

        if (!uploadedRoute) {
          continue
        }

        const currentState = useLayerStore.getState()
        const hasUnsaved = currentState.hasUnsavedChanges(routeInfo.routeId)

        // If route has unsaved changes, use original saved markers instead of current markers
        let routeMarkers = snappedRoads.routeMarkers.find(
          (m) => m.routeId === routeInfo.routeId,
        )

        if (hasUnsaved) {
          // Use original markers from editing state
          const editingState = currentState.getEditingState(routeInfo.routeId)
          if (editingState?.originalMarkers) {
            routeMarkers = editingState.originalMarkers
            console.log(
              `ℹ️ Route ${routeInfo.routeName} has unsaved changes - using original saved data`,
            )
          }
        }

        if (!routeMarkers) {
          continue
        }

        // Find the Google route for this route
        // Always use saved roads (not preview roads) - preview roads are only for display
        const googleRoads = snappedRoads.roads.filter(
          (road) => road.uploadedRouteId === routeInfo.routeId,
        )

        if (googleRoads.length === 0) {
          continue
        }

        // Get distance from properties
        const distanceStr = googleRoads[0].feature.properties?.distance
        const lengthKm = distanceStr ? parseFloat(distanceStr) : 0

        // Prefer encoded polyline from properties if available (from Google Routes API)
        // This is more efficient than converting coordinates to LineString
        let encodedPolyline: string | undefined = undefined
        let linestringGeoJson: GeoJSON.LineString | undefined = undefined

        // Check if we have a single road with encodedPolyline in properties
        if (googleRoads.length === 1) {
          const road = googleRoads[0]
          encodedPolyline = road.feature.properties?.encodedPolyline
        }

        // If no encoded polyline available, fall back to creating LineString from coordinates
        if (!encodedPolyline) {
          // Combine all Google route segments into a single LineString
          const allCoordinates: [number, number][] = []
          googleRoads.forEach((road) => {
            const geometry = road.feature.geometry
            if (geometry.type === "LineString") {
              allCoordinates.push(
                ...(geometry.coordinates as [number, number][]),
              )
            } else if (geometry.type === "MultiLineString") {
              geometry.coordinates.forEach((line) => {
                allCoordinates.push(...(line as [number, number][]))
              })
            }
          })

          if (allCoordinates.length < 2) {
            continue
          }

          // Create LineString GeoJSON
          linestringGeoJson = {
            type: "LineString",
            coordinates: allCoordinates,
          }
        }

        // Use origin and destination from route markers (not from linestring)
        const origin: [number, number] = [
          routeMarkers.startMarker.lng,
          routeMarkers.startMarker.lat,
        ] // [lng, lat]

        const destination: [number, number] = [
          routeMarkers.endMarker.lng,
          routeMarkers.endMarker.lat,
        ] // [lng, lat]

        // Use waypoints from route markers (sorted by order)
        const waypoints: [number, number][] = (routeMarkers.waypoints || [])
          .sort((a, b) => a.order - b.order)
          .map((waypoint) => [waypoint.position.lng, waypoint.position.lat])

        const isOptimizedRoute =
          (uploadedRoute.data.type === "Feature" &&
            (uploadedRoute.data.properties?.source === "google_routes_api" ||
              String(uploadedRoute.data.properties?.id || "").includes(
                "-optimized",
              ))) ||
          (uploadedRoute.data.type === "FeatureCollection" &&
            uploadedRoute.data.features.some(
              (f) =>
                f.properties?.source === "google_routes_api" ||
                String(f.properties?.id || "").includes("-optimized"),
            ))

        if (isOptimizedRoute) {
          console.error(
            "❌ ERROR: uploadedRoute.data appears to be the optimized route, not the original!",
            {
              routeId: routeInfo.routeId,
              routeName: routeInfo.routeName,
              dataType: uploadedRoute.data.type,
              properties:
                uploadedRoute.data.type === "Feature"
                  ? uploadedRoute.data.properties
                  : uploadedRoute.data.features[0]?.properties,
            },
          )
          // This should not happen - uploadedRoute.data should always be the original route
          // If it does happen, we cannot save the route properly
          throw new Error(
            `Route ${routeInfo.routeName} has optimized route data instead of original. Cannot save route.`,
          )
        }

        // Create deep copy of the original route data
        const originalRouteGeoJson:
          | GeoJSON.Feature
          | GeoJSON.FeatureCollection = JSON.parse(
          JSON.stringify(uploadedRoute.data),
        )

        // Additional validation: Check if coordinates actually match (they shouldn't)
        // Only compare if we have linestringGeoJson (not when using encodedPolyline)
        if (linestringGeoJson) {
          const compareCoordinates = () => {
            let originalCoords:
              | [number, number][]
              | [number, number, number][] = []
            let originalIs3D = false

            if (originalRouteGeoJson.type === "FeatureCollection") {
              const feature = originalRouteGeoJson.features[0]
              if (feature?.geometry.type === "LineString") {
                originalCoords = feature.geometry.coordinates as
                  | [number, number][]
                  | [number, number, number][]
                originalIs3D = originalCoords[0]?.length === 3
              }
            } else if (originalRouteGeoJson.geometry.type === "LineString") {
              originalCoords = originalRouteGeoJson.geometry.coordinates as
                | [number, number][]
                | [number, number, number][]
              originalIs3D = originalCoords[0]?.length === 3
            }

            const optimizedCoords = linestringGeoJson.coordinates

            // Compare first 3 coordinates (using only lng, lat - ignore altitude)
            const first3Original = originalCoords
              .slice(0, 3)
              .map((c) => [c[0], c[1]])
            const first3Optimized = optimizedCoords
              .slice(0, 3)
              .map((c) => [c[0], c[1]])

            const coordsMatch = first3Original.every((orig, idx) => {
              const opt = first3Optimized[idx]
              if (!opt) return false
              // Compare with small tolerance for floating point differences
              return (
                Math.abs(orig[0] - opt[0]) < 0.00001 &&
                Math.abs(orig[1] - opt[1]) < 0.00001
              )
            })

            if (coordsMatch) {
              console.error(
                "❌ CRITICAL: First 3 coordinates match between original and optimized routes!",
                {
                  routeId: routeInfo.routeId,
                  routeName: routeInfo.routeName,
                  originalIs3D,
                  first3Original,
                  first3Optimized,
                  message:
                    "The original route appears to be the same as the optimized route. This should not happen!",
                },
              )
            } else {
              console.log("✅ Coordinates are different (good):", {
                routeId: routeInfo.routeId,
                routeName: routeInfo.routeName,
                originalFirst3: first3Original,
                optimizedFirst3: first3Optimized,
              })
            }
          }

          compareCoordinates()
        }

        // Ensure we have either encodedPolyline or linestringGeoJson
        if (!encodedPolyline && !linestringGeoJson) {
          console.error(`❌ No valid geometry for route ${routeInfo.routeName}`)
          continue
        }

        // Build the road object with either encodedPolyline or linestringGeoJson
        const roadToSave: {
          id: string
          name?: string
          length?: number
          encodedPolyline?: string
          linestringGeoJson?: GeoJSON.LineString
          originalRouteGeoJson?: GeoJSON.Feature | GeoJSON.FeatureCollection
          origin: [number, number]
          destination: [number, number]
          waypoints?: [number, number][]
          matchPercentage?: number
        } = {
          id: routeInfo.routeId,
          name: routeInfo.routeName,
          length: lengthKm,
          originalRouteGeoJson, // This is the original uploaded route
          origin,
          destination,
          waypoints,
          matchPercentage: routeInfo.similarityPercentage, // Include match percentage
        }

        // Add geometry: prefer encoded polyline if available, otherwise use LineString
        if (encodedPolyline) {
          roadToSave.encodedPolyline = encodedPolyline
        } else if (linestringGeoJson) {
          roadToSave.linestringGeoJson = linestringGeoJson
        }

        roadsToSave.push(roadToSave)
      }

      // Count excluded routes
      const excludedRoutes = googleRoutesInfo.filter(
        (r) => !r.isOptimizedRouteWithinBoundary,
      )
      if (excludedRoutes.length > 0) {
        console.log(
          `⚠️ Excluding ${excludedRoutes.length} route(s) with optimized routes outside boundary:`,
          excludedRoutes.map((r) => r.routeName),
        )
      }

      if (roadsToSave.length === 0) {
        if (excludedRoutes.length === googleRoutesInfo.length) {
          throw new Error(
            "All routes have optimized routes outside the jurisdiction boundary. Please adjust the routes to ensure they are within the boundary.",
          )
        }
        throw new Error("No valid routes to save")
      }

      // Use batch save mutation
      const result = await batchSaveRoutesMutation.mutateAsync({
        projectId: projectId,
        tag: tag,
        roads: roadsToSave,
      })

      // Check for errors
      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors
          .map((e) => `${e.roadId}: ${e.message}`)
          .join(", ")
        throw new Error(
          `Failed to save some routes: ${errorMessages}. ${result.savedCount} route(s) saved successfully.`,
        )
      }

      setSaveSuccess(true)
      // Dismiss loading toast
      if (savingToastIdRef.current) {
        toast.dismiss(savingToastIdRef.current)
        savingToastIdRef.current = null
      }

      // Clear edit mode
      setEditingSavedRouteId(null)

      // Clear all routes after successful save
      handleClearAll()

      // Navigate to the folder where routes were saved and open left panel
      setCurrentFolder(savedTag)
      setLeftPanelExpanded(true)
    } catch (error) {
      console.error("Error saving routes:", error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to save routes. Please try again."
      // Update loading toast to error
      if (savingToastIdRef.current) {
        toast.update(savingToastIdRef.current, errorMessage, "error")
        savingToastIdRef.current = null
      } else {
        toast.error(errorMessage)
      }

      // Restore routes and reopen UploadedRoutesPanel on failure
      // Clear current state first
      clearUploadedRoutes()
      clearSnappedRoads()
      clearAllOptimizedRouteMarkers()

      // Restore uploaded routes
      routesToSave.forEach((route) => {
        const addUploadedRoute = useLayerStore.getState().addUploadedRoute
        addUploadedRoute(route)
      })

      // Restore snapped roads - group by routeId to avoid duplicates
      const roadsByRouteId = new Map<string, GeoJSON.Feature[]>()
      currentSnappedRoads.roads.forEach((road) => {
        const routeId = road.uploadedRouteId
        if (routeId) {
          if (!roadsByRouteId.has(routeId)) {
            roadsByRouteId.set(routeId, [])
          }
          roadsByRouteId.get(routeId)!.push(road.feature)
        }
      })

      // Add snapped roads grouped by route
      roadsByRouteId.forEach((roads, routeId) => {
        const addSnappedRoads = useLayerStore.getState().addSnappedRoads
        addSnappedRoads(routeId, roads)
      })

      // Restore route markers
      currentSnappedRoads.routeMarkers.forEach((marker) => {
        const setOptimizedRouteMarkers =
          useLayerStore.getState().setOptimizedRouteMarkers
        setOptimizedRouteMarkers(
          marker.routeId,
          marker.startMarker,
          marker.endMarker,
        )
        // Restore waypoints if any
        if (marker.waypoints && marker.waypoints.length > 0) {
          marker.waypoints.forEach((waypoint) => {
            const addWaypoint = useLayerStore.getState().addWaypoint
            addWaypoint(marker.routeId, waypoint.position)
          })
        }
      })

      // Reopen UploadedRoutesPanel and folder dialog on error
      setTimeout(() => {
        setIsOpen(true)
        setFolderDialogOpen(true)
      }, 500)
    } finally {
      setIsSaving(false)
    }
  }

  // Track abort controllers for route generation
  const abortControllersRef = React.useRef<Map<string, AbortController>>(
    new Map(),
  )

  // Expose abort controller registration to MapControls via a global function
  React.useEffect(() => {
    // Store abort controller registration function globally so MapControls can access it
    const registerFn = (routeId: string, controller: AbortController): void => {
      abortControllersRef.current.set(routeId, controller)
    }

    const getFn = (routeId: string): AbortController | undefined => {
      return abortControllersRef.current.get(routeId)
    }

    const removeFn = (routeId: string): void => {
      abortControllersRef.current.delete(routeId)
    }

    // Store functions on window object
    ;(
      window as typeof window & {
        __registerRouteAbortController?: typeof registerFn
        __getRouteAbortController?: typeof getFn
        __removeRouteAbortController?: typeof removeFn
      }
    ).__registerRouteAbortController = registerFn
    ;(
      window as typeof window & {
        __getRouteAbortController?: typeof getFn
      }
    ).__getRouteAbortController = getFn
    ;(
      window as typeof window & {
        __removeRouteAbortController?: typeof removeFn
      }
    ).__removeRouteAbortController = removeFn

    return () => {
      const win = window as typeof window & {
        __registerRouteAbortController?: typeof registerFn
        __getRouteAbortController?: typeof getFn
        __removeRouteAbortController?: typeof removeFn
      }
      delete win.__registerRouteAbortController
      delete win.__getRouteAbortController
      delete win.__removeRouteAbortController
    }
  }, [])

  const handleAddWaypoint = React.useCallback(
    (routeId: string) => {
      // Ensure route is selected when adding waypoint
      if (selectedUploadedRouteId !== routeId) {
        setSelectedUploadedRouteId(routeId)
      }
      // Set waypoint adding mode - user will click on map to add waypoint
      setAddingWaypointMode(routeId)
    },
    [
      setAddingWaypointMode,
      selectedUploadedRouteId,
      setSelectedUploadedRouteId,
    ],
  )

  const handleRemoveWaypoint = React.useCallback(
    async (routeId: string, waypointId: string) => {
      // Update temporary state
      removeWaypoint(routeId, waypointId)
      // Regenerate route immediately with updated waypoints
      await regenerateRoute(routeId)
    },
    [removeWaypoint, regenerateRoute],
  )

  const handleMoveWaypointUp = React.useCallback(
    async (routeId: string, waypointId: string) => {
      // Update temporary state
      moveWaypointUp(routeId, waypointId)
      // Regenerate route immediately with updated waypoints
      await regenerateRoute(routeId)
    },
    [moveWaypointUp, regenerateRoute],
  )

  const handleMoveWaypointDown = React.useCallback(
    async (routeId: string, waypointId: string) => {
      // Update temporary state
      moveWaypointDown(routeId, waypointId)
      // Regenerate route immediately with updated waypoints
      await regenerateRoute(routeId)
    },
    [moveWaypointDown, regenerateRoute],
  )

  const handleMoveOriginDown = React.useCallback(
    async (routeId: string) => {
      // Update temporary state
      moveOriginDown(routeId)
      // Regenerate route immediately with updated waypoints
      await regenerateRoute(routeId)
    },
    [moveOriginDown, regenerateRoute],
  )

  const handleMoveDestinationUp = React.useCallback(
    async (routeId: string) => {
      // Update temporary state
      moveDestinationUp(routeId)
      // Regenerate route immediately with updated waypoints
      await regenerateRoute(routeId)
    },
    [moveDestinationUp, regenerateRoute],
  )

  const handleSwapStartEnd = React.useCallback(
    (routeId: string) => {
      // This now updates temporary state, route will be regenerated on save
      swapRouteStartEnd(routeId)
    },
    [swapRouteStartEnd],
  )

  const handleSaveRouteChanges = React.useCallback(
    async (routeId: string) => {
      // Cancel waypoint adding mode when saving
      if (isAddingWaypoint) {
        cancelAddingWaypoint()
      }

      // Save temporary changes to the actual route
      // This clears editing state and moves preview roads to regular roads
      saveRouteChanges(routeId)

      // Regenerate route with saved changes immediately
      // Since editing state is cleared, this will create regular roads, not preview roads
      await regenerateRoute(routeId)

      // Ensure any remaining preview roads are cleared (safety check)
      const currentState = useLayerStore.getState()
      const hasPreviewRoads = currentState.snappedRoads.previewRoads.some(
        (road) => road.uploadedRouteId === routeId,
      )
      if (hasPreviewRoads) {
        currentState.removePreviewRoadsForRoute(routeId)
      }

      // Re-initialize editing state after regeneration to track future changes
      // This ensures the editing state is set up with the newly saved markers
      // Both original and temporary markers will be the same (the saved markers),
      // so hasUnsavedChanges will return false immediately
      // We do this here to ensure it happens after regenerateRoute completes
      // and route markers are fully updated
      initializeRouteEditing(routeId)
    },
    [
      saveRouteChanges,
      regenerateRoute,
      initializeRouteEditing,
      isAddingWaypoint,
      cancelAddingWaypoint,
    ],
  )

  const handleDiscardRouteChanges = React.useCallback(
    (routeId: string) => {
      // Cancel waypoint adding mode when discarding changes
      if (isAddingWaypoint && waypointAddingRouteId === routeId) {
        cancelAddingWaypoint()
      }

      // Discard temporary changes and restore original state
      discardRouteChanges(routeId)
    },
    [
      discardRouteChanges,
      isAddingWaypoint,
      waypointAddingRouteId,
      cancelAddingWaypoint,
    ],
  )

  const handleCreateReversedRoute = React.useCallback(
    (routeId: string, routeName: string) => {
      // Get current state from store
      const currentState = useLayerStore.getState()

      // Find the uploaded route
      const uploadedRoute = uploadedRoutes.routes.find((r) => r.id === routeId)
      if (!uploadedRoute) {
        console.error("Route not found:", routeId)
        return
      }

      // Get the optimized route (snapped roads) for this route (for display and waypoints)
      const optimizedRoads = currentState.snappedRoads.roads.filter(
        (road) => road.uploadedRouteId === routeId,
      )

      if (optimizedRoads.length === 0) {
        console.error("No optimized route found for route:", routeId)
        return
      }

      // Extract coordinates from the ORIGINAL uploaded route (for similarity calculation)
      const extractCoordinates = (
        data: GeoJSON.Feature | GeoJSON.FeatureCollection,
      ): [number, number][] => {
        if (data.type === "FeatureCollection") {
          const allCoords: [number, number][] = []
          data.features.forEach((feature) => {
            if (feature.geometry.type === "LineString") {
              allCoords.push(
                ...(feature.geometry.coordinates as [number, number][]),
              )
            } else if (feature.geometry.type === "MultiLineString") {
              feature.geometry.coordinates.forEach((line) => {
                allCoords.push(...(line as [number, number][]))
              })
            }
          })
          return allCoords
        } else {
          if (data.geometry.type === "LineString") {
            return data.geometry.coordinates as [number, number][]
          } else if (data.geometry.type === "MultiLineString") {
            const allCoords: [number, number][] = []
            data.geometry.coordinates.forEach((line) => {
              allCoords.push(...(line as [number, number][]))
            })
            return allCoords
          }
        }
        return []
      }

      const originalCoordinates = extractCoordinates(uploadedRoute.data)
      if (originalCoordinates.length < 2) {
        console.error("Not enough coordinates to reverse route")
        return
      }

      // Reverse the original uploaded route coordinates (for similarity calculation)
      const reversedOriginalCoordinates = [...originalCoordinates].reverse()

      // Extract coordinates from the optimized route (for display and waypoints)
      const optimizedCoordinates: [number, number][] = []
      optimizedRoads.forEach((road) => {
        const geometry = road.feature.geometry
        if (geometry.type === "LineString") {
          optimizedCoordinates.push(
            ...(geometry.coordinates as [number, number][]),
          )
        } else if (geometry.type === "MultiLineString") {
          geometry.coordinates.forEach((line) => {
            optimizedCoordinates.push(...(line as [number, number][]))
          })
        }
      })

      // Reverse the optimized route coordinates (for display)
      const reversedOptimizedCoordinates = [...optimizedCoordinates].reverse()

      // Don't copy waypoints when creating reversed route
      const reversedWaypoints: Array<{
        id: string
        position: { lat: number; lng: number }
        order: number
      }> = []

      // Create new GeoJSON feature with reversed coordinates from ORIGINAL uploaded route
      // (This is used for similarity calculation)
      const reversedFeature: GeoJSON.Feature = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: reversedOriginalCoordinates,
        },
        properties: {
          // Preserve properties from the original uploaded route
          ...(uploadedRoute.data.type === "Feature"
            ? uploadedRoute.data.properties
            : {}),
        },
      }

      // Create new uploaded route
      const newRoute: UploadedRoute = {
        id: crypto.randomUUID(),
        name: routeName,
        type: uploadedRoute.type,
        data: reversedFeature,
        color: uploadedRoute.color,
        uploadedAt: new Date(),
        originalRouteId: routeId, // Link to the original route
      }

      // Add the new route
      const addUploadedRoute = useLayerStore.getState().addUploadedRoute
      addUploadedRoute(newRoute)

      // Extract origin and destination from reversed optimized coordinates for markers
      const origin = reversedOptimizedCoordinates[0]
      const destination =
        reversedOptimizedCoordinates[reversedOptimizedCoordinates.length - 1]

      // Create reversed optimized route features
      const reversedOptimizedFeatures = optimizedRoads.map((road) => {
        const geometry = road.feature.geometry
        let reversedGeometry: GeoJSON.LineString | GeoJSON.MultiLineString

        if (geometry.type === "LineString") {
          reversedGeometry = {
            type: "LineString",
            coordinates: [
              ...(geometry.coordinates as [number, number][]),
            ].reverse(),
          }
        } else if (geometry.type === "MultiLineString") {
          // MultiLineString - reverse each line and the order of lines
          const reversedLines = [...geometry.coordinates]
            .reverse()
            .map((line) => [...(line as [number, number][])].reverse())
          reversedGeometry = {
            type: "MultiLineString",
            coordinates: reversedLines,
          }
        } else {
          // Fallback to LineString if geometry type is unexpected
          reversedGeometry = {
            type: "LineString",
            coordinates: reversedOptimizedCoordinates,
          }
        }

        return {
          ...road.feature,
          geometry: reversedGeometry,
          properties: {
            ...road.feature.properties,
            id: `${newRoute.id}-optimized`,
            name: "Optimized Route (Reversed)",
          },
        }
      })

      // Add reversed optimized route to snapped roads immediately
      addSnappedRoads(newRoute.id, reversedOptimizedFeatures)

      // Set markers first (this creates the routeMarkers entry)
      setOptimizedRouteMarkers(
        newRoute.id,
        { lat: origin[1], lng: origin[0] },
        { lat: destination[1], lng: destination[0] },
      )

      // Add waypoints if they exist (must be done after markers are set)
      if (reversedWaypoints.length > 0) {
        reversedWaypoints.forEach((waypoint) => {
          const addWaypoint = useLayerStore.getState().addWaypoint
          addWaypoint(newRoute.id, waypoint.position)
        })

        // Regenerate route with waypoints (this will create a fresh optimized route with waypoints)
        // Use setTimeout to ensure waypoints are added to store before regeneration
        setTimeout(() => {
          regenerateRoute(newRoute.id)
        }, 100)
      }

      // Select the new reversed route (deselect the original)
      setSelectedUploadedRouteId(newRoute.id)

      // Ensure panel stays open when reversed route is created
      // Use setTimeout to ensure this runs after the route is added to the store
      setTimeout(() => {
        setIsOpen(true)
      }, 0)

      console.log("✅ Created reversed route from optimized route:", routeName)
    },
    [
      uploadedRoutes.routes,
      regenerateRoute,
      addSnappedRoads,
      setOptimizedRouteMarkers,
      setSelectedUploadedRouteId,
      setIsOpen,
    ],
  )

  // Batch create reversed routes
  const handleBatchCreateReversed = React.useCallback(() => {
    if (selectedRouteIds.size === 0) return

    selectedRouteIds.forEach((routeId) => {
      const route = displayedRoutes.find((r) => r.routeId === routeId)
      if (route) {
        const reversedRouteName = `${route.routeName} (Reversed)`
        handleCreateReversedRoute(routeId, reversedRouteName)
      }
    })

    // Clear selection after creating reversed routes
    setSelectedRouteIds(new Set())
  }, [selectedRouteIds, displayedRoutes, handleCreateReversedRoute])

  // Individual delete route
  const handleDeleteRoute = React.useCallback(
    (routeId: string) => {
      // Abort route generation for this route if it's in progress
      const controller = abortControllersRef.current.get(routeId)
      if (controller) {
        controller.abort()
        abortControllersRef.current.delete(routeId)
      }

      // Get latest state from store
      const currentState = useLayerStore.getState()
      const isSelectedRoute = currentState.selectedUploadedRouteId === routeId

      // Clear hover state if this route is being hovered
      if (currentState.snappedRoads.hoveredRouteId === routeId) {
        setHoveredRouteId(null)
      }

      // If this is the selected route, do full cleanup (similar to handleBackToAllRoutes)
      if (isSelectedRoute) {
        // Discard any unsaved changes
        if (currentState.hasUnsavedChanges(routeId)) {
          discardRouteChanges(routeId)
        }
        setSelectedUploadedRouteId(null)
        setSelectedRoutePanelVisible(false)
        setMapMode("view")
        // Cancel waypoint adding mode if active
        if (isAddingWaypoint) {
          cancelAddingWaypoint()
        }
      }

      // Remove from selection if in multi-select mode
      if (selectedRouteIds.has(routeId)) {
        setSelectedRouteIds((prev) => {
          const newSet = new Set(prev)
          newSet.delete(routeId)
          return newSet
        })
      }

      // Remove the uploaded route
      removeUploadedRoute(routeId)

      // Remove the Google routes for this route
      removeSnappedRoadsForRoute(routeId)

      // Remove the markers for this route
      removeOptimizedRouteMarkers(routeId)

      // Focus on all remaining routes after deletion
      setTimeout(() => {
        const updatedState = useLayerStore.getState()
        const allRouteIds = updatedState.uploadedRoutes.routes.map((r) => r.id)
        if (allRouteIds.length > 0) {
          focusOnUploadedRoutes(allRouteIds)
          // Ensure panel stays open after deletion if routes remain
          setIsOpen(true)
        } else {
          // If all routes are deleted, collapse and close the panel
          setIsOpen(false)
          setLeftPanelExpanded(false)
          setActivePanel("saved_routes")
        }
      }, 0)
    },
    [
      setHoveredRouteId,
      setSelectedUploadedRouteId,
      setSelectedRoutePanelVisible,
      setMapMode,
      selectedRouteIds,
      removeUploadedRoute,
      removeSnappedRoadsForRoute,
      removeOptimizedRouteMarkers,
      setIsOpen,
      setLeftPanelExpanded,
      setActivePanel,
      isAddingWaypoint,
      cancelAddingWaypoint,
      discardRouteChanges,
      focusOnUploadedRoutes,
    ],
  )

  // Remove all routes outside boundary
  const handleRemoveOutOfBoundaryRoutes = React.useCallback(() => {
    const routesOutsideBoundary = googleRoutesInfo.filter(
      (r) => !r.isOptimizedRouteWithinBoundary,
    )

    if (routesOutsideBoundary.length === 0) {
      return
    }

    // Get latest state from store
    const currentState = useLayerStore.getState()
    const selectedRouteId = currentState.selectedUploadedRouteId
    const isSelectedRouteOutOfBoundary = routesOutsideBoundary.some(
      (r) => r.routeId === selectedRouteId,
    )

    routesOutsideBoundary.forEach((routeInfo) => {
      const routeId = routeInfo.routeId

      // Abort route generation for this route if it's in progress
      const controller = abortControllersRef.current.get(routeId)
      if (controller) {
        controller.abort()
        abortControllersRef.current.delete(routeId)
      }

      // Clear hover state if this route is being hovered
      if (currentState.snappedRoads.hoveredRouteId === routeId) {
        setHoveredRouteId(null)
      }

      // Remove from selection if in multi-select mode
      if (selectedRouteIds.has(routeId)) {
        setSelectedRouteIds((prev) => {
          const newSet = new Set(prev)
          newSet.delete(routeId)
          return newSet
        })
      }

      // Remove the uploaded route
      removeUploadedRoute(routeId)

      // Remove the Google routes for this route
      removeSnappedRoadsForRoute(routeId)

      // Remove the markers for this route
      removeOptimizedRouteMarkers(routeId)
    })

    // If the selected route was out of boundary, do full cleanup
    if (isSelectedRouteOutOfBoundary && selectedRouteId) {
      // Discard any unsaved changes
      if (currentState.hasUnsavedChanges(selectedRouteId)) {
        discardRouteChanges(selectedRouteId)
      }
      setSelectedUploadedRouteId(null)
      setSelectedRoutePanelVisible(false)
      setMapMode("view")
      // Cancel waypoint adding mode if active
      if (isAddingWaypoint) {
        cancelAddingWaypoint()
      }
    }

    // Focus on all remaining routes after deletion
    setTimeout(() => {
      const updatedState = useLayerStore.getState()
      const allRouteIds = updatedState.uploadedRoutes.routes.map((r) => r.id)
      if (allRouteIds.length > 0) {
        focusOnUploadedRoutes(allRouteIds)
        // Ensure panel stays open after deletion if routes remain
        setIsOpen(true)
      } else {
        // If all routes are deleted, collapse and close the panel
        setIsOpen(false)
        setLeftPanelExpanded(false)
        setActivePanel("saved_routes")
      }
    }, 0)

    // Close dialog
    setRemoveOutOfBoundaryDialogOpen(false)

    toast.success(
      `Removed ${routesOutsideBoundary.length} route${
        routesOutsideBoundary.length !== 1 ? "s" : ""
      } outside jurisdiction boundary`,
    )
  }, [
    googleRoutesInfo,
    selectedRouteIds,
    setHoveredRouteId,
    setSelectedUploadedRouteId,
    setSelectedRoutePanelVisible,
    setMapMode,
    removeUploadedRoute,
    removeSnappedRoadsForRoute,
    removeOptimizedRouteMarkers,
    setIsOpen,
    setLeftPanelExpanded,
    setActivePanel,
    isAddingWaypoint,
    cancelAddingWaypoint,
    discardRouteChanges,
    focusOnUploadedRoutes,
  ])

  // Remove all routes over 80km
  const handleRemoveOver80KmRoutes = React.useCallback(() => {
    const routesOver80Km = googleRoutesInfo.filter(
      (r) => (r.calculatedRouteLengthKm || r.distanceKm) > 80,
    )

    if (routesOver80Km.length === 0) {
      return
    }

    // Get latest state from store
    const currentState = useLayerStore.getState()
    const selectedRouteId = currentState.selectedUploadedRouteId
    const isSelectedRouteOver80Km = routesOver80Km.some(
      (r) => r.routeId === selectedRouteId,
    )

    routesOver80Km.forEach((routeInfo) => {
      const routeId = routeInfo.routeId

      // Abort route generation for this route if it's in progress
      const controller = abortControllersRef.current.get(routeId)
      if (controller) {
        controller.abort()
        abortControllersRef.current.delete(routeId)
      }

      // Clear hover state if this route is being hovered
      if (currentState.snappedRoads.hoveredRouteId === routeId) {
        setHoveredRouteId(null)
      }

      // Remove from selection if in multi-select mode
      if (selectedRouteIds.has(routeId)) {
        setSelectedRouteIds((prev) => {
          const newSet = new Set(prev)
          newSet.delete(routeId)
          return newSet
        })
      }

      // Remove the uploaded route
      removeUploadedRoute(routeId)

      // Remove the Google routes for this route
      removeSnappedRoadsForRoute(routeId)

      // Remove the markers for this route
      removeOptimizedRouteMarkers(routeId)
    })

    // If the selected route was over 80km, do full cleanup
    if (isSelectedRouteOver80Km && selectedRouteId) {
      // Discard any unsaved changes
      if (currentState.hasUnsavedChanges(selectedRouteId)) {
        discardRouteChanges(selectedRouteId)
      }
      setSelectedUploadedRouteId(null)
      setSelectedRoutePanelVisible(false)
      setMapMode("view")
      // Cancel waypoint adding mode if active
      if (isAddingWaypoint) {
        cancelAddingWaypoint()
      }
    }

    // Focus on all remaining routes after deletion
    setTimeout(() => {
      const updatedState = useLayerStore.getState()
      const allRouteIds = updatedState.uploadedRoutes.routes.map((r) => r.id)
      if (allRouteIds.length > 0) {
        focusOnUploadedRoutes(allRouteIds)
        // Ensure panel stays open after deletion if routes remain
        setIsOpen(true)
      } else {
        // If all routes are deleted, collapse and close the panel
        setIsOpen(false)
        setLeftPanelExpanded(false)
        setActivePanel("saved_routes")
      }
    }, 0)

    // Close dialog
    setRemoveOver80KmDialogOpen(false)

    const limitKm = 80
    const limitInUserUnit =
      distanceUnit === "miles" ? convertKmToMiles(limitKm) : limitKm
    const limitDisplay =
      distanceUnit === "miles"
        ? `${limitInUserUnit.toFixed(1)} mi`
        : `${limitKm} km`

    toast.success(
      `Removed ${routesOver80Km.length} route${
        routesOver80Km.length !== 1 ? "s" : ""
      } exceeding ${limitDisplay} limit`,
    )
  }, [
    googleRoutesInfo,
    selectedRouteIds,
    setHoveredRouteId,
    setSelectedUploadedRouteId,
    setSelectedRoutePanelVisible,
    setMapMode,
    removeUploadedRoute,
    removeSnappedRoadsForRoute,
    removeOptimizedRouteMarkers,
    setIsOpen,
    setLeftPanelExpanded,
    setActivePanel,
    isAddingWaypoint,
    cancelAddingWaypoint,
    discardRouteChanges,
    focusOnUploadedRoutes,
    distanceUnit,
  ])

  // Batch delete routes
  const handleBatchDelete = React.useCallback(() => {
    if (selectedRouteIds.size === 0) return

    // Get latest state from store
    const currentState = useLayerStore.getState()
    const selectedRouteId = currentState.selectedUploadedRouteId
    const isSelectedRouteInBatch =
      selectedRouteId && selectedRouteIds.has(selectedRouteId)

    selectedRouteIds.forEach((routeId) => {
      // Abort route generation for this route if it's in progress
      const controller = abortControllersRef.current.get(routeId)
      if (controller) {
        controller.abort()
        abortControllersRef.current.delete(routeId)
      }

      // Clear hover state if this route is being hovered
      if (currentState.snappedRoads.hoveredRouteId === routeId) {
        setHoveredRouteId(null)
      }

      // Remove the uploaded route
      removeUploadedRoute(routeId)

      // Remove the Google routes for this route
      removeSnappedRoadsForRoute(routeId)

      // Remove the markers for this route
      removeOptimizedRouteMarkers(routeId)
    })

    // If the selected route was in the batch, do full cleanup
    if (isSelectedRouteInBatch && selectedRouteId) {
      // Discard any unsaved changes
      if (currentState.hasUnsavedChanges(selectedRouteId)) {
        discardRouteChanges(selectedRouteId)
      }
      setSelectedUploadedRouteId(null)
      setSelectedRoutePanelVisible(false)
      setMapMode("view")
      // Cancel waypoint adding mode if active
      if (isAddingWaypoint) {
        cancelAddingWaypoint()
      }
    }

    // Clear selection after deleting routes
    setSelectedRouteIds(new Set())

    // Focus on all remaining routes after deletion
    setTimeout(() => {
      const updatedState = useLayerStore.getState()
      const allRouteIds = updatedState.uploadedRoutes.routes.map((r) => r.id)
      if (allRouteIds.length > 0) {
        focusOnUploadedRoutes(allRouteIds)
        // Ensure panel stays open after batch deletion if routes remain
        setIsOpen(true)
      } else {
        // If all routes are deleted, collapse and close the panel
        setIsOpen(false)
        setLeftPanelExpanded(false)
        setActivePanel("saved_routes")
      }
    }, 0)
  }, [
    selectedRouteIds,
    setHoveredRouteId,
    setSelectedUploadedRouteId,
    setSelectedRoutePanelVisible,
    setMapMode,
    removeUploadedRoute,
    removeSnappedRoadsForRoute,
    removeOptimizedRouteMarkers,
    setIsOpen,
    setLeftPanelExpanded,
    setActivePanel,
    isAddingWaypoint,
    cancelAddingWaypoint,
    discardRouteChanges,
    focusOnUploadedRoutes,
  ])

  // Panel should never automatically close - only close when user explicitly closes it
  // Removed automatic closing logic to prevent panel from closing when routes are deleted
  // Removed early return when no routes - panel should stay open even when empty

  return (
    <>
      {/* Remove Out of Boundary Routes Confirmation Dialog */}
      <Modal
        open={removeOutOfBoundaryDialogOpen}
        onClose={() => setRemoveOutOfBoundaryDialogOpen(false)}
        title="Remove Routes Outside Boundary"
        maxWidth="sm"
        actions={
          <>
            <Button
              variant="outlined"
              onClick={() => setRemoveOutOfBoundaryDialogOpen(false)}
              sx={{
                textTransform: "none",
                fontFamily: '"Google Sans", Roboto',
                fontSize: "14px",
                fontWeight: 500,
                padding: "8px 16px",
                borderColor: "#d1d5db",
                color: "#1976d2",
                "&:hover": {
                  borderColor: "#1976d2",
                  backgroundColor: "#e3f2fd",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleRemoveOutOfBoundaryRoutes}
              sx={{
                textTransform: "none",
                fontFamily: '"Google Sans", Roboto',
                fontSize: "14px",
                fontWeight: 500,
                padding: "8px 16px",
                backgroundColor: "#e65100",
                "&:hover": {
                  backgroundColor: "#bf360c",
                },
              }}
            >
              Remove All
            </Button>
          </>
        }
      >
        <Box>
          <Typography
            variant="body2"
            sx={{
              fontSize: "14px",
              fontWeight: 400,
              color: "#202124",
              fontFamily: '"Google Sans", sans-serif',
              lineHeight: 1.5,
              mb: 2,
            }}
          >
            Are you sure you want to remove all routes outside the jurisdiction
            boundary? This action cannot be undone.
          </Typography>
          <Box
            sx={{
              px: 2,
              py: 1.5,
              backgroundColor: "#fff3e0",
              border: "1px solid #ffb74d",
              borderRadius: "8px",
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontSize: "13px",
                fontWeight: 500,
                color: "#e65100",
                fontFamily: '"Google Sans", sans-serif',
                mb: 0.5,
              }}
            >
              Routes to be removed:
            </Typography>
            <Box
              component="ul"
              sx={{
                margin: 0,
                paddingLeft: 2,
                fontSize: "13px",
                color: "#e65100",
                fontFamily: '"Google Sans", sans-serif',
              }}
            >
              {googleRoutesInfo
                .filter((r) => !r.isOptimizedRouteWithinBoundary)
                .map((route) => (
                  <li key={route.routeId}>{route.routeName}</li>
                ))}
            </Box>
          </Box>
        </Box>
      </Modal>

      {/* Remove Over 80km Routes Confirmation Dialog */}
      <Modal
        open={removeOver80KmDialogOpen}
        onClose={() => setRemoveOver80KmDialogOpen(false)}
        title="Remove Routes Over 80km"
        maxWidth="sm"
        actions={
          <>
            <Button
              variant="outlined"
              onClick={() => setRemoveOver80KmDialogOpen(false)}
              sx={{
                textTransform: "none",
                fontFamily: '"Google Sans", Roboto',
                fontSize: "14px",
                fontWeight: 500,
                padding: "8px 16px",
                borderColor: "#d1d5db",
                color: "#1976d2",
                "&:hover": {
                  borderColor: "#1976d2",
                  backgroundColor: "#e3f2fd",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleRemoveOver80KmRoutes}
              sx={{
                textTransform: "none",
                fontFamily: '"Google Sans", Roboto',
                fontSize: "14px",
                fontWeight: 500,
                padding: "8px 16px",
                backgroundColor: "#e65100",
                "&:hover": {
                  backgroundColor: "#bf360c",
                },
              }}
            >
              Remove All
            </Button>
          </>
        }
      >
        <Box>
          <Typography
            variant="body2"
            sx={{
              fontSize: "14px",
              fontWeight: 400,
              color: "#202124",
              fontFamily: '"Google Sans", sans-serif',
              lineHeight: 1.5,
              mb: 2,
            }}
          >
            Are you sure you want to remove all routes exceeding the 80km limit?
            This action cannot be undone.
          </Typography>
          <Box
            sx={{
              px: 2,
              py: 1.5,
              backgroundColor: "#fff3e0",
              border: "1px solid #ffb74d",
              borderRadius: "8px",
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontSize: "13px",
                fontWeight: 500,
                color: "#e65100",
                fontFamily: '"Google Sans", sans-serif',
                mb: 0.5,
              }}
            >
              Routes to be removed:
            </Typography>
            <Box
              component="ul"
              sx={{
                margin: 0,
                paddingLeft: 2,
                fontSize: "13px",
                color: "#e65100",
                fontFamily: '"Google Sans", sans-serif',
              }}
            >
              {googleRoutesInfo
                .filter((r) => (r.calculatedRouteLengthKm || r.distanceKm) > 80)
                .map((route) => (
                  <li key={route.routeId}>{route.routeName}</li>
                ))}
            </Box>
          </Box>
        </Box>
      </Modal>

      {/* Reversed Route Naming Dialog */}
      <Modal
        open={reversedRouteDialogOpen}
        onClose={() => {
          setReversedRouteDialogOpen(false)
          setReversedRouteName("")
          setReversingRouteId(null)
        }}
        title="Name Reversed Route"
        actions={
          <>
            <Button
              variant="outlined"
              onClick={() => {
                setReversedRouteDialogOpen(false)
                setReversedRouteName("")
                setReversingRouteId(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                if (reversingRouteId && reversedRouteName.trim()) {
                  const trimmed = reversedRouteName.trim()
                  if (trimmed.length > 100) {
                    return // Don't proceed if exceeds limit
                  }
                  handleCreateReversedRoute(reversingRouteId, trimmed)
                  setReversedRouteDialogOpen(false)
                  setReversedRouteName("")
                  setReversingRouteId(null)
                }
              }}
              disabled={!reversedRouteName.trim()}
            >
              Create
            </Button>
          </>
        }
      >
        <Box sx={{ mt: 2 }}>
          <TextField
            fullWidth
            label="Route Name"
            value={reversedRouteName}
            onChange={(e) => setReversedRouteName(e.target.value)}
            placeholder="Enter route name"
            autoFocus
            inputProps={{ maxLength: 100 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && reversedRouteName.trim()) {
                if (reversingRouteId) {
                  const trimmed = reversedRouteName.trim()
                  if (trimmed.length > 100) {
                    return // Don't proceed if exceeds limit
                  }
                  handleCreateReversedRoute(reversingRouteId, trimmed)
                  setReversedRouteDialogOpen(false)
                  setReversedRouteName("")
                  setReversingRouteId(null)
                }
              }
            }}
          />
        </Box>
      </Modal>

      {/* Folder Selection Dialog */}
      <Modal
        open={folderDialogOpen}
        onClose={() => {
          // Clear selected folder when dialog is closed (via X, ESC, or backdrop click)
          setSelectedTag(null)
          setTagError("")
          setFolderDialogOpen(false)
        }}
        title="Select Folder"
        maxWidth="xs"
        actions={
          <>
            <Button
              variant="outlined"
              onClick={handleCancelFolderDialog}
              sx={{
                textTransform: "none",
                fontFamily: '"Google Sans", Roboto',
                fontSize: "14px",
                fontWeight: 500,
                padding: "8px 16px",
                borderColor: "#d1d5db",
                color: "#1976d2",
                "&:hover": {
                  borderColor: "#1976d2",
                  backgroundColor: "#e3f2fd",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveFromDialog}
              disabled={
                isSaving ||
                !allRoutesLoaded ||
                !selectedTag ||
                !selectedTag.trim()
              }
              sx={{
                textTransform: "none",
                fontFamily: '"Google Sans", Roboto',
                fontSize: "14px",
                fontWeight: 500,
                padding: "8px 16px",
                backgroundColor: "#1976d2",
                "&:hover": {
                  backgroundColor: "#1565c0",
                },
                "&:disabled": {
                  backgroundColor: "#9ca3af",
                  color: "#ffffff",
                },
              }}
            >
              {isSaving
                ? editingSavedRouteId
                  ? "Updating..."
                  : "Saving..."
                : !allRoutesLoaded
                  ? "Loading routes..."
                  : editingSavedRouteId
                    ? "Update Route"
                    : `Save All (${googleRoutesInfo.length})`}
            </Button>
          </>
        }
      >
        <Box sx={{ mb: 2 }}>
          {tags.length > 0 && (
            <Typography
              variant="caption"
              sx={{
                fontSize: "12px",
                color: "#757575",
                fontFamily: '"Google Sans", sans-serif',
                mb: 1.5,
                display: "block",
              }}
            >
              {tags.length} {tags.length === 1 ? "folder" : "folders"} available
            </Typography>
          )}
          <TagSelector
            value={selectedTag}
            onChange={handleTagChange}
            onInputChange={handleTagInputChange}
            tags={tags}
            error={tagError}
            required
            showTagsCount={false}
            label="Folder"
          />
        </Box>
      </Modal>
      {/* Left Panel for Routes List - only show when open */}
      {isOpen && (
        <FloatingSheet
          isExpanded={leftPanelExpanded}
          onToggle={handleToggleCollapse}
          width={360}
          disabled={isRoutesLoading}
        >
          {/* Header Section - Fixed Height */}
          <Box
            className="px-4 pt-3 pb-3 border-b border-gray-200 bg-[#FAFAFA]"
            sx={{
              flexShrink: 0,
            }}
          >
            <Box className="flex items-center justify-between mb-3">
              <Typography
                variant="h6"
                className="text-gray-900 font-medium"
                style={{ fontSize: "15px", fontWeight: 500 }}
              >
                {editingSavedRouteId ? "Edit Route" : "Uploaded Routes"}
              </Typography>
              {!isRoutesLoading && (
                <RouteFilter
                  sortBy={sortBy}
                  onSortChange={(newSortBy) => {
                    if (
                      newSortBy === "difference" ||
                      newSortBy === "distance" ||
                      newSortBy === "alphabetical"
                    ) {
                      setSortBy(newSortBy)
                    }
                  }}
                  reverseOrder={reverseOrder}
                  onReverseOrderChange={setReverseOrder}
                />
              )}
            </Box>
            {isRoutesLoading && (
              <Box
                sx={{
                  mb: 2,
                  px: 2,
                  py: 1.5,
                  backgroundColor: "#e3f2fd",
                  border: "1px solid #90caf9",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <CircularProgress size={16} sx={{ color: "#1976d2" }} />
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "13px",
                    fontWeight: 400,
                    color: "#1565c0",
                    fontFamily: '"Google Sans", sans-serif',
                  }}
                >
                  Please wait while all routes are being loaded...
                </Typography>
              </Box>
            )}
            {/* Search Input */}
            <Box className="mb-3">
              <SearchBar
                placeholder="Search routes..."
                value={searchQuery}
                onChange={setSearchQuery}
              />
            </Box>
            <Box className="flex items-center justify-between">
              <Box className="flex items-center gap-2">
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "12px",
                    color: "#757575",
                    fontWeight: 400,
                    fontFamily: '"Google Sans", sans-serif',
                  }}
                >
                  {multiSelectEnabled && selectedRouteIds.size > 0 ? (
                    <>
                      {selectedRouteIds.size} route
                      {selectedRouteIds.size !== 1 ? "s" : ""} selected
                    </>
                  ) : (
                    <>
                      {displayedRoutes.length}{" "}
                      {displayedRoutes.length === 1 ? "route" : "routes"}
                      {searchQuery && (
                        <span> of {googleRoutesInfo.length}</span>
                      )}
                    </>
                  )}
                </Typography>
                {multiSelectEnabled &&
                  selectedRouteIds.size > 0 &&
                  !isRoutesLoading && (
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                    >
                      <Tooltip
                        title={`Create reversed routes for ${selectedRouteIds.size} selected route${selectedRouteIds.size !== 1 ? "s" : ""}`}
                      >
                        <IconButton
                          size="small"
                          onClick={handleBatchCreateReversed}
                          sx={{
                            color: "#1976d2",
                            border: "1px solid #e0e0e0",
                            padding: "2px",
                            width: "24px",
                            height: "24px",
                            "&:hover": {
                              backgroundColor: "#e3f2fd",
                              color: "#1565c0",
                              borderColor: "#1976d2",
                            },
                          }}
                        >
                          <AddRowIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip
                        title={`Delete ${selectedRouteIds.size} selected route${selectedRouteIds.size !== 1 ? "s" : ""}`}
                      >
                        <IconButton
                          size="small"
                          onClick={handleBatchDelete}
                          sx={{
                            color: "#757575",
                            border: "1px solid #e0e0e0",
                            padding: "2px",
                            width: "24px",
                            height: "24px",
                            "&:hover": {
                              backgroundColor: "#f0f0f0",
                              color: PRIMARY_RED,
                              borderColor: PRIMARY_RED,
                            },
                          }}
                        >
                          <Delete sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
              </Box>
              <Box className="flex items-center gap-1">
                {displayedRoutes.length > 0 && !isRoutesLoading && (
                  <>
                    {multiSelectEnabled ? (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={
                          selectedRouteIds.size === displayedRoutes.length
                            ? deselectAllRoutes
                            : selectAllRoutes
                        }
                        sx={{
                          fontSize: "12px",
                          textTransform: "none",
                          fontFamily: '"Google Sans", Roboto',
                          fontWeight: 500,
                          color: "#5f6368",
                          borderColor: "#d1d5db",
                          padding: "6px 12px",
                          minWidth: "auto",
                          "&:hover": {
                            borderColor: "#1976d2",
                            backgroundColor: "#e3f2fd",
                          },
                        }}
                      >
                        {selectedRouteIds.size === displayedRoutes.length
                          ? "Deselect All"
                          : "Select All"}
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setMultiSelectEnabled(true)}
                        sx={{
                          fontSize: "12px",
                          textTransform: "none",
                          fontFamily: '"Google Sans", Roboto',
                          fontWeight: 500,
                          color: "#5f6368",
                          borderColor: "#d1d5db",
                          padding: "6px 12px",
                          minWidth: "auto",
                          "&:hover": {
                            borderColor: "#1976d2",
                            backgroundColor: "#e3f2fd",
                          },
                        }}
                      >
                        Select
                      </Button>
                    )}
                    {multiSelectEnabled && (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setMultiSelectEnabled(false)}
                        sx={{
                          fontSize: "12px",
                          textTransform: "none",
                          fontFamily: '"Google Sans", Roboto',
                          fontWeight: 500,
                          color: "#757575",
                          padding: "6px 12px",
                          minWidth: "auto",
                          "&:hover": {
                            backgroundColor: "#f5f5f5",
                          },
                        }}
                      >
                        Done
                      </Button>
                    )}
                  </>
                )}
              </Box>
            </Box>
          </Box>

          {/* Content - Takes full remaining height */}
          <Box
            className="flex-1 flex flex-col"
            sx={{
              minHeight: 0, // Allows flex child to shrink below content size
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* Routes List - Scrollable */}
            <Box
              className="flex-1 overflow-auto pretty-scrollbar"
              sx={{
                minHeight: 0,
              }}
            >
              {shouldShowLoadingInList ? (
                <Box className="p-6 text-center">
                  <CircularProgress size={32} />
                  <Typography
                    variant="body2"
                    className="text-gray-500 mt-2"
                    style={{ fontSize: "14px" }}
                  >
                    Generating routes...
                  </Typography>
                </Box>
              ) : uploadedRoutes.routes.length === 0 ? (
                <Box className="p-6 text-center text-gray-500">
                  <Typography variant="body2" style={{ fontSize: "14px" }}>
                    No routes uploaded yet.
                  </Typography>
                </Box>
              ) : displayedRoutes.length === 0 ? (
                <Box className="p-6 text-center text-gray-500">
                  <Typography variant="body2" style={{ fontSize: "14px" }}>
                    No Google routes generated yet.
                  </Typography>
                </Box>
              ) : (
                <List disablePadding className="px-4 !mx-0 !my-2">
                  {displayedRoutes.map((route) => {
                    return (
                      <React.Fragment key={route.routeId}>
                        <ListItem className="mb-1" disablePadding>
                          <ListItemButton
                            selected={selectedUploadedRouteId === route.routeId}
                            disabled={isRoutesLoading}
                            onClick={() => {
                              if (isRoutesLoading) return
                              if (multiSelectEnabled) {
                                // Multi-select mode: toggle checkbox and sync panel
                                const isCurrentlySelected =
                                  selectedUploadedRouteId === route.routeId
                                const isCheckboxChecked = selectedRouteIds.has(
                                  route.routeId,
                                )

                                // Toggle checkbox
                                toggleRouteSelection(route.routeId)

                                // Sync panel state with checkbox state
                                // If checkbox will be checked (currently unchecked), open panel
                                // If checkbox will be unchecked (currently checked), close panel if it's open for this route
                                if (isCheckboxChecked) {
                                  // Checkbox will be unchecked after toggle
                                  // Close panel if it's open for this route
                                  if (isCurrentlySelected) {
                                    setSelectedUploadedRouteId(null)
                                    setSelectedRoutePanelVisible(false)
                                    setMapMode("view")
                                  }
                                } else {
                                  // Checkbox will be checked after toggle
                                  // Cancel waypoint adding mode if selecting a different route
                                  if (
                                    isAddingWaypoint &&
                                    waypointAddingRouteId !== route.routeId
                                  ) {
                                    cancelAddingWaypoint()
                                  }
                                  // Open panel for this route
                                  setSelectedUploadedRouteId(route.routeId)
                                  setSelectedRoutePanelVisible(true)
                                  setMapMode("editing_uploaded_route")
                                  // Keep panel open when selecting a route
                                  setIsOpen(true)
                                  setActivePanel("uploaded_routes")
                                  // Initialize editing state when route is selected
                                  initializeRouteEditing(route.routeId)
                                }
                              } else {
                                // Normal mode: just open/close the panel
                                const isCurrentlySelected =
                                  selectedUploadedRouteId === route.routeId
                                if (isCurrentlySelected) {
                                  setSelectedUploadedRouteId(null)
                                  setSelectedRoutePanelVisible(false)
                                  setMapMode("view")
                                } else {
                                  // Cancel waypoint adding mode if selecting a different route
                                  if (
                                    isAddingWaypoint &&
                                    waypointAddingRouteId !== route.routeId
                                  ) {
                                    cancelAddingWaypoint()
                                  }
                                  setSelectedUploadedRouteId(route.routeId)
                                  setSelectedRoutePanelVisible(true)
                                  setMapMode("editing_uploaded_route")
                                  // Keep panel open when selecting a route
                                  setIsOpen(true)
                                  setActivePanel("uploaded_routes")
                                  // Initialize editing state when route is selected
                                  initializeRouteEditing(route.routeId)
                                }
                              }
                            }}
                            onMouseEnter={() =>
                              setHoveredRouteId(route.routeId)
                            }
                            onMouseLeave={() => setHoveredRouteId(null)}
                            sx={{
                              minHeight: 44,
                              padding: "6px 12px",
                              borderRadius: "1rem", // rounded-2xl
                              marginBottom: "4px",
                              position: "relative",
                              zIndex: 10, // Ensure route card is above horizontal lines
                              backgroundColor:
                                multiSelectEnabled &&
                                selectedRouteIds.has(route.routeId)
                                  ? "#e3f2fd"
                                  : selectedUploadedRouteId === route.routeId
                                    ? "#e3f2fd"
                                    : "#ffffff",
                              borderLeft:
                                multiSelectEnabled &&
                                selectedRouteIds.has(route.routeId)
                                  ? "3px solid #1b75d2"
                                  : selectedUploadedRouteId === route.routeId
                                    ? "3px solid #1976d2"
                                    : "3px solid transparent",
                              border: "1px solid #e0e0e0",
                              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                              "&:hover": {
                                backgroundColor:
                                  multiSelectEnabled &&
                                  selectedRouteIds.has(route.routeId)
                                    ? "#e3f2fd"
                                    : "#f5f5f5",
                                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                              },
                              "&.Mui-selected": {
                                backgroundColor: "#e3f2fd",
                                "&:hover": {
                                  backgroundColor: "#bbdefb",
                                },
                              },
                              "&.Mui-disabled": {
                                opacity: 0.6,
                                cursor: "not-allowed",
                                "&:hover": {
                                  backgroundColor: "#ffffff",
                                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                                },
                              },
                            }}
                          >
                            {multiSelectEnabled && (
                              <ListItemIcon
                                className="min-w-[40px]"
                                sx={{
                                  minWidth: 40,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "flex-start",
                                }}
                              >
                                <Checkbox
                                  checked={selectedRouteIds.has(route.routeId)}
                                  disabled={isRoutesLoading}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (isRoutesLoading) return
                                    const isCurrentlySelected =
                                      selectedUploadedRouteId === route.routeId
                                    const isCheckboxChecked =
                                      selectedRouteIds.has(route.routeId)

                                    // Toggle checkbox
                                    toggleRouteSelection(route.routeId)

                                    // Sync panel state with checkbox state
                                    // If checkbox will be checked (currently unchecked), open panel
                                    // If checkbox will be unchecked (currently checked), close panel if it's open for this route
                                    if (isCheckboxChecked) {
                                      // Checkbox will be unchecked after toggle
                                      // Close panel if it's open for this route
                                      if (isCurrentlySelected) {
                                        setSelectedUploadedRouteId(null)
                                        setSelectedRoutePanelVisible(false)
                                        setMapMode("view")
                                      }
                                    } else {
                                      // Checkbox will be checked after toggle
                                      // Cancel waypoint adding mode if selecting a different route
                                      if (
                                        isAddingWaypoint &&
                                        waypointAddingRouteId !== route.routeId
                                      ) {
                                        cancelAddingWaypoint()
                                      }
                                      // Open panel for this route
                                      setSelectedUploadedRouteId(route.routeId)
                                      setSelectedRoutePanelVisible(true)
                                      setMapMode("editing_uploaded_route")
                                      // Keep panel open when selecting a route
                                      setIsOpen(true)
                                      setLeftPanelExpanded(true)
                                      setActivePanel("uploaded_routes")
                                      // Initialize editing state when route is selected
                                      initializeRouteEditing(route.routeId)
                                    }
                                  }}
                                  size="small"
                                  sx={{
                                    color: "#757575",
                                    padding: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    "&.Mui-checked": {
                                      color: "#1976d2",
                                    },
                                  }}
                                  icon={
                                    <CheckBoxOutlineBlank
                                      sx={{
                                        fontSize: 20,
                                        display: "flex",
                                        alignItems: "center",
                                      }}
                                    />
                                  }
                                  checkedIcon={
                                    <CheckBox
                                      sx={{
                                        fontSize: 20,
                                        display: "flex",
                                        alignItems: "center",
                                      }}
                                    />
                                  }
                                />
                              </ListItemIcon>
                            )}

                            <ListItemText
                              sx={{
                                margin: 0,
                                padding: 0,
                                flex: 1,
                                minWidth: 0,
                                "& .MuiListItemText-primary": {
                                  marginBottom: "4px",
                                },
                                "& .MuiListItemText-secondary": {
                                  marginTop: 0,
                                },
                              }}
                              primary={
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 1,
                                    minWidth: 0,
                                  }}
                                >
                                  <Typography
                                    variant="body2"
                                    className="font-medium text-gray-900"
                                    title={route.routeName}
                                    sx={{
                                      fontSize: "14px",
                                      fontWeight: 500,
                                      lineHeight: 1.4,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      flex: 1,
                                      minWidth: 0,
                                      color:
                                        multiSelectEnabled &&
                                        selectedRouteIds.has(route.routeId)
                                          ? "#1976d2"
                                          : "#212121",
                                    }}
                                  >
                                    {route.routeName}
                                  </Typography>
                                  {!multiSelectEnabled && (
                                    <Box
                                      className="flex items-center gap-1"
                                      sx={{
                                        flexShrink: 0,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 0.5,
                                      }}
                                    >
                                      {/* Status Tags */}
                                      {hasUnsavedChanges(route.routeId) && (
                                        <Chip
                                          component="span"
                                          label="Unsaved"
                                          size="small"
                                          sx={{
                                            height: "16px",
                                            backgroundColor: "#fff3e0",
                                            color: "#e65100",
                                            border: "1px solid #ffb74d",
                                            "& .MuiChip-label": {
                                              padding: "0 4px",
                                              fontSize: "9px",
                                              fontWeight: 400,
                                              fontFamily:
                                                '"Google Sans", sans-serif',
                                              lineHeight: 1.2,
                                            },
                                            flexShrink: 0,
                                          }}
                                        />
                                      )}
                                      {!route.isOptimizedRouteWithinBoundary && (
                                        <Tooltip title="Optimized route is outside the jurisdiction boundary. This route will be excluded when saving.">
                                          <Chip
                                            component="span"
                                            label="Outside"
                                            size="small"
                                            sx={{
                                              height: "16px",
                                              backgroundColor:
                                                PRIMARY_RED_LIGHT,
                                              color: "#c62828",
                                              border: "1px solid #ef5350",
                                              "& .MuiChip-label": {
                                                padding: "0 4px",
                                                fontSize: "9px",
                                                fontWeight: 400,
                                                fontFamily:
                                                  '"Google Sans", sans-serif',
                                                lineHeight: 1.2,
                                              },
                                              flexShrink: 0,
                                              cursor: "help",
                                            }}
                                          />
                                        </Tooltip>
                                      )}
                                      {(() => {
                                        const routeLengthToCheck =
                                          route.calculatedRouteLengthKm ||
                                          route.distanceKm
                                        if (routeLengthToCheck > 80) {
                                          const limitKm = 80
                                          const limitInUserUnit =
                                            distanceUnit === "miles"
                                              ? convertKmToMiles(limitKm)
                                              : limitKm
                                          const limitDisplay =
                                            distanceUnit === "miles"
                                              ? `>${limitInUserUnit.toFixed(1)} mi`
                                              : `>${limitKm} km`

                                          const tooltipLimitDisplay =
                                            distanceUnit === "miles"
                                              ? `${limitInUserUnit.toFixed(1)} mi`
                                              : `${limitKm} km`

                                          return (
                                            <Tooltip
                                              title={`Route exceeds ${tooltipLimitDisplay} limit. This route cannot be saved.`}
                                            >
                                              <Chip
                                                component="span"
                                                label={limitDisplay}
                                                size="small"
                                                sx={{
                                                  height: "16px",
                                                  backgroundColor:
                                                    PRIMARY_RED_LIGHT,
                                                  color: "#c62828",
                                                  border: "1px solid #ef5350",
                                                  "& .MuiChip-label": {
                                                    padding: "0 4px",
                                                    fontSize: "9px",
                                                    fontWeight: 400,
                                                    fontFamily:
                                                      '"Google Sans", sans-serif',
                                                    lineHeight: 1.2,
                                                  },
                                                  flexShrink: 0,
                                                  cursor: "help",
                                                }}
                                              />
                                            </Tooltip>
                                          )
                                        }
                                        return null
                                      })()}
                                      {/* Action Buttons */}
                                      <Tooltip title="Create return route">
                                        <IconButton
                                          edge="end"
                                          aria-label="create return route"
                                          size="small"
                                          disabled={isRoutesLoading}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (isRoutesLoading) return
                                            setReversingRouteId(route.routeId)
                                            setReversedRouteName(
                                              `${route.routeName} (Reversed)`,
                                            )
                                            setReversedRouteDialogOpen(true)
                                          }}
                                          sx={{
                                            color: "#5f6368",
                                            padding: "4px",
                                            "&:hover": {
                                              backgroundColor: "#e3f2fd",
                                              color: "#1976d2",
                                            },
                                            "&:disabled": {
                                              color: "#bdbdbd",
                                              cursor: "not-allowed",
                                            },
                                            transition: "all 0.15s",
                                          }}
                                        >
                                          <AddRowIcon
                                            sx={{ fontSize: "18px" }}
                                          />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Delete route">
                                        <IconButton
                                          edge="end"
                                          aria-label="delete route"
                                          size="small"
                                          disabled={isRoutesLoading}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (isRoutesLoading) return
                                            handleDeleteRoute(route.routeId)
                                          }}
                                          sx={{
                                            color: "#5f6368",
                                            padding: "4px",
                                            "&:hover": {
                                              backgroundColor: "#fce8e6",
                                              color: "#d93025",
                                            },
                                            "&:disabled": {
                                              color: "#bdbdbd",
                                              cursor: "not-allowed",
                                            },
                                            transition: "all 0.15s",
                                          }}
                                        >
                                          <Delete fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    </Box>
                                  )}
                                </Box>
                              }
                              secondary={
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 0.5,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 0.5,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        fontSize: "11px",
                                        fontWeight: 400,
                                        color: "#757575",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {formatDistance(
                                        route.distanceKm,
                                        distanceUnit,
                                      )}
                                    </Typography>
                                    <Tooltip title="Shows how closely Google's route follows your uploaded route">
                                      <Chip
                                        component="span"
                                        label={`${route.similarityPercentage}% match`}
                                        size="small"
                                        sx={{
                                          height: "18px",
                                          backgroundColor:
                                            route.similarityPercentage >= 80
                                              ? "#e8f5e9"
                                              : route.similarityPercentage >= 60
                                                ? "#fff3e0"
                                                : PRIMARY_RED_LIGHT,
                                          color:
                                            route.similarityPercentage >= 80
                                              ? "#2e7d32"
                                              : route.similarityPercentage >= 60
                                                ? "#e65100"
                                                : "#c62828",
                                          "& .MuiChip-label": {
                                            padding: "0 6px",
                                            fontSize: "10px",
                                            fontWeight: 400,
                                            lineHeight: "18px",
                                          },
                                          cursor: "help",
                                          display: "inline-flex",
                                          alignItems: "center",
                                        }}
                                      />
                                    </Tooltip>
                                  </Box>
                                </Box>
                              }
                            />
                          </ListItemButton>
                        </ListItem>
                      </React.Fragment>
                    )
                  })}
                </List>
              )}
            </Box>
          </Box>
          {/* Footer */}
          <Box
            className="px-4 py-3 border-t border-gray-200 bg-white"
            sx={{
              flexShrink: 0,
              minHeight: "48px",
              position: "relative",
              zIndex: 1001, // Ensure footer is above content
            }}
          >
            <Box className="flex flex-col">
              {saveSuccess && (
                <Box
                  sx={{
                    px: 1.5,
                    py: 1,
                    mb: 2,
                    backgroundColor: "#e8f5e9",
                    border: "1px solid #c8e6c9",
                    borderRadius: "4px",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "14px",
                      fontWeight: 400,
                      color: "#2e7d32",
                      fontFamily: '"Google Sans", sans-serif',
                    }}
                  >
                    ✓ All routes saved successfully!
                  </Typography>
                </Box>
              )}
              {/* Combined warning for invalid routes */}
              {(() => {
                const routesOutsideBoundary = googleRoutesInfo.filter(
                  (r) => !r.isOptimizedRouteWithinBoundary,
                )
                const routesOver80Km = googleRoutesInfo.filter(
                  (r) => (r.calculatedRouteLengthKm || r.distanceKm) > 80,
                )

                if (
                  routesOutsideBoundary.length > 0 ||
                  routesOver80Km.length > 0
                ) {
                  return (
                    <Box
                      sx={{
                        px: 2,
                        py: 1.5,
                        mb: 2,
                        backgroundColor: "#fff3e0",
                        border: "1px solid #ffb74d",
                        borderRadius: "8px",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 0.5,
                        }}
                      >
                        {routesOutsideBoundary.length > 0 && (
                          <Typography
                            variant="body2"
                            component="div"
                            sx={{
                              fontSize: "13px",
                              fontWeight: 400,
                              color: "#e65100",
                              fontFamily: '"Google Sans", sans-serif',
                              lineHeight: 1.5,
                            }}
                          >
                            {routesOutsideBoundary.length}{" "}
                            {routesOutsideBoundary.length === 1
                              ? "route is"
                              : "routes are"}{" "}
                            outside the jurisdiction.{" "}
                            <Box
                              component="span"
                              onClick={() =>
                                setRemoveOutOfBoundaryDialogOpen(true)
                              }
                              sx={{
                                color: "#e65100",
                                textDecoration: "underline",
                                cursor: "pointer",
                                fontWeight: 500,
                                "&:hover": {
                                  color: "#bf360c",
                                },
                              }}
                            >
                              Remove all
                            </Box>
                          </Typography>
                        )}
                        {routesOver80Km.length > 0 &&
                          (() => {
                            const limitKm = 80
                            const limitInUserUnit =
                              distanceUnit === "miles"
                                ? convertKmToMiles(limitKm)
                                : limitKm
                            const limitDisplay =
                              distanceUnit === "miles"
                                ? `${limitInUserUnit.toFixed(1)} mi`
                                : `${limitKm} km`

                            return (
                              <Typography
                                variant="body2"
                                component="div"
                                sx={{
                                  fontSize: "13px",
                                  fontWeight: 400,
                                  color: "#e65100",
                                  fontFamily: '"Google Sans", sans-serif',
                                  lineHeight: 1.5,
                                }}
                              >
                                {routesOver80Km.length}{" "}
                                {routesOver80Km.length === 1
                                  ? "route exceeds"
                                  : "routes exceed"}{" "}
                                the {limitDisplay} limit and cannot be saved.{" "}
                                <Box
                                  component="span"
                                  onClick={() =>
                                    setRemoveOver80KmDialogOpen(true)
                                  }
                                  sx={{
                                    color: "#e65100",
                                    textDecoration: "underline",
                                    cursor: "pointer",
                                    fontWeight: 500,
                                    "&:hover": {
                                      color: "#bf360c",
                                    },
                                  }}
                                >
                                  Remove all
                                </Box>
                              </Typography>
                            )
                          })()}
                      </Box>
                    </Box>
                  )
                }
                return null
              })()}
              {/* Action Buttons */}
              {(() => {
                const routesOutsideBoundary = googleRoutesInfo.filter(
                  (r) => !r.isOptimizedRouteWithinBoundary,
                )
                const routesOver80Km = googleRoutesInfo.filter(
                  (r) => (r.calculatedRouteLengthKm || r.distanceKm) > 80,
                )
                return (
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      justifyContent: "flex-end",
                      alignItems: "center",
                    }}
                  >
                    <Box className="flex items-center gap-1">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          cancelFileProcessing()
                          setEditingSavedRouteId(null)
                          handleClearAll()
                          toast.info("Uploading cancelled")
                        }}
                        sx={{
                          minWidth: "80px",
                          textTransform: "none",
                          fontFamily: '"Google Sans", Roboto',
                          fontSize: "12px",
                          fontWeight: 500,
                          padding: "6px 12px",
                          borderColor: "#d1d5db",
                          color: "#1976d2",
                          "&:hover": {
                            borderColor: "#1976d2",
                            backgroundColor: "#e3f2fd",
                          },
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={handleOpenFolderDialog}
                        disabled={
                          isSaving ||
                          !allRoutesLoaded ||
                          routesOutsideBoundary.length > 0 ||
                          routesOver80Km.length > 0
                        }
                        sx={{
                          minWidth: "80px",
                          textTransform: "none",
                          fontFamily: '"Google Sans", Roboto',
                          fontSize: "12px",
                          fontWeight: 500,
                          padding: "6px 12px",
                          backgroundColor: "#1976d2",
                          "&:hover": {
                            backgroundColor: "#1565c0",
                          },
                          "&:disabled": {
                            backgroundColor: "#9ca3af",
                            color: "#ffffff",
                          },
                        }}
                      >
                        {!allRoutesLoaded ? "Loading routes..." : "Save"}
                      </Button>
                    </Box>
                  </Box>
                )
              })()}
            </Box>
          </Box>
        </FloatingSheet>
      )}

      {/* Right Panel for Selected Route - show when a route is selected (even if main panel is closed when editing) */}
      {(isOpen || editingSavedRouteId) &&
        selectedUploadedRouteId &&
        selectedRouteInfo && (
          <SelectedRoutePanel
            routeId={selectedUploadedRouteId}
            routeInfo={selectedRouteInfo}
            className={className}
            style={style}
            onBack={handleBackToAllRoutes}
            onRenameRoute={async (newName: string) => {
              if (!selectedUploadedRouteId) return
              updateUploadedRoute(selectedUploadedRouteId, {
                name: newName.trim(),
              })
            }}
            onSwapStartEnd={handleSwapStartEnd}
            onAddWaypoint={handleAddWaypoint}
            onRemoveWaypoint={handleRemoveWaypoint}
            onMoveWaypointUp={handleMoveWaypointUp}
            onMoveWaypointDown={handleMoveWaypointDown}
            onMoveOriginDown={handleMoveOriginDown}
            onMoveDestinationUp={handleMoveDestinationUp}
            onCancelAddingWaypoint={cancelAddingWaypoint}
            isAddingWaypoint={isAddingWaypoint}
            waypointAddingRouteId={waypointAddingRouteId}
            onSaveRouteChanges={handleSaveRouteChanges}
            onDiscardRouteChanges={handleDiscardRouteChanges}
          />
        )}
    </>
  )
}

export default UploadedRoutesPanel
