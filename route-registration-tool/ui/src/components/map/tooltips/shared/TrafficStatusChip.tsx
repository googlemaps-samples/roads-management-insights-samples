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
