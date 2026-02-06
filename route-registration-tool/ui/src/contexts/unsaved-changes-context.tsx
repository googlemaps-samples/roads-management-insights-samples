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

import React, { createContext, useCallback, useContext, useState } from "react"
import { useNavigate } from "react-router-dom"

import { UnsavedChangesDialog } from "../components/common/UnsavedChangesDialog"
import { hasUnsavedChanges } from "../utils/unsaved-changes-detector"

interface UnsavedChangesContextType {
  navigateWithCheck: (path: string) => void
  executeActionWithCheck: (action: () => void) => void
}

const UnsavedChangesContext = createContext<
  UnsavedChangesContextType | undefined
>(undefined)

// Internal provider component that uses useNavigate (must be inside RouterProvider)
const UnsavedChangesProviderInner: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  // Handle browser reload/close with unsaved changes
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check for unsaved changes
      if (hasUnsavedChanges()) {
        // Modern browsers ignore custom messages and show their own generic message
        // But we still need to call preventDefault() and set returnValue
        e.preventDefault()
        // Some browsers require returnValue to be set
        e.returnValue = ""
        return ""
      }
    }

    // Add event listener
    window.addEventListener("beforeunload", handleBeforeUnload)

    // Cleanup
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, []) // Empty dependency array - we want this to run once and check on every reload attempt

  const navigateWithCheck = useCallback(
    (path: string) => {
      // Always clear layers when navigating to dashboard
      if (path === "/dashboard") {
        if (hasUnsavedChanges()) {
          setPendingPath(path)
          setDialogOpen(true)
          return
        }
        // Navigate FIRST, then clear state after navigation starts
        navigate(path)
        console.log(`navigation started to ${path}`)
        return
      }

      // For other paths, check for unsaved changes
      if (hasUnsavedChanges()) {
        setPendingPath(path)
        setDialogOpen(true)
        return
      }
      navigate(path)
    },
    [navigate],
  )

  const executeActionWithCheck = useCallback((action: () => void) => {
    if (hasUnsavedChanges()) {
      setPendingAction(() => action)
      setDialogOpen(true)
      return
    }
    action()
  }, [])

  const handleStay = useCallback(() => {
    setDialogOpen(false)
    setPendingPath(null)
    setPendingAction(null)
  }, [])

  const handleLeave = useCallback(() => {
    setDialogOpen(false)

    if (pendingPath) {
      navigate(pendingPath)
      console.log(`navigation started to pending path ${pendingPath}`)
      setPendingPath(null)
    }
    if (pendingAction) {
      pendingAction()
      console.log(`pending action executed`)
      setPendingAction(null)
    }
    // no clearing layers here
  }, [navigate, pendingPath, pendingAction])

  return (
    <UnsavedChangesContext.Provider
      value={{ navigateWithCheck, executeActionWithCheck }}
    >
      {children}
      <UnsavedChangesDialog
        open={dialogOpen}
        onClose={handleStay}
        onStay={handleStay}
        onLeave={handleLeave}
      />
    </UnsavedChangesContext.Provider>
  )
}

// Outer provider that doesn't use useNavigate (can be outside RouterProvider)
export const UnsavedChangesProvider: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  return <UnsavedChangesProviderInner>{children}</UnsavedChangesProviderInner>
}

export const useUnsavedChangesNavigation = () => {
  const context = useContext(UnsavedChangesContext)
  if (context === undefined) {
    throw new Error(
      "useUnsavedChangesNavigation must be used within UnsavedChangesProvider",
    )
  }
  return context
}
