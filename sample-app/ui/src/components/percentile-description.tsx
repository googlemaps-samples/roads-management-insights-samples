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

import { Box, Typography } from "@mui/material"

interface PercentileDescriptionProps {
  sx?: React.CSSProperties
}

export const PercentileDescription: React.FC<PercentileDescriptionProps> = ({
  sx,
}) => {
  return (
    <Box sx={{ ...sx }}>
      <Box
        sx={{
          backgroundColor: "#f8f9fa",
          borderRadius: "8px",
          padding: "12px",
          border: "1px solid #e8eaed",
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontSize: "10px",
            color: "#202124",
            lineHeight: 1.4,
            fontFamily: '"Google Sans", Roboto, sans-serif',
          }}
        >
          95% Reliable Time is the travel time that 95% of trips are faster
          than, and only 5% are slower than — representing a near worst-case
          travel duration under typical conditions.
        </Typography>
      </Box>
    </Box>
  )
}
