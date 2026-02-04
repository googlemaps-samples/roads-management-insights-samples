// Copyright 2025 Google LLC
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

import { Box, Chip, Typography } from "@mui/material"

const RealtimeMonitoringContent = () => (
  <Box>
    <Typography
      sx={{
        fontSize: "14px",
        color: "#202124",
        fontWeight: 500,
        lineHeight: 1.6,
        mb: 2,
        fontFamily: "Google Sans, sans-serif",
      }}
    >
      Detect and monitor traffic disruptions by analyzing real-time data to
      identify unusual traffic patterns that deviate from the expected norm,
      which could indicate accidents, sudden increases in traffic volume, or
      emerging congestion.
    </Typography>

    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
      <Chip
        label="Immediate Awareness"
        size="small"
        sx={{
          fontSize: "11px",
          height: "22px",
          backgroundColor: "#e8f0fe",
          color: "#1a73e8",
        }}
      />
      <Chip
        label="Data-Driven Decisions"
        size="small"
        sx={{
          fontSize: "11px",
          height: "22px",
          backgroundColor: "#fef7e0",
          color: "#ea8600",
        }}
      />
      <Chip
        label="Safety and Efficiency"
        size="small"
        sx={{
          fontSize: "11px",
          height: "22px",
          backgroundColor: "#e6f4ea",
          color: "#137333",
        }}
      />
    </Box>

    <Typography
      sx={{
        fontSize: "13px",
        color: "#202124",
        fontWeight: 400,
        fontStyle: "italic",
        fontFamily: "Google Sans, sans-serif",
      }}
    >
      A perfect fit for smart city projects, driving real-time traffic
      optimization.
    </Typography>
  </Box>
)

export default RealtimeMonitoringContent
