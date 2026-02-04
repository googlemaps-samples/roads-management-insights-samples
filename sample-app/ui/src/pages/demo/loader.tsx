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

import { Box, Typography, keyframes, styled } from "@mui/material"
import { useEffect, useState } from "react"

import googleLogo from "../../assets/images/google-maps-platform.svg"
import { DEMO_CITIES } from "../../data/common/demo-cities"
import { fetchHistoricalData } from "../../data/historical/fetcher"
import { fetchRealtimeData } from "../../data/realtime/fetcher"
import { useAppStore } from "../../store"
import { City } from "../../types/city"
import { Mode, Usecase } from "../../types/common"
import { isDemoMode } from "../../utils"

// Type for API response - same as City but with string dates
interface CityApiResponse {
  id: string
  name: string
  coords: { lat: number; lng: number }
  availableDateRanges: {
    startDate: string
    endDate: string
  }
  boundingBox?: {
    minLng: number
    minLat: number
    maxLng: number
    maxLat: number
  }
  boundaryType?: string
  liveDataDate: string
  zoom: number
  customZoom?: { [key in Usecase]?: number }
  useCases: Usecase[]
  mode?: Mode
  timezone: string
}

const shimmer = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: calc(200px + 100%) 0;
  }
`
const Img = styled("img")({
  height: "48px",
  width: "auto",
  "@media (max-width: 768px)": {
    height: "32px",
  },
  display: "flex",
  alignItems: "center",
  marginBottom: "16px",
})

const LoadingContainer = styled(Box)(({ theme }) => ({
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: theme.palette.common.white,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
}))

const LoadingContent = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "32px",
})

const LoadingBar = styled(Box)(({ theme }) => ({
  width: "300px",
  height: "4px",
  backgroundColor: theme.palette.surfaces.tertiary,
  borderRadius: "2px",
  overflow: "hidden",
  position: "relative",
}))

const LoadingProgress = styled(Box)<{ progress: number }>(
  ({ progress, theme }) => ({
    height: "100%",
    width: `${progress}%`,
    background: `linear-gradient(90deg, ${theme.palette.google.blue}, ${theme.palette.google.red}, ${theme.palette.google.yellow}, ${theme.palette.google.green})`,
    borderRadius: "2px",
    transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    backgroundSize: "200px 100%",
    animation: `${shimmer} 1.5s infinite`,
  }),
)

const LoaderTitle = styled(Typography)(({ theme }) => ({
  fontFamily: "Google Sans, sans-serif",
  fontSize: "24px",
  fontWeight: 400,
  color: theme.palette.text.primary,
  marginBottom: "8px",
}))

const LoaderMessage = styled(Typography)(({ theme }) => ({
  fontFamily: "Google Sans, sans-serif",
  fontSize: "14px",
  fontWeight: 400,
  color: theme.palette.text.secondary,
  marginBottom: "24px",
}))

const LoaderTextContainer = styled(Box)({
  textAlign: "center",
  gap: "8px",
})

function useDemoDataPreloader({ onComplete }: { onComplete: () => void }) {
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingMessage, setLoadingMessage] = useState("Initializing...")
  const loadCities = useAppStore((state) => state.loadCities)

  useEffect(() => {
    const demoMode = isDemoMode()
    let isApiComplete = false

    ;(async () => {
      if (demoMode) {
        loadCities(DEMO_CITIES)

        // Get all unique use cases from all cities
        const allUseCases = new Set<Usecase>()
        Object.values(DEMO_CITIES).forEach((city) => {
          city.useCases.forEach((useCase) =>
            allUseCases.add(useCase as Usecase),
          )
        })

        // Load data for each use case, only for applicable cities
        for (const useCase of allUseCases) {
          // Get cities that support this use case
          const applicableCities = Object.keys(DEMO_CITIES).filter((cityId) =>
            DEMO_CITIES[cityId].useCases.includes(useCase),
          )

          // Load data based on use case
          switch (useCase) {
            case "realtime-monitoring":
            case "data-analytics":
              // Load realtime-monitoring/historical and realtime-monitoring/live JSON files
              await Promise.all(
                applicableCities.map(async (cityId) => {
                  try {
                    await Promise.all([
                      fetchHistoricalData(cityId),
                      fetchRealtimeData(cityId),
                    ])
                    console.log(
                      `✅ Loaded realtime-monitoring data (historical + live) for ${cityId}`,
                    )
                  } catch (error) {
                    console.error(
                      `❌ Error loading realtime-monitoring data for ${cityId}:`,
                      error,
                    )
                  }
                }),
              )
              break

            case "route-reliability":
              // Load historical JSON files for route-reliability
              await Promise.all(
                applicableCities.map(async (cityId) => {
                  try {
                    await fetchRealtimeData(cityId)
                    await fetchHistoricalData(cityId)
                    console.log(
                      `✅ Loaded route-reliability data (historical) for ${cityId}`,
                    )
                  } catch (error) {
                    console.error(
                      `❌ Error loading route-reliability data for ${cityId}:`,
                      error,
                    )
                  }
                }),
              )
              break

            default:
              break
          }
        }
      } else {
        // Non-demo mode: Fetch city metadata from API
        try {
          setLoadingMessage("Fetching city metadata...")
          const isLocalEnvironment = import.meta.env.DEV
          const response = await fetch(
            isLocalEnvironment
              ? "http://localhost:8000/api/cities/metadata"
              : "/api/cities/metadata",
          )

          if (!response.ok) {
            throw new Error(
              `Failed to fetch city metadata: ${response.statusText}`,
            )
          }

          const cityMetadata = (await response.json()) as Record<
            string,
            CityApiResponse
          >
          console.log("✅ Fetched city metadata:", cityMetadata)

          // Convert date strings to Date objects for each city
          const citiesWithDates = Object.entries(cityMetadata).reduce(
            (acc, [key, city]) => {
              acc[key] = {
                ...city,
                availableDateRanges: {
                  startDate: new Date(city.availableDateRanges.startDate),
                  endDate: new Date(city.availableDateRanges.endDate),
                },
                liveDataDate: new Date(city.liveDataDate),
              }
              return acc
            },
            {} as Record<string, City>,
          )

          // Load cities directly into the store
          loadCities(citiesWithDates)

          setLoadingMessage("Loading live data...")

          // Preload realtime data for all cities to ensure historical mode works immediately
          const cityIds = Object.keys(citiesWithDates)
          const preloadPromises = cityIds.map(async (cityId) => {
            try {
              await fetchRealtimeData(cityId)
              console.log(`✅ Preloaded realtime data for ${cityId}`)
            } catch (error) {
              console.error(
                `❌ Error preloading realtime data for ${cityId}:`,
                error,
              )
              // Don't fail the entire loading process if one city fails
            }
          })

          // Wait for all realtime data to be preloaded
          await Promise.allSettled(preloadPromises)

          setLoadingMessage(
            "City metadata and realtime data loaded successfully!",
          )
        } catch (error) {
          console.error("❌ Error fetching city metadata:", error)
          setLoadingMessage("Error loading city metadata")
          // Still complete loading even if there's an error
        }

        // Mark API call as complete (only matters in non-demo mode)
        isApiComplete = true
      }
    })()

    const loadingSteps = [
      { progress: 10, delay: 300, message: "Initializing Maps..." },
      { progress: 25, delay: 600, message: "Loading traffic data..." },
      { progress: 40, delay: 1200, message: "Preparing analytics..." },
      { progress: 60, delay: 2000, message: "Processing route segments..." },
      { progress: 80, delay: 3500, message: "Finalizing interface..." },
      { progress: 100, delay: 5000, message: "Ready!" },
    ]

    loadingSteps.forEach(({ progress, delay, message }) => {
      setTimeout(() => {
        setLoadingProgress(progress)
        if (demoMode) {
          setLoadingMessage(message)
        }
      }, delay)
    })

    if (demoMode) {
      // Demo mode: Complete loading after timer
      const demoTimeout = setTimeout(() => {
        onComplete()
      }, 5000)

      return () => {
        clearTimeout(demoTimeout)
      }
    } else {
      // Non-demo mode: Wait for API to complete
      const completionCheck = setInterval(() => {
        if (isApiComplete) {
          clearInterval(completionCheck)
          onComplete()
        }
      }, 100)

      // Fallback: Complete after 10 seconds max
      const fallbackTimeout = setTimeout(() => {
        clearInterval(completionCheck)
        onComplete()
      }, 10000)

      return () => {
        clearInterval(completionCheck)
        clearTimeout(fallbackTimeout)
      }
    }
  }, [loadCities, onComplete])

  return { loadingProgress, loadingMessage }
}

const Loader = ({ onComplete }: { onComplete: () => void }) => {
  const { loadingProgress, loadingMessage } = useDemoDataPreloader({
    onComplete,
  })

  return (
    <LoadingContainer>
      <LoadingContent>
        <Img src={googleLogo} alt="Google Maps Platform" />

        <LoaderTextContainer>
          <LoaderTitle>Roads Management Insights</LoaderTitle>
          <LoaderMessage>{loadingMessage}</LoaderMessage>
        </LoaderTextContainer>

        <LoadingBar>
          <LoadingProgress progress={loadingProgress} />
        </LoadingBar>
      </LoadingContent>
    </LoadingContainer>
  )
}

export default Loader
