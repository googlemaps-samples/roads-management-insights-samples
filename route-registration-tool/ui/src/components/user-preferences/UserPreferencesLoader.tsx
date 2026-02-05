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

