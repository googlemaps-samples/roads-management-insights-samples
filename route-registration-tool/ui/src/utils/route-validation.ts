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
