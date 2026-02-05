// ui/src/components/markers/SearchMarker.tsx
import { AdvancedMarker } from "@vis.gl/react-google-maps"
import { useEffect, useState } from "react"

import { PRIMARY_BLUE } from "../../constants/colors"

const SearchMarker: React.FC = () => {
  const [coordinates, setCoordinates] = useState<{
    lat: number
    lng: number
  } | null>(null)

  useEffect(() => {
    const handleShowMarker = (event: Event) => {
      const customEvent = event as CustomEvent<{ lat: number; lng: number }>
      setCoordinates(customEvent.detail)
    }

    const handleClearMarker = () => {
      setCoordinates(null)
    }

    window.addEventListener("showSearchMarker", handleShowMarker)
    window.addEventListener("clearSearchMarker", handleClearMarker)
    return () => {
      window.removeEventListener("showSearchMarker", handleShowMarker)
      window.removeEventListener("clearSearchMarker", handleClearMarker)
    }
  }, [])

  if (!coordinates) return null

  return (
    <AdvancedMarker
      position={{ lat: coordinates.lat, lng: coordinates.lng }}
      zIndex={1000}
    >
      <div
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          backgroundColor: PRIMARY_BLUE,
          border: "2px solid white",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.3)",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
          }
        }
      `}</style>
    </AdvancedMarker>
  )
}

export default SearchMarker
