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

import { Box } from "@mui/material"
import React, { useCallback, useEffect, useRef } from "react"

import { createDronePath, processPolylines } from "../../data/landing-page"

declare global {
  interface Window {
    mapLoaded?: boolean
  }
}

const Map3DBackground = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const polylinesRef = useRef<any[]>([])
  const animationRefs = useRef<{
    colorInterval?: NodeJS.Timeout
    alertInterval?: NodeJS.Timeout
    droneInterval?: NodeJS.Timeout
  }>({})
  const initStartedRef = useRef(false)

  // Calculate bearing between two points
  const calculateBearing = useCallback(
    (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const dLng = ((lng2 - lng1) * Math.PI) / 180
      const lat1Rad = (lat1 * Math.PI) / 180
      const lat2Rad = (lat2 * Math.PI) / 180

      const y = Math.sin(dLng) * Math.cos(lat2Rad)
      const x =
        Math.cos(lat1Rad) * Math.sin(lat2Rad) -
        Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)

      let bearing = (Math.atan2(y, x) * 180) / Math.PI
      bearing = (bearing + 360) % 360

      return bearing
    },
    [],
  )

  // Add route segments to map using 3D polylines
  const addRouteSegments = useCallback(
    async (
      map: any,
      routes: {
        coordinates: { lat: number; lng: number }[]
        color: string
      }[],
    ) => {
      if (!map || !window.google?.maps) {
        return
      }

      try {
        // Import the 3D polyline library
        const maps3d = (await window.google.maps.importLibrary("maps3d")) as any
        const { Polyline3DElement, AltitudeMode } = maps3d

        routes.forEach((route) => {
          const polylineOptions = {
            strokeColor: route.color,
            outerColor: "#0b11d9", // No transparency for better visibility
            outerWidth: 0.1,
            strokeWidth: 15, // Very thick for maximum visibility
            altitudeMode: AltitudeMode.RELATIVE_TO_GROUND,
            extruded: false, // Keep extrusion for 3D prominence
            drawsOccludedSegments: true,
          }

          const polyline = new Polyline3DElement(polylineOptions)

          // Use coordinates directly from polyline data
          polyline.coordinates = route.coordinates

          // Append to map
          map.append(polyline)
          polylinesRef.current.push(polyline)
        })
      } catch (error) {
        console.error("❌ Error adding 3D polylines:", error)
      }
    },
    [],
  )

  // Start alert markers with 3D markers
  const startAlertMarkers = useCallback(async (map: any, routes: any[]) => {
    if (!map || !window.google?.maps) return

    try {
      // Import the 3D marker libraries
      const maps3d = (await window.google.maps.importLibrary(
        "maps3d",
      )) as google.maps.Maps3DLibrary
      const { Marker3DElement } = maps3d as any

      // Track which route segments already have alerts
      const alertSegments = new Set<string>()

      const addRandomAlerts = () => {
        // Find routes that are currently red (congested)
        const redRoutes = routes.filter((_, index) => {
          const polyline = polylinesRef.current[index]
          return polyline?.strokeColor?.includes("#bd2a2a")
        })

        if (redRoutes.length === 0) return // No red routes to add alerts to

        // Add 1-3 alerts only on red routes
        const numAlerts = 1 + Math.floor(Math.random() * 3)

        for (let i = 0; i < numAlerts; i++) {
          // Select a random red route
          const randomRoute =
            redRoutes[Math.floor(Math.random() * redRoutes.length)]

          // Find a segment that doesn't already have an alert
          let attempts = 0
          let randomPoint
          let segmentKey

          do {
            randomPoint =
              randomRoute.coordinates[
                Math.floor(Math.random() * randomRoute.coordinates.length)
              ]
            // Create a unique key for this segment (rounded coordinates to avoid exact duplicates)
            segmentKey = `${Math.round(randomPoint.lat * 1000)},${Math.round(randomPoint.lng * 1000)}`
            attempts++
          } while (alertSegments.has(segmentKey) && attempts < 10)

          // If we found a unique segment, add the alert
          if (!alertSegments.has(segmentKey)) {
            alertSegments.add(segmentKey)

            // Create 3D marker with exclamation icon using SVG template
            const exclamationIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="22" fill="#ff4444" stroke="#ffffff" stroke-width="3"/>
  <path fill="#ffffff" d="M22 12h4v16h-4zm2 30a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
</svg>`

            // Parse the SVG and create a template
            const parser = new DOMParser()
            const svgElement = parser.parseFromString(
              exclamationIconSvg,
              "image/svg+xml",
            ).documentElement

            const marker = new Marker3DElement({
              position: {
                lat: randomPoint.lat,
                lng: randomPoint.lng,
                altitude: 100, // Slightly above ground
              },
              extruded: true,
              altitudeMode: "ABSOLUTE",
            })

            // Create template with custom SVG
            const template = document.createElement("template")
            template.content.append(svgElement)
            marker.append(template)

            map.append(marker)

            // Pulsating animation using CSS transforms
            let growing = true
            setInterval(() => {
              const currentScale = growing ? 1.5 : 0.9
              marker.style.transform = `scale(${currentScale})`

              if (currentScale >= 1.5) growing = false
              if (currentScale <= 0.9) growing = true
            }, 200)
          }
        }
      }

      // Add alerts every 8-12 seconds
      animationRefs.current.alertInterval = setInterval(
        addRandomAlerts,
        8000 + Math.random() * 4000,
      )
      addRandomAlerts() // Initial alerts
    } catch (error) {
      console.error("Error creating 3D alert markers:", error)
    }
  }, [])

  // Complete unified animation from Eiffel Tower revolve to route animation
  const startCompleteAnimation = useCallback(
    (map: any) => {
      if (!map || !window.google?.maps) return

      const dronePath = createDronePath()

      // Eiffel Tower data
      const eiffelTowerLat = 48.8582441923036
      const eiffelTowerLng = 2.2944640877697395

      // Animation timing
      const animationInterval = 16 // 60fps
      const revolveDuration = 15000 // Revolve for 15 seconds (slower to match route speed)
      const routeSpeedPerSecond = 2 // Route animation speed
      const progressPerFrame = (routeSpeedPerSecond * animationInterval) / 1000

      // Animation state
      let isRevolving = true
      let isTransitioning = false
      let isOnRoute = false

      // Route animation variables
      let currentIndex = 0
      let currentHeading = 0
      let currentTilt = 75
      let currentRange = 800
      let currentPoint = dronePath[0]
      let targetPoint = dronePath[1]
      let interpolationProgress = 0
      let smoothedLat = currentPoint.lat
      let smoothedLng = currentPoint.lng
      let targetLat = currentPoint.lat
      let targetLng = currentPoint.lng

      const animateComplete = () => {
        // Phase 1: Revolving around Eiffel Tower (start only once)
        if (isRevolving) {
          // First, smoothly transition to the revolve starting position
          const revolveCamera = {
            center: { lat: eiffelTowerLat, lng: eiffelTowerLng, altitude: 100 },
            range: 1500,
            tilt: 60,
            heading: 0,
          }

          try {
            // Smooth transition to revolve position first
            map.flyCameraTo({
              endCamera: revolveCamera,
              durationMillis: 2500, // 2.5 second transition to revolve position
            })

            // Start the revolve after the transition completes
            setTimeout(() => {
              try {
                map.flyCameraAround({
                  camera: revolveCamera,
                  durationMillis: revolveDuration,
                  rounds: 1,
                })
              } catch (error) {
                console.log("❌ Revolving animation error:", error)
              }
            }, 2500)

            // Set transition to start exactly when revolve should complete
            setTimeout(() => {
              console.log("🔄 Starting transition to route")
              isTransitioning = true
            }, 2500 + revolveDuration)

            isRevolving = false
          } catch (error) {
            console.log("❌ Initial transition error:", error)
          }
          return
        }

        // Phase 2: Transition to route (after revolve completes)
        if (isTransitioning) {
          // Use flyCameraTo for smooth transition to route starting position
          const routeStartLat = dronePath[0].lat
          const routeStartLng = dronePath[0].lng

          try {
            map.flyCameraTo({
              endCamera: {
                center: {
                  lat: routeStartLat,
                  lng: routeStartLng,
                  altitude: 1500,
                },
                tilt: 35,
                range: 50,
              },
              durationMillis: 2500, // Match the speed of other transitions
            })

            // Set a timeout to start route animation after transition completes
            setTimeout(() => {
              // Initialize route animation variables to match transition end position
              currentPoint = dronePath[0]
              targetPoint = dronePath[1]
              smoothedLat = routeStartLat
              smoothedLng = routeStartLng
              targetLat = routeStartLat
              targetLng = routeStartLng
              currentHeading = 0
              currentTilt = 35
              currentRange = 50

              isTransitioning = false
              isOnRoute = true
            }, 2500)
          } catch (error) {
            console.log("❌ Transition animation error:", error)
          }
          return
        }

        // Phase 3: Route animation (after transition completes)
        if (!isOnRoute) return

        if (currentIndex >= dronePath.length - 1) {
          currentIndex = 0
          interpolationProgress = 0
          currentPoint = dronePath[0]
          targetPoint = dronePath[1]
        }

        // Linear interpolation for uniform speed
        const interpolatedLat =
          currentPoint.lat +
          (targetPoint.lat - currentPoint.lat) * interpolationProgress
        const interpolatedLng =
          currentPoint.lng +
          (targetPoint.lng - currentPoint.lng) * interpolationProgress

        // Multi-level smoothing for ultra-smooth movement
        targetLat += (interpolatedLat - targetLat) * 0.05
        targetLng += (interpolatedLng - targetLng) * 0.05
        smoothedLat += (targetLat - smoothedLat) * 0.08
        smoothedLng += (targetLng - smoothedLng) * 0.08

        // Calculate bearing to next point with look-ahead
        const lookAheadIndex = Math.min(currentIndex + 25, dronePath.length - 1)
        const lookAheadPoint = dronePath[lookAheadIndex]
        const targetHeading = calculateBearing(
          smoothedLat,
          smoothedLng,
          lookAheadPoint.lat,
          lookAheadPoint.lng,
        )

        // Ultra-smooth heading transition
        let headingDiff = targetHeading - currentHeading
        if (headingDiff > 180) headingDiff -= 360
        if (headingDiff < -180) headingDiff += 360

        const headingSmoothingFactor = 0.01
        currentHeading += headingDiff * headingSmoothingFactor
        currentHeading = (currentHeading + 360) % 360

        // Ultra-smooth tilt and range changes
        const targetTilt = 35
        const targetRange = 50

        currentTilt += (targetTilt - currentTilt) * 0.005
        currentRange += (targetRange - currentRange) * 0.005

        // Update 3D map view with direct property updates for smooth continuous movement
        try {
          map.center = {
            lat: smoothedLat,
            lng: smoothedLng,
            altitude: 1500,
          }
          map.heading = currentHeading
          map.tilt = currentTilt
          map.range = currentRange
        } catch (error) {
          console.log("❌ Route animation error:", error)
        }

        // Update interpolation progress
        interpolationProgress += progressPerFrame

        if (interpolationProgress >= 1) {
          interpolationProgress = 0
          currentIndex++
          currentPoint = dronePath[currentIndex]
          targetPoint =
            dronePath[Math.min(currentIndex + 1, dronePath.length - 1)]
        }
      }

      // Start the complete animation
      animationRefs.current.droneInterval = setInterval(
        animateComplete,
        animationInterval,
      )
    },
    [calculateBearing],
  )

  useEffect(() => {
    // Prevent duplicate initialization
    if (initStartedRef.current) return
    initStartedRef.current = true

    const waitForGoogleMapsAndInitMap = async (): Promise<void> => {
      const interval = setInterval(() => {
        if (window.mapLoaded === true) {
          clearInterval(interval)
          initMap()
        }
      }, 1)
    }

    const initMap = async () => {
      try {
        // Import the 3D maps library
        const maps3d = (await window.google.maps.importLibrary(
          "maps3d",
        )) as google.maps.Maps3DLibrary
        const { Map3DElement } = maps3d

        if (!mapContainerRef.current) {
          console.log("❌ Map container not available")
          return
        }

        // Clear skeleton and create the 3D map element
        mapContainerRef.current.innerHTML = ""

        // Create the 3D map element
        const map3DElement = new Map3DElement({
          center: {
            lat: 48.852643734232616,
            lng: 2.292483219199886,
            altitude: 300,
          },
          tilt: 80,
          heading: 0,
          mode: "HYBRID", // Needed for map to show
        } as any)

        // Append the map element to the container
        mapContainerRef.current.appendChild(map3DElement)
        mapRef.current = map3DElement

        try {
          const routes = await processPolylines()
          await addRouteSegments(map3DElement, routes)
          await startAlertMarkers(map3DElement, routes)
        } catch (error) {
          console.error("Error loading routes:", error)
        }

        // Delay the start of revolving animation by 2 seconds after everything is loaded
        setTimeout(() => {
          startCompleteAnimation(map3DElement)
        }, 2000)
      } catch (error) {
        console.error("❌ Error initializing 3D map:", error)
      }
    }
    waitForGoogleMapsAndInitMap()

    // Cleanup function
    return () => {
      // Clear all animations
      Object.values(animationRefs.current).forEach((interval) => {
        if (interval) clearInterval(interval)
      })
      animationRefs.current = {}

      // Clear 3D polylines and markers
      polylinesRef.current.forEach((polyline) => {
        if (polyline.remove) {
          polyline.remove()
        }
      })
      polylinesRef.current = []

      // Clear container
      if (mapContainerRef.current) {
        mapContainerRef.current.innerHTML = ""
      }
      mapRef.current = null
    }
  }, []) // Empty dependency array to prevent re-runs

  return (
    <Box
      ref={mapContainerRef}
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0, // Put the map behind everything but still visible
      }}
    />
  )
}

export default React.memo(Map3DBackground)
