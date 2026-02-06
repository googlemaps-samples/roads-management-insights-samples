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

interface TypeChipProps {
  type: "road" | "route"
}

export function TypeChip({ type }: TypeChipProps) {
  // Use transparent background with border, matching FeatureSelectionMenu style
  const styles =
    type === "road"
      ? "bg-transparent border border-gray-300 text-gray-700"
      : "bg-transparent border border-blue-300 text-blue-700"
  const label = type === "road" ? "ROAD" : "ROUTE"

  return (
    <div
      className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${styles}`}
    >
      {label}
    </div>
  )
}
