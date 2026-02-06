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
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from "@mui/material"
import React from "react"

import { routesApi } from "../../data/api/routes-api"
import {
  useApplySegmentation,
  useClearSegmentation,
  useProjectTags,
  useSaveRoute,
} from "../../hooks"
import { useProjectWorkspaceStore } from "../../stores"
import { useLayerStore } from "../../stores/layer-store"
import { calculateSegmentDistance } from "../../stores/layer-store/utils/geo-math"
import { convertKmToMiles, useDistanceUnit } from "../../utils/distance-utils"
import {
  calculateRouteLengthFromPolyline,
  decodePolylineToGeoJSON,
} from "../../utils/polyline-decoder"
import { calculateRouteSimilarity } from "../../utils/route-similarity"
import { haversineDistance } from "../../utils/route-snapping"
import { toast } from "../../utils/toast"
import Button from "../common/Button"
import Modal from "../common/Modal"
import UnsavedRoutesDialog from "../common/UnsavedRoutesDialog"
import NamingStage from "./NamingStage"
import NewRouteStage from "./NewRouteStage"
import RouteReadyStage from "./RouteReadyStage"
import SegmentationStage from "./SegmentationStage"

interface IndividualDrawingPanelProps {
  className?: string
  style?: React.CSSProperties
}

const IndividualDrawingPanel: React.FC<IndividualDrawingPanelProps> = ({
  className,
  style,
}) => {
  const {
    projectId,
    dynamicIslandHeight,
    setSelectedRoute,
    setRightPanelType,
    rightPanelType,
    setLeftPanelExpanded,
    setCurrentFolder,
    pendingRouteSelection,
    setPendingRouteSelection,
    mapMode,
  } = useProjectWorkspaceStore()
  const discardRouteChanges = useLayerStore(
    (state) => state.discardRouteChanges,
  )
  const saveRouteMutation = useSaveRoute()
  const applySegmentationMutation = useApplySegmentation()
  const clearSegmentationMutation = useClearSegmentation()

  // Track points count for change detection
  const prevPointsCountRef = React.useRef<number>(0)

  const individualRoute = useLayerStore((state) => state.individualRoute)
  const segmentation = useLayerStore((state) => state.segmentation)
  // console.log("segmentationnnnnnnnnnnnnnnnnnnnnnnnnnnnn", segmentation)
  const setDistanceKm = useLayerStore((state) => state.setDistanceKm)
  const clearPreviewSegments = useLayerStore(
    (state) => state.clearPreviewSegments,
  )

  const clearAllDrawing = useLayerStore((state) => state.clearAllDrawing)
  const setRouteUUID = useLayerStore((state) => state.setRouteUUID)
  const clearPoints = useLayerStore((state) => state.clearPoints)
  const setHoveredSegmentId = useLayerStore(
    (state) => state.setHoveredSegmentId,
  )
  const startSegmentation = useLayerStore((state) => state.startSegmentation)
  const stopSegmentation = useLayerStore((state) => state.stopSegmentation)
  const { setMapMode } = useProjectWorkspaceStore()

  // Handle back button
  const handleBack = () => {
    if (stage === "ready") {
      setStage("points")
      setRightPanelType(null)
      // Enable individual marker interactions when returning to New Route step
      useProjectWorkspaceStore.getState().setShowIndividualMarkers(true)
    } else if (stage === "segmentation") {
      setStage("ready")
      setRightPanelType("route_ready")
      clearPreviewSegments()
      stopSegmentation()
    } else if (stage === "naming") {
      setStage("ready")
      setRightPanelType("route_ready")
      setShouldClearSegmentationOnSave(false)
    }
  }

  // Handle close button
  const handleClose = () => {
    // Check for unsaved changes when editing a saved route
    const selectedRoute = useProjectWorkspaceStore.getState().selectedRoute
    const routeUUID = useLayerStore.getState().individualRoute.routeUUID
    const editingSavedRouteId = useLayerStore.getState().editingSavedRouteId
    const hasUnsavedChanges = useLayerStore.getState().hasUnsavedChanges

    const isEditingSavedRoute =
      mapMode === "individual_drawing" &&
      selectedRoute !== null &&
      selectedRoute.id !== undefined

    if (isEditingSavedRoute) {
      // Get current state to check for unsaved changes
      const { individualRoute, snappedRoads } = useLayerStore.getState()

      // Check for unsaved changes
      const hasPreviewRoads = snappedRoads.previewRoads.length > 0
      const hasRouteBeenRegenerated =
        individualRoute.generatedRoute !== null &&
        selectedRoute !== null &&
        individualRoute.generatedRoute.encodedPolyline !==
          selectedRoute.encodedPolyline

      const routeIdToCheck =
        editingSavedRouteId || routeUUID || selectedRoute?.id || null
      const hasEditingStateChanges =
        routeIdToCheck !== null && hasUnsavedChanges(routeIdToCheck)

      const hasUnsavedRouteChanges =
        hasPreviewRoads || hasRouteBeenRegenerated || hasEditingStateChanges

      if (hasUnsavedRouteChanges) {
        // Set pending route selection to "close" (closing panel)
        const { setPendingRouteSelection } = useProjectWorkspaceStore.getState()
        setPendingRouteSelection("close")
        return
      }
    }

    setStage("points")
    setRightPanelType(null)
    setRouteName("")
    setSelectedTag(null)
    setNewTag("")
    setRouteNameError("")
    setTagError("")
    setSegmentNames(new Map())
    setShouldClearSegmentationOnSave(false)
    clearAllDrawing()
    setMapMode("view")
    // Clear selected route to remove selected-route-border and selected-route-main layers
    setSelectedRoute(null)
    // Ensure marker interactions enabled next time we start a new route
    useProjectWorkspaceStore.getState().setShowIndividualMarkers(true)
  }

  const [stage, setStage] = React.useState<
    "points" | "ready" | "segmentation" | "naming"
  >("points")

  // Control individual marker interactions based on stage
  // Markers are always visible, but interactions (add/drag) only allowed in "points" stage
  React.useEffect(() => {
    const { setShowIndividualMarkers } = useProjectWorkspaceStore.getState()
    setShowIndividualMarkers(stage === "points")
  }, [stage])

  const [routeName, setRouteName] = React.useState("")
  const [segmentationMode, setSegmentationMode] = React.useState<
    "distance" | "manual" | "intersections"
  >("distance")

  const distanceUnit = useDistanceUnit()

  // Initialize distanceInput - convert from km (stored) to current unit for display
  // Round to 3 decimal places to avoid floating point precision issues
  const [distanceInput, setDistanceInput] = React.useState<string>(() => {
    if (segmentation.distanceKm !== undefined) {
      const displayValue =
        distanceUnit === "miles"
          ? convertKmToMiles(segmentation.distanceKm)
          : segmentation.distanceKm
      // Round to 3 decimal places to avoid floating point precision issues
      const roundedValue = Math.round(displayValue * 1000) / 1000
      return String(roundedValue)
    }
    return ""
  })
  const [selectedTag, setSelectedTag] = React.useState<string | null>(null)
  const [newTag, setNewTag] = React.useState("")
  const [clearSegmentationDialogOpen, setClearSegmentationDialogOpen] =
    React.useState(false)
  const [shouldClearSegmentationOnSave, setShouldClearSegmentationOnSave] =
    React.useState(false)
  const [routeGeometryChangedDialogOpen, setRouteGeometryChangedDialogOpen] =
    React.useState(false)
  const [segmentNames, setSegmentNames] = React.useState<Map<string, string>>(
    new Map(),
  )

  // Sync distance input when segmentation distance changes externally
  // Convert from km (stored) to current unit for display
  // Round to 3 decimal places to avoid floating point precision issues
  React.useEffect(() => {
    if (segmentation.distanceKm !== undefined) {
      const displayValue =
        distanceUnit === "miles"
          ? convertKmToMiles(segmentation.distanceKm)
          : segmentation.distanceKm
      // Round to 3 decimal places to avoid floating point precision issues
      const roundedValue = Math.round(displayValue * 1000) / 1000
      setDistanceInput(String(roundedValue))
    } else {
      setDistanceInput("")
    }
  }, [segmentation.distanceKm, distanceUnit])

  // Pre-populate route name and tag when editing a route
  React.useEffect(() => {
    if (individualRoute.routeUUID && individualRoute.originalRouteName) {
      // We're editing a route, populate the fields
      setRouteName(individualRoute.originalRouteName)
      setSelectedTag(individualRoute.originalRouteTag)
    } else {
      // Not editing a route or originalRouteName not set yet, clear the fields
      // This ensures we don't show stale route names from previously selected routes
      setRouteName("")
      setSelectedTag(null)
    }
  }, [
    individualRoute.routeUUID,
    individualRoute.originalRouteName,
    individualRoute.originalRouteTag,
  ])

  // Track previous routeUUID to detect route switching
  const prevRouteUUIDRef = React.useRef<string | null>(null)

  // Reset stage when switching to a different route
  React.useEffect(() => {
    const currentRouteUUID = individualRoute.routeUUID
    const routeSwitched =
      prevRouteUUIDRef.current !== null &&
      prevRouteUUIDRef.current !== currentRouteUUID

    // If routeUUID changed, reset state and stage to start from beginning
    if (routeSwitched) {
      console.log("🔄 Route switched, resetting to points stage")
      // Clear any existing segmentation state
      clearPreviewSegments()
      stopSegmentation()
      // Reset waypoint adding mode when switching routes
      useLayerStore.getState().cancelAddingIndividualWaypoint()
      // Reset to points stage to start from beginning
      setStage("points")
      setRightPanelType(null)
      // Clear route name and tag to prevent showing stale data from previous route
      // The useEffect for originalRouteName will set them to the correct values
      setRouteName("")
      setSelectedTag(null)
      setNewTag("")
      // Show individual markers for editing
      useProjectWorkspaceStore.getState().setShowIndividualMarkers(true)
    }

    // Update the ref
    prevRouteUUIDRef.current = currentRouteUUID
  }, [
    individualRoute.routeUUID,
    setRightPanelType,
    clearPreviewSegments,
    stopSegmentation,
  ])

  // Subscribe to routes and selectedRoute to detect when route is deleted
  const routes = useProjectWorkspaceStore((state) => state.routes)
  const selectedRoute = useProjectWorkspaceStore((state) => state.selectedRoute)

  // Detect when the route being edited is deleted and cancel modify operation
  React.useEffect(() => {
    // Only check if we're editing a route (routeUUID exists)
    if (!individualRoute.routeUUID) return

    // Check if the route still exists in the store
    const routeExists =
      selectedRoute?.id === individualRoute.routeUUID ||
      routes.some((r) => r.id === individualRoute.routeUUID)

    // If route doesn't exist, it was deleted - cancel the modify operation
    if (!routeExists) {
      console.log(
        "⚠️ Route being edited was deleted, cancelling modify operation",
      )
      // Call handleClose logic directly to avoid dependency issues
      setStage("points")
      setRightPanelType(null)
      setRouteName("")
      setSelectedTag(null)
      setNewTag("")
      setRouteNameError("")
      setTagError("")
      setSegmentNames(new Map())
      setShouldClearSegmentationOnSave(false)
      clearAllDrawing()
      setMapMode("view")
      setSelectedRoute(null)
      useProjectWorkspaceStore.getState().setShowIndividualMarkers(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [individualRoute.routeUUID, routes, selectedRoute])

  // Validation state
  const [routeNameError, setRouteNameError] = React.useState<string>("")
  const [tagError, setTagError] = React.useState<string>("")

  const { data: tags = [] } = useProjectTags(projectId || "")

  // Auto-scroll is now handled internally by RoutePointsList component
  // This effect just tracks the count for other purposes if needed
  React.useEffect(() => {
    prevPointsCountRef.current = individualRoute.points.length
  }, [individualRoute.points.length])

  const handleContinue = async () => {
    try {
      console.log("🔄 Continue clicked - checking state...")
      console.log("Generated route:", individualRoute.generatedRoute)
      console.log("Points count:", individualRoute.points.length)

      // Ensure we have a generated route
      if (
        !individualRoute.generatedRoute ||
        !individualRoute.generatedRoute.encodedPolyline
      ) {
        console.error(
          "❌ Cannot continue: no generated route or missing polyline",
        )
        alert(
          "Please wait for the route to be generated. Make sure you have at least 2 points.",
        )
        return
      }

      console.log("✅ Route found, moving to ready stage...")

      // Reset waypoint adding mode when continuing to next stage
      useLayerStore.getState().cancelAddingIndividualWaypoint()

      // Move to "ready" stage - route is ready to save, segmentation is optional
      setStage("ready")
      setRightPanelType("route_ready")
      // Disable individual marker interactions when moving past New Route step
      // (markers remain visible but not interactive)
      useProjectWorkspaceStore.getState().setShowIndividualMarkers(false)
    } catch (error) {
      console.error("❌ Error in handleContinue:", error)
      alert(
        `Failed to continue: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  const handleEnableSegmentation = async () => {
    try {
      if (!individualRoute.generatedRoute) return

      console.log("✅ Enabling segmentation...")

      // Check if we're editing a route with existing segments
      const isEditingRoute = !!individualRoute.routeUUID

      if (isEditingRoute) {
        // Get the route from store to check for existing segments
        const routes = useProjectWorkspaceStore.getState().routes
        const route = routes.find((r) => r.id === individualRoute.routeUUID)

        // Check if route geometry has changed by comparing encoded polylines
        const routeGeometryChanged =
          route &&
          individualRoute.generatedRoute?.encodedPolyline &&
          route.encodedPolyline !==
            individualRoute.generatedRoute.encodedPolyline

        if (routeGeometryChanged) {
          console.log(
            "⚠️ Route geometry has changed - existing segments are no longer valid",
          )
          // Show warning dialog if route has existing segments
          if (route && route.segments && route.segments.length > 0) {
            setRouteGeometryChangedDialogOpen(true)
            return // Don't proceed until user confirms
          }
        }
      }

      // Proceed with segmentation (will handle preloading segments if geometry unchanged)
      proceedWithSegmentation()
    } catch (error) {
      console.error("❌ Error enabling segmentation:", error)
      alert(
        `Failed to enable segmentation: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  // Sync segmentationMode with store's segmentation type
  React.useEffect(() => {
    if (segmentation.type) {
      if (segmentation.type === "manual") {
        setSegmentationMode("manual")
      } else if (segmentation.type === "distance") {
        setSegmentationMode("distance")
      }
    }
  }, [segmentation.type])

  const handleSegmentNameChange = (segmentId: string, name: string) => {
    console.log(
      `🔍 handleSegmentNameChange called: segmentId="${segmentId}", name="${name}"`,
    )
    setSegmentNames((prev) => {
      const newMap = new Map(prev)
      newMap.set(segmentId, name)
      console.log(`🔍 Updated segment names map:`, newMap)
      return newMap
    })
  }

  const handleSave = async () => {
    // Check if we're editing a route with existing segmentation
    const isEditingRoute = !!individualRoute.routeUUID
    const hadSegmentation = individualRoute.originalRouteIsSegmented

    if (isEditingRoute && hadSegmentation && !segmentation.isActive) {
      // Show confirmation dialog that segmentation will be cleared
      setClearSegmentationDialogOpen(true)
      return
    }

    // Reset validation errors when moving to naming stage
    setRouteNameError("")
    setTagError("")
    setStage("naming")
    setRightPanelType("naming")
  }

  const handleConfirmClearSegmentation = async () => {
    // Close the confirmation dialog
    setClearSegmentationDialogOpen(false)

    // Set flag to clear segmentation when saving (don't clear it now)
    setShouldClearSegmentationOnSave(true)

    // Proceed to naming stage
    setRouteNameError("")
    setTagError("")
    setStage("naming")
    setRightPanelType("naming")
  }

  const handleCancelClearSegmentation = () => {
    setClearSegmentationDialogOpen(false)
    setShouldClearSegmentationOnSave(false)
  }

  const handleConfirmRouteGeometryChanged = () => {
    setRouteGeometryChangedDialogOpen(false)
    // Proceed with enabling segmentation (without preloading segments)
    proceedWithSegmentation()
  }

  const handleCancelRouteGeometryChanged = () => {
    setRouteGeometryChangedDialogOpen(false)
  }

  const proceedWithSegmentation = () => {
    if (!individualRoute.generatedRoute) return

    // Check if we're editing a route with existing segments
    const isEditingRoute = !!individualRoute.routeUUID
    let segmentationType: "distance" | "manual" | "intersections" = "distance"
    let existingPreviewSegments: any[] = []
    let distanceKm: number | undefined = undefined

    if (isEditingRoute) {
      // Get the route from store to check for existing segments
      const routes = useProjectWorkspaceStore.getState().routes
      const route = routes.find((r) => r.id === individualRoute.routeUUID)

      // Check if route geometry has changed by comparing encoded polylines
      const routeGeometryChanged =
        route &&
        individualRoute.generatedRoute?.encodedPolyline &&
        route.encodedPolyline !== individualRoute.generatedRoute.encodedPolyline

      // Only preload segments if geometry hasn't changed
      if (
        route &&
        route.segments &&
        route.segments.length > 0 &&
        !routeGeometryChanged
      ) {
        // Route has existing segments and geometry hasn't changed - convert them to preview segments
        console.log(
          "✅ Route geometry unchanged - preloading existing segments",
        )
        segmentationType =
          (route.segmentationType as "distance" | "manual" | "intersections") ||
          "distance"

        // Get distance from segmentation config if distance-based
        if (segmentationType === "distance" && route.segments.length > 0) {
          try {
            const firstSegment = route.segments[0]
            if (firstSegment.segmentation_config) {
              const config =
                typeof firstSegment.segmentation_config === "string"
                  ? JSON.parse(firstSegment.segmentation_config)
                  : firstSegment.segmentation_config
              if (config.distanceKm) {
                distanceKm = config.distanceKm
              }
            }
          } catch (error) {
            console.error("Error parsing segmentation config:", error)
          }
        }

        // Convert existing segments to preview segments format
        existingPreviewSegments = route.segments
          .sort((a, b) => (a.segment_order || 0) - (b.segment_order || 0))
          .map((segment, index) => {
            let segmentCoords: number[][] = []

            // Try to get coordinates from encoded_polyline
            if (segment.encoded_polyline) {
              try {
                const decoded = decodePolylineToGeoJSON(
                  segment.encoded_polyline,
                )
                if (decoded.type === "LineString") {
                  segmentCoords = decoded.coordinates
                }
              } catch (error) {
                console.error("Error decoding segment polyline:", error)
              }
            }

            // Calculate distance
            const segmentDistanceKm =
              segment.length ||
              (segmentCoords.length > 0
                ? calculateSegmentDistance(segmentCoords)
                : 0)

            return {
              id: segment.uuid,
              routeId: route.id,
              name: segment.route_name || `Segment ${index + 1}`,
              linestringGeoJson: {
                type: "LineString" as const,
                coordinates: segmentCoords,
              },
              segmentOrder: segment.segment_order || index + 1,
              distanceKm: segmentDistanceKm,
              length: segmentDistanceKm,
              createdAt: segment.created_at || new Date().toISOString(),
            }
          })
      }
    }

    // Initialize segmentation state with the generated route
    startSegmentation(individualRoute.generatedRoute, segmentationType)

    // Update segmentation mode state
    setSegmentationMode(segmentationType)

    // Set distance if distance-based segmentation
    if (segmentationType === "distance" && distanceKm) {
      setDistanceKm(distanceKm)
    }

    // Load existing preview segments if available
    if (existingPreviewSegments.length > 0) {
      const segmentIds = new Set(existingPreviewSegments.map((seg) => seg.id))
      const layerStore = useLayerStore.getState()

      // For manual segmentation, also load cut points from segmentation_points
      let cutPoints: any[] = []
      if (segmentationType === "manual" && isEditingRoute) {
        const routes = useProjectWorkspaceStore.getState().routes
        const route = routes.find((r) => r.id === individualRoute.routeUUID)
        if (route && route.segments && route.segments.length > 0) {
          try {
            const firstSegment = route.segments[0]
            if (firstSegment.segmentation_points) {
              const cutPointsData = JSON.parse(firstSegment.segmentation_points)
              if (Array.isArray(cutPointsData) && cutPointsData.length > 0) {
                cutPoints = cutPointsData.map((cp: any, idx: number) => ({
                  id: `cut-point-${idx}-${Date.now()}`,
                  routeId: individualRoute.generatedRoute?.id || route.id,
                  coordinates:
                    Array.isArray(cp) && cp.length >= 2
                      ? { lat: cp[1], lng: cp[0] }
                      : cp.coordinates || { lat: 0, lng: 0 },
                  cutOrder: idx,
                  distanceFromStart: 0,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  isSnapped: true,
                }))
              }
            }
          } catch (error) {
            console.error("Error loading cut points:", error)
          }
        }
      }

      // Set preview segments and cut points directly in state
      useLayerStore.setState({
        segmentation: {
          ...layerStore.segmentation,
          previewSegments: existingPreviewSegments,
          selectedSegmentIds: segmentIds,
          distanceKm: distanceKm || layerStore.segmentation.distanceKm,
          cutPoints: cutPoints,
          isCalculating: false,
        },
      })

      // Populate segment names from existing segments
      const namesMap = new Map<string, string>()
      existingPreviewSegments.forEach((seg) => {
        if (seg.name) {
          namesMap.set(seg.id, seg.name)
        }
      })
      setSegmentNames(namesMap)
    }

    // Move to segmentation stage
    setStage("segmentation")
    setRightPanelType("segmentation")
  }

  const validateRouteName = (name: string): string => {
    const trimmed = name.trim()
    if (!trimmed) {
      return "Route name is required"
    }
    return ""
  }

  const validateTag = (newTagValue: string): string => {
    if (!newTagValue.trim()) {
      return "" // Empty tag is allowed (no tag selected)
    }

    const trimmed = newTagValue.trim().toLowerCase()

    // Check if tag already exists (case-insensitive)
    const existingTagLower = tags.map((t) => t.toLowerCase())
    if (existingTagLower.includes(trimmed)) {
      return "Folder already exists"
    }

    if (trimmed.length < 2) {
      return "Folder must be at least 2 characters"
    }

    if (trimmed.length > 100) {
      return "Folder name must not exceed 100 characters"
    }

    return ""
  }

  const handleRouteNameChange = (value: string) => {
    setRouteName(value)
    // Clear error when user starts typing
    if (routeNameError) {
      setRouteNameError("")
    }
  }

  const confirmSave = async () => {
    if (!projectId) return
    if (
      !individualRoute.generatedRoute ||
      !individualRoute.generatedRoute.encodedPolyline
    )
      return
    setSelectedRoute(null)
    // Validate route name
    const routeNameValidation = validateRouteName(routeName)
    if (routeNameValidation) {
      setRouteNameError(routeNameValidation)
      return
    }

    // Validate tag if provided (either selected or new)
    const tagValue = selectedTag || newTag.trim()
    if (tagValue && !selectedTag) {
      // It's a new tag, validate it
      const tagValidation = validateTag(newTag)
      if (tagValidation) {
        setTagError(tagValidation)
        return
      }
    }

    const origin = individualRoute.generatedRoute.origin
    const destination = individualRoute.generatedRoute.destination
    const waypoints = individualRoute.generatedRoute.waypoints || []

    // Get length in kilometers (already in km from google-routes-api)
    const lengthKm = individualRoute.generatedRoute?.distance ?? undefined

    // Calculate match percentage if editing an uploaded route
    // Also preserve the original route type and originalRouteGeoJson when editing
    let matchPercentage: number | undefined = undefined
    let routeType: string = "drawn" // Default to "drawn" for new routes
    let originalRouteGeoJson:
      | GeoJSON.Feature
      | GeoJSON.FeatureCollection
      | undefined = undefined

    if (individualRoute.routeUUID) {
      // Find the route being edited - check selectedRoute first (has full data), then routes array
      const projectStore = useProjectWorkspaceStore.getState()
      const route =
        projectStore.selectedRoute?.id === individualRoute.routeUUID
          ? projectStore.selectedRoute
          : projectStore.routes.find((r) => r.id === individualRoute.routeUUID)

      if (route) {
        // Preserve the original route type when editing
        routeType = route.type || "drawn"

        if (route.type === "uploaded" && route.originalRouteGeoJson) {
          // Preserve the original route GeoJSON for future match percentage calculations
          originalRouteGeoJson = route.originalRouteGeoJson

          try {
            // Decode the generated route polyline
            const decodedGeometry = decodePolylineToGeoJSON(
              individualRoute.generatedRoute.encodedPolyline,
            )

            if (decodedGeometry.type === "LineString") {
              const percentage = calculateRouteSimilarity(
                route.originalRouteGeoJson,
                decodedGeometry,
              )
              matchPercentage = Math.max(0, Math.min(100, percentage))
            }
          } catch (error) {
            console.error("Error calculating match percentage:", error)
          }
        }
      }
    }

    // Clear segmentation if user confirmed clearing it (before saving)
    if (shouldClearSegmentationOnSave && individualRoute.routeUUID) {
      try {
        await clearSegmentationMutation.mutateAsync(individualRoute.routeUUID)
        console.log("✅ Segmentation cleared successfully before saving")
        // Reset the flag after clearing
        setShouldClearSegmentationOnSave(false)
      } catch (error) {
        console.error("❌ Error clearing segmentation:", error)
        toast.error("Failed to clear segmentation. Please try again.")
        return
      }
    }

    // Build payload for save route
    const payload = {
      uuid: individualRoute.routeUUID || crypto.randomUUID(),
      route_name: routeName.trim(),
      coordinates: {
        origin: [origin.lng, origin.lat] as [number, number],
        destination: [destination.lng, destination.lat] as [number, number],
        waypoints: waypoints.map(
          (w: any) => [w.lng, w.lat] as [number, number],
        ),
      },
      encoded_polyline: individualRoute.generatedRoute.encodedPolyline,
      region_id: parseInt(projectId),
      tag: selectedTag || (newTag.trim() ? newTag.trim() : null),
      length: lengthKm, // Length in kilometers
      route_type: routeType, // Preserve original type when editing, use "drawn" for new routes
      original_route_geo_json: originalRouteGeoJson, // Preserve original route GeoJSON for uploaded routes
      match_percentage: matchPercentage, // Match percentage for uploaded routes
    }

    // 1) Save parent route
    try {
      await saveRouteMutation.mutateAsync(payload as any)

      // Hide uploaded route if it's visible (uploaded routes have IDs like `${routeId}-uploaded-${timestamp}`)
      // Only hide if we're editing an existing route (individualRoute.routeUUID exists)
      if (individualRoute.routeUUID) {
        const layerStore = useLayerStore.getState()
        // Remove ALL uploaded routes that match the pattern (in case there are multiple)
        const uploadedRoutesToRemove = layerStore.uploadedRoutes.routes.filter(
          (r) => r.id.startsWith(`${individualRoute.routeUUID}-uploaded-`),
        )
        uploadedRoutesToRemove.forEach((uploadedRoute) => {
          layerStore.removeUploadedRoute(uploadedRoute.id)
        })
      }
    } catch (error) {
      console.error("❌ Failed to save route:", error)
      toast.error("Failed to save route. Please try again.")
      setMapMode("view")
      return
    }

    // 2) Apply segmentation only if it was enabled
    try {
      if (segmentation.isActive && segmentation.previewSegments.length > 0) {
        // Decode the original route polyline to get all coordinates for waypoint matching
        const originalRouteCoords = decodePolylineToGeoJSON(
          individualRoute.generatedRoute.encodedPolyline,
        ).coordinates

        // Find the index of each waypoint along the original route
        const waypointIndices = waypoints.map((wp: any) => {
          let closestIndex = 0
          let minDistance = Number.MAX_VALUE

          originalRouteCoords.forEach((coord: number[], index: number) => {
            const distance = haversineDistance(
              { lat: wp.lat, lng: wp.lng },
              { lat: coord[1], lng: coord[0] }, // [lng, lat] to {lat, lng}
            )

            if (distance < minDistance) {
              minDistance = distance
              closestIndex = index
            }
          })

          return { waypoint: wp, index: closestIndex }
        })

        // Sort waypoint indices by their position along the route
        waypointIndices.sort((a, b) => a.index - b.index)

        // For each segment, find its start and end indices in the original route
        // and assign waypoints that fall within that range
        const segments = segmentation.previewSegments.map(
          (s: any, index: number) => {
            // Use custom name if provided, otherwise auto-generate
            const customName = segmentNames.get(s.id)?.trim()
            const segmentName =
              customName || `${routeName.trim()} - Segment ${index + 1}`

            console.log(
              `🔍 Segment ${index}: id=${s.id}, customName="${customName}", finalName="${segmentName}"`,
            )

            // Get segment coordinates
            const segmentCoords =
              s.linestringGeoJson?.coordinates || s.coordinates || []

            // Calculate segment length in kilometers
            const segmentLengthKm =
              segmentCoords.length > 0
                ? calculateSegmentDistance(segmentCoords)
                : 0

            if (segmentCoords.length === 0) {
              return {
                id: s.id,
                route_name: segmentName,
                name: segmentName,
                is_selected: segmentation.selectedSegmentIds.has(s.id),
                is_enabled: segmentation.selectedSegmentIds.has(s.id) ? 1 : 0,
                origin: null,
                destination: null,
                waypoints: null,
                length: 0,
                linestringGeoJson: {
                  type: "LineString",
                  coordinates: [],
                },
              }
            }

            // Extract origin and destination from segment coordinates
            const segmentOrigin = segmentCoords[0] // [lng, lat]
            const segmentDestination = segmentCoords[segmentCoords.length - 1] // [lng, lat]

            // Find the indices of segment origin and destination in the original route
            // Since segments are created from the original route, we should find exact or very close matches
            let segmentStartIndex = -1
            let segmentEndIndex = -1

            // Find exact or closest match for segment start
            // Try exact match first (coordinates should match for most cases)
            for (let idx = 0; idx < originalRouteCoords.length; idx++) {
              const coord = originalRouteCoords[idx]
              if (
                Math.abs(coord[0] - segmentOrigin[0]) < 0.000001 &&
                Math.abs(coord[1] - segmentOrigin[1]) < 0.000001
              ) {
                segmentStartIndex = idx
                break
              }
            }

            // If no exact match, find closest
            if (segmentStartIndex === -1) {
              let minStartDist = Number.MAX_VALUE
              originalRouteCoords.forEach((coord: number[], idx: number) => {
                const dist = haversineDistance(
                  { lat: segmentOrigin[1], lng: segmentOrigin[0] },
                  { lat: coord[1], lng: coord[0] },
                )
                if (dist < minStartDist) {
                  minStartDist = dist
                  segmentStartIndex = idx
                }
              })
            }

            // Find exact or closest match for segment end
            for (let idx = originalRouteCoords.length - 1; idx >= 0; idx--) {
              const coord = originalRouteCoords[idx]
              if (
                Math.abs(coord[0] - segmentDestination[0]) < 0.000001 &&
                Math.abs(coord[1] - segmentDestination[1]) < 0.000001
              ) {
                segmentEndIndex = idx
                break
              }
            }

            // If no exact match, find closest
            if (segmentEndIndex === -1) {
              let minEndDist = Number.MAX_VALUE
              originalRouteCoords.forEach((coord: number[], idx: number) => {
                const dist = haversineDistance(
                  { lat: segmentDestination[1], lng: segmentDestination[0] },
                  { lat: coord[1], lng: coord[0] },
                )
                if (dist < minEndDist) {
                  minEndDist = dist
                  segmentEndIndex = idx
                }
              })
            }

            // Ensure start < end
            if (segmentStartIndex > segmentEndIndex) {
              const temp = segmentStartIndex
              segmentStartIndex = segmentEndIndex
              segmentEndIndex = temp
            }

            // Find waypoints that fall within this segment's range
            // Include waypoints that are encountered along the route path between segment start and end
            // (strictly between, not at the origin or destination)
            const segmentWaypoints = waypointIndices
              .filter((wpInfo) => {
                const isBetween =
                  wpInfo.index > segmentStartIndex &&
                  wpInfo.index < segmentEndIndex

                console.log(
                  `🔍 Segment ${index} waypoint check:`,
                  `waypoint index=${wpInfo.index},`,
                  `segment start=${segmentStartIndex},`,
                  `segment end=${segmentEndIndex},`,
                  `isBetween=${isBetween}`,
                )

                return isBetween
              })
              .map((wpInfo) => [wpInfo.waypoint.lng, wpInfo.waypoint.lat])

            console.log(
              `🔍 Segment ${index} (${segmentName}):`,
              `startIndex=${segmentStartIndex},`,
              `endIndex=${segmentEndIndex},`,
              `waypoints=${JSON.stringify(segmentWaypoints)}`,
            )

            return {
              id: s.id,
              route_name: segmentName,
              name: segmentName,
              is_selected: segmentation.selectedSegmentIds.has(s.id),
              is_enabled: segmentation.selectedSegmentIds.has(s.id) ? 1 : 0,
              origin: {
                lat: segmentOrigin[1],
                lng: segmentOrigin[0],
              },
              destination: {
                lat: segmentDestination[1],
                lng: segmentDestination[0],
              },
              waypoints: segmentWaypoints.length > 0 ? segmentWaypoints : null, // Set to null if empty
              length: segmentLengthKm, // Length in kilometers
              linestringGeoJson: {
                type: "LineString",
                coordinates: segmentCoords, // [lng, lat] format
              },
            }
          },
        )

        const segmentationPayload = {
          routeId: payload.uuid,
          data: {
            type: segmentation.type,
            ...(segmentation.type === "manual" ||
            segmentation.type === "intersections"
              ? {
                  cutPoints: segmentation.cutPoints.map((p) => [
                    p.coordinates.lng,
                    p.coordinates.lat,
                  ]),
                }
              : {
                  distanceKm: segmentation.distanceKm,
                }),
            segments,
          },
        }

        console.log(
          "🔍 Sending segmentation payload:",
          JSON.stringify(segmentationPayload, null, 2),
        )
        console.log(
          "🔍 Segments being sent:",
          segments.map((s: any) => ({
            id: s.id,
            route_name: s.route_name,
            name: s.name,
          })),
        )

        const segmentationResult =
          await applySegmentationMutation.mutateAsync(segmentationPayload)

        // Note: useApplySegmentation hook already handles updating the store with the new UUID
        // The old route UUID is soft-deleted, and the new UUID is in segmentationResult.newRouteUuid
        // Store update is handled in the hook's onSuccess callback, so no need to refetch here
        console.log(
          "✅ Segmentation applied, new route UUID:",
          segmentationResult.newRouteUuid,
        )
      }
    } catch (error) {
      console.error("❌ Failed to apply segmentation:", error)
      toast.error("Failed to apply segmentation. Please try again.")
      setMapMode("view")
      return
    }

    // Reset state and exit
    setRouteNameError("")
    setTagError("")
    setRouteName("")
    setSelectedTag(null)
    setNewTag("")
    setSegmentNames(new Map())
    setStage("points")
    clearPreviewSegments()
    clearAllDrawing()
    // Clear route UUID and points to ensure clean state
    setRouteUUID(null)
    clearPoints()
    // Clear right panel type to ensure clean state
    setRightPanelType(null)
    // Exit individual drawing mode
    setMapMode("view")
    // Ensure marker interactions enabled next time we start a new route
    useProjectWorkspaceStore.getState().setShowIndividualMarkers(true)
    // Navigate to the folder where the route was saved and open left panel
    // Keep empty string "" and "Untagged" as separate - use tag value as-is
    const savedTag = selectedTag ?? (newTag.trim() ? newTag.trim() : "")
    setCurrentFolder(savedTag)
    setLeftPanelExpanded(true)
  }

  // Calculate route length from encoded polyline if available (more accurate)
  const calculatedRouteLength = React.useMemo(() => {
    const route = segmentation.targetRoute || individualRoute.generatedRoute
    if (!route?.encodedPolyline) {
      return route?.distance ?? 0
    }
    return (
      calculateRouteLengthFromPolyline(route.encodedPolyline) ??
      route?.distance ??
      0
    )
  }, [segmentation.targetRoute, individualRoute.generatedRoute])

  // Use calculated route length for validation (80km check), fallback to API distance
  const routeLength = calculatedRouteLength

  // Calculate route length from encoded polyline if available (more accurate) for naming stage
  const calculatedRouteLengthForNaming = React.useMemo(() => {
    const route = segmentation.targetRoute || individualRoute.generatedRoute
    if (!route?.encodedPolyline) {
      return route?.distance ?? undefined
    }
    return calculateRouteLengthFromPolyline(route.encodedPolyline)
  }, [segmentation.targetRoute, individualRoute.generatedRoute])

  // Calculate match percentage when ready stage is shown
  const matchPercentage = React.useMemo(() => {
    if (stage !== "ready" || !individualRoute.generatedRoute) {
      return undefined
    }

    if (individualRoute.routeUUID) {
      // Find the route being edited
      const routes = useProjectWorkspaceStore.getState().routes
      const route = routes.find((r) => r.id === individualRoute.routeUUID)

      if (route && route.type === "uploaded" && route.originalRouteGeoJson) {
        try {
          // Decode the generated route polyline
          const decodedGeometry = decodePolylineToGeoJSON(
            individualRoute.generatedRoute.encodedPolyline,
          )

          if (decodedGeometry.type === "LineString") {
            const percentage = calculateRouteSimilarity(
              route.originalRouteGeoJson,
              decodedGeometry,
            )
            return Math.max(0, Math.min(100, percentage))
          }
        } catch (error) {
          console.error("Error calculating match percentage:", error)
        }
      }
    }

    return undefined
  }, [stage, individualRoute.routeUUID, individualRoute.generatedRoute])

  return (
    <>
      {stage === "points" && (
        <NewRouteStage
          className={className}
          style={style}
          dynamicIslandHeight={dynamicIslandHeight}
          onClose={handleClose}
          onContinue={handleContinue}
        />
      )}

      {stage === "ready" && rightPanelType === "route_ready" && (
        <RouteReadyStage
          className={className}
          style={style}
          dynamicIslandHeight={dynamicIslandHeight}
          routeLength={routeLength}
          matchPercentage={matchPercentage}
          onBack={handleBack}
          onClose={handleClose}
          onEnableSegmentation={handleEnableSegmentation}
          onSave={handleSave}
        />
      )}

      {stage === "segmentation" && rightPanelType === "segmentation" && (
        <SegmentationStage
          className={className}
          style={style}
          dynamicIslandHeight={dynamicIslandHeight}
          routeLength={routeLength}
          segmentationMode={segmentationMode}
          distanceInput={distanceInput}
          segmentNames={segmentNames}
          onBack={handleBack}
          onClose={handleClose}
          onSegmentationModeChange={setSegmentationMode}
          onDistanceInputChange={setDistanceInput}
          onDistanceKmSet={setDistanceKm}
          onSegmentNameChange={handleSegmentNameChange}
          onSave={handleSave}
          onHoveredSegmentIdChange={setHoveredSegmentId}
        />
      )}

      {stage === "naming" && rightPanelType === "naming" && (
        <NamingStage
          className={className}
          style={style}
          dynamicIslandHeight={dynamicIslandHeight}
          routeName={routeName}
          selectedTag={selectedTag}
          newTag={newTag}
          routeNameError={routeNameError}
          tagError={tagError}
          tags={tags}
          routeLengthKm={calculatedRouteLengthForNaming ?? undefined}
          isSegmented={segmentation.isActive}
          segments={segmentation.previewSegments || []}
          onBack={() => {
            if (segmentation.isActive) {
              setStage("segmentation")
              setRightPanelType("segmentation")
            } else {
              setStage("ready")
              setRightPanelType("route_ready")
            }
            setRouteNameError("")
            setTagError("")
          }}
          onClose={handleClose}
          onRouteNameChange={handleRouteNameChange}
          onTagChange={(value) => {
            if (value && tags.includes(value)) {
              setSelectedTag(value)
              setNewTag("")
            } else {
              setSelectedTag(null)
              setNewTag(value || "")
            }
            if (tagError) {
              setTagError("")
            }
          }}
          onConfirmSave={confirmSave}
          isSaving={
            saveRouteMutation.isPending || applySegmentationMutation.isPending
          }
        />
      )}

      {/* Clear Segmentation Confirmation Dialog */}
      <Dialog
        open={clearSegmentationDialogOpen}
        onClose={handleCancelClearSegmentation}
        aria-labelledby="clear-segmentation-dialog-title"
        aria-describedby="clear-segmentation-dialog-description"
        sx={{
          "& .MuiDialog-paper": {
            borderRadius: "16px",
          },
        }}
      >
        <DialogTitle id="clear-segmentation-dialog-title">
          Clear Existing Segmentation?
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="clear-segmentation-dialog-description">
            This route has existing segmentation. Saving will remove the current
            segmentation. Do you want to continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions
          sx={{
            p: 2,
            px: 3,
            gap: 1,
          }}
        >
          <Button
            onClick={handleCancelClearSegmentation}
            variant="outlined"
            fullWidth
            size="small"
            sx={{
              py: 1,
              fontSize: "0.813rem",
              minHeight: "36px",
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmClearSegmentation}
            variant="contained"
            color="primary"
            fullWidth
            size="small"
            sx={{
              py: 1,
              fontSize: "0.813rem",
              minHeight: "36px",
            }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Route Geometry Changed Warning Dialog */}
      <Modal
        open={routeGeometryChangedDialogOpen}
        onClose={handleCancelRouteGeometryChanged}
        title="Route Geometry Changed"
        actions={
          <Box
            sx={{
              display: "flex",
              gap: 1,
              width: "100%",
            }}
          >
            <Button
              onClick={handleCancelRouteGeometryChanged}
              variant="outlined"
              fullWidth
              size="small"
              sx={{
                py: 1,
                fontSize: "0.813rem",
                minHeight: "36px",
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmRouteGeometryChanged}
              variant="contained"
              color="primary"
              fullWidth
              size="small"
              sx={{
                py: 1,
                fontSize: "0.813rem",
                minHeight: "36px",
              }}
            >
              Continue
            </Button>
          </Box>
        }
      >
        <Typography
          variant="body1"
          sx={{
            color: "#5f6368",
            fontFamily: '"Google Sans", sans-serif',
            fontSize: "14px",
            lineHeight: "20px",
          }}
        >
          The route geometry has been modified. Existing segments are no longer
          valid and will be lost if you continue. You will need to create new
          segments for this route.
        </Typography>
      </Modal>

      {/* Unsaved Routes Dialog for closing panel */}
      {pendingRouteSelection === "close" && (
        <UnsavedRoutesDialog
          open={pendingRouteSelection === "close"}
          type="uploaded_routes"
          routeCount={1}
          onConfirm={() => {
            // Discard unsaved changes
            const selectedRoute =
              useProjectWorkspaceStore.getState().selectedRoute
            const routeUUID = useLayerStore.getState().individualRoute.routeUUID
            const editingSavedRouteId =
              useLayerStore.getState().editingSavedRouteId
            const routeBeingEdited =
              editingSavedRouteId || routeUUID || selectedRoute?.id
            if (routeBeingEdited) {
              discardRouteChanges(routeBeingEdited)
            }

            // Clear pending route selection
            setPendingRouteSelection(null)

            // Close the panel
            setStage("points")
            setRightPanelType(null)
            setRouteName("")
            setSelectedTag(null)
            setNewTag("")
            setRouteNameError("")
            setTagError("")
            setSegmentNames(new Map())
            setShouldClearSegmentationOnSave(false)
            clearAllDrawing()
            setMapMode("view")
            setSelectedRoute(null)
            useProjectWorkspaceStore.getState().setShowIndividualMarkers(true)
          }}
          onCancel={() => {
            setPendingRouteSelection(null)
          }}
        />
      )}
    </>
  )
}

export default IndividualDrawingPanel
