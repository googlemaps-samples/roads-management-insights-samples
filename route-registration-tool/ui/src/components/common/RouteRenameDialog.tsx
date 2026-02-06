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

import { CircularProgress, TextField } from "@mui/material"
import React, { useEffect, useState } from "react"

import Button from "./Button"
import Modal from "./Modal"

interface RouteRenameDialogProps {
  open: boolean
  currentName: string
  onClose: () => void
  onSave: (newName: string) => Promise<void>
  isLoading?: boolean
  error?: string
  projectId?: string
}

const RouteRenameDialog: React.FC<RouteRenameDialogProps> = ({
  open,
  currentName,
  onClose,
  onSave,
  isLoading = false,
  error: externalError,
  projectId,
}) => {
  const [newName, setNewName] = useState(currentName)
  const [error, setError] = useState("")

  // Reset form when dialog opens/closes or currentName changes
  useEffect(() => {
    if (open) {
      setNewName(currentName)
      setError("")
    }
  }, [open, currentName])

  const handleSave = async () => {
    const trimmedName = newName.trim()

    // Clear previous errors
    setError("")

    if (trimmedName.length > 100) {
      setError("Route name must not exceed 100 characters")
      return
    }

    try {
      await onSave(trimmedName)
      // Dialog will be closed by parent component after successful save
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to rename route"
      setError(errorMessage)
    }
  }

  const handleClose = () => {
    setError("")
    setNewName(currentName)
    onClose()
  }

  const displayError = error || externalError || ""

  return (
    <Modal
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      title="Rename Route"
      actions={
        <>
          <Button
            onClick={handleClose}
            style={{ textTransform: "none" }}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={isLoading || !newName.trim()}
            style={{ textTransform: "none" }}
          >
            {isLoading ? <CircularProgress size={20} /> : "Rename"}
          </Button>
        </>
      }
    >
      <TextField
        label="Route Name"
        value={newName}
        onChange={(e) => {
          setNewName(e.target.value)
          setError("")
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isLoading && newName.trim()) {
            handleSave()
          } else if (e.key === "Escape") {
            handleClose()
          }
        }}
        error={!!displayError}
        helperText={displayError}
        fullWidth
        variant="standard"
        required
        autoFocus
        disabled={isLoading}
        inputProps={{ maxLength: 100 }}
      />
    </Modal>
  )
}

export default RouteRenameDialog
