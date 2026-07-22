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

import { useParams } from "react-router-dom"

import { isValidUuid, loadStoredSessionId } from "../utils/session"

export function useSessionId(): string | null {
  const params = useParams()
  const fromRoute = params.sessionId
  if (typeof fromRoute === "string" && isValidUuid(fromRoute)) return fromRoute
  return loadStoredSessionId()
}

