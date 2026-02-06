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

/**
 * Dataset name input form component
 */
import {
  Autocomplete,
  Box,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material"
import { Controller, useFormContext } from "react-hook-form"

import { useBigQueryDatasets } from "../../hooks/use-api"
import { RegionCreationFormData } from "../../types/region-creation"

interface DatasetNameFormProps {
  validateDatasetName?: (name: string) => true | string
}

export default function DatasetNameForm({
  validateDatasetName,
}: DatasetNameFormProps) {
  const {
    control,
    watch,
    formState: { errors },
  } = useFormContext<RegionCreationFormData>()

  const googleCloudProjectId = watch("googleCloudProjectId")

  // Fetch datasets when GCP project ID is available
  const {
    data: datasets = [],
    isLoading: isLoadingDatasets,
    error: datasetsError,
  } = useBigQueryDatasets(googleCloudProjectId)

  const validateDatasetNameValue = (value: string | null): true | string => {
    if (!value || value.trim() === "") {
      return "Dataset name is required"
    }
    if (validateDatasetName) {
      const result = validateDatasetName(value)
      if (result !== true) {
        return result
      }
    }
    // Validate format: only letters, numbers, and underscores
    const trimmed = value.trim()
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return "Dataset name can only contain letters, numbers, and underscores"
    }
    return true
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Typography variant="body2" className="font-semibold text-sm">
          Dataset Name
        </Typography>
        <Typography variant="caption" className="text-mui-secondary text-xs">
          {googleCloudProjectId
            ? "Select a BigQuery dataset or enter a custom name"
            : "BigQuery dataset name (letters, numbers, and underscores only)"}
        </Typography>
      </div>
      <Controller
        name="datasetName"
        control={control}
        rules={{
          required: "Dataset name is required",
          validate: validateDatasetNameValue,
        }}
        render={({ field }) => (
          <Autocomplete
            {...field}
            freeSolo
            options={datasets.map((dataset) => dataset.datasetId)}
            value={field.value || ""}
            onChange={(_, newValue) => {
              const value =
                typeof newValue === "string" ? newValue : newValue || ""
              field.onChange(value)
            }}
            onInputChange={(_, newInputValue) => {
              field.onChange(newInputValue)
            }}
            loading={isLoadingDatasets}
            disabled={!googleCloudProjectId || isLoadingDatasets}
            renderOption={(props, option) => (
              <li {...props} key={option}>
                <Box className="flex flex-col">
                  <Typography
                    variant="body2"
                    className=" text-xs"
                    sx={{
                      fontWeight: 500,
                      fontSize: "0.75rem",
                      lineHeight: "1rem",
                      margin: 0,
                      fontFamily: "inherit",
                    }}
                  >
                    {option}
                  </Typography>
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                variant="standard"
                label="Dataset Name"
                placeholder="historical_roads_data"
                fullWidth
                size="small"
                error={!!errors.datasetName}
                helperText={
                  errors.datasetName?.message ||
                  (datasetsError
                    ? "Failed to load datasets. You can still enter a dataset name manually."
                    : "") ||
                  ""
                }
                slotProps={{
                  input: {
                    ...params.InputProps,
                    className: "text-sm",
                    endAdornment: (
                      <>
                        {isLoadingDatasets ? (
                          <CircularProgress color="inherit" size={20} />
                        ) : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
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
    </div>
  )
}
