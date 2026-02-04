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

/**
 * Demo mode utility functions
 */

// Extend global interfaces to include DEMO_MODE
declare global {
  interface Window {
    DEMO_MODE?: string
  }

  var DEMO_MODE: string | undefined
}

/**
 * Checks if the application is running in demo mode
 * @returns true if demo mode is enabled, false otherwise
 */
export function isDemoMode(): boolean {
  if (typeof window !== "undefined") {
    const demoMode = window.DEMO_MODE
    return demoMode === "true"
  }
  if (typeof globalThis !== "undefined") {
    const demoMode = globalThis.DEMO_MODE
    return demoMode === "true"
  }
  return false
}

/**
 * Sets the application mode for workers
 * @param mode - The mode to set ("demo" or "production")
 */
export function setApplicationMode(mode: "demo" | "production"): void {
  if (typeof globalThis !== "undefined") {
    globalThis.DEMO_MODE = mode === "demo" ? "true" : "false"
  }
  if (typeof window !== "undefined") {
    window.DEMO_MODE = mode === "demo" ? "true" : "false"
  }
}
