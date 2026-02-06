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
