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
