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

import { useEffect } from "react"

import { useUserPreferences } from "../../hooks/use-api"

/**
 * Component that loads user preferences on app startup
 * This ensures preferences are available throughout the app
 */
export default function UserPreferencesLoader() {
  const { data: preferences, isLoading, error } = useUserPreferences()

  useEffect(() => {
    if (error) {
      console.warn("Failed to load user preferences:", error)
    } else if (preferences) {
      console.log("User preferences loaded:", preferences)
    }
  }, [preferences, error])

  // This component doesn't render anything
  // It just triggers the query to load preferences
  return null
}

