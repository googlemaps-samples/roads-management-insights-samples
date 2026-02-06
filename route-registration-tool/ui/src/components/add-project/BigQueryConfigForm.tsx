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
 * BigQuery configuration form component
 */
import { TextField } from "@mui/material"
import { useFormContext } from "react-hook-form"

import { RegionCreationFormData } from "../../types/region-creation"

export default function BigQueryConfigForm() {
  const {
    register,
    formState: { errors },
  } = useFormContext<RegionCreationFormData>()

  return (
    <div className="space-y-2 p-2 bg-gray-50/30 rounded">
      <TextField
        {...register("googleBigQueryConfig.projectId")}
        variant="standard"
        label="Google Cloud Project ID"
        placeholder="project-id"
        fullWidth
        size="small"
        error={!!errors.googleBigQueryConfig?.projectId}
        helperText={errors.googleBigQueryConfig?.projectId?.message}
        slotProps={{
          input: {
            className: "text-sm",
          },
          inputLabel: {
            className: "text-sm",
          },
        }}
      />
      <TextField
        {...register("googleBigQueryConfig.datasetId")}
        variant="standard"
        label="BigQuery Dataset"
        placeholder="dataset-id"
        fullWidth
        size="small"
        error={!!errors.googleBigQueryConfig?.datasetId}
        helperText={errors.googleBigQueryConfig?.datasetId?.message}
        slotProps={{
          input: {
            className: "text-sm",
          },
          inputLabel: {
            className: "text-sm",
          },
        }}
      />
    </div>
  )
}
