import { ArrowBack } from "@mui/icons-material"
import { Box, IconButton, Typography } from "@mui/material"
import React from "react"
import { useNavigate } from "react-router-dom"

interface PageHeaderProps {
  title?: string
  showBackButton?: boolean
  onBack?: () => void
}

export default function PageHeader({
  title,
  showBackButton = false,
  onBack,
}: PageHeaderProps) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      navigate(-1)
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        p: 2,
        backgroundColor: "white",
        borderBottom: "1px solid #e0e0e0",
      }}
    >
      {showBackButton && (
        <IconButton onClick={handleBack} size="small">
          <ArrowBack />
        </IconButton>
      )}

      {title && (
        <Typography variant="h6" component="h1">
          {title}
        </Typography>
      )}
    </Box>
  )
}
