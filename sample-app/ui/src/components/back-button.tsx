// Copyright 2025 Google LLC
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

interface BackButtonProps {
  onClick: () => void
  title?: string
  subtitle?: string
  color?: string
  icon?: React.ReactNode
}

export const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  subtitle,
  icon,
}) => {
  return (
    <div
      className="flex items-center justify-between mb-6 px-3 py-2 rounded-md bg-white border border-gray-200 shadow-sm cursor-pointer transition-colors duration-200 hover:bg-gray-50"
      onClick={onClick}
    >
      {/* Left side with back button */}
      <div className="flex items-center gap-1.5">
        {/* Back arrow */}
        <div className="w-2.5 h-2.5 border-l-2 border-t-2 border-gray-600 border-r-0 border-b-0 transform -rotate-45" />

        {/* Back text */}
        <span className="text-xs text-gray-600 font-medium font-sans">
          Back
        </span>
      </div>

      {/* Right side with subtitle and optional icon */}
      {subtitle && (
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-gray-800 font-sans">
            {subtitle}
          </span>
        </div>
      )}
    </div>
  )
}
