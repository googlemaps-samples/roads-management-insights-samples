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

import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import { debounce } from "@mui/material"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useAppStore } from "../store"
import { City } from "../types/city"

const CityDropdown = () => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedCityFromStore = useAppStore((state) => state.selectedCity)
  const selectCity = useAppStore((state) => state.selectCity)
  const usecase = useAppStore((state) => state.usecase)
  const availableCities = useAppStore((state) => state.availableCities)

  const [localSelectedCity, setLocalSelectedCity] = useState<City>(
    selectedCityFromStore,
  )

  useEffect(() => {
    setLocalSelectedCity(selectedCityFromStore)
  }, [selectedCityFromStore])

  const citiesToShow = useMemo(() => {
    const cities = Object.values(availableCities)
    if (cities.length === 1 && cities[0]?.id === "fallback") {
      return []
    }

    return cities.filter((city) => city.useCases?.includes(usecase))
  }, [usecase, availableCities])

  const debouncedSelectCity = useCallback(
    debounce((cityId: string) => {
      selectCity(cityId)
    }, 300),
    [selectCity],
  )

  const handleSelectCity = (cityId: string) => {
    const newCity = availableCities[cityId]
    if (newCity) {
      setLocalSelectedCity(newCity)
      debouncedSelectCity(cityId)
    }
    setIsOpen(false)
  }

  const handleClickOutside = (event: MouseEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target as Node)
    ) {
      setIsOpen(false)
    }
  }

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      debouncedSelectCity.clear()
    }
  }, [debouncedSelectCity])

  return (
    <div className="relative min-w-[70px]" ref={dropdownRef}>
      {/* Select Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between px-3 py-1.5 rounded-lg border transition-all duration-200 ease-out
          min-h-0
          ${
            isOpen
              ? "bg-[rgba(66,133,244,0.12)] border-[rgba(66,133,244,0.4)] shadow-[0_0_0_3px_rgba(66,133,244,0.2)]"
              : "bg-[rgba(66,133,244,0.08)] border-[rgba(66,133,244,0.2)] hover:bg-[rgba(66,133,244,0.12)] hover:border-[rgba(66,133,244,0.3)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(66,133,244,0.15),0_2px_8px_rgba(66,133,244,0.1)]"
          }
          focus:outline-none focus:ring-0
        `}
      >
        <div className="flex items-center pr-8">
          <LocationOnIcon
            className="w-4 h-4 text-[#4285F4] mr-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)] animate-pulse"
            style={{
              animation: "subtlePulse 3s ease-in-out infinite",
            }}
          />
          <span className="text-[13px] font-semibold text-[#1a1a1a] whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)]">
            {localSelectedCity.name}
          </span>
        </div>
        <KeyboardArrowDownIcon
          className={`w-[18px] h-[18px] text-[#4285F4] absolute right-2 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 w-40 max-w-44 bg-[rgba(255,255,255,0.98)] backdrop-blur-[20px] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15),0_8px_32px_rgba(66,133,244,0.1),0_0_0_1px_rgba(66,133,244,0.1)] border border-[rgba(66,133,244,0.15)] overflow-hidden z-50">
          {/* Menu Header */}
          <div className="px-3 py-2 border-b border-[rgba(66,133,244,0.1)] bg-[rgba(66,133,244,0.02)]">
            <span className="text-xs font-semibold text-[#4285F4] uppercase tracking-[0.5px]">
              Select a city
            </span>
          </div>

          {/* Menu Items */}
          <div className="py-0">
            {Object.values(citiesToShow).map((location: City) => (
              <button
                key={location.id}
                onClick={() => handleSelectCity(location.id)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-xs transition-all duration-150 ease-out
                  ${
                    localSelectedCity.id === location.id
                      ? "bg-[rgba(66,133,244,0.08)] border-l-[3px] border-l-[#4285F4] font-semibold text-[#1a1a1a] hover:bg-[rgba(66,133,244,0.12)]"
                      : "font-medium text-[#5f6368] hover:bg-[rgba(66,133,244,0.04)] hover:translate-x-0.5 hover:text-[#1a1a1a]"
                  }
                `}
              >
                <LocationOnIcon
                  className={`w-3.5 h-3.5 transition-all duration-150 ${
                    localSelectedCity.id === location.id
                      ? "text-[#4285F4] drop-shadow-[0_1px_2px_rgba(66,133,244,0.3)]"
                      : "text-[#5f6368]"
                  }`}
                />
                <span
                  className={
                    localSelectedCity.id === location.id
                      ? "font-semibold"
                      : "font-medium"
                  }
                >
                  {location.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes subtlePulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.9;
          }
        }
      `}</style>
    </div>
  )
}

export default CityDropdown
