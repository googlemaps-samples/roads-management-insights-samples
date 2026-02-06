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

import { CircularProgress, Typography } from "@mui/material"
import React, { useEffect, useRef } from "react"

import Button from "./Button"
import Modal from "./Modal"

interface ConfirmationDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmColor?:
    | "error"
    | "primary"
    | "secondary"
    | "success"
    | "info"
    | "warning"
  isLoading?: boolean
  maxWidth?: "xs" | "sm" | "md" | "lg" | "xl" | false
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmColor = "error",
  isLoading = false,
  maxWidth = "sm",
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const focusedButtonRef = useRef<"cancel" | "confirm">("confirm")

  const handleConfirm = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      onConfirm()
    },
    [onConfirm],
  )

  const handleCancel = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    },
    [onClose],
  )

  // Focus the confirm button when dialog opens
  useEffect(() => {
    if (open) {
      focusedButtonRef.current = "confirm"
      // Small delay to ensure the dialog is fully rendered
      const timer = setTimeout(() => {
        if (confirmButtonRef.current && !isLoading) {
          confirmButtonRef.current.focus()
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [open, isLoading])

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Enter key - click the focused button
      if (e.key === "Enter") {
        e.preventDefault()
        e.stopPropagation()
        if (
          focusedButtonRef.current === "confirm" &&
          confirmButtonRef.current &&
          !isLoading
        ) {
          confirmButtonRef.current.click()
        } else if (
          focusedButtonRef.current === "cancel" &&
          cancelButtonRef.current
        ) {
          cancelButtonRef.current.click()
        }
        return
      }

      // Handle Arrow keys - switch focus between buttons
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault()
        e.stopPropagation()

        if (focusedButtonRef.current === "confirm") {
          // Move focus to cancel button
          focusedButtonRef.current = "cancel"
          if (cancelButtonRef.current) {
            cancelButtonRef.current.focus()
          }
        } else {
          // Move focus to confirm button
          focusedButtonRef.current = "confirm"
          if (confirmButtonRef.current && !isLoading) {
            confirmButtonRef.current.focus()
          }
        }
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, isLoading])

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth
      title={title}
      sx={{
        zIndex: 20000,
        "& .MuiBackdrop-root": {
          zIndex: 19999,
        },
      }}
      PaperProps={{
        sx: {
          zIndex: 20000,
        },
      }}
      actions={
        <>
          <Button
            ref={cancelButtonRef}
            onClick={handleCancel}
            onMouseDown={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation()
            }}
            onFocus={() => {
              focusedButtonRef.current = "cancel"
            }}
            variant="text"
            sx={{
              color: "#5f6368",
              "&:hover": {
                backgroundColor: "rgba(95, 99, 104, 0.08)",
              },
            }}
          >
            {cancelText}
          </Button>
          <Button
            ref={confirmButtonRef}
            onClick={handleConfirm}
            onMouseDown={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation()
            }}
            onFocus={() => {
              focusedButtonRef.current = "confirm"
            }}
            variant="contained"
            disabled={isLoading}
            sx={{ pointerEvents: "auto" }}
          >
            {isLoading ? <CircularProgress size={20} /> : confirmText}
          </Button>
        </>
      }
    >
      <Typography variant="body2" className="text-gray-700">
        {message}
      </Typography>
    </Modal>
  )
}

export default ConfirmationDialog
