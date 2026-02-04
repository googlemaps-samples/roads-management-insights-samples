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

import { Box } from "@mui/material"
import { ReactNode } from "react"

interface CollapsibleSectionProps {
  isExpanded: boolean
  children: ReactNode
}

const CollapsibleSection = ({
  isExpanded,
  children,
}: CollapsibleSectionProps) => {
  return (
    <Box
      sx={{
        overflow: "visible",
        transition:
          "max-height 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)",
        maxHeight: isExpanded ? "400px" : "0px",
        opacity: isExpanded ? 1 : 0,
        pointerEvents: isExpanded ? "auto" : "none",
      }}
    >
      {children}
    </Box>
  )
}

export default CollapsibleSection
