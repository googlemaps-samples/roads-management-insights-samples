/**
 * Helper function to format duration in seconds to readable string
 */
export function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "0s"

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`
    } else if (remainingSeconds > 0) {
      return `${hours}h ${remainingSeconds}s`
    } else {
      return `${hours}h`
    }
  } else if (minutes > 0) {
    if (remainingSeconds > 0) {
      return `${minutes}m ${remainingSeconds}s`
    } else {
      return `${minutes}m`
    }
  } else {
    return `${remainingSeconds}s`
  }
}
