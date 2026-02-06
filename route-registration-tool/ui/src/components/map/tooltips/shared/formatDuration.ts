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
