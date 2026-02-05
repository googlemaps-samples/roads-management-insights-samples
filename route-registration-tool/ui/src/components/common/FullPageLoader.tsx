import { Backdrop, CircularProgress, Typography } from "@mui/material"
import React from "react"

interface FullPageLoaderProps {
  open: boolean
  message?: string
}

const FullPageLoader: React.FC<FullPageLoaderProps> = ({
  open,
  message = "Syncing routes, please wait...",
}) => {
  return (
    <Backdrop
      open={open}
      sx={{
        zIndex: 9999,
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
      }}
    >
      <CircularProgress size={60} thickness={4} />
      <Typography
        variant="body1"
        sx={{
          color: "text.primary",
          fontWeight: 500,
        }}
      >
        {message}
      </Typography>
    </Backdrop>
  )
}

export default FullPageLoader
