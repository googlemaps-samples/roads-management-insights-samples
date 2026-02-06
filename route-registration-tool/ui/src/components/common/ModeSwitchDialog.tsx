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

import { Typography } from "@mui/material"
import React from "react"

import Button from "./Button"
import Modal from "./Modal"

interface ModeSwitchDialogProps {
  open: boolean
  fromMode: string
  toMode: string
  onConfirm: () => void
  onCancel: () => void
  title?: string
  message?: string
  confirmButtonText?: string
}

const ModeSwitchDialog: React.FC<ModeSwitchDialogProps> = ({
  open,
  onConfirm,
  onCancel,
  title = "Exit Import roads mode",
  message = "You have unsaved selected roads. If you exit now, all your selections will be lost.",
  confirmButtonText = "Exit Mode",
}) => {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      maxWidth="sm"
      actions={
        <>
          <Button onClick={onCancel} variant="outlined">
            Cancel
          </Button>
          <Button onClick={onConfirm} variant="contained" color="primary">
            {confirmButtonText}
          </Button>
        </>
      }
    >
      <Typography variant="body2" className="text-gray-600">
        {message}
      </Typography>
    </Modal>
  )
}

export default ModeSwitchDialog
