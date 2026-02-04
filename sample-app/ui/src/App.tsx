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

import { CssBaseline } from "@mui/material"
import { ThemeProvider, createTheme } from "@mui/material/styles"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { Suspense, lazy } from "react"
import { Route, BrowserRouter as Router, Routes } from "react-router-dom"

import Header from "./components/header"
import { QueryProvider } from "./store/query-provider"

const DemoAppContent = lazy(() => import("./pages/demo/page"))
const LandingPageContent = lazy(() => import("./pages/landing/page"))

const theme = createTheme({
  typography: {
    // Global font family - applied to all text by default
    fontFamily: ["Google Sans", "Product Sans", "Roboto", "sans-serif"].join(
      ",",
    ),
    h1: {
      fontSize: "2.125rem", // 34px
      fontWeight: 300,
      letterSpacing: "-0.01562em",
      lineHeight: 1.2, // Tight for large headings
    },
    h2: {
      fontSize: "1.5rem", // 24px
      fontWeight: 400,
      letterSpacing: "-0.00833em",
      lineHeight: 1.3, // Slightly looser
    },
    h3: {
      fontSize: "1.25rem", // 20px
      fontWeight: 500,
      letterSpacing: "0em",
      lineHeight: 1.4, // Good for readability
    },
    h4: {
      fontSize: "1.125rem", // 18px
      fontWeight: 500,
      letterSpacing: "0.00735em",
      lineHeight: 1.4,
    },
    h5: {
      fontSize: "1rem", // 16px
      fontWeight: 600,
      letterSpacing: "0em",
      lineHeight: 1.5, // Standard for medium text
    },
    h6: {
      fontSize: "0.875rem", // 14px
      fontWeight: 600,
      letterSpacing: "0.0075em",
      lineHeight: 1.5,
    },
    subtitle1: {
      fontSize: "1rem", // 16px
      fontWeight: 400,
      letterSpacing: "0.00938em",
      lineHeight: 1.5, // Good for reading
    },
    subtitle2: {
      fontSize: "0.875rem", // 14px
      fontWeight: 500,
      letterSpacing: "0.00714em",
      lineHeight: 1.5,
    },
    body1: {
      fontSize: "1rem", // 16px
      fontWeight: 400,
      letterSpacing: "0.00938em",
      lineHeight: 1.6, // Optimal for body text readability
    },
    body2: {
      fontSize: "0.875rem", // 14px
      fontWeight: 400,
      letterSpacing: "0.01071em",
      lineHeight: 1.6, // Good for smaller body text
    },
    button: {
      fontSize: "0.875rem", // 14px
      fontWeight: 500,
      letterSpacing: "0.02857em",
      lineHeight: 1.2, // Tight for buttons
      textTransform: "none",
    },
    caption: {
      fontSize: "0.75rem", // 12px
      fontWeight: 400,
      letterSpacing: "0.03333em",
      lineHeight: 1.4, // Readable for small text
    },
    overline: {
      fontSize: "0.625rem", // 10px
      fontWeight: 400,
      letterSpacing: "0.08333em",
      lineHeight: 1.3, // Tight for labels
      textTransform: "uppercase",
    },
    // Custom variants for specific use cases
    small: {
      fontSize: "0.6875rem", // 11px
      fontWeight: 400,
      letterSpacing: "0.02em",
      lineHeight: 1.4, // Good for tiny text
    },
  },
  palette: {
    // Map Material UI palette to our Google colors
    primary: {
      main: "#4285F4", // Google Blue
    },
    secondary: {
      main: "#0F9D58", // Google Green
    },
    error: {
      main: "#E94335", // Google Red
    },
    warning: {
      main: "#FBBB05", // Google Yellow
    },
    // Keep essential Material UI colors
    background: {
      default: "#ffffff",
      paper: "#ffffff",
    },
    text: {
      primary: "#202124",
      secondary: "#5f6368",
      dark: "#1a1a1a",
    },
    common: {
      white: "#ffffff",
      black: "#000000",
    },
    grey: {
      50: "#f8f9fa",
      100: "#f1f3f4",
      200: "#e8eaed",
      300: "#dadce0",
      400: "#bdc1c6",
      500: "#9aa0a6",
      600: "#80868b",
      700: "#5f6368",
      800: "#3c4043",
      900: "#202124",
    },
    // Primary Google colors for direct access
    google: {
      blue: "#4285F4",
      green: "#0F9D58",
      yellow: "#FBBB05",
      red: "#E94335",
    },
    // Interactive colors
    interactive: {
      primary: "#1a73e8",
      primaryHover: "#1557b0",
      primaryDark: "#174ea6",
    },
    // Additional semantic colors
    borders: {
      light: "#e8eaed",
      medium: "#dadce0",
      dark: "#bdc1c6",
    },
    surfaces: {
      primary: "#ffffff",
      secondary: "#f8f9fa",
      tertiary: "#f1f3f4",
    },
    // Disabled states
    disabled: {
      background: "#dddddd",
      text: "#aaaaaa",
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 24,
          fontWeight: 500,
        },
        contained: {
          boxShadow:
            "0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)",
          "&:hover": {
            boxShadow:
              "0 1px 3px 0 rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow:
            "0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)",
          borderRadius: 8,
        },
      },
    },
  },
})

function App() {
  return (
    <QueryProvider>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <CssBaseline />
          <Router>
            <Header />
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<LandingPageContent />} />
                <Route path="/demo" element={<DemoAppContent />} />
              </Routes>
            </Suspense>
          </Router>
        </LocalizationProvider>
      </ThemeProvider>
    </QueryProvider>
  )
}

export default App
