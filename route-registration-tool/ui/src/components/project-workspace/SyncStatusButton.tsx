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

import {
  CheckCircle,
  Error as ErrorIcon,
  Sync as SyncIcon,
} from "@mui/icons-material"
import { IconButton } from "@mui/material"
import React from "react"

import { ValidatingIcon } from "../../assets/images"
import { getColorsForMapType } from "../../stores/layer-store/utils/color-utils"
import { useProjectWorkspaceStore } from "../../stores/project-workspace-store"

export type SyncStatus = "unsynced" | "validating" | "synced" | "invalid"

interface SyncStatusButtonProps {
  status: SyncStatus
  isLoading?: boolean
  disabled?: boolean
  onClick: (e?: React.MouseEvent) => void
  size?: "small" | "medium" | "large"
}

const SyncStatusButton: React.FC<SyncStatusButtonProps> = ({
  status,
  isLoading = false,
  disabled = false,
  onClick,
  size = "small",
}) => {
  const mapType = useProjectWorkspaceStore((state) => state.mapType)
  const colors = getColorsForMapType(mapType)

  // Convert RGBA array to CSS color string
  const rgbaToCss = ([r, g, b]: [number, number, number, number]): string =>
    `rgb(${r}, ${g}, ${b})`

  const getStatusColor = (status: SyncStatus): string => {
    switch (status) {
      case "synced":
        return rgbaToCss(colors.routeStatusColors.synced)
      case "validating":
        return rgbaToCss(colors.routeStatusColors.validating)
      case "unsynced":
        return rgbaToCss(colors.routeStatusColors.unsynced)
      case "invalid":
        return rgbaToCss(colors.routeStatusColors.invalid)
      default:
        return rgbaToCss(colors.routeStatusColors.unsynced)
    }
  }

  const getIcon = () => {
    const statusColor = getStatusColor(status)

    if (isLoading) {
      return (
        <SyncIcon
          sx={{
            fontSize: 18,
            color: statusColor,
            animation: "spin 1s linear infinite",
            "@keyframes spin": {
              "0%": {
                transform: "rotate(0deg)",
              },
              "100%": {
                transform: "rotate(360deg)",
              },
            },
          }}
        />
      )
    }

    switch (status) {
      case "unsynced":
        return (
          <SyncIcon
            sx={{
              fontSize: 18,
              color: statusColor,
            }}
          />
        )
      case "validating":
        return (
          <ValidatingIcon
            sx={{
              width: "18px",
              height: "18px",
              color: statusColor,
            }}
          />
        )
      case "synced":
        return (
          <CheckCircle
            sx={{
              fontSize: 18,
              color: statusColor,
            }}
          />
        )
      case "invalid":
        return (
          <ErrorIcon
            sx={{
              fontSize: 18,
              color: statusColor,
            }}
          />
        )
      default:
        return (
          <SyncIcon
            sx={{
              fontSize: 18,
              color: statusColor,
            }}
          />
        )
    }
  }

  const getTitle = () => {
    if (isLoading) return "Syncing..."
    switch (status) {
      case "unsynced":
        return "Unsynced - Click to sync"
      case "validating":
        return "Validating sync status"
      case "synced":
        return "Synced"
      case "invalid":
        return "Invalid - Click to retry"
      default:
        return "Sync route"
    }
  }

  const isButtonDisabled = disabled || status === "synced" || isLoading

  return (
    <IconButton
      size={size}
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      disabled={isButtonDisabled}
      title={getTitle()}
      sx={{
        minWidth: 32,
        minHeight: 32,
        padding: "4px",
        "&:hover": {
          backgroundColor: "rgba(0, 0, 0, 0.04)",
        },
      }}
    >
      {getIcon()}
    </IconButton>
  )
}

export default SyncStatusButton
