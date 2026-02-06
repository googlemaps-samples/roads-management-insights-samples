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

// ui/src/utils/clipboard.ts

/**
 * Copy text to clipboard with fallback for older browsers
 * @param text - The text to copy
 * @param label - Optional label for console logging (e.g., 'Road ID', 'Route ID')
 * @returns Promise<boolean> - True if successful, false otherwise
 */
export const copyToClipboard = async (
  text: string,
  label: string = "Text",
): Promise<boolean> => {
  try {
    // Modern clipboard API
    await navigator.clipboard.writeText(text)
    console.log(`✅ ${label} copied to clipboard:`, text)
    return true
  } catch (error) {
    console.warn(`⚠️ Clipboard API failed, trying fallback method:`, error)

    // Fallback method for older browsers
    try {
      const textArea = document.createElement("textarea")
      textArea.value = text
      textArea.style.position = "fixed" // Avoid scrolling to bottom
      textArea.style.left = "-999999px"
      textArea.style.top = "-999999px"
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      const successful = document.execCommand("copy")
      document.body.removeChild(textArea)

      if (successful) {
        console.log(`✅ ${label} copied to clipboard (fallback):`, text)
        return true
      } else {
        console.error(`❌ Failed to copy ${label} using fallback method`)
        return false
      }
    } catch (fallbackError) {
      console.error(`❌ Failed to copy ${label}:`, fallbackError)
      return false
    }
  }
}

/**
 * Format a date string for display
 * @param dateString - ISO date string
 * @returns Formatted date string (e.g., "2 days ago", "Just now")
 */
export const formatRelativeDate = (dateString: string): string => {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSecs < 60) return "Just now"
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`

    // For older dates, show formatted date
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    })
  } catch (error) {
    return dateString
  }
}
