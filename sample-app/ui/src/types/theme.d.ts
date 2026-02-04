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

import { Theme } from "@mui/material/styles"

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    small: true
  }
}

declare module "@mui/material/styles" {
  interface TypeText {
    dark: string
  }

  interface Palette {
    google: {
      blue: string
      green: string
      yellow: string
      red: string
    }
    interactive: {
      primary: string
      primaryHover: string
      primaryDark: string
    }
    borders: {
      light: string
      medium: string
      dark: string
    }
    surfaces: {
      primary: string
      secondary: string
      tertiary: string
    }
    disabled: {
      background: string
      text: string
    }
  }

  interface PaletteOptions {
    google?: {
      blue?: string
      green?: string
      yellow?: string
      red?: string
    }
    interactive?: {
      primary?: string
      primaryHover?: string
      primaryDark?: string
    }
    borders?: {
      light?: string
      medium?: string
      dark?: string
    }
    surfaces?: {
      primary?: string
      secondary?: string
      tertiary?: string
    }
    disabled?: {
      background?: string
      text?: string
    }
  }

  interface TypographyVariants {
    small: React.CSSProperties
  }

  interface TypographyVariantsOptions {
    small?: React.CSSProperties
  }
}

// Extend the theme's TypeScript types
declare module "@mui/material/styles/createTheme" {
  interface Theme {
    palette: Palette
  }
}
