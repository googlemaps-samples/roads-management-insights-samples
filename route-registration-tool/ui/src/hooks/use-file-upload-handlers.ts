import { useRef } from "react"

import { useProjectWorkspaceStore } from "../stores"
import { useLayerStore } from "../stores/layer-store"
import { isPointInBoundary } from "../utils/boundary-validation"
import {
  cancelFileProcessing,
  handleFileUpload,
} from "../utils/route-upload-handler"
import { toast } from "../utils/toast"

/**
 * Hook for handling file upload functionality
 */
export const useFileUploadHandlers = () => {
  const setMapMode = useProjectWorkspaceStore((state) => state.setMapMode)
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const setRouteNamingDialogOpen = useProjectWorkspaceStore(
    (state) => state.setRouteNamingDialogOpen,
  )
  const routeNamingDialogOpen = useProjectWorkspaceStore(
    (state) => state.routeNamingDialogOpen,
  )
  const pendingFile = useProjectWorkspaceStore((state) => state.pendingFile)
  const setPendingFile = useProjectWorkspaceStore(
    (state) => state.setPendingFile,
  )
  const pendingFeatureCount = useProjectWorkspaceStore(
    (state) => state.pendingFeatureCount,
  )
  const setPendingFeatureCount = useProjectWorkspaceStore(
    (state) => state.setPendingFeatureCount,
  )
  const pendingProperties = useProjectWorkspaceStore(
    (state) => state.pendingProperties,
  )
  const setPendingProperties = useProjectWorkspaceStore(
    (state) => state.setPendingProperties,
  )

  const clearAllDrawing = useLayerStore((state) => state.clearAllDrawing)

  const addUploadedRoute = useLayerStore((state) => state.addUploadedRoute)
  const addSnappedRoads = useLayerStore((state) => state.addSnappedRoads)
  const setSnappedRoadsLoading = useLayerStore(
    (state) => state.setSnappedRoadsLoading,
  )
  const setOptimizedRouteMarkers = useLayerStore(
    (state) => state.setOptimizedRouteMarkers,
  )
  const focusOnUploadedRoutes = useLayerStore(
    (state) => state.focusOnUploadedRoutes,
  )

  // File input ref for upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Track if we're waiting for file selection to detect cancellation
  const isWaitingForFileSelection = useRef(false)
  // Track focus handler to remove it if needed
  const focusHandlerRef = useRef<(() => void) | null>(null)

  const handleUploadRoute = (onRouteOptionsClose?: () => void) => {
    // Check if there are existing uploaded routes
    const { uploadedRoutes } = useLayerStore.getState()
    const hasUploadedRoutes = uploadedRoutes.routes.length > 0

    if (mapMode === "upload_routes") {
      // If clicking the same mode and there are uploaded routes, show dialog
      if (hasUploadedRoutes) {
        // Set pending upload clear to show confirmation dialog
        useProjectWorkspaceStore.getState().setPendingUploadClear(true)
        // Close the dropdown when an option is selected
        onRouteOptionsClose?.()
        return
      }
      // If no uploaded routes, switch back to view
      setMapMode("view")
      clearAllDrawing()
      isWaitingForFileSelection.current = false
      // Remove focus handler if it exists
      if (focusHandlerRef.current) {
        window.removeEventListener("focus", focusHandlerRef.current)
        focusHandlerRef.current = null
      }
    } else {
      // Check if there are existing uploaded routes
      if (hasUploadedRoutes) {
        // Set pending upload clear to show confirmation dialog
        useProjectWorkspaceStore.getState().setPendingUploadClear(true)
        // Close the dropdown when an option is selected
        onRouteOptionsClose?.()
        return
      }
      // Check pending mode switch before attempting to switch
      const pendingModeSwitchBefore =
        useProjectWorkspaceStore.getState().pendingModeSwitch
      const roadImportPendingModeSwitchBefore =
        useLayerStore.getState().roadImport.pendingModeSwitch

      setMapMode("upload_routes")

      // Check if mode switch was blocked (pendingModeSwitch was set)
      // Check both project workspace store and layer store (for import mode)
      const pendingModeSwitchAfter =
        useProjectWorkspaceStore.getState().pendingModeSwitch
      const roadImportPendingModeSwitchAfter =
        useLayerStore.getState().roadImport.pendingModeSwitch
      const modeSwitchBlocked =
        (pendingModeSwitchAfter !== null &&
          pendingModeSwitchAfter !== pendingModeSwitchBefore) ||
        (roadImportPendingModeSwitchAfter !== null &&
          roadImportPendingModeSwitchAfter !==
            roadImportPendingModeSwitchBefore)

      // Only proceed with file upload if mode switch was successful (not blocked)
      if (!modeSwitchBlocked) {
        clearAllDrawing()
        // Mark that we're waiting for file selection
        isWaitingForFileSelection.current = true
        // Trigger file input click
        fileInputRef.current?.click()

        // Use window focus event to detect when file dialog closes
        // The dialog causes window to lose focus, and when it closes, focus returns
        // This handles the case where user cancels the dialog (onChange won't fire)
        const handleWindowFocus = () => {
          // Small delay to ensure file input state has updated
          setTimeout(() => {
            if (
              isWaitingForFileSelection.current &&
              fileInputRef.current &&
              !fileInputRef.current.files?.length
            ) {
              // User canceled the file dialog, reset to view mode
              setMapMode("view")
              isWaitingForFileSelection.current = false
            }
            // Remove the event listener after checking
            if (focusHandlerRef.current) {
              window.removeEventListener("focus", focusHandlerRef.current)
              focusHandlerRef.current = null
            }
          }, 100)
        }

        // Store handler reference and add focus listener to detect when dialog closes
        // Remove any existing handler first
        if (focusHandlerRef.current) {
          window.removeEventListener("focus", focusHandlerRef.current)
        }
        focusHandlerRef.current = handleWindowFocus
        window.addEventListener("focus", handleWindowFocus, { once: true })
      }
    }
    // Close the dropdown when an option is selected
    onRouteOptionsClose?.()
  }

  const handleFileUploadChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]

    // Remove focus handler since onChange fired (file was selected or input was reset)
    if (focusHandlerRef.current) {
      window.removeEventListener("focus", focusHandlerRef.current)
      focusHandlerRef.current = null
    }

    // Reset the waiting flag since onChange fired (file was selected or input was reset)
    isWaitingForFileSelection.current = false

    // If no file was selected (user canceled or input was reset), reset mode to view
    if (!file) {
      // Only reset if we're still in upload_routes mode (user might have already switched)
      const currentMode = useProjectWorkspaceStore.getState().mapMode
      if (currentMode === "upload_routes") {
        setMapMode("view")
      }
      return
    }

    // Get project boundary for validation
    const projectData = useProjectWorkspaceStore.getState().projectData
    const boundary = projectData?.boundaryGeoJson

    // Preview file on backend using GDAL to get feature count and properties
    // This works for all GDAL-supported formats (GeoJSON, Shapefile, KML, KMZ, GPX, etc.)
    const previewToastId = toast.loading(`Analyzing ${file.name}...`, {
      description: "Reading GeoJSON file and extracting metadata",
    })

    ;(async () => {
      try {
        // For GeoJSON files, validate LineStrings within boundary before preview
        if (
          file.name.toLowerCase().endsWith(".geojson") ||
          file.name.toLowerCase().endsWith(".json")
        ) {
          const fileText = await file.text()
          let geojson:
            | GeoJSON.FeatureCollection
            | GeoJSON.Feature
            | GeoJSON.Geometry

          try {
            geojson = JSON.parse(fileText)
          } catch {
            throw new Error("Invalid JSON format")
          }

          // Normalize to FeatureCollection
          let featureCollection: GeoJSON.FeatureCollection
          if (geojson.type === "FeatureCollection") {
            featureCollection = geojson as GeoJSON.FeatureCollection
          } else if (geojson.type === "Feature") {
            featureCollection = {
              type: "FeatureCollection",
              features: [geojson as GeoJSON.Feature],
            }
          } else if (
            geojson.type === "LineString" ||
            geojson.type === "MultiLineString"
          ) {
            featureCollection = {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  geometry: geojson as
                    | GeoJSON.LineString
                    | GeoJSON.MultiLineString,
                  properties: {},
                },
              ],
            }
          } else {
            throw new Error(
              "Invalid file format. The file must contain routes (LineString or MultiLineString geometries).",
            )
          }

          // Filter for LineString and MultiLineString features
          const lineStringFeatures = featureCollection.features.filter(
            (feature) =>
              feature.geometry.type === "LineString" ||
              feature.geometry.type === "MultiLineString",
          )

          if (lineStringFeatures.length === 0) {
            throw new Error(
              "No routes found in the file. The file must contain LineString or MultiLineString geometries to be uploaded as routes.",
            )
          }

          // Check if any LineString features are within the boundary
          if (boundary) {
            const featuresWithinBoundary = lineStringFeatures.filter(
              (feature) => {
                const coordinates: [number, number][] = []
                const geometry = feature.geometry

                if (geometry.type === "LineString") {
                  coordinates.push(
                    ...(geometry.coordinates as [number, number][]),
                  )
                } else if (geometry.type === "MultiLineString") {
                  geometry.coordinates.forEach((line) => {
                    coordinates.push(...(line as [number, number][]))
                  })
                }

                // Check if at least one coordinate is within the boundary
                // (We check if any coordinate is within, not all, to be more lenient)
                return coordinates.some(([lng, lat]) =>
                  isPointInBoundary(lat, lng, boundary),
                )
              },
            )

            if (featuresWithinBoundary.length === 0) {
              throw new Error(
                "No routes found within the jurisdiction boundary. Please ensure your file contains routes (LineString features) that are located within the project's jurisdiction area.",
              )
            }
          }
        }

        const { apiClient } = await import("../data/api-client")
        const response = await apiClient.uploadFile<{
          success: boolean
          feature_count: number
          available_properties: string[]
          message?: string
        }>("/file-upload/preview-file", file)

        if (!response.success) {
          const errorMsg = response.message || "Failed to preview file"
          toast.dismiss(previewToastId)
          toast.error(errorMsg)
          // Reset mode to view when preview fails
          const currentMode = useProjectWorkspaceStore.getState().mapMode
          if (currentMode === "upload_routes") {
            setMapMode("view")
          }
          return
        }

        // Store file, feature count, and properties, then show naming dialog
        setPendingFile(file)
        setPendingFeatureCount(response.feature_count)
        setPendingProperties(response.available_properties)
        setRouteNamingDialogOpen(true)

        toast.dismiss(previewToastId)
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : "Failed to analyze file. Please ensure it's a valid GeoJSON file."
        toast.update(previewToastId, errorMsg, "error")
        // Reset mode to view when validation fails
        const currentMode = useProjectWorkspaceStore.getState().mapMode
        if (currentMode === "upload_routes") {
          setMapMode("view")
        }
      }
    })()

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleRouteNamingConfirm = (namingConfig: {
    type: "custom" | "property"
    value: string
  }) => {
    if (!pendingFile) return

    // Create callbacks object for route upload handler
    const win = window as typeof window & {
      __registerRouteAbortController?: (
        routeId: string,
        controller: AbortController,
      ) => void
      __getRouteAbortController?: (
        routeId: string,
      ) => AbortController | undefined
    }

    const uploadCallbacks = {
      addUploadedRoute,
      addSnappedRoads,
      setSnappedRoadsLoading,
      setOptimizedRouteMarkers,
      focusOnUploadedRoutes,
      registerAbortController: win.__registerRouteAbortController,
      getAbortController: win.__getRouteAbortController,
    }

    // Use the utility function to handle file upload with naming config
    handleFileUpload(pendingFile, uploadCallbacks, namingConfig).catch(
      (error) => {
        console.error("Error uploading file:", error)
        toast.error(
          error instanceof Error ? error.message : "Failed to upload file",
        )
      },
    )

    // Reset state
    setPendingFile(null)
    setPendingFeatureCount(0)
    setPendingProperties([])
  }

  const handleRouteNamingCancel = () => {
    setPendingFile(null)
    setPendingFeatureCount(0)
    setPendingProperties([])
    setRouteNamingDialogOpen(false)
  }

  const handleClearUploadedRoutesAndUpload = () => {
    const {
      clearUploadedRoutes,
      clearSnappedRoads,
      clearAllOptimizedRouteMarkers,
      setSelectedUploadedRouteId,
    } = useLayerStore.getState()

    // Cancel any pending route generation requests first
    // This prevents routes from being added after they're cleared
    cancelFileProcessing()

    // Clear uploaded routes and related state
    clearUploadedRoutes()
    clearSnappedRoads()
    clearAllOptimizedRouteMarkers()
    setSelectedUploadedRouteId(null)

    // Clear pending upload clear state
    useProjectWorkspaceStore.getState().setPendingUploadClear(false)

    // Switch to upload_routes mode
    setMapMode("upload_routes")

    // Open file explorer after a short delay to ensure mode switch completed
    setTimeout(() => {
      clearAllDrawing()
      // Mark that we're waiting for file selection
      isWaitingForFileSelection.current = true

      // Find the file input element (it's in MapControls component)
      // We use querySelector to find the hidden file input with geojson accept
      const fileInput = document.querySelector<HTMLInputElement>(
        'input[type="file"][accept*="geojson"]',
      )

      if (fileInput) {
        // Set up cancellation handler to reset mode if user cancels file dialog
        const handleWindowFocus = () => {
          setTimeout(() => {
            // Check if no file was selected (user cancelled)
            if (fileInput && !fileInput.files?.length) {
              // User canceled the file dialog, reset to view mode
              setMapMode("view")
              isWaitingForFileSelection.current = false
            }
            // Remove the event listener after checking
            window.removeEventListener("focus", handleWindowFocus)
          }, 100)
        }

        // Add focus listener to detect when dialog closes
        window.addEventListener("focus", handleWindowFocus, { once: true })

        // Also try using the ref if available
        if (fileInputRef.current) {
          fileInputRef.current.click()
        } else {
          fileInput.click()
        }
      } else {
        // If not found immediately, try again after a longer delay
        // (in case MapControls hasn't rendered yet)
        setTimeout(() => {
          const retryFileInput = document.querySelector<HTMLInputElement>(
            'input[type="file"][accept*="geojson"]',
          )
          if (retryFileInput) {
            // Set up cancellation handler for retry
            const handleWindowFocus = () => {
              setTimeout(() => {
                // Check if no file was selected (user cancelled)
                if (retryFileInput && !retryFileInput.files?.length) {
                  // User canceled the file dialog, reset to view mode
                  setMapMode("view")
                  isWaitingForFileSelection.current = false
                }
                // Remove the event listener after checking
                window.removeEventListener("focus", handleWindowFocus)
              }, 100)
            }

            // Add focus listener to detect when dialog closes
            window.addEventListener("focus", handleWindowFocus, { once: true })

            retryFileInput.click()
          }
        }, 200)
      }
    }, 150)
  }

  return {
    fileInputRef,
    pendingFile,
    pendingFeatureCount,
    pendingProperties,
    routeNamingDialogOpen,
    handleUploadRoute,
    handleFileUploadChange,
    handleRouteNamingConfirm,
    handleRouteNamingCancel,
    handleClearUploadedRoutesAndUpload,
  }
}
