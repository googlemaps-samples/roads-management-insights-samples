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

import { LayersList } from "@deck.gl/core"
import { GoogleMapsOverlay } from "@deck.gl/google-maps"
import { useMap } from "@vis.gl/react-google-maps"
import React, { useEffect, useMemo } from "react"

export interface DeckGlOverlayProps {
  layers?: LayersList
}

/**
 * Component that renders a DeckGL overlay on top of a Google Map
 * This handles the connection between DeckGL and the Google Maps API
 */
export const DeckGlOverlay: React.FC<DeckGlOverlayProps> = ({ layers }) => {
  // the GoogleMapsOverlay can persist throughout the lifetime of the DeckGlOverlay
  const deck = useMemo(() => new GoogleMapsOverlay({}), [])

  // add the overlay to the map once the map is available
  const map = useMap()
  useEffect(() => {
    if (map) {
      deck.setMap(map)
      deck.setProps({
        pickingRadius: 10,
        _pickable: true,
      })
    }

    return () => deck.setMap(null)
  }, [deck, map])

  // whenever the rendered data changes, the layers will be updated
  useEffect(() => {
    deck.setProps({ layers })
  }, [deck, layers])

  // no dom rendered by this component
  return null
}

export default DeckGlOverlay
