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

import { UnfoldLess, UnfoldMore } from "@mui/icons-material"
import { IconButton, useTheme } from "@mui/material"
import { styled } from "@mui/material/styles"

interface ExpandButtonProps {
  isExpanded: boolean
  onClick: () => void
  disabled?: boolean
}

const StyledExpandButton = styled(IconButton)(({ theme }) => ({
  color: theme.palette.text.secondary,
  backgroundColor: `${theme.palette.google.blue}14`, // 8% opacity
  width: "28px",
  height: "28px",
  padding: 0,
  borderRadius: "50%",
  transition: "all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)",
  "&:hover": {
    backgroundColor: `${theme.palette.google.blue}1F`, // 12% opacity
    color: theme.palette.google.blue,
  },
  "& .MuiSvgIcon-root": {
    fontSize: "18px",
    transition: "transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)",
  },
  position: "relative",
  zIndex: 1,
  border: `1px solid ${theme.palette.google.blue}33`, // 20% opacity
}))

const ExpandButton = ({
  isExpanded,
  onClick,
  disabled = false,
}: ExpandButtonProps) => {
  const theme = useTheme()

  return (
    <StyledExpandButton
      disabled={disabled}
      onPointerDown={onClick}
      sx={{
        border: `1px solid ${theme.palette.google.blue}66`,
        color: theme.palette.google.blue,
        cursor: "pointer",
        ":disabled": {
          cursor: "not-allowed",
          opacity: 0.5,
          border: `1px solid ${theme.palette.disabled.background}`,
          color: theme.palette.disabled.text,
        },
      }}
    >
      {isExpanded ? <UnfoldLess /> : <UnfoldMore />}
    </StyledExpandButton>
  )
}

export default ExpandButton
