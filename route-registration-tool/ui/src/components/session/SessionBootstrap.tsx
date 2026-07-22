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

import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import {
  generateSessionId,
  loadStoredSessionId,
  storeSessionId,
} from "../../utils/session"

export default function SessionBootstrap() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const stored = loadStoredSessionId()
    const sessionId = stored ?? generateSessionId()
    storeSessionId(sessionId)

    // Preserve path intent for legacy routes (/dashboard, /add-project, /project/:id).
    const legacyPath = location.pathname
    const suffix =
      legacyPath === "/" || legacyPath === "/dashboard"
        ? "/dashboard"
        : legacyPath === "/add-project"
          ? "/add-project"
          : legacyPath.startsWith("/project/")
            ? legacyPath
            : "/dashboard"

    navigate(`/${sessionId}${suffix}`, { replace: true })
  }, [navigate, location.pathname])

  return null
}

