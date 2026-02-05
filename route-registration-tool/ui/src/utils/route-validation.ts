export interface RouteNameValidationResult {
  isValid: boolean
  error?: string
}

export const validateRouteName = (name: string): RouteNameValidationResult => {
  const trimmed = name.trim()

  // Required check
  if (!trimmed) {
    return { isValid: false, error: "Route name is required" }
  }

  // Length check
  if (trimmed.length > 100) {
    return {
      isValid: false,
      error: "Route name must not exceed 100 characters",
    }
  }

  return { isValid: true }
}
