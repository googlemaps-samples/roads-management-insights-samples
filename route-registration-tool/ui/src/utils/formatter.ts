export const toTitleCase = (str: string): string => {
  return str
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (s) => s.toUpperCase())
}

/**
 * Maps sync_status values to status labels matching RouteDetailsPanel
 * sync_status: "unsynced" | "validating" | "synced" | "invalid"
 * Returns: "Unsynced" | "Validating" | "Running" | "Invalid"
 */
export const getSyncStatusLabel = (
  syncStatus?: string | null,
): "Unsynced" | "Validating" | "Running" | "Invalid" => {
  if (!syncStatus) return "Unsynced"

  switch (syncStatus.toLowerCase()) {
    case "synced":
      return "Running"
    case "validating":
      return "Validating"
    case "invalid":
      return "Invalid"
    case "unsynced":
    default:
      return "Unsynced"
  }
}
