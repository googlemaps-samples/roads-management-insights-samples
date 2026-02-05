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
