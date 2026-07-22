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

export const SESSION_STORAGE_KEY = "rst_session_id"

export function isValidUuid(value: string): boolean {
  // Accept canonical UUID strings (v4 or otherwise) — backend normalizes via UUID().
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  )
}

export function generateSessionId(): string {
  // Modern browsers support this; fallback isn't necessary for this app target.
  return crypto.randomUUID()
}

export function loadStoredSessionId(): string | null {
  try {
    const v = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (v && isValidUuid(v)) return v
    return null
  } catch {
    return null
  }
}

export function storeSessionId(sessionId: string) {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId)
  } catch {
    // ignore storage failures
  }
}

export function buildSessionPath(sessionId: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`
  return `/${sessionId}${p}`
}
