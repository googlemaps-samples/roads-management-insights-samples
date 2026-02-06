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
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  TextField,
  Typography,
} from "@mui/material"
import React from "react"

import { validateRouteName as validateRouteNameUtil } from "../../utils/route-validation"
import Button from "../common/Button"
import Modal from "../common/Modal"

interface RouteNamingDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (namingConfig: {
    type: "custom" | "property"
    value: string
  }) => void
  featureCount: number
  availableProperties?: string[]
  projectId?: string
}

const RouteNamingDialog: React.FC<RouteNamingDialogProps> = ({
  open,
  onClose,
  onConfirm,
  featureCount,
  availableProperties = [],
  projectId,
}) => {
  const [namingType, setNamingType] = React.useState<"custom" | "property">(
    availableProperties.length > 0 ? "property" : "custom",
  )
  const [selectedProperty, setSelectedProperty] = React.useState<string>(
    availableProperties[0] || "",
  )
  const [customName, setCustomName] = React.useState<string>("Route")
  const [customNameError, setCustomNameError] = React.useState<string>("")

  React.useEffect(() => {
    if (open) {
      // Reset to defaults when dialog opens
      setNamingType(availableProperties.length > 0 ? "property" : "custom")
      setSelectedProperty(availableProperties[0] || "")
      setCustomName("Route")
    }
  }, [open, availableProperties])

  const handleConfirm = () => {
    if (namingType === "property") {
      onConfirm({ type: "property", value: selectedProperty })
    } else {
      const trimmed = customName.trim()
      if (!trimmed) {
        setCustomNameError("Route name is required")
        return
      }
      // Validate custom name
      const validation = validateRouteNameUtil(trimmed)
      if (!validation.isValid) {
        setCustomNameError(validation.error || "")
        return
      }
      setCustomNameError("")
      onConfirm({ type: "custom", value: trimmed })
    }
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  const previewName = customName.trim() ? `${customName.trim()} 1` : ""

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      title="Configure Route Names"
      actions={
        <>
          <Button
            onClick={handleCancel}
            variant="text"
            sx={{
              color: "#5f6368",
              "&:hover": {
                backgroundColor: "rgba(95, 99, 104, 0.08)",
              },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            variant="contained"
            disabled={
              (namingType === "custom" && !customName.trim()) ||
              (namingType === "property" && !selectedProperty)
            }
          >
            Continue
          </Button>
        </>
      }
    >
      <Typography
        variant="body2"
        sx={{
          color: "#5f6368",
          marginBottom: "24px",
          fontSize: "14px",
        }}
      >
        This GeoJSON file contains {featureCount} feature(s). Choose how to name
        the routes:
      </Typography>

      <FormControl component="fieldset" fullWidth>
        <RadioGroup
          value={namingType}
          onChange={(e) =>
            setNamingType(e.target.value as "custom" | "property")
          }
        >
          {availableProperties.length > 0 && (
            <>
              <FormControlLabel
                value="property"
                control={<Radio />}
                label="Use feature property"
                sx={{ marginBottom: "16px" }}
              />
              {namingType === "property" && (
                <div style={{ marginLeft: "32px", marginBottom: "16px" }}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="property-select-label">
                      Select Property
                    </InputLabel>
                    <Select
                      labelId="property-select-label"
                      value={selectedProperty}
                      label="Select Property"
                      onChange={(e) => setSelectedProperty(e.target.value)}
                      sx={{
                        borderRadius: "8px",
                      }}
                    >
                      {availableProperties.map((property) => (
                        <MenuItem key={property} value={property}>
                          {property}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#5f6368",
                      fontSize: "12px",
                      marginTop: "8px",
                      display: "block",
                    }}
                  >
                    Routes will be named using the "{selectedProperty}" property
                    value from each feature. If a feature doesn't have this
                    property, it will fall back to a default name.
                  </Typography>
                </div>
              )}
            </>
          )}

          <FormControlLabel
            value="custom"
            control={<Radio />}
            label="Use a custom name"
            sx={{ marginBottom: "16px" }}
          />
          {namingType === "custom" && (
            <div style={{ marginLeft: "32px", marginBottom: "16px" }}>
              <TextField
                fullWidth
                placeholder="Enter custom name (e.g., 'My Route')"
                value={customName}
                onChange={(e) => {
                  setCustomName(e.target.value)
                  if (customNameError) {
                    setCustomNameError("")
                  }
                }}
                variant="outlined"
                size="small"
                inputProps={{ maxLength: 100 }}
                error={!!customNameError}
                helperText={customNameError}
                sx={{
                  marginBottom: "8px",
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "8px",
                  },
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  color: "#5f6368",
                  fontSize: "12px",
                  display: "block",
                }}
              >
                Routes will be named: {previewName || "..."},{" "}
                {customName.trim() || "..."} 2, {customName.trim() || "..."} 3,
                etc.
              </Typography>
            </div>
          )}
        </RadioGroup>
      </FormControl>
    </Modal>
  )
}

export default RouteNamingDialog
