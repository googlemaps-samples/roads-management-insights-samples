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

interface UnsavedRoutesDialogProps {
  open: boolean
  type: "uploaded_routes" | "drawn_route" | "polygon_drawing"
  routeCount?: number
  pointCount?: number
  onConfirm: () => void
  onCancel: () => void
}

const UnsavedRoutesDialog: React.FC<UnsavedRoutesDialogProps> = ({
  open,
  type,
  routeCount,
  pointCount,
  onConfirm,
  onCancel,
}) => {
  const getMessage = () => {
    if (type === "uploaded_routes") {
      return `You have ${routeCount || 0} unsaved route${
        (routeCount || 0) !== 1 ? "s" : ""
      }. If you switch modes now, all unsaved routes will be lost. Do you want to continue?`
    } else if (type === "drawn_route") {
      return `You have an unsaved route with ${pointCount || 0} point${
        (pointCount || 0) !== 1 ? "s" : ""
      }. If you switch modes now, your unsaved route will be lost. Do you want to continue?`
    } else {
      return `You have an unsaved polygon with ${pointCount || 0} point${
        (pointCount || 0) !== 1 ? "s" : ""
      }. If you switch modes now, your unsaved polygon will be lost. Do you want to continue?`
    }
  }

  const getTitle = () => {
    if (type === "uploaded_routes") {
      return "Unsaved Routes"
    } else if (type === "drawn_route") {
      return "Unsaved Route"
    } else {
      return "Unsaved Polygon"
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={getTitle()}
      maxWidth="sm"
      actions={
        <>
          <Button onClick={onCancel} variant="outlined">
            Go Back
          </Button>
          <Button onClick={onConfirm} variant="contained" color="primary">
            Continue
          </Button>
        </>
      }
    >
      <Typography variant="body2" className="text-gray-600">
        {getMessage()}
      </Typography>
    </Modal>
  )
}

export default UnsavedRoutesDialog
