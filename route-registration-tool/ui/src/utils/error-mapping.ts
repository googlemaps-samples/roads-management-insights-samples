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
 * Error mapping utility for converting technical API errors to user-friendly messages
 */

/**
 * Maps GCP API error messages to user-friendly messages
 */
export function mapGcpError(error: string | Error): string {
  const errorMessage = error instanceof Error ? error.message : error

  // Permission denied errors
  if (
    errorMessage.includes("Permission denied") ||
    errorMessage.includes("permission")
  ) {
    return "You don't have access to this project. Please check your Google Cloud Project permissions."
  }

  // Project not found errors
  if (errorMessage.includes("not found") || errorMessage.includes("404")) {
    return "Project not found. Please verify the project ID."
  }

  // API not enabled errors
  if (
    errorMessage.includes("API") &&
    (errorMessage.includes("not enabled") || errorMessage.includes("disabled"))
  ) {
    return "Cloud Resource Manager API is not enabled. Please enable it in GCP Console."
  }

  // Resource Manager specific errors
  if (
    errorMessage.includes("cloudresourcemanager") ||
    errorMessage.includes("resourcemanager")
  ) {
    return "Cloud Resource Manager API is not enabled or you don't have access. You can still manually enter your project ID."
  }

  // Authentication errors
  if (errorMessage.includes("auth") || errorMessage.includes("credential")) {
    return "Authentication failed. Please run 'gcloud auth login' in your terminal."
  }

  // Generic API errors
  if (
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("Network")
  ) {
    return "Unable to connect to GCP. Please check your internet connection."
  }

  // Default fallback
  return "Unable to verify project. Please try again or check your GCP configuration."
}

/**
 * Maps file upload errors to user-friendly messages
 */
export function mapFileUploadError(error: string | Error): string {
  const errorMessage = error instanceof Error ? error.message : error

  if (
    errorMessage.includes("extension") ||
    errorMessage.includes("file type")
  ) {
    return "Invalid file type. Please upload a .json or .geojson file."
  }

  if (
    errorMessage.includes("Polygon") ||
    errorMessage.includes("geometry type")
  ) {
    return "Invalid geometry type. Only Polygon features are supported."
  }

  if (errorMessage.includes("feature") && errorMessage.includes("one")) {
    return "Invalid file. Please upload a GeoJSON with exactly one Polygon feature."
  }

  if (errorMessage.includes("JSON") || errorMessage.includes("parse")) {
    return "Invalid JSON format. Please check your file syntax."
  }

  return errorMessage
}

/**
 * Maps project creation errors to user-friendly messages
 */
export function mapProjectCreationError(error: string | Error): string {
  const errorMessage = error instanceof Error ? error.message : error

  if (
    errorMessage.includes("already exists") ||
    errorMessage.includes("duplicate")
  ) {
    return errorMessage // Already user-friendly from backend
  }

  if (
    errorMessage.includes("GCP project") ||
    errorMessage.includes("Google Cloud")
  ) {
    return errorMessage // Already user-friendly from backend
  }

  return "Failed to create project. Please try again."
}
