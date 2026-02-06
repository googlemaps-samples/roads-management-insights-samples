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

interface TrafficStatusChipProps {
  status: "NORMAL" | "SLOW" | "TRAFFIC_JAM" | string | undefined
}

export function TrafficStatusChip({ status }: TrafficStatusChipProps) {
  const getStatusColor = (status: string | undefined): string => {
    switch (status) {
      case "NORMAL":
        return "bg-green-500"
      case "SLOW":
        return "bg-yellow-400"
      case "TRAFFIC_JAM":
        return "bg-red-500"
      default:
        return "bg-yellow-500"
    }
  }

  const getStatusLabel = (status: string | undefined): string => {
    switch (status) {
      case "NORMAL":
        return "NORMAL"
      case "SLOW":
        return "SLOW"
      case "TRAFFIC_JAM":
        return "TRAFFIC JAM"
      default:
        return "NORMAL"
    }
  }

  if (!status) return null

  return (
    <div
      className={`text-xs font-medium px-2 py-0.5 rounded-full text-white whitespace-nowrap flex-shrink-0 ${getStatusColor(status)}`}
    >
      {getStatusLabel(status)}
    </div>
  )
}
