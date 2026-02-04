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

import { InfoOutlined, UnfoldLess, UnfoldMore } from "@mui/icons-material"
import { IconButton, Typography, useTheme } from "@mui/material"
import { styled } from "@mui/material/styles"
import React, { ReactNode } from "react"

import { CustomTooltip } from "./custom-tooltip"
import {
  CardHeader,
  HeaderActions,
  HeaderContent,
  HeaderSubTitle,
  HeaderTitle,
  TitleContainer,
  TitleContainerMultiLine,
  ToggleButton,
} from "./right-panel-shared"

// InfoButton for single-line headers (center aligned)
const InfoButtonSingleLine = styled(IconButton)(({ theme }) => ({
  color: theme.palette.text.secondary,
  padding: "4px",
  "&:hover": {
    backgroundColor: theme.palette.surfaces.tertiary,
    color: theme.palette.interactive.primary,
  },
}))

// InfoButton for multi-line headers (aligned with first line)
const InfoButtonMultiLine = styled(IconButton)(({ theme }) => ({
  color: theme.palette.text.secondary,
  padding: "4px",
  alignSelf: "flex-start", // Align to the top of the container
  marginTop: "2px", // Center with first line of multi-line headers
  "&:hover": {
    backgroundColor: theme.palette.surfaces.tertiary,
    color: theme.palette.interactive.primary,
  },
}))

interface PanelHeaderProps {
  title: string | ReactNode
  subTitle?: string 
  isMinimized: boolean
  onToggleMinimize: () => void
  infoTooltip?: ReactNode
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  subTitle,
  isMinimized,
  onToggleMinimize,
  infoTooltip,
}) => {
  const theme = useTheme()
  // Check if title is a multi-line React element
  const isMultiLine = typeof title !== "string" && React.isValidElement(title)
  const Container = isMultiLine ? TitleContainerMultiLine : TitleContainer
  const InfoButton = isMultiLine ? InfoButtonMultiLine : InfoButtonSingleLine

  return (
    <CardHeader>
      <HeaderContent>
        <Container>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
            <HeaderTitle isMinimized={isMinimized}>{title}</HeaderTitle>
            {subTitle && 
            <HeaderSubTitle isMinimized={isMinimized}>{subTitle}</HeaderSubTitle>}
          </div>
          {infoTooltip && (
            <CustomTooltip
              title={
                <Typography
                  sx={{
                    fontSize: "10.5px",
                    color: theme.palette.grey[800],
                    fontFamily: '"Google Sans", Roboto, sans-serif',
                    fontWeight: 400,
                    lineHeight: "1.5",
                    textAlign: "left",
                  }}
                >
                  {infoTooltip}
                </Typography>
              }
              placement="bottom-start"
              arrow
            >
              <InfoButton size="small">
                <InfoOutlined sx={{ fontSize: "16px" }} />
              </InfoButton>
            </CustomTooltip>
          )}
        </Container>
        <HeaderActions>
          <ToggleButton size="small" onClick={onToggleMinimize}>
            {isMinimized ? <UnfoldMore /> : <UnfoldLess />}
          </ToggleButton>
        </HeaderActions>
      </HeaderContent>
    </CardHeader>
  )
}
