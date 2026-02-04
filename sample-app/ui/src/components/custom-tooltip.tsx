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

import { Tooltip, TooltipProps } from "@mui/material"
import { styled } from "@mui/material/styles"

export const CustomTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} arrow classes={{ popper: className }} />
))(({ theme }) => ({
  "& .MuiTooltip-tooltip": {
    backgroundColor: theme.palette.common.white,
    color: "#000000",
    fontSize: "12px",
    fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
    fontWeight: "400",
    padding: "16px",
    borderRadius: "12px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
    border: "1px solid rgba(0,0,0,0.12)",
    maxWidth: "350px",
    lineHeight: "1.4",
  },
  "& .MuiTooltip-arrow": {
    color: theme.palette.common.white,
    "&::before": {
      backgroundColor: theme.palette.common.white,
      border: "1px solid rgba(0,0,0,0.12)",
    },
  },
}))
