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
