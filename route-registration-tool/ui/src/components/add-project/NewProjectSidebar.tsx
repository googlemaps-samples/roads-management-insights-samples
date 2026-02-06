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

// ui/src/components/add-project/NewProjectSidebar.tsx
import { Box, CircularProgress, Paper, Typography } from "@mui/material"
import React, { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useNavigate } from "react-router-dom"

import { useCreateProject, useProjects } from "../../hooks/use-api"
import { useProjectCreationStore } from "../../stores"
import { RegionCreationFormData } from "../../types/region-creation"
import { clearAllLayers } from "../../utils/clear-all-layers"
import { toast } from "../../utils/toast"
import Button from "../common/Button"
import DatasetNameForm from "./DatasetNameForm"
import GcpProjectSelector from "./GcpProjectSelector"
import GeoJsonUploader from "./GeoJsonUploader"
import ProjectNameForm from "./ProjectNameForm"

const steps = [
  "Google Cloud Project",
  "Dataset Name",
  "Project Name",
  "Jurisdiction Boundary",
]

interface NewProjectSidebarProps {
  onStepChange?: (step: number) => void
}

export default function NewProjectSidebar({
  onStepChange,
}: NewProjectSidebarProps) {
  const navigate = useNavigate()
  const [activeStep, setActiveStep] = useState(0)

  // Notify parent of step changes
  React.useEffect(() => {
    onStepChange?.(activeStep)
  }, [activeStep, onStepChange])

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
  const { data: existingProjects } = useProjects()

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
    if (existingProjects) {
      const duplicate = existingProjects.find(
        (p) => p.name.toLowerCase().trim() === name.toLowerCase().trim(),
      )
      if (duplicate) {
        return `A project with the name "${name}" already exists. Please choose a different name.`
      }
    }
    return true
  }

  const validateGcpProjectId = (projectId: string) => {
    if (!projectId || projectId.trim() === "") {
      return "Google Cloud Project ID is required"
    }
    if (existingProjects) {
      const duplicate = existingProjects.find(
        (p) =>
          p.bigQueryColumn?.googleCloudProjectId?.toLowerCase().trim() ===
          projectId.toLowerCase().trim(),
      )
      if (duplicate) {
        return `A project with Google Cloud Project ID "${projectId}" already exists (Project: "${duplicate.name}"). Each GCP project can only be used once.`
      }
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
    formState: hookFormState,
  } = methods
  const watchedValues = watch()
  const { errors } = hookFormState

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
        let features: any[] = []
        if (geoJson.type === "FeatureCollection") {
          features = geoJson.features || []
        } else if (geoJson.type === "Feature") {
          features = [geoJson]
        } else if (geoJson.type === "Polygon") {
          // Direct Polygon geometry
          features = [
            {
              type: "Feature",
              geometry: geoJson,
              properties: {},
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
    if (activeStep < steps.length - 1) {
      await handleNext()
      return
    }

    // Only submit on the last step
    const isValid = await trigger()
    if (isValid && isStepValid(activeStep)) {
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
      if (!geoJsonState.uploadedGeoJson) {
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
        boundaryGeoJson: geoJsonState.uploadedGeoJson,
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
        navigate(`/project/${project.id}`)
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
    navigate("/dashboard")
  }

  // Step validation - checks both field values and form validation errors
  const isStepValid = (step: number): boolean => {
    switch (step) {
      case 0: {
        // Step 1: GCP Project - check values and validation errors
        const hasGcpProjectId = watchedValues.googleCloudProjectId.trim() !== ""
        const hasGcpProjectNumber =
          watchedValues.googleCloudProjectNumber.trim() !== ""
        const hasGcpErrors =
          !!errors.googleCloudProjectId || !!errors.googleCloudProjectNumber
        return hasGcpProjectId && hasGcpProjectNumber && !hasGcpErrors
      }
      case 1: {
        // Step 2: Dataset Name - check value and validation errors
        const hasDatasetName = watchedValues.datasetName?.trim() !== ""
        const hasDatasetNameError = !!errors.datasetName
        return hasDatasetName && !hasDatasetNameError
      }
      case 2: {
        // Step 3: Project Name - check value and validation errors
        const hasName = watchedValues.name.trim() !== ""
        const hasNameError = !!errors.name
        return hasName && !hasNameError
      }
      case 3:
        // Step 4: GeoJSON - check if uploaded and no error
        return geoJsonState.uploadedGeoJson !== null && !geoJsonState.error
      default:
        return false
    }
  }

  const handleNext = async () => {
    // Trigger validation for current step
    let isValid = false

    switch (activeStep) {
      case 0: {
        // Validate GCP Project fields
        const gcpValid = await trigger([
          "googleCloudProjectId",
          "googleCloudProjectNumber",
        ])
        isValid = gcpValid && isStepValid(activeStep)
        break
      }
      case 1: {
        // Validate Dataset Name
        const datasetNameValid = await trigger("datasetName")
        isValid = datasetNameValid && isStepValid(activeStep)
        break
      }
      case 2: {
        // Validate Project Name
        const nameValid = await trigger("name")
        isValid = nameValid && isStepValid(activeStep)
        break
      }
      case 3:
        // Validate GeoJSON
        isValid = isStepValid(activeStep)
        break
      default:
        isValid = false
    }

    if (isValid) {
      setActiveStep((prevStep) => prevStep + 1)
    }
  }

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1)
  }

  const isLoading = formState.isLoading || createProjectMutation.isPending

  const renderStepContent = (step: number) => {
    switch (step) {
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
          Step {activeStep + 1} of {steps.length}: {steps[activeStep]}
        </Typography>
      </Box>

      {/* Content */}
      <Box className="flex-1 overflow-auto pretty-scrollbar px-4">
        <FormProvider {...methods}>
          <form onSubmit={handleFormSubmit}>
            {renderStepContent(activeStep)}
          </form>
        </FormProvider>
      </Box>

      {/* Navigation Buttons */}
      <Box className="p-4 border-t border-gray-200">
        <Box className="flex gap-2">
          <Button
            onClick={handleCancel}
            disabled={isLoading}
            variant="outlined"
            // size="small"
            className="flex-1 "
          >
            Cancel
          </Button>
          {activeStep > 0 && (
            <Button
              onClick={handleBack}
              disabled={isLoading}
              variant="outlined"
              // size="small"
              className="flex-1 "
            >
              Back
            </Button>
          )}
          {activeStep < steps.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={!isStepValid(activeStep) || isLoading}
              variant="contained"
              // size="small"
              className="flex-1 "
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmit(onSubmit)}
              disabled={!isStepValid(activeStep) || isLoading}
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
