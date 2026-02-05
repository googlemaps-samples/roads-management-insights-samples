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
