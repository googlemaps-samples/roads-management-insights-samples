import { Box, Typography } from "@mui/material"
import React from "react"

import {
  PRIMARY_RED_GOOGLE,
  PRIMARY_RED_GOOGLE_DARK,
  PRIMARY_RED_SHADOW,
} from "../../constants/colors"
import Button from "./Button"
import Modal from "./Modal"

interface UnsavedChangesDialogProps {
  open: boolean
  onClose: () => void
  onStay: () => void
  onLeave: () => void
}

export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  open,
  onClose,
  onStay,
  onLeave,
}) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unsaved Changes"
      maxWidth="sm"
      actions={
        <>
          <Button
            onClick={onStay}
            variant="text"
            sx={{
              color: "#5f6368",
              textTransform: "none",
              fontSize: "14px",
              fontFamily: '"Google Sans", sans-serif',
              fontWeight: 500,
              padding: "8px 16px",
              "&:hover": {
                backgroundColor: "rgba(95, 99, 104, 0.08)",
              },
            }}
          >
            Stay
          </Button>
          <Button
            onClick={onLeave}
            variant="contained"
            sx={{
              backgroundColor: PRIMARY_RED_GOOGLE,
              color: "#ffffff",
              textTransform: "none",
              fontSize: "14px",
              fontFamily: '"Google Sans", sans-serif',
              fontWeight: 500,
              padding: "8px 16px",
              boxShadow: "none",
              "&:hover": {
                backgroundColor: PRIMARY_RED_GOOGLE_DARK,
                boxShadow: `0 1px 3px ${PRIMARY_RED_SHADOW}`,
              },
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            Leave
          </Button>
        </>
      }
    >
      <Box sx={{ pt: 1 }}>
        <Typography
          variant="body1"
          sx={{
            fontSize: "15px",
            color: "#202124",
            fontFamily: '"Google Sans", sans-serif',
            lineHeight: 1.5,
            mb: 3,
          }}
        >
          You have unsaved changes in this project. If you leave now, all
          unsaved changes will be lost.
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontSize: "14px",
            color: "#5f6368",
            fontFamily: '"Google Sans", sans-serif',
            lineHeight: 1.5,
          }}
        >
          Are you sure you want to leave?
        </Typography>
      </Box>
    </Modal>
  )
}
