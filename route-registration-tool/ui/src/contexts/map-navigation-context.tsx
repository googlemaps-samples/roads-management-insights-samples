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

import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react"

import { useNavigateToGeometry } from "../hooks/use-navigate-to-geometry"

interface NavigateToGeometryOptions {
  padding?:
    | number
    | { top: number; right: number; bottom: number; left: number }
}

type NavigateToGeometryFunction = (
  geometry:
    | { encodedPolyline: string }
    | { linestring: GeoJSON.LineString }
    | string,
  options?: NavigateToGeometryOptions,
) => void

interface MapNavigationContextValue {
  navigateToGeometry: NavigateToGeometryFunction | null
  setNavigateToGeometry: (fn: NavigateToGeometryFunction | null) => void
}

const MapNavigationContext = createContext<MapNavigationContextValue>({
  navigateToGeometry: null,
  setNavigateToGeometry: () => {},
})

interface MapNavigationProviderProps {
  children: ReactNode
}

/**
 * Provider component that provides navigation functionality
 * The actual navigation function is set by MapNavigationSetter component inside the Map
 */
export const MapNavigationProvider: React.FC<MapNavigationProviderProps> = ({
  children,
}) => {
  const [navigateToGeometry, setNavigateToGeometryState] =
    useState<NavigateToGeometryFunction | null>(null)

  const setNavigateToGeometry = useCallback(
    (fn: NavigateToGeometryFunction | null) => {
      console.log("🧭 MapNavigationProvider: Setting navigation function", {
        hasFunction: !!fn,
      })
      setNavigateToGeometryState((prev: NavigateToGeometryFunction | null) => {
        console.log("🧭 MapNavigationProvider: State update", {
          previousValue: !!prev,
          newValue: !!fn,
        })
        return fn
      })
    },
    [], // Empty deps - we want a stable setter function
  )

  const contextValue = useMemo(
    () => ({
      navigateToGeometry,
      setNavigateToGeometry,
    }),
    [navigateToGeometry, setNavigateToGeometry],
  )

  return (
    <MapNavigationContext.Provider value={contextValue}>
      {children}
    </MapNavigationContext.Provider>
  )
}

/**
 * Component that must be used inside a Map component to set up navigation
 * This component uses the hook and sets the navigation function in the context
 */
interface MapNavigationSetterProps {
  mapId?: string
}

export const MapNavigationSetter: React.FC<MapNavigationSetterProps> = ({
  mapId = "main-map",
}) => {
  const { setNavigateToGeometry } = useMapNavigation()
  const navigateToGeometry = useNavigateToGeometry(mapId)

  // ✅ Use refs to track previous values and avoid unnecessary updates
  const hasSetFunction = useRef(false)
  const prevNavigateFn = useRef(navigateToGeometry)
  const prevMapId = useRef(mapId)

  React.useEffect(() => {
    // Only update if function or mapId actually changed
    const functionChanged = prevNavigateFn.current !== navigateToGeometry
    const mapIdChanged = prevMapId.current !== mapId

    if (functionChanged) {
      prevNavigateFn.current = navigateToGeometry
      hasSetFunction.current = false
    }

    if (mapIdChanged) {
      prevMapId.current = mapId
      hasSetFunction.current = false
    }

    // Only set function if it's available and hasn't been set yet
    if (
      setNavigateToGeometry &&
      navigateToGeometry &&
      (!hasSetFunction.current || functionChanged || mapIdChanged)
    ) {
      setNavigateToGeometry(navigateToGeometry)
      hasSetFunction.current = true
      console.log("🧭 MapNavigationSetter: Function set in context", { mapId })
    }
  }, [navigateToGeometry, setNavigateToGeometry, mapId])

  return null
}

/**
 * Hook to access the map navigation context
 * Returns the navigateToGeometry function or null if map is not available
 */
export const useMapNavigation = (): MapNavigationContextValue => {
  const context = useContext(MapNavigationContext)
  if (!context) {
    console.warn("useMapNavigation must be used within a MapNavigationProvider")
    return { navigateToGeometry: null, setNavigateToGeometry: () => {} }
  }
  return context
}
