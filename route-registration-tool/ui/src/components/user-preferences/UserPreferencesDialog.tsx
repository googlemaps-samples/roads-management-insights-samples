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

import { Check } from "@mui/icons-material"
import { Switch } from "@mui/material"
import { useEffect, useState } from "react"

import { PRIMARY_BLUE } from "../../constants/colors"
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from "../../hooks/use-api"
import { DistanceUnit, RouteColorMode } from "../../types/user"
import Button from "../common/Button"
import Modal from "../common/Modal"

interface UserPreferencesDialogProps {
  open: boolean
  onClose: () => void
}

export default function UserPreferencesDialog({
  open,
  onClose,
}: UserPreferencesDialogProps) {
  const { data: preferences, isLoading } = useUserPreferences()
  const updatePreferences = useUpdateUserPreferences()

  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("km")
  const [googleCloudAccount, setGoogleCloudAccount] = useState<string>("")
  const [showTooltip, setShowTooltip] = useState<boolean>(true)
  const [showInstructions, setShowInstructions] = useState<boolean>(true)
  const [routeColorMode, setRouteColorMode] =
    useState<RouteColorMode>("sync_status")

  // Load preferences when dialog opens
  useEffect(() => {
    if (open && preferences) {
      setDistanceUnit(preferences.distanceUnit)
      setGoogleCloudAccount(preferences.googleCloudAccount || "")
      setShowTooltip(preferences.show_tooltip ?? true)
      setShowInstructions(preferences.show_instructions ?? true)
      setRouteColorMode(preferences.route_color_mode || "sync_status")
    }
  }, [open, preferences])

  const handleSave = async () => {
    try {
      await updatePreferences.mutateAsync({
        distanceUnit,
        googleCloudAccount: googleCloudAccount || null,
        show_tooltip: showTooltip,
        show_instructions: showInstructions,
        route_color_mode: routeColorMode,
      })
      onClose()
    } catch (error) {
      console.error("Failed to update preferences:", error)
    }
  }

  const handleDistanceUnitChange = (unit: DistanceUnit) => {
    setDistanceUnit(unit)
  }

  const handleShowTooltipChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setShowTooltip(event.target.checked)
  }

  const handleShowInstructionsChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setShowInstructions(event.target.checked)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      title="Preferences"
      actions={
        <>
          <Button onClick={onClose} disabled={updatePreferences.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={updatePreferences.isPending || isLoading}
          >
            {updatePreferences.isPending ? "Saving..." : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-6 pt-2">
        {/* Distance Units Section */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-900">
            Distance units
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleDistanceUnitChange("km")}
              disabled={isLoading}
              className={`flex-1 flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors ${
                distanceUnit === "km"
                  ? "bg-blue-50 border-blue-200 text-gray-900"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="text-sm font-medium">Kilometers</span>
              {distanceUnit === "km" && (
                <Check className="text-blue-600" fontSize="small" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleDistanceUnitChange("miles")}
              disabled={isLoading}
              className={`flex-1 flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors ${
                distanceUnit === "miles"
                  ? "bg-blue-50 border-blue-200 text-gray-900"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="text-sm font-medium">Miles</span>
              {distanceUnit === "miles" && (
                <Check className="text-blue-600" fontSize="small" />
              )}
            </button>
          </div>
        </div>

        {/* Show Tooltips Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-900 block">
                Show tooltips
              </label>
              <p className="text-sm text-gray-600 mt-0.5">
                Hover hints on roads
              </p>
            </div>
            <Switch
              checked={showTooltip}
              onChange={handleShowTooltipChange}
              disabled={isLoading}
              sx={{
                "& .MuiSwitch-switchBase.Mui-checked": {
                  color: PRIMARY_BLUE,
                },
                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                  backgroundColor: PRIMARY_BLUE,
                },
              }}
            />
          </div>
        </div>

        {/* Context Instructions Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-900 block">
                Context instructions
              </label>
              <p className="text-sm text-gray-600 mt-0.5">
                Display guide panels
              </p>
            </div>
            <Switch
              checked={showInstructions}
              onChange={handleShowInstructionsChange}
              disabled={isLoading}
              sx={{
                "& .MuiSwitch-switchBase.Mui-checked": {
                  color: PRIMARY_BLUE,
                },
                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                  backgroundColor: PRIMARY_BLUE,
                },
              }}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
