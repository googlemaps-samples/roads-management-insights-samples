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
