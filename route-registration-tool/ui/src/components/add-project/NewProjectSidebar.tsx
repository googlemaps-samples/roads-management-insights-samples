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

import { Box, CircularProgress, Paper, Typography } from "@mui/material"
import React, { useEffect, useRef, useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useNavigate } from "react-router-dom"

import {
  useClientConfig,
  useCreateProject,
  useGcpProjects,
} from "../../hooks/use-api"
import { useProjectCreationStore } from "../../stores"
import { RegionCreationFormData } from "../../types/region-creation"
import { clearAllLayers } from "../../utils/clear-all-layers"
import { buildSessionPath } from "../../utils/session"
import { toast } from "../../utils/toast"
import Button from "../common/Button"
import DatasetNameForm from "./DatasetNameForm"
import GcpProjectSelector from "./GcpProjectSelector"
import GeoJsonUploader from "./GeoJsonUploader"
import ProjectNameForm from "./ProjectNameForm"
import { useSessionId } from "../../hooks/use-session-id"
import { WORLD_JURISDICTION_GEO_JSON } from "../../utils/world-jurisdiction-geojson"

const FULL_FLOW_STEPS = [
  "Google Cloud Project",
  "Dataset Name",
  "Project Name",
  "Jurisdiction Boundary",
] as const

interface NewProjectSidebarProps {
  onStepChange?: (step: number) => void
}

export default function NewProjectSidebar({
  onStepChange,
}: NewProjectSidebarProps) {
  const navigate = useNavigate()
  const sessionId = useSessionId()
  const [activeStep, setActiveStep] = useState(0)
  const didApplyMultitenantDefaults = useRef(false)
  const didToastGcpError = useRef(false)

  const { data: clientConfig, isPending: isClientConfigPending } =
    useClientConfig()
  const stepIndices =
    clientConfig?.new_project_creation_step_indices &&
      clientConfig.new_project_creation_step_indices.length > 0
      ? clientConfig.new_project_creation_step_indices.slice().sort((a, b) => a - b)
      : null

  // Visible steps are chosen via step indices.
  // If indices are not provided, fall back to the count-based behavior for backward compatibility.
  const visibleOriginalSteps: number[] = stepIndices
    ? Array.from(new Set(stepIndices)).filter((i) => i >= 0 && i <= 3)
    : (() => {
      const newProjectCreationSteps = Math.max(
        1,
        Math.min(4, clientConfig?.new_project_creation_steps ?? 4),
      )

      // Visible steps are a suffix of the original flow, but we always keep "Project Name".
      // 1 step => [2]
      // 2 steps => [2,3]
      // 3 steps => [1,2,3]
      // 4 steps => [0,1,2,3]
      return [
        ...(newProjectCreationSteps === 4 ? [0] : []),
        ...(newProjectCreationSteps >= 3 ? [1] : []),
        2,
        ...(newProjectCreationSteps >= 2 ? [3] : []),
      ]
    })()

  // Step 2 (Project Name) is always required.
  if (!visibleOriginalSteps.includes(2)) {
    visibleOriginalSteps.push(2)
    visibleOriginalSteps.sort((a, b) => a - b)
  }

  const activeOriginalStep = visibleOriginalSteps[activeStep] ?? 2

  const stepLabels = visibleOriginalSteps.map(
    (i) => FULL_FLOW_STEPS[i as 0 | 1 | 2 | 3],
  )

  const isGcpStepVisible = visibleOriginalSteps.includes(0)
  const isJurisdictionStepVisible = visibleOriginalSteps.includes(3)
  const enableMultitenant = clientConfig?.enable_multitenant === true
  /** When multitenant is on, jurisdiction upload is optional; default is whole-world boundary. */
  const isJurisdictionBoundaryOptional =
    enableMultitenant && isJurisdictionStepVisible

  // Notify parent of step changes
  React.useEffect(() => {
    onStepChange?.(activeOriginalStep)
  }, [activeOriginalStep, onStepChange])

  // Store hooks
  const {
    geoJsonState,
    formState,
    updateGeoJsonState,
    updateFormState,
    clearProjectCreationState,
  } = useProjectCreationStore()

  // Real API hooks
  const createProjectMutation = useCreateProject()
  const { data: gcpProjectsResponse } = useGcpProjects()

  // Form setup with validation
  const methods = useForm<RegionCreationFormData>({
    defaultValues: {
      name: "",
      googleCloudProjectId: "",
      googleCloudProjectNumber: "",
      subscriptionId: "",
      datasetName: "historical_roads_data",
    },
    mode: "onChange",
  })

  // Validation rules
  const validateProjectName = (name: string) => {
    if (!name || name.trim() === "") {
      return "Project name is required"
    }
    return true
  }

  const validateGcpProjectId = (projectId: string) => {
    if (!projectId || projectId.trim() === "") {
      return "Google Cloud Project ID is required"
    }

    return true
  }

  const validateDatasetName = (datasetName: string) => {
    if (!datasetName || datasetName.trim() === "") {
      return "Dataset name is required"
    }
    const trimmed = datasetName.trim()
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return "Dataset name can only contain letters, numbers, and underscores"
    }
    return true
  }

  const {
    handleSubmit,
    watch,
    trigger,
    getValues,
    setValue,
    formState: hookFormState,
  } = methods
  const watchedValues = watch()
  const { errors } = hookFormState

  useEffect(() => {
    // When the GCP step is hidden, we still need GCP ids for project creation.
    if (isGcpStepVisible) return
    if (didApplyMultitenantDefaults.current) return
    if (!gcpProjectsResponse) return

    if (!gcpProjectsResponse.success) {
      if (!didToastGcpError.current && gcpProjectsResponse.message) {
        didToastGcpError.current = true
        toast.error("GCP Projects Fetch Failed", {
          description: gcpProjectsResponse.message,
        })
      }
      return
    }

    const projects = gcpProjectsResponse.data || []
    if (!projects.length) return

    didApplyMultitenantDefaults.current = true
    const first = projects[0]

    setValue(
      "googleCloudProjectId",
      first.project_id ?? "",
      { shouldValidate: false, shouldDirty: false },
    )
    setValue(
      "googleCloudProjectNumber",
      first.project_number ?? "",
      { shouldValidate: false, shouldDirty: false },
    )
  }, [isGcpStepVisible, gcpProjectsResponse, setValue])

  useEffect(() => {
    // When the jurisdiction step is hidden, default to a world-covering polygon.
    if (isJurisdictionStepVisible || isClientConfigPending) return
    updateGeoJsonState({
      uploadedGeoJson: WORLD_JURISDICTION_GEO_JSON,
      error: null,
    })
  }, [isJurisdictionStepVisible, isClientConfigPending, updateGeoJsonState])

  // File upload with strict validation
  const handleFileUpload = (file: File) => {
    // Validate file extension - Error Type 1
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith(".json") && !fileName.endsWith(".geojson")) {
      // Clear uploaded GeoJSON and reset UI state
      updateGeoJsonState({
        uploadedGeoJson: null,
        error: null,
        text: "",
      })
      toast.error("Invalid File Type", {
        description: "Only .json and .geojson files are supported",
      })
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      updateGeoJsonState({ text })
      try {
        const geoJson = JSON.parse(text)

        // Validate GeoJSON structure
        type MaybePolygonFeature = {
          geometry?: { type?: string }
        }
        let features: MaybePolygonFeature[] = []

        if (geoJson.type === "FeatureCollection") {
          features =
            (geoJson as { features?: MaybePolygonFeature[] }).features || []
        } else if (geoJson.type === "Feature") {
          features = [geoJson as MaybePolygonFeature]
        } else if (geoJson.type === "Polygon") {
          // Direct Polygon geometry
          features = [
            {
              geometry: { type: "Polygon" },
            },
          ]
        } else {
          // Invalid structure - Error Type 4
          updateGeoJsonState({
            uploadedGeoJson: null,
            error: null,
            text: "",
          })
          toast.error("Invalid File", {
            description: "Invalid GeoJSON structure",
          })
          return
        }

        // Validate exactly ONE feature
        if (features.length === 0) {
          // No features - Error Type 4
          updateGeoJsonState({
            uploadedGeoJson: null,
            error: null,
            text: "",
          })
          toast.error("Invalid File", {
            description: "GeoJSON must contain at least one feature",
          })
          return
        }

        if (features.length > 1) {
          // Multiple features - Error Type 3
          updateGeoJsonState({
            uploadedGeoJson: null,
            error: null,
            text: "",
          })
          toast.error("Too Many Features", {
            description: "Upload a file with only 1 polygon feature",
          })
          return
        }

        // Validate geometry type is Polygon
        const feature = features[0]
        if (!feature.geometry || feature.geometry.type !== "Polygon") {
          // Wrong geometry type - Error Type 2
          updateGeoJsonState({
            uploadedGeoJson: null,
            error: null,
            text: "",
          })
          toast.error("Invalid Geometry Type", {
            description: `File does not contain a polygon geometry type. Found: ${feature.geometry?.type || "none"}`,
          })
          return
        }

        // Success - store the GeoJSON
        updateGeoJsonState({
          uploadedGeoJson: geoJson,
          error: null,
        })
        toast.success("File Uploaded", {
          description: "GeoJSON file validated successfully",
        })
      } catch (error) {
        console.error("Failed to parse GeoJSON:", error)
        // JSON parse error - Error Type 4
        updateGeoJsonState({
          uploadedGeoJson: null,
          error: null,
          text: "",
        })
        toast.error("Invalid File", {
          description: "Invalid JSON format. Please check your file syntax.",
        })
      }
    }
    reader.readAsText(file)
  }

  const handleDownloadSample = () => {
    const sampleGeoJson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [78.9629, 20.5937],
                [78.9629, 20.6037],
                [78.9729, 20.6037],
                [78.9729, 20.5937],
                [78.9629, 20.5937],
              ],
            ],
          },
        },
      ],
    }

    const blob = new Blob([JSON.stringify(sampleGeoJson, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "sample-boundary.geojson"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    updateGeoJsonState({ dragActive: true })
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    updateGeoJsonState({ dragActive: false })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    updateGeoJsonState({ dragActive: false })

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
  }

  // Handle form submission - only submit on last step, otherwise go to next
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // If not on last step, go to next step instead of submitting
    if (activeStep < stepLabels.length - 1) {
      await handleNext()
      return
    }

    // Only submit on the last step
    const lastStepValid =
      activeOriginalStep === 2
        ? (await trigger("name")) && isStepValid(activeOriginalStep)
        : isStepValid(activeOriginalStep)

    if (lastStepValid) {
      const formData = getValues()
      await onSubmit(formData)
    }
  }

  // Form submission
  const onSubmit = async (data: RegionCreationFormData) => {
    console.log("Submitting project:", data)
    console.log("GeoJSON data:", geoJsonState.uploadedGeoJson)
    updateFormState({ isLoading: true, error: null })

    try {
      let boundaryGeoJson
      if (!isJurisdictionStepVisible) {
        boundaryGeoJson = WORLD_JURISDICTION_GEO_JSON
      } else if (isJurisdictionBoundaryOptional) {
        boundaryGeoJson =
          geoJsonState.uploadedGeoJson ?? WORLD_JURISDICTION_GEO_JSON
      } else {
        boundaryGeoJson = geoJsonState.uploadedGeoJson
      }

      if (!boundaryGeoJson) {
        const errorMsg = "Please upload a valid GeoJSON boundary"
        toast.error("Missing Boundary", {
          description: errorMsg,
        })
        throw new Error(errorMsg)
      }

      if (!data.googleCloudProjectId || !data.googleCloudProjectNumber) {
        const errorMsg =
          "Please select a GCP project or enter project details manually"
        toast.error("Missing GCP Project", {
          description: errorMsg,
        })
        throw new Error(errorMsg)
      }

      const projectData = {
        name: data.name,
        boundaryGeoJson,
        bigQueryColumn: {
          googleCloudProjectId: data.googleCloudProjectId,
          googleCloudProjectNumber: data.googleCloudProjectNumber,
          subscriptionId: data.subscriptionId || undefined,
        },
        datasetName: data.datasetName,
      }

      console.log("Creating project with data:", projectData)
      const project = await createProjectMutation.mutateAsync(projectData)

      console.log("Project created successfully:", project)

      if (project && project.id) {
        updateFormState({ isLoading: false, success: true })
        toast.success("Project Created", {
          description: `Project "${data.name}" created successfully`,
        })
        // Clear all layers before navigating to the new project
        clearAllLayers()
        navigate(
          sessionId
            ? buildSessionPath(sessionId, `/project/${project.id}`)
            : `/project/${project.id}`,
        )
      } else {
        throw new Error("Failed to create project")
      }
    } catch (error) {
      console.error("Error creating project:", error)
      const errorMsg =
        error instanceof Error ? error.message : "Failed to create project"
      updateFormState({
        isLoading: false,
        error: errorMsg,
      })
      toast.error("Project Creation Failed", {
        description: errorMsg,
      })
    }
  }

  const handleCancel = () => {
    clearProjectCreationState()
    navigate(sessionId ? buildSessionPath(sessionId, "/dashboard") : "/dashboard")
  }

  // Step validation - checks both field values and form validation errors
  const isStepValid = (originalStep: number): boolean => {
    const hasName = watchedValues.name.trim() !== ""
    const hasNameError = !!errors.name

    const hasDatasetName = watchedValues.datasetName?.trim() !== ""
    const hasDatasetNameError = !!errors.datasetName

    const hasGcpProjectId = watchedValues.googleCloudProjectId.trim() !== ""
    const hasGcpProjectNumber =
      watchedValues.googleCloudProjectNumber.trim() !== ""
    const hasGcpErrors =
      !!errors.googleCloudProjectId || !!errors.googleCloudProjectNumber

    const hasBoundary =
      geoJsonState.uploadedGeoJson !== null && !geoJsonState.error

    const requiredGcpPresent =
      hasGcpProjectId && hasGcpProjectNumber && !hasGcpErrors
    const requiredDatasetPresent = hasDatasetName && !hasDatasetNameError

    switch (originalStep) {
      case 0:
        return requiredGcpPresent
      case 1:
        return requiredDatasetPresent
      case 2:
        // Project Name is always visible, but earlier steps may be hidden.
        return (
          hasName &&
          !hasNameError &&
          requiredGcpPresent &&
          requiredDatasetPresent
        )
      case 3: {
        const boundaryOk = isJurisdictionBoundaryOptional
          ? !geoJsonState.error
          : hasBoundary
        return requiredGcpPresent && requiredDatasetPresent && boundaryOk
      }
      default:
        return false
    }
  }

  const handleNext = async () => {
    const isOriginalStepValid = async (originalStep: number) => {
      switch (originalStep) {
        case 0:
          return (
            (await trigger([
              "googleCloudProjectId",
              "googleCloudProjectNumber",
            ])) && isStepValid(0)
          )
        case 1:
          return (await trigger("datasetName")) && isStepValid(1)
        case 2:
          return (await trigger("name")) && isStepValid(2)
        case 3:
          return isStepValid(3)
        default:
          return false
      }
    }

    const valid = await isOriginalStepValid(activeOriginalStep)
    if (valid) setActiveStep((prevStep) => prevStep + 1)
  }

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1)
  }

  const isLoading = formState.isLoading || createProjectMutation.isPending

  const renderStepContent = (originalStep: number) => {
    switch (originalStep) {
      case 0:
        return (
          <Box className="py-3">
            <GcpProjectSelector validateGcpProjectId={validateGcpProjectId} />
          </Box>
        )
      case 1:
        return (
          <Box className="py-3">
            <DatasetNameForm validateDatasetName={validateDatasetName} />
          </Box>
        )
      case 2:
        return (
          <Box className="py-3">
            <ProjectNameForm validateProjectName={validateProjectName} />
          </Box>
        )
      case 3:
        return (
          <Box className="py-3">
            <GeoJsonUploader
              state={geoJsonState}
              boundaryUploadOptional={isJurisdictionBoundaryOptional}
              onFileUpload={handleFileUpload}
              onDownloadSample={handleDownloadSample}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          </Box>
        )
      default:
        return null
    }
  }

  return (
    <Paper
      elevation={8}
      className="fixed top-24 left-4 w-80 max-h-[calc(100vh-2rem)] bg-white/95 backdrop-blur-[10px] rounded-2xl z-[1000] transition-all duration-300 flex flex-col"
      sx={{
        fontFamily: '"Google Sans", "Roboto", "Helvetica", "Arial", sans-serif',
      }}
    >
      {/* Header */}
      <Box className="p-4 border-b border-gray-200">
        <Typography
          variant="h6"
          className="text-base"
          sx={{ fontWeight: 600, color: "#202124" }}
        >
          Create New Project
        </Typography>
        <Typography variant="caption" className="text-mui-secondary text-xs">
          {isClientConfigPending ? (
            "Loading…"
          ) : (
            <>
              Step {activeStep + 1} of {stepLabels.length}:{" "}
              {stepLabels[activeStep]}
            </>
          )}
        </Typography>
      </Box>

      {/* Content */}
      <Box className="flex-1 overflow-auto pretty-scrollbar px-4">
        {isClientConfigPending ? (
          <Box className="flex justify-center items-center py-12">
            <CircularProgress size={28} />
          </Box>
        ) : (
          <FormProvider {...methods}>
            <form onSubmit={handleFormSubmit}>
              {renderStepContent(activeOriginalStep)}
            </form>
          </FormProvider>
        )}
      </Box>

      {/* Navigation Buttons */}
      <Box className="p-4 border-t border-gray-200">
        <Box className="flex gap-2">
          <Button
            onClick={handleCancel}
            disabled={isLoading || isClientConfigPending}
            variant="outlined"
            // size="small"
            className="flex-1 "
          >
            Cancel
          </Button>
          {activeStep > 0 && (
            <Button
              onClick={handleBack}
              disabled={isLoading || isClientConfigPending}
              variant="outlined"
              // size="small"
              className="flex-1 "
            >
              Back
            </Button>
          )}
          {activeStep < stepLabels.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={
                !isStepValid(activeOriginalStep) ||
                isLoading ||
                isClientConfigPending
              }
              variant="contained"
              // size="small"
              className="flex-1 "
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmit(onSubmit)}
              disabled={
                !isStepValid(activeOriginalStep) ||
                isLoading ||
                isClientConfigPending
              }
              variant="contained"
              size="small"
              className="flex-1 text-xs"
            >
              {isLoading ? (
                <>
                  <CircularProgress size={14} className="mr-1.5 text-white" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          )}
        </Box>
      </Box>
    </Paper>
  )
}
