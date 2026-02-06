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

import React from "react"

interface ReverseRouteIconProps {
  sx?: React.CSSProperties
}

export const ReverseRouteIcon: React.FC<ReverseRouteIconProps> = ({ sx }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    style={sx}
  >
    {/* Up arrow (left) */}
    <path d="M9 8l-3 3h2v5h2v-5h2l-3-3z" />
    {/* Down arrow (right) */}
    <path d="M15 16l3-3h-2v-5h-2v5h-2l3 3z" />
  </svg>
)
