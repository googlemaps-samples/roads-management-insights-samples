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

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import {
  Box,
  FormControl,
  MenuItem,
  Select,
  Theme,
  Typography,
  styled,
  useTheme,
} from "@mui/material"

import { useAppStore } from "../store"

const DropdownArrow = styled(KeyboardArrowDownIcon)(({ theme }) => ({
  color: theme.palette.google.blue,
  fontSize: "18px",
  marginLeft: "12px",
  transition: "transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)",
  "&.rotated": {
    transform: "rotate(180deg)",
  },
  "&.Mui-disabled": {
    display: "none",
  },
}))

const StyledSelect = styled(Select)(() => ({
  borderRadius: "12px",
  padding: "0px 0px",
  gap: "12px",
  border: "none",
  "& .MuiSelect-select": {
    padding: "0px 0px",
  },
  "&::before": {
    borderBottom: "none",
  },
  "&::after": {
    borderBottom: "none",
  },
  "&.Mui-disabled": {
    "& .MuiSelect-icon": {
      display: "none",
    },
    "&::before": {
      borderBottom: "none !important",
    },
    "&::after": {
      borderBottom: "none !important",
    },
    "& .MuiSelect-select": {
      color: "inherit !important",
      "-webkit-text-fill-color": "inherit !important",
      "&::before": {
        borderBottom: "none !important",
      },
      "&::after": {
        borderBottom: "none !important",
      },
    },
  },
}))

const StyledMenuItem = styled(MenuItem)(() => ({
  // Add any specific menu item styles if needed
}))

const MenuItemContainer = styled(Box)(() => ({
  display: "flex",
  alignItems: "center",
  gap: "4px",
}))

const StatusIndicator = styled(Box)<{ color: string }>(({ color }) => ({
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  backgroundColor: color,
  "&.Mui-disabled": {
    backgroundColor: `${color} !important`,
  },
}))

const MenuItemText = styled(Typography)<{ color: string }>(({ color }) => ({
  color: color,
  "&.Mui-disabled": {
    color: `${color} !important`,
    "-webkit-text-fill-color": `${color} !important`,
  },
}))

const Modes = (theme: Theme) => [
  {
    label: "Live View",
    value: "live",
    color: theme.palette.google.green,
  },
  {
    label: "Historical View",
    value: "historical",
    color: theme.palette.google.red,
  },
]

const ModeSelector = () => {
  const availableModes = useAppStore((state) => state.selectedCity.mode)
  const switchMode = useAppStore((state) => state.switchMode)
  const mode = useAppStore((state) => state.mode)
  const theme = useTheme()

  const allModes = Modes(theme)

  const modesToShow = availableModes
    ? allModes.filter((mode) =>
        mode ? availableModes?.includes(mode.value) : true,
      )
    : allModes

  const shouldDownDisabled = true

  return (
    <FormControl variant="standard">
      <StyledSelect
        onChange={(e) => {
          if (e.target.value === "live") {
            switchMode("live")
          } else {
            switchMode("historical")
          }
        }}
        value={mode}
        disabled={shouldDownDisabled}
        IconComponent={DropdownArrow}
      >
        {modesToShow.map((mode) => (
          <StyledMenuItem key={mode.value} value={mode.value}>
            <MenuItemContainer>
              <StatusIndicator color={mode.color} />
              <MenuItemText variant="h6" color={mode.color}>
                {mode.label}
              </MenuItemText>
            </MenuItemContainer>
          </StyledMenuItem>
        ))}
      </StyledSelect>
    </FormControl>
  )
}

export default ModeSelector
