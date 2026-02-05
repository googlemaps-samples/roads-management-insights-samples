/**
 * Utility functions for capturing map snapshots
 */
import html2canvas from "html2canvas-pro"

/**
 * Captures Google Map using the idle event listener approach
 * This is based on a working implementation that waits for map to be fully rendered
 * @param mapElementId - The ID of the map container element
 * @param targetWidth - Target width for the snapshot (default: 1920)
 * @param targetHeight - Target height for the snapshot (default: 1080)
 * @returns Promise<string> - Base64-encoded PNG image
 */
export async function captureGoogleMapWithIdle(
  mapElementId: string = "main-map",
  targetWidth: number = 1920,
  targetHeight: number = 1080,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const mapElement = document.getElementById(mapElementId) as HTMLElement

    if (!mapElement) {
      reject(new Error(`Map element with ID "${mapElementId}" not found`))
      return
    }

    // Try to get the Google Maps instance from the element
    // The vis.gl library stores the map instance in the element's data attributes or internal state
    let mapInstance: google.maps.Map | null = null

    // Method 1: Try to get from window if it's set globally (like in the user's example)
    // This is set by MapInstanceExposer component
    const windowWithMap = window as typeof window & {
      googleMap?: google.maps.Map
    }
    if (windowWithMap.googleMap) {
      mapInstance = windowWithMap.googleMap
    }

    // Method 2: Try to find via vis.gl's internal structure
    // The Map component from @vis.gl/react-google-maps stores the instance
    if (!mapInstance) {
      const mapContainer = mapElement.querySelector('[role="application"]')
      if (mapContainer) {
        // Try various ways to access the map instance
        const container = mapContainer as {
          __map?: google.maps.Map
          map?: google.maps.Map
          _map?: google.maps.Map
          parentElement?: { __map?: google.maps.Map } | null
        }
        mapInstance =
          container.__map ||
          container.map ||
          container._map ||
          container.parentElement?.__map ||
          null
      }
    }

    // Method 3: Try to find via data attributes or React refs
    if (!mapInstance) {
      // Check if the element has a map reference stored
      const element = mapElement as {
        __map?: google.maps.Map
        map?: google.maps.Map
        _map?: google.maps.Map
      }
      mapInstance = element.__map || element.map || element._map || null
    }

    // Method 4: Try to find via Google Maps API - search for map instances in the DOM
    if (!mapInstance) {
      // Google Maps creates divs with specific classes, we can try to find the map instance
      const googleMapDivs = mapElement.querySelectorAll(
        'div[style*="position"][style*="overflow"]',
      )
      for (const div of Array.from(googleMapDivs)) {
        const divWithMap = div as { __map?: google.maps.Map }
        if (divWithMap.__map instanceof google.maps.Map) {
          mapInstance = divWithMap.__map
          break
        }
      }
    }

    // If we can't find the map instance, try to trigger idle by zooming slightly
    // and then capture after a delay
    if (!mapInstance) {
      console.warn(
        "⚠️ Could not find Google Maps instance, using fallback method",
      )
      // Fallback: wait a bit and then capture
      setTimeout(() => {
        captureWithHtml2Canvas(mapElement, targetWidth, targetHeight)
          .then(resolve)
          .catch(reject)
      }, 2000)
      return
    }

    console.log("📸 Waiting for map to be idle before capturing...")

    // Get current zoom and slightly adjust it to trigger idle event
    const currentZoom = mapInstance.getZoom() || 13
    mapInstance.setZoom(currentZoom + 0.001)

    // Listen for idle event
    const idleListener = mapInstance.addListener("idle", () => {
      console.log("✓ Map is idle, capturing snapshot...")

      const elementWidth = mapElement.offsetWidth
      const elementHeight = mapElement.offsetHeight

      if (elementWidth === 0 || elementHeight === 0) {
        reject(new Error("Map element has zero dimensions"))
        return
      }

      const scale = Math.max(
        targetWidth / elementWidth,
        targetHeight / elementHeight,
      )

      console.log(`Capturing at scale ${scale.toFixed(2)}x`)

      html2canvas(mapElement, {
        scale: scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: elementWidth,
        height: elementHeight,
      })
        .then((canvas) => {
          const img = canvas.toDataURL("image/png", 1.0)
          console.log("✓ Snapshot captured successfully")
          resolve(img)
        })
        .catch((error) => {
          console.error("❌ html2canvas failed:", error)
          reject(error)
        })

      // Remove listener
      google.maps.event.removeListener(idleListener)
    })
  })
}

/**
 * Helper function to capture with html2canvas (fallback)
 */
async function captureWithHtml2Canvas(
  mapElement: HTMLElement,
  targetWidth: number,
  targetHeight: number,
): Promise<string> {
  const elementWidth = mapElement.offsetWidth
  const elementHeight = mapElement.offsetHeight

  const scale = Math.max(
    targetWidth / elementWidth,
    targetHeight / elementHeight,
  )

  const canvas = await html2canvas(mapElement, {
    scale: scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: elementWidth,
    height: elementHeight,
  })

  return canvas.toDataURL("image/png", 1.0)
}

/**
 * Captures a snapshot and compresses it for storage
 * Uses the idle event approach for better reliability
 * @param mapElementId - The ID of the map container element
 * @param downloadLocally - Whether to also download the file locally (default: true)
 * @param filename - Optional filename for local download
 * @returns Promise<string> - Compressed base64-encoded image
 */
export async function captureCompressedMapSnapshot(
  mapElementId: string = "main-map",
): Promise<string> {
  // Use the idle event approach for better reliability
  const dataUrl = await captureGoogleMapWithIdle(mapElementId, 1920, 1080)

  return dataUrl
}
