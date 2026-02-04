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

const RouteReliabilityContent = () => (
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
      Analyze historical travel times on pre-defined routes to identify systemic
      problem areas on key transportation corridors. Use data to pinpoint
      systemic bottlenecks, justify infrastructure investments, and develop
      operational strategies for more consistent and predictable travel for the
      public.
    </Typography>

    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
      <Chip
        label="Performance Monitoring"
        size="small"
        sx={{
          fontSize: "11px",
          height: "22px",
          backgroundColor: "#e8f0fe",
          color: "#1a73e8",
        }}
      />
      <Chip
        label="Corridor Management"
        size="small"
        sx={{
          fontSize: "11px",
          height: "22px",
          backgroundColor: "#fef7e0",
          color: "#ea8600",
        }}
      />
      <Chip
        label="Infrastructure Investment"
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
      Ideal for commuter services requiring reliable route performance analysis.
    </Typography>
  </Box>
)

export default RouteReliabilityContent
