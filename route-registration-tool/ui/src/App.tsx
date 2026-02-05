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
