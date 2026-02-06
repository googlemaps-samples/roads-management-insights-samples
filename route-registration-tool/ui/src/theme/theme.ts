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

import { createTheme } from "@mui/material/styles"

import { PRIMARY_BLUE, PRIMARY_BLUE_DARK } from "../constants/colors"

// Custom font sizes used throughout the application
export const fontSizes = {
  caption: "0.688rem", // Small text, chip labels, waypoint numbers
  helper: "0.75rem", // Helper text, captions, secondary info
  body: "0.813rem", // Body text, buttons, inputs, main content
} as const

// Extend MUI theme type to include custom font sizes
declare module "@mui/material/styles" {
  interface Theme {
    fontSizes: typeof fontSizes
  }
  interface ThemeOptions {
    fontSizes?: typeof fontSizes
  }
}

export const theme = createTheme({
  cssVariables: true,
  typography: {
    fontFamily: '"Google Sans", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  palette: {
    primary: {
      main: PRIMARY_BLUE,
      dark: PRIMARY_BLUE_DARK,
      contrastText: "#ffffff",
    },
  },
  fontSizes,
})

