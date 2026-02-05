import { Outlet } from "react-router-dom"

import { UnsavedChangesProvider } from "../../contexts/unsaved-changes-context"

export default function RootLayout() {
  return (
    <UnsavedChangesProvider>
      <Outlet />
    </UnsavedChangesProvider>
  )
}

