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

import { IconButton, Typography } from "@mui/material"
import { styled } from "@mui/material/styles"

export const RightCard = styled("div")<{
  $variant: "live" | "historical"
}>(() => ({
  width: "100%",
  backgroundColor: "rgba(255, 255, 255, 1)",
  borderRadius: "16px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  maxHeight: "calc(100vh - 120px)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(232, 234, 237, 0.8)",
}))

export const CardHeader = styled("div")({
  padding: "8px 12px 8px 12px",
  backgroundColor: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: "1px solid rgba(232, 234, 237, 0.6)",
})

export const HeaderContent = styled("div")({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
})

export const TitleContainer = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flex: 1,
})

export const TitleContainerMultiLine = styled("div")({
  display: "flex",
  alignItems: "flex-start",
  gap: "8px",
  flex: 1,
})

export const HeaderActions = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: "12px",
})

export const HeaderTitle = styled("h1")<{ isMinimized: boolean }>(
  (props) => ({
    fontWeight: 500,
    color: props.theme.palette.text.primary,
    fontSize: "18px",
  })
)

export const HeaderSubTitle = styled("h6")<{ isMinimized: boolean }>(
  ({ theme }) => ({
    color: theme.palette.text.secondary,
    fontSize: "12px",
  }),
)

export const ToggleButton = styled(IconButton)(({ theme }) => ({
  color: theme.palette.text.secondary,
  "&:hover": {
    backgroundColor: theme.palette.surfaces.tertiary,
  },
}))

export const ScrollableContent = styled("div")({
  flex: 1,
  overflow: "auto",
  minHeight: 0,
  "&::-webkit-scrollbar": {
    width: "6px",
  },
  "&::-webkit-scrollbar-track": {
    backgroundColor: "transparent",
    margin: 0,
    padding: 0,
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "#dadce0",
    borderRadius: "8px",
    margin: "2px",
    padding: 0,
    border: "1px solid transparent",
    backgroundClip: "content-box",
    minHeight: "40px",
  },
  // Firefox scrollbar styling
  scrollbarWidth: "thin",
  scrollbarColor: "#dadce0 transparent",
})
