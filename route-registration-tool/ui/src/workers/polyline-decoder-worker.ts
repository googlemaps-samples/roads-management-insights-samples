// Web Worker for batch polyline decoding
import { decodePolylineToGeoJSON } from "../utils/polyline-decoder"

interface DecodePolylineMessage {
  type: "DECODE_POLYLINES"
  payload: {
    polylines: Array<{ key: string; encoded: string }>
  }
}

interface PolylinesDecodedMessage {
  type: "POLYLINES_DECODED"
  payload: {
    decoded: Array<[string, number[][]]> // Array of [key, coordinates] pairs for JSON serialization
  }
}

interface ErrorMessage {
  type: "ERROR"
  payload: {
    error: string
  }
}

self.onmessage = (e: MessageEvent<DecodePolylineMessage>) => {
  const { type, payload } = e.data

  if (type === "DECODE_POLYLINES") {
    try {
      const { polylines } = payload
      const decoded: Array<[string, number[][]]> = []

      // Batch decode all polylines
      for (const { key, encoded } of polylines) {
        try {
          const decodedGeoJson = decodePolylineToGeoJSON(encoded)
          if (
            decodedGeoJson.coordinates &&
            decodedGeoJson.coordinates.length >= 2
          ) {
            decoded.push([key, decodedGeoJson.coordinates])
          }
        } catch (error: any) {
          console.warn(
            `[polyline-decoder-worker] Failed to decode polyline ${key}:`,
            error,
          )
          // Continue with other polylines even if one fails
        }
      }

      // Send decoded results back
      const response: PolylinesDecodedMessage = {
        type: "POLYLINES_DECODED",
        payload: { decoded },
      }
      self.postMessage(response)
    } catch (error: any) {
      const errorResponse: ErrorMessage = {
        type: "ERROR",
        payload: { error: error.message || "Unknown error decoding polylines" },
      }
      self.postMessage(errorResponse)
    }
  }
}
