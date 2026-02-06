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

// ui/src/components/markers/PolygonDrawingMarkers.tsx
import { AdvancedMarker } from "@vis.gl/react-google-maps"

import { DestinationIcon } from "../../assets/images"
import { useLayerStore } from "../../stores"

const PolygonDrawingMarkers: React.FC = () => {
  const polygonDrawing = useLayerStore((state) => state.polygonDrawing)

  if (polygonDrawing.points.length === 0) return null

  return (
    <>
      {polygonDrawing.points.map((point, index) => (
        <AdvancedMarker
          key={`polygon-${index}`}
          position={{ lat: point[1], lng: point[0] }}
          draggable={true}
        >
          <img src={DestinationIcon} width={24} height={24} />
        </AdvancedMarker>
      ))}
    </>
  )
}

export default PolygonDrawingMarkers
