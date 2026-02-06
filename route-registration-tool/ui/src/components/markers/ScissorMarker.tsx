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

export default function ScissorMarker() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 120 80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g>
        {/* Arms connecting handles to pivot */}
        <path
          d="M45 28 L58 40 L45 52"
          fill="none"
          stroke="black"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Top blade */}
        <path fill="black" d="M58 40 L95 25 L98 30 L58 43 Z" />

        {/* Bottom blade */}
        <path fill="black" d="M58 40 L95 55 L98 50 L58 37 Z" />

        {/* Handles */}
        <circle cx="45" cy="28" r="8" fill="black" />
        <circle cx="45" cy="52" r="8" fill="black" />

        {/* Pivot screw (White for contrast) */}
        <circle cx="58" cy="40" r="3" fill="white" />
      </g>
    </svg>
  )
}
