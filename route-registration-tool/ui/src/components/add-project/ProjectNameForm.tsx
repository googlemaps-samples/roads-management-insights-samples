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
 * Project name input form component
 */
import { TextField, Typography } from "@mui/material"
import { useFormContext } from "react-hook-form"

import { RegionCreationFormData } from "../../types/region-creation"

interface ProjectNameFormProps {
  validateProjectName?: (name: string) => true | string
}

export default function ProjectNameForm({
  validateProjectName,
}: ProjectNameFormProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<RegionCreationFormData>()

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Typography variant="body2" className="font-semibold text-sm">
          Project Name
        </Typography>
        <Typography variant="caption" className="text-mui-secondary text-xs">
          Choose a unique name for your project
        </Typography>
      </div>
      <TextField
        {...register("name", {
          required: "Project name is required",
          maxLength: {
            value: 100,
            message: "Project name must not exceed 100 characters",
          },
          validate: (value) => {
            if (validateProjectName) {
              const result = validateProjectName(value)
              if (result !== true) {
                return result
              }
            }
            const trimmed = value.trim()
            if (trimmed.length > 100) {
              return "Project name must not exceed 100 characters"
            }
            return true
          },
        })}
        variant="standard"
        label="Project Name"
        placeholder="Enter project name"
        fullWidth
        size="small"
        error={!!errors.name}
        helperText={errors.name?.message || ""}
        inputProps={{ maxLength: 100 }}
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
