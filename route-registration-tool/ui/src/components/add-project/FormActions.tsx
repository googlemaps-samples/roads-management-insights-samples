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
 * Form action buttons component
 */
import { Box, Button, CircularProgress } from "@mui/material"

interface FormActionsProps {
  isLoading: boolean
  canSubmit: boolean
  onSubmit: () => void
  onCancel: () => void
}

export default function FormActions({
  isLoading,
  canSubmit,
  onSubmit,
  onCancel,
}: FormActionsProps) {
  return (
    <Box className="flex gap-2 w-full">
      <Button
        onClick={onCancel}
        disabled={isLoading}
        variant="outlined"
        size="small"
        className="flex-1 text-xs py-1.5 rounded-full"
      >
        Cancel
      </Button>
      <Button
        onClick={onSubmit}
        disabled={isLoading || !canSubmit}
        variant="contained"
        size="small"
        className="flex-1 text-xs py-1.5 rounded-full"
      >
        {isLoading ? (
          <>
            <CircularProgress size={12} className="mr-1 text-white" />
            Creating...
          </>
        ) : (
          "Create Project"
        )}
      </Button>
    </Box>
  )
}
