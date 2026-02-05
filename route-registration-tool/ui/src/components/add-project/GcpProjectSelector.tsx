import { CheckCircle, Link as LinkIcon } from "@mui/icons-material"
import {
  Autocomplete,
  Box,
  CircularProgress,
  Link,
  TextField,
  Typography,
} from "@mui/material"
import { useEffect, useState } from "react"
import { Controller, useFormContext } from "react-hook-form"

import { PRIMARY_BLUE } from "../../constants/colors"
import { useGcpProjects, useVerifyProjectDetails } from "../../hooks/use-api"
import { RegionCreationFormData } from "../../types/region-creation"
import { mapGcpError } from "../../utils/error-mapping"
import { toast } from "../../utils/toast"
import Button from "../common/Button"

interface GcpProjectSelectorProps {
  validateGcpProjectId?: (projectId: string) => true | string
}

// Type for the custom "Add" option
interface CreateOptionType {
  inputValue: string
  project_id: string
  project_number?: string
}

export default function GcpProjectSelector({
  validateGcpProjectId,
}: GcpProjectSelectorProps) {
  const {
    setValue,
    watch,
    trigger,
    control,
    formState: { errors },
  } = useFormContext<RegionCreationFormData>()

  const [verificationStatus, setVerificationStatus] = useState<{
    status: "idle" | "verifying" | "success" | "error"
    message?: string
    verifiedProjectId?: string
  }>({ status: "idle" })

  const [inputValue, setInputValue] = useState("")

  const { data: gcpProjectsResponse, isLoading, error } = useGcpProjects()

  const selectedProjectId = watch("googleCloudProjectId")
  const projectNumber = watch("googleCloudProjectNumber")

  const verifyMutation = useVerifyProjectDetails()

  const projects = gcpProjectsResponse?.data || []
  const hasError = gcpProjectsResponse ? !gcpProjectsResponse.success : !!error

  // Show toast when API fails
  useEffect(() => {
    if (hasError && error) {
      const friendlyError = mapGcpError(error as Error)
      toast.info("Manual Entry Available", {
        description: friendlyError,
      })
    }
  }, [hasError, error])

  // Find selected project from the list
  const selectedProject = projects.find(
    (p) => p.project_id === selectedProjectId,
  )

  // Determine if we should show tick mark
  // For dropdown selections: show tick only if project number matches the selected project
  // For manual entries: show tick only if verified and Project ID matches verified one
  const showTickMark =
    (selectedProject &&
      projectNumber &&
      projectNumber === selectedProject.project_number) ||
    (!selectedProject &&
      projectNumber &&
      verificationStatus.status === "success" &&
      verificationStatus.verifiedProjectId === selectedProjectId)

  // Handle manual verification
  const handleVerify = () => {
    if (!selectedProjectId || selectedProjectId.trim() === "") {
      toast.error("Project ID Required", {
        description: "Please enter a Project ID first",
      })
      return
    }

    setVerificationStatus({ status: "verifying" })
    verifyMutation.mutate(selectedProjectId, {
      onSuccess: (data) => {
        if (data.project_number) {
          setValue("googleCloudProjectNumber", data.project_number)
          setVerificationStatus({
            status: "success",
            message: "Project verified successfully",
            verifiedProjectId: selectedProjectId,
          })
          toast.success("Project Verified", {
            description: `Project ${selectedProjectId} verified successfully`,
          })
          trigger("googleCloudProjectId")
          trigger("googleCloudProjectNumber")
        } else {
          setVerificationStatus({
            status: "error",
            message: "Project number not found",
          })
          toast.error("Verification Failed", {
            description: "Project number not found",
          })
        }
      },
      onError: (error) => {
        const friendlyError = mapGcpError(error)
        setVerificationStatus({
          status: "error",
          message: friendlyError,
        })
        toast.error("Verification Failed", {
          description: friendlyError,
        })
      },
    })
  }

  // Reset verification status when selecting from dropdown
  useEffect(() => {
    if (selectedProject) {
      setVerificationStatus({ status: "idle" })
      setValue("googleCloudProjectNumber", selectedProject.project_number)
    }
  }, [selectedProject, setValue])

  // Handle Project ID changes: ensure project number matches or is cleared
  useEffect(() => {
    if (!selectedProjectId || selectedProjectId.trim() === "") {
      return
    }

    // If Project ID matches a project in the list, ensure project number matches
    if (selectedProject) {
      if (projectNumber !== selectedProject.project_number) {
        setValue("googleCloudProjectNumber", selectedProject.project_number)
        setVerificationStatus({ status: "idle" })
      }
    } else {
      // Project ID doesn't match any project in the list
      // If we have a project number but no verification, clear it
      if (
        projectNumber &&
        verificationStatus.status !== "success" &&
        verificationStatus.verifiedProjectId !== selectedProjectId
      ) {
        setValue("googleCloudProjectNumber", "")
        setVerificationStatus({ status: "idle" })
      }
    }
  }, [
    selectedProjectId,
    selectedProject,
    projectNumber,
    verificationStatus,
    setValue,
  ])

  // Invalidate verification when Project ID changes after successful verification
  useEffect(() => {
    // If we have a verified Project ID and the current Project ID doesn't match it,
    // invalidate the verification and clear the project number
    if (
      verificationStatus.status === "success" &&
      verificationStatus.verifiedProjectId &&
      selectedProjectId !== verificationStatus.verifiedProjectId &&
      !selectedProject // Only invalidate for manually entered projects, not dropdown selections
    ) {
      setVerificationStatus({ status: "idle" })
      setValue("googleCloudProjectNumber", "")
    }
  }, [
    selectedProjectId,
    verificationStatus.status,
    verificationStatus.verifiedProjectId,
    selectedProject,
    setValue,
    projectNumber,
  ])

  // Filter options and add "Add" option if input doesn't match
  const getFilteredOptions = () => {
    if (!inputValue.trim()) {
      return projects
    }

    const filtered = projects.filter((project) =>
      project.project_id.toLowerCase().includes(inputValue.toLowerCase()),
    )

    // Check if input value exactly matches any project
    const exactMatch = projects.some(
      (p) => p.project_id.toLowerCase() === inputValue.toLowerCase(),
    )

    // If no exact match and input is not empty, add "Add" option
    if (!exactMatch && inputValue.trim()) {
      return [
        ...filtered,
        {
          inputValue: inputValue,
          project_id: `Add "${inputValue}"`,
          project_number: undefined,
        } as CreateOptionType,
      ]
    }

    return filtered
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Typography variant="body2" className="font-semibold text-sm">
          Google Cloud Project
        </Typography>
        <Typography variant="caption" className="text-mui-secondary text-xs">
          Select or enter your Google Cloud Project for BigQuery data storage.
        </Typography>
        {selectedProjectId &&
          selectedProjectId.trim() !== "" &&
          (selectedProject || verificationStatus.status === "success") && (
            <Link
              href={`https://console.cloud.google.com/home/dashboard?project=${selectedProjectId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 underline ml-1.5"
            >
              Project console{" "}
              <span className="text-xs text-blue-600 hover:text-blue-800 underline">
                <LinkIcon className="w-4 h-4" />
              </span>
            </Link>
          )}
      </div>

      <div className="space-y-2">
        {/* Loading State */}
        {isLoading && (
          <Box className="flex items-center justify-center p-4">
            <CircularProgress size={20} />
            <Typography
              variant="body2"
              className="ml-2 text-mui-secondary text-sm"
            >
              Fetching GCP projects...
            </Typography>
          </Box>
        )}

        {/* Autocomplete for project selection */}
        {!isLoading && (
          <Box className="flex gap-2 items-start">
            <Box className="flex-1">
              <Controller
                name="googleCloudProjectId"
                control={control}
                rules={{
                  required: "Google Cloud Project ID is required",
                  validate: validateGcpProjectId,
                  pattern: {
                    value: /^[a-z]([a-z0-9-]*[a-z0-9])?$/,
                    message:
                      "Project ID must start with a lowercase letter, contain only lowercase letters, digits, or hyphens, and end with a letter or number",
                  },
                }}
                render={({ field }) => (
                  <Autocomplete
                    freeSolo
                    selectOnFocus
                    clearOnBlur
                    handleHomeEndKeys
                    disableClearable={!!showTickMark}
                    options={getFilteredOptions()}
                    getOptionLabel={(option) => {
                      if (typeof option === "string") {
                        return option
                      }
                      if ("inputValue" in option && option.inputValue) {
                        return option.inputValue
                      }
                      return option.project_id || ""
                    }}
                    isOptionEqualToValue={(option, value) => {
                      if (typeof value === "string") {
                        return option.project_id === value
                      }
                      return option.project_id === value.project_id
                    }}
                    filterOptions={(x) => x}
                    renderOption={(props, option) => {
                      const isCreateOption =
                        "inputValue" in option && option.inputValue
                      return (
                        <li
                          {...props}
                          key={
                            isCreateOption
                              ? `create-${option.inputValue}`
                              : option.project_id
                          }
                        >
                          <Box className="flex flex-col">
                            <Typography
                              variant="body2"
                              className="font-medium text-xs"
                            >
                              {isCreateOption
                                ? `Check for "${option.inputValue}"`
                                : option.project_id}
                            </Typography>
                            {!isCreateOption && (
                              <Typography
                                variant="caption"
                                className="text-mui-secondary text-xs"
                              >
                                Project Number: {option.project_number}
                              </Typography>
                            )}
                          </Box>
                        </li>
                      )
                    }}
                    onChange={(_, newValue) => {
                      if (!newValue) {
                        field.onChange("")
                        setValue("googleCloudProjectNumber", "")
                        return
                      }

                      if (typeof newValue === "string") {
                        field.onChange(newValue)
                        setValue("googleCloudProjectNumber", "")
                      } else if (
                        "inputValue" in newValue &&
                        newValue.inputValue
                      ) {
                        // Handle "Add" option selection
                        field.onChange(newValue.inputValue)
                        setValue("googleCloudProjectNumber", "")
                        setVerificationStatus({ status: "idle" })
                      } else {
                        field.onChange(newValue.project_id)
                        setValue(
                          "googleCloudProjectNumber",
                          newValue.project_number || "",
                        )
                      }
                    }}
                    onInputChange={(_, newInputValue, reason) => {
                      setInputValue(newInputValue)
                      if (reason !== "reset") {
                        field.onChange(newInputValue)
                        // If the new Project ID doesn't match the verified one, invalidate verification
                        if (
                          verificationStatus.status === "success" &&
                          verificationStatus.verifiedProjectId &&
                          newInputValue !== verificationStatus.verifiedProjectId
                        ) {
                          setVerificationStatus({ status: "idle" })
                          setValue("googleCloudProjectNumber", "")
                        }
                      }
                    }}
                    value={
                      projects.find((p) => p.project_id === field.value) ||
                      field.value ||
                      null
                    }
                    inputValue={inputValue}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        variant="standard"
                        label="Google Cloud Project ID"
                        placeholder="Type or select project ID"
                        error={!!errors.googleCloudProjectId}
                        helperText={
                          errors.googleCloudProjectId?.message ||
                          (projects.length === 0 && !hasError
                            ? "No available projects found"
                            : "")
                        }
                        slotProps={{
                          input: {
                            ...params.InputProps,
                            endAdornment: (
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: showTickMark ? 1 : 0,
                                }}
                              >
                                {showTickMark && (
                                  <CheckCircle
                                    sx={{
                                      fontSize: "20px",
                                      color: PRIMARY_BLUE,
                                      flexShrink: 0,
                                      marginRight: "4px",
                                    }}
                                  />
                                )}
                                {params.InputProps.endAdornment}
                              </Box>
                            ),
                            className: "text-sm",
                          },
                          inputLabel: {
                            className: "text-sm",
                          },
                        }}
                      />
                    )}
                  />
                )}
              />
            </Box>

            {/* Verify Button - shown when user types a project ID not in the list */}
            {selectedProjectId &&
              !selectedProject &&
              verificationStatus.status !== "success" && (
                <Button
                  variant="text"
                  onClick={handleVerify}
                  disabled={
                    !selectedProjectId ||
                    selectedProjectId.trim() === "" ||
                    verifyMutation.isPending
                  }
                  className="mt-4 text-xs"
                >
                  {verifyMutation.isPending ? (
                    <CircularProgress size={16} />
                  ) : (
                    "Verify"
                  )}
                </Button>
              )}
          </Box>
        )}
      </div>
    </div>
  )
}
