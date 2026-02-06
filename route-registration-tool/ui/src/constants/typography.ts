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

export const TYPOGRAPHY_SCALES = {
  // Large screens (1440px+) - Current design
  large: {
    // Panel widths
    leftPanelWidth: 360,
    rightPanelWidth: 320,
    legendsPanelWidth: 210,
    dynamicIslandWidth: 400,

    // Font sizes
    heading: {
      h1: "24px",
      h2: "20px",
      h3: "18px",
      h4: "16px",
      h5: "15px",
      h6: "14px",
    },
    body: {
      large: "15px",
      medium: "14px",
      small: "13px",
      xsmall: "12px",
      xxsmall: "11px",
    },

    // Spacing (in pixels, convert to MUI spacing units by dividing by 8)
    spacing: {
      panel: {
        px: 16, // px-4
        py: 12, // py-3
      },
      card: {
        px: 12, // px-3
        py: 8, // py-2
      },
      button: {
        px: 16, // px-4
        py: 10, // py-2.5
      },
      header: {
        px: 20, // px-5 (2.5 * 8)
        py: 16, // py-4 (2 * 8)
      },
      footer: {
        px: 24, // px-6 (3 * 8)
        py: 16, // py-4 (2 * 8)
      },
    },

    // Component sizes
    iconButton: {
      small: 32,
      medium: 40,
      large: 48,
    },
    button: {
      height: 40,
      fontSize: "14px",
    },
  },

  // Medium screens (1024px - 1439px) - Optimized for 1280x800
  medium: {
    // Panel widths
    leftPanelWidth: 360,
    rightPanelWidth: 320,
    legendsPanelWidth: 210,
    dynamicIslandWidth: 400,

    // Font sizes
    heading: {
      h1: "24px",
      h2: "20px",
      h3: "18px",
      h4: "16px",
      h5: "15px",
      h6: "14px",
    },
    body: {
      large: "15px",
      medium: "14px",
      small: "13px",
      xsmall: "12px",
      xxsmall: "11px",
    },

    // Spacing (in pixels, convert to MUI spacing units by dividing by 8)
    spacing: {
      panel: {
        px: 16, // px-4
        py: 12, // py-3
      },
      card: {
        px: 12, // px-3
        py: 8, // py-2
      },
      button: {
        px: 16, // px-4
        py: 10, // py-2.5
      },
      header: {
        px: 20, // px-5 (2.5 * 8)
        py: 16, // py-4 (2 * 8)
      },
      footer: {
        px: 24, // px-6 (3 * 8)
        py: 16, // py-4 (2 * 8)
      },
    },

    // Component sizes
    iconButton: {
      small: 32,
      medium: 40,
      large: 48,
    },
    button: {
      height: 40,
      fontSize: "14px",
    },
  },
} as const

export type TypographyScale = keyof typeof TYPOGRAPHY_SCALES
export type TypographyConfig = (typeof TYPOGRAPHY_SCALES)[TypographyScale]

// medium: {
//   // Panel widths - ~17-20% reduction
//   leftPanelWidth: 300,
//   rightPanelWidth: 300,
//   legendsPanelWidth: 240,
//   dynamicIslandWidth: 340,

//   // Font sizes - slightly smaller
//   heading: {
//     h1: "22px",
//     h2: "18px",
//     h3: "16px",
//     h4: "15px",
//     h5: "14px",
//     h6: "13px",
//   },
//   body: {
//     large: "14px",
//     medium: "13px",
//     small: "12px",
//     xsmall: "11px",
//     xxsmall: "10px",
//   },

//   // Spacing - reduced by ~20-25%
//   spacing: {
//     panel: {
//       px: 12, // px-3
//       py: 10, // py-2.5
//     },
//     card: {
//       px: 10, // px-2.5
//       py: 6, // py-1.5
//     },
//     button: {
//       px: 12, // px-3
//       py: 8, // py-2
//     },
//     header: {
//       px: 16, // px-4 (2 * 8)
//       py: 12, // py-3 (1.5 * 8)
//     },
//     footer: {
//       px: 16, // px-4 (2 * 8)
//       py: 12, // py-3 (1.5 * 8)
//     },
//   },

//   // Component sizes - smaller
//   iconButton: {
//     small: 28,
//     medium: 36,
//     large: 44,
//   },
//   button: {
//     height: 36,
//     fontSize: "13px",
//   },
// },
