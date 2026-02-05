import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  SxProps,
  Theme,
  Typography,
} from "@mui/material"
import React from "react"

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string | React.ReactNode
  children: React.ReactNode
  actions?: React.ReactNode
  maxWidth?: "xs" | "sm" | "md" | "lg" | "xl" | false
  fullWidth?: boolean
  sx?: SxProps<Theme>
  PaperProps?: {
    sx?: SxProps<Theme>
  }
  contentSx?: SxProps<Theme>
  actionsSx?: SxProps<Theme>
  titleSx?: SxProps<Theme>
}

const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  actions,
  maxWidth = "sm",
  fullWidth = true,
  sx,
  PaperProps,
  contentSx,
  actionsSx,
  titleSx,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      sx={sx}
      PaperProps={{
        ...PaperProps,
        sx: {
          borderRadius: "8px",
          boxShadow:
            "0px 11px 15px -7px rgba(0, 0, 0, 0.2), 0px 24px 38px 3px rgba(0, 0, 0, 0.14), 0px 9px 46px 8px rgba(0, 0, 0, 0.12)",
          margin: "32px",
          maxHeight: "calc(100% - 64px)",
          ...PaperProps?.sx,
        },
      }}
    >
      {title && (
        <DialogTitle
          sx={{
            padding: "24px 24px 0 24px",
            margin: 0,
            borderBottom: "none",
            ...titleSx,
          }}
        >
          <Typography
            variant="h6"
            component="div"
            sx={{
              fontSize: "22px",
              fontFamily: '"Google Sans", sans-serif',
              fontWeight: 400,
              color: "#202124",
              lineHeight: "28px",
              letterSpacing: "0",
            }}
          >
            {title}
          </Typography>
        </DialogTitle>
      )}
      <DialogContent
        sx={{
          padding: "24px 24px 8px 24px",
          margin: 0,
          ...contentSx,
        }}
      >
        {children}
      </DialogContent>
      {actions && (
        <DialogActions
          sx={{
            padding: "8px 24px 24px 24px",
            margin: 0,
            borderTop: "none",
            gap: "8px",
            justifyContent: "flex-end",
            minHeight: "auto",
            ...actionsSx,
          }}
        >
          {actions}
        </DialogActions>
      )}
    </Dialog>
  )
}

export default Modal
