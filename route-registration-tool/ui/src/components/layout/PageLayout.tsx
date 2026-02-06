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

import React from "react"
import { ErrorBoundary } from "react-error-boundary"

import Navbar from "./Navbar"
import Button from "../common/Button"

interface PageLayoutProps {
  children: React.ReactNode
}

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error
  resetErrorBoundary: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-screen p-3 text-center">
      <h2 className="text-xl font-semibold text-mui-primary mb-2">
        Something went wrong
      </h2>
      <p className="text-mui-secondary mb-4">{error.message}</p>
      <Button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-mui-primary text-white rounded-lg hover:opacity-90 transition-opacity"
      >
        Try again
      </Button>
    </div>
  )
}

export default function PageLayout({ children }: PageLayoutProps) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => window.location.reload()}
    >
      <div className="h-screen w-screen overflow-hidden flex flex-col">
        <Navbar variant="workspace" />
        <div className="flex-1 w-full relative flex flex-col">{children}</div>
      </div>
    </ErrorBoundary>
  )
}
