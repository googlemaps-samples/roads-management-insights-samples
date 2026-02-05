import { apiClient } from "../data/api-client"
import { googleRoutesApi } from "../data/api/google-routes-api"
import { isPointInBoundary } from "./boundary-validation"
import { decodePolylineToGeoJSON } from "./polyline-decoder"
import { toast } from "./toast"

// Store active processing state for cancellation
let isProcessingCancelled = false
const activeAbortControllers: Map<string, AbortController> = new Map()
let activeProcessingToastId: string | number | null = null
// Track the info toast ID and route count for routes that are still generating
let routesGeneratingToastId: string | number | null = null
let routesGeneratingCount: number = 0
let routesGeneratingMessage: string = ""
// Track failed routes to show summary at the end
const failedRoutes: Array<{
  routeId: string
  routeName: string
  error: string
}> = []

// Types for route upload handlers
export interface RouteUploadCallbacks {
  addUploadedRoute: (route: {
    id: string
    name: string
    type: "geojson" | "polyline"
    data: GeoJSON.FeatureCollection
    color: [number, number, number, number]
    uploadedAt: Date
  }) => void
  addSnappedRoads: (routeId: string, features: GeoJSON.Feature[]) => void
  setSnappedRoadsLoading: (loading: boolean) => void
  setOptimizedRouteMarkers: (
    routeId: string,
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
  ) => void
  focusOnUploadedRoutes: (routeIds: string[]) => void
  setSuccessMessage?: (message: string) => void
  setErrorMessage?: (message: string) => void
  registerAbortController?: (
    routeId: string,
    controller: AbortController,
  ) => void
  getAbortController?: (routeId: string) => AbortController | undefined
}

/**
 * Main file upload handler - processes geospatial files on backend using GDAL
 * Accepts only supported geospatial formats: GeoJSON, Shapefile (ZIP), KML, KMZ, GPX
 */
export const handleFileUpload = async (
  file: File,
  callbacks: RouteUploadCallbacks,
  namingConfig?: {
    type: "custom" | "property"
    value: string
  },
): Promise<void> => {
  if (!file) return

  // Validate file extension before processing
  const fileExtension = file.name.split(".").pop()?.toLowerCase()
  const supportedExtensions = ["geojson", "json", "kml", "kmz", "gpx", "zip"]

  if (!fileExtension || !supportedExtensions.includes(fileExtension)) {
    const errorMsg = `Unsupported file format. Please upload one of: ${supportedExtensions.join(", ")}`
    toast.error(errorMsg)
    callbacks.setErrorMessage?.(errorMsg)
    return
  }

  await processGeospatialFile(file, callbacks, namingConfig)
}

/**
 * Process geospatial file on backend using GDAL with auto-detection
 */
async function processGeospatialFile(
  file: File,
  callbacks: RouteUploadCallbacks,
  namingConfig?: {
    type: "custom" | "property"
    value: string
  },
): Promise<void> {
  // Reset cancellation flag for new processing
  isProcessingCancelled = false
  activeAbortControllers.clear()
  // Clear routes generating toast tracking
  routesGeneratingToastId = null
  routesGeneratingCount = 0
  routesGeneratingMessage = ""

  const processingToastId = toast.loading(`Processing ${file.name}...`, {
    description: "Uploading and processing file",
  })
  activeProcessingToastId = processingToastId

  try {
    // Prepare form data for upload
    const formData: Record<string, string> = {}
    if (namingConfig) {
      formData.naming_type = namingConfig.type
      formData.naming_value = namingConfig.value
    }

    // Upload file to backend for processing
    // GDAL will auto-detect the format (GeoJSON, Shapefile, KML, KMZ, GPX, etc.)
    const response = await apiClient.uploadFile<{
      success: boolean
      feature_count: number
      features: Array<{
        geometry: GeoJSON.Geometry
        properties: Record<string, unknown>
      }>
      available_properties: string[]
      message?: string
    }>("/file-upload/process-file", file, formData)

    // Check if processing was cancelled
    if (isProcessingCancelled) {
      return
    }

    if (!response.success) {
      throw new Error(response.message || "Failed to process GeoJSON file")
    }

    // Convert backend response to GeoJSON FeatureCollection
    const featureCollection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: response.features.map((feature) => ({
        type: "Feature",
        geometry: feature.geometry,
        properties: feature.properties,
      })),
    }

    // Get project boundary for validation
    const { useProjectWorkspaceStore } = await import(
      "../stores/project-workspace-store"
    )
    const projectData = useProjectWorkspaceStore.getState().projectData
    const boundary = projectData?.boundaryGeoJson

    // Process the feature collection
    processFeatureCollection(
      featureCollection,
      file.name,
      "geojson",
      callbacks,
      processingToastId,
      namingConfig,
      boundary,
    )
  } catch (error) {
    // Don't show error if processing was cancelled
    if (isProcessingCancelled) {
      return
    }
    const errorMsg =
      error instanceof Error ? error.message : "Failed to process GeoJSON file"
    toast.update(processingToastId, errorMsg, "error", {
      duration: 5000,
    })
    callbacks.setErrorMessage?.(errorMsg)
  } finally {
    if (!isProcessingCancelled) {
      activeProcessingToastId = null
    }
  }
}

/**
 * Cancel active file processing
 */
export const cancelFileProcessing = (): void => {
  // Set cancellation flag
  isProcessingCancelled = true

  // Abort all ongoing route generation requests
  activeAbortControllers.forEach((controller) => {
    controller.abort()
  })
  activeAbortControllers.clear()

  // Dismiss processing toast if active
  if (activeProcessingToastId !== null) {
    toast.dismiss(activeProcessingToastId)
    activeProcessingToastId = null
  }

  // Clear routes generating toast tracking
  if (routesGeneratingToastId !== null) {
    toast.dismiss(routesGeneratingToastId)
    routesGeneratingToastId = null
    routesGeneratingCount = 0
    routesGeneratingMessage = ""
  }
}

/**
 * Validate that all features in a FeatureCollection have LineString or MultiLineString geometry
 */
function validateLineStringGeometries(
  featureCollection: GeoJSON.FeatureCollection,
): { isValid: boolean; errorMessage?: string } {
  if (featureCollection.features.length === 0) {
    return {
      isValid: false,
      errorMessage: "The uploaded file has no features.",
    }
  }

  const invalidFeatures: Array<{ index: number; geometryType: string }> = []

  featureCollection.features.forEach((feature, index) => {
    const geometryType = feature.geometry.type
    if (geometryType !== "LineString" && geometryType !== "MultiLineString") {
      invalidFeatures.push({ index, geometryType })
    }
  })

  if (invalidFeatures.length > 0) {
    const invalidTypes = [
      ...new Set(invalidFeatures.map((f) => f.geometryType)),
    ].join(", ")
    const errorMessage = `The uploaded file contains features with non-LineString geometry types (${invalidTypes}). Only LineString and MultiLineString geometries are supported.`
    return { isValid: false, errorMessage }
  }

  return { isValid: true }
}

/**
 * Extract all coordinates from a feature (LineString or MultiLineString)
 */
function extractAllCoordinates(feature: GeoJSON.Feature): [number, number][] {
  const coordinates: [number, number][] = []
  const geometry = feature.geometry

  if (geometry.type === "LineString") {
    coordinates.push(...(geometry.coordinates as [number, number][]))
  } else if (geometry.type === "MultiLineString") {
    geometry.coordinates.forEach((line) => {
      coordinates.push(...(line as [number, number][]))
    })
  }

  return coordinates
}

/**
 * Check if all coordinates in a feature are within the boundary
 */
function isRouteWithinBoundary(
  feature: GeoJSON.Feature,
  boundary:
    | GeoJSON.Polygon
    | GeoJSON.FeatureCollection
    | GeoJSON.Feature<GeoJSON.Polygon>
    | null
    | undefined,
): boolean {
  if (!boundary) {
    // If no boundary is set, allow all routes
    return true
  }

  const coordinates = extractAllCoordinates(feature)
  if (coordinates.length === 0) {
    return false
  }

  // Check if all coordinates are within the boundary
  return coordinates.every(([lng, lat]) => {
    return isPointInBoundary(lat, lng, boundary)
  })
}

/**
 * Process feature collection and add routes
 */
function processFeatureCollection(
  featureCollection: GeoJSON.FeatureCollection,
  fileName: string,
  fileType: "geojson",
  callbacks: RouteUploadCallbacks,
  processingToastId: string | number,
  namingConfig?: {
    type: "custom" | "property"
    value: string
  },
  boundary?:
    | GeoJSON.Polygon
    | GeoJSON.FeatureCollection
    | GeoJSON.Feature<GeoJSON.Polygon>
    | null,
): void {
  // Validate that all features have LineString or MultiLineString geometry
  const validation = validateLineStringGeometries(featureCollection)
  if (!validation.isValid) {
    const errorMsg =
      validation.errorMessage ||
      "The uploaded file has no LineString geometries."
    toast.update(processingToastId, errorMsg, "error", {
      duration: 5000,
    })
    callbacks.setErrorMessage?.(errorMsg)
    return
  }

  // Check feature count limit
  const MAX_FEATURES = 500
  if (featureCollection.features.length > MAX_FEATURES) {
    const errorMsg = `GeoJSON file contains ${featureCollection.features.length} features. Maximum allowed is ${MAX_FEATURES} features.`
    toast.update(processingToastId, errorMsg, "error", {
      duration: 5000,
    })
    callbacks.setErrorMessage?.(errorMsg)
    return
  }

  // Process each feature as a separate route
  const timestamp = Date.now()
  const routeIds: string[] = []
  let discardedCount = 0
  const discardReason = "outside jurisdiction boundary"
  // Clear failed routes for this upload batch
  failedRoutes.length = 0

  for (let index = 0; index < featureCollection.features.length; index++) {
    // Check if processing was cancelled BEFORE creating any new routes
    if (isProcessingCancelled) {
      toast.update(processingToastId, "Uploading cancelled", "info", {
        duration: 5000,
      })
      callbacks.setErrorMessage?.("Processing cancelled")
      // Clear any routes that were already added
      routeIds.forEach((routeId) => {
        const controller = activeAbortControllers.get(routeId)
        if (controller) {
          controller.abort()
        }
      })
      activeAbortControllers.clear()
      activeProcessingToastId = null
      return
    }

    const feature = featureCollection.features[index]

    // Check if route is within jurisdiction boundary
    if (!isRouteWithinBoundary(feature, boundary)) {
      discardedCount++
      console.log(
        `⚠️ Route "${feature.properties?.name || `Feature ${index + 1}`}" discarded - ${discardReason}`,
      )
      continue
    }

    const routeId = `${fileType}-${timestamp}-${index}`
    routeIds.push(routeId)

    // Get feature name based on naming config
    // Helper function to check if a value is a valid non-empty string
    const isValidName = (value: unknown): boolean => {
      return (
        typeof value === "string" &&
        value.trim().length > 0 &&
        value !== "null" &&
        value !== "undefined"
      )
    }

    // Helper function to get fallback name
    const getFallbackName = (): string => {
      return `${fileName} - Feature ${index + 1}`
    }

    let featureName: string
    if (namingConfig) {
      if (namingConfig.type === "property") {
        // Use property value from feature, fallback to default if not available or empty
        const propertyValue = feature.properties?.[namingConfig.value]
        if (isValidName(propertyValue)) {
          featureName = String(propertyValue).trim()
        } else {
          // Fallback to default naming if property doesn't exist or is empty
          featureName = getFallbackName()
        }
      } else {
        // Custom name
        featureName = `${namingConfig.value} ${index + 1}`
      }
    } else {
      // Try to use feature.properties.name, but fallback if it's missing or empty
      const nameFromProperties = feature.properties?.name
      if (isValidName(nameFromProperties)) {
        featureName = String(nameFromProperties).trim()
      } else {
        // Fallback to default naming
        featureName = getFallbackName()
      }
    }

    // Create a FeatureCollection with just this feature
    const singleFeatureCollection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [feature],
    }

    // Add to layer store
    callbacks.addUploadedRoute({
      id: routeId,
      name: featureName,
      type: "geojson",
      data: singleFeatureCollection,
      color: [255, 235, 59, 255], // Yellow
      uploadedAt: new Date(),
    })

    // Check cancellation again before starting route generation
    // This check happens BEFORE creating the abort controller, so we can stop immediately
    if (isProcessingCancelled) {
      console.log(
        "Processing cancelled, skipping route generation for:",
        routeId,
      )
      // Don't start this route, but continue the loop to check cancellation for remaining routes
      continue
    }

    // Generate optimized route using Google Routes API (asynchronously - fire and forget)
    // Create abort controller and register it BEFORE starting the async operation
    const abortController = new AbortController()

    // Register controller immediately so it can be aborted if cancellation happens
    activeAbortControllers.set(routeId, abortController)
    if (callbacks.registerAbortController) {
      callbacks.registerAbortController(routeId, abortController)
    }

    // Check cancellation one more time AFTER registering controller but BEFORE starting async call
    if (isProcessingCancelled) {
      console.log(
        "Processing cancelled after controller creation, aborting immediately:",
        routeId,
      )
      abortController.abort()
      activeAbortControllers.delete(routeId)
      continue
    }

    // Start route generation asynchronously (don't await - allows parallel processing)
    generateOptimizedRoute(
      routeId,
      featureName,
      singleFeatureCollection,
      callbacks,
      abortController.signal,
    ).catch(() => {
      // Remove from active controllers when done (success or error)
      activeAbortControllers.delete(routeId)
    })
  }

  // Clear active processing state if not cancelled
  if (!isProcessingCancelled) {
    activeProcessingToastId = null
  }

  // Only show success message and focus if not cancelled
  if (!isProcessingCancelled) {
    // Focus map on all uploaded routes
    if (routeIds.length > 0) {
      callbacks.focusOnUploadedRoutes(routeIds)
    }

    // Handle case when no routes were uploaded (all discarded)
    if (routeIds.length === 0) {
      const warningMsg = `**0** routes uploaded • **${discardedCount}** discarded (${discardReason})`
      const warningDescription =
        discardedCount > 0
          ? `All routes were outside the jurisdiction boundary and could not be uploaded.`
          : "No routes were uploaded."

      toast.update(processingToastId, warningMsg, "warning", {
        description: warningDescription,
        duration: 5000,
      })
      callbacks.setErrorMessage?.(warningMsg)
      return
    }

    // Build success message with discarded count and failed routes if any
    const routeText = routeIds.length === 1 ? "route" : "routes"
    let successMsg = `**${routeIds.length}** ${routeText} uploaded`
    if (discardedCount > 0) {
      successMsg += ` • **${discardedCount}** discarded (${discardReason})`
    }
    if (failedRoutes.length > 0) {
      successMsg += ` • **${failedRoutes.length}** failed to generate`
    }

    const description =
      failedRoutes.length > 0
        ? `${failedRoutes.length} route${failedRoutes.length === 1 ? "" : "s"} could not be generated`
        : "Generating Google routes..."

    // Show loading toast while routes are still generating (not success yet)
    // Store the toast ID and message so we can update it to success when all routes finish
    routesGeneratingToastId = processingToastId
    routesGeneratingCount = routeIds.length
    routesGeneratingMessage = successMsg
    toast.update(processingToastId, successMsg, "loading", {
      description,
      duration: Infinity, // Keep it visible until we update it to success
    })
    callbacks.setSuccessMessage?.(successMsg)

    // Log failed routes for debugging
    if (failedRoutes.length > 0) {
      console.warn(
        "⚠️ [processFeatureCollection] Some routes failed to generate:",
        failedRoutes,
      )
    }
  }
}

/**
 * Handle GeoJSON file upload
 */
export const handleGeoJsonUpload = (
  file: File,
  callbacks: RouteUploadCallbacks,
): void => {
  const processingToastId = toast.loading(`Processing ${file.name}...`, {
    description: "Reading and validating GeoJSON file",
  })

  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const content = e.target?.result as string
      const geojson = JSON.parse(content)

      // Validate GeoJSON structure
      if (!geojson.type) {
        throw new Error("Invalid GeoJSON: missing type field")
      }

      // Convert to FeatureCollection if needed
      let featureCollection: GeoJSON.FeatureCollection
      if (geojson.type === "FeatureCollection") {
        featureCollection = geojson
      } else if (geojson.type === "Feature") {
        featureCollection = {
          type: "FeatureCollection",
          features: [geojson],
        }
      } else if (
        geojson.type === "LineString" ||
        geojson.type === "Polygon" ||
        geojson.type === "Point" ||
        geojson.type === "MultiLineString" ||
        geojson.type === "MultiPolygon"
      ) {
        // Raw geometry, wrap it in a Feature
        // Validate that it's a LineString or MultiLineString before processing
        if (
          geojson.type !== "LineString" &&
          geojson.type !== "MultiLineString"
        ) {
          const errorMsg = `The uploaded file contains a ${geojson.type} geometry. Only LineString and MultiLineString geometries are supported.`
          toast.update(processingToastId, errorMsg, "error", {
            duration: 5000,
          })
          callbacks.setErrorMessage?.(errorMsg)
          return
        }
        featureCollection = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: geojson,
              properties: {},
            },
          ],
        }
      } else {
        throw new Error(`Unsupported GeoJSON type: ${geojson.type}`)
      }

      // Validate that all features have LineString or MultiLineString geometry
      const validation = validateLineStringGeometries(featureCollection)
      if (!validation.isValid) {
        const errorMsg =
          validation.errorMessage ||
          "The uploaded file has no LineString geometries."
        toast.update(processingToastId, errorMsg, "error", {
          duration: 5000,
        })
        callbacks.setErrorMessage?.(errorMsg)
        return
      }

      // Check feature count limit
      const MAX_FEATURES = 500
      if (featureCollection.features.length > MAX_FEATURES) {
        const errorMsg = `GeoJSON file contains ${featureCollection.features.length} features. Maximum allowed is ${MAX_FEATURES} features.`
        toast.update(processingToastId, errorMsg, "error", {
          duration: 5000,
        })
        callbacks.setErrorMessage?.(errorMsg)
        return
      }

      // Get project boundary for validation
      const { useProjectWorkspaceStore } = await import(
        "../stores/project-workspace-store"
      )
      const projectData = useProjectWorkspaceStore.getState().projectData
      const boundary = projectData?.boundaryGeoJson

      // Process the feature collection (this will handle boundary validation)
      processFeatureCollection(
        featureCollection,
        file.name,
        "geojson",
        callbacks,
        processingToastId,
        undefined,
        boundary,
      )
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Invalid GeoJSON file format"
      toast.update(processingToastId, errorMsg, "error", {
        duration: 5000,
      })
      callbacks.setErrorMessage?.(errorMsg)
    }
  }
  reader.readAsText(file)
}

/**
 * Generate optimized route using Google Routes API
 */
export const generateOptimizedRoute = async (
  routeId: string,
  routeName: string,
  featureCollection: GeoJSON.FeatureCollection,
  callbacks: RouteUploadCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> => {
  // Check if processing was cancelled before starting
  if (isProcessingCancelled) {
    return
  }

  // Ensure we have an abort signal - create one if not provided
  let controller: AbortController | undefined
  let signal: AbortSignal

  if (abortSignal) {
    signal = abortSignal
  } else {
    controller = new AbortController()
    signal = controller.signal
    activeAbortControllers.set(routeId, controller)
  }

  try {
    // Check cancellation again before making API call
    if (isProcessingCancelled || signal.aborted) {
      return
    }

    callbacks.setSnappedRoadsLoading(true)

    // Extract all coordinates from the feature collection
    const allCoordinates: [number, number][] = []

    featureCollection.features.forEach((feature) => {
      if (
        feature.geometry.type === "LineString" ||
        feature.geometry.type === "MultiLineString"
      ) {
        const coords =
          feature.geometry.type === "LineString"
            ? feature.geometry.coordinates
            : feature.geometry.coordinates.flat()

        coords.forEach((coord) => {
          allCoordinates.push([coord[0], coord[1]])
        })
      }
    })

    if (allCoordinates.length < 2) {
      return
    }

    // Check cancellation before processing coordinates
    if (isProcessingCancelled || signal.aborted) {
      return
    }

    // Use first coordinate as origin, last as destination (no intermediates)
    const origin = allCoordinates[0]
    const destination = allCoordinates[allCoordinates.length - 1]

    // Check cancellation one more time before making the API call
    if (isProcessingCancelled || signal.aborted) {
      return
    }

    // Call Google Routes API using consolidated API
    const apiResponse = await googleRoutesApi.generateRoute(
      { lat: origin[1], lng: origin[0] },
      { lat: destination[1], lng: destination[0] },
      [],
      signal,
    )

    // Check cancellation after API call
    if (isProcessingCancelled || signal.aborted) {
      return
    }

    if (!apiResponse.success || !apiResponse.data) {
      const errorMsg = apiResponse.message || "No routes found"
      // Track failed route (don't show individual toast - will show summary at end)
      failedRoutes.push({
        routeId,
        routeName,
        error: errorMsg,
      })
      // Note: Route remains in uploadedRoutes but without markers/roads
      // This will cause allRoutesLoaded to be false until we handle failed routes
      return
    }

    const { encodedPolyline, distance, duration } = apiResponse.data
    const distanceKm = distance.toFixed(2)
    const durationMinutes = duration.toFixed(0)

    // Check cancellation before processing route data
    if (isProcessingCancelled || signal.aborted) {
      return
    }

    // Decode the polyline to GeoJSON
    const decodedGeometry = decodePolylineToGeoJSON(encodedPolyline)

    // Check cancellation again after decoding
    if (isProcessingCancelled || signal.aborted) {
      return
    }

    // Create a feature for the optimized route
    const routeFeature: GeoJSON.Feature = {
      type: "Feature",
      geometry: decodedGeometry,
      properties: {
        id: `${routeId}-optimized`,
        name: "Optimized Route",
        source: "google_routes_api",
        distance: distanceKm,
        duration: durationMinutes,
        traffic_aware: true,
        encodedPolyline: encodedPolyline,
      },
    }

    // Check cancellation before adding to store
    if (isProcessingCancelled || signal.aborted) {
      return
    }

    // Add optimized route to layer store
    callbacks.addSnappedRoads(routeId, [routeFeature])

    // Set markers for the optimized route (start and end points)
    callbacks.setOptimizedRouteMarkers(
      routeId,
      { lat: origin[1], lng: origin[0] },
      { lat: destination[1], lng: destination[0] },
    )

    const successMsg = `Generated Google route: ${distanceKm}km, ~${durationMinutes}min`
    // toast.success(successMsg)
    callbacks.setSuccessMessage?.(successMsg)
  } catch (error) {
    // Don't show error if request was aborted or processing was cancelled
    if (
      (error instanceof Error && error.name === "AbortError") ||
      isProcessingCancelled ||
      (signal && signal.aborted)
    ) {
      return
    }
    const errorMsg =
      error instanceof Error
        ? error.message
        : "Failed to generate optimized route"
    toast.error(errorMsg, { duration: 5000 })
    callbacks.setErrorMessage?.(errorMsg)
  } finally {
    // Remove from active controllers when done
    activeAbortControllers.delete(routeId)
    const remainingRoutes = activeAbortControllers.size
    // Only set loading to false if not cancelled AND no more routes are being processed
    // This ensures loading stays true until ALL routes have finished
    if (!isProcessingCancelled && remainingRoutes === 0) {
      callbacks.setSnappedRoadsLoading(false)

      // All routes have finished generating - show success toast
      if (routesGeneratingToastId !== null && routesGeneratingCount > 0) {
        const successMsg =
          routesGeneratingMessage ||
          `**${routesGeneratingCount}** route${routesGeneratingCount === 1 ? "" : "s"} uploaded`

        toast.update(routesGeneratingToastId, successMsg, "success", {
          description: "All Google routes generated",
          duration: 5000,
        })
        routesGeneratingToastId = null
        routesGeneratingCount = 0
        routesGeneratingMessage = ""
      }
    } else {
      console.log(
        "⏳ [generateOptimizedRoute] Routes still processing, keeping isLoading true",
      )
    }
  }
}
