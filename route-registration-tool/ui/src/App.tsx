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

import { ThemeProvider } from "@mui/material/styles"
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom"

import RootLayout from "./components/layout/RootLayout"
import UserPreferencesLoader from "./components/user-preferences/UserPreferencesLoader"
import AddProjectPage from "./pages/add-project/page"
import DashboardPage from "./pages/dashboard/page"
import ProjectWorkspacePage from "./pages/project/[projectId]/page"
import { theme } from "./theme/theme"

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: "/",
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: "/dashboard",
        element: <DashboardPage />,
      },
      {
        path: "/add-project",
        element: <AddProjectPage />,
      },
      {
        path: "/project/:projectId",
        element: <ProjectWorkspacePage />,
      },
    ],
  },
])

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <UserPreferencesLoader />
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}
