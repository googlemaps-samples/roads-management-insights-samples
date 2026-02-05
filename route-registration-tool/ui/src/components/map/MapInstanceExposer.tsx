/**
 * Component that exposes the Google Maps instance to window.googleMap
 * This allows the snapshot utility to access the map instance for idle event listening
 */
import { useMap } from "@vis.gl/react-google-maps"
import { useEffect } from "react"

export const MapInstanceExposer: React.FC = () => {
  const map = useMap()

  useEffect(() => {
    if (map) {
      // Expose map instance to window for snapshot utility
      ;(window as any).googleMap = map
      console.log("✓ Map instance exposed to window.googleMap")

      return () => {
        // Cleanup
        delete (window as any).googleMap
      }
    }
  }, [map])

  return null
}

