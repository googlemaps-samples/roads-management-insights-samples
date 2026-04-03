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

import { useEffect, useMemo, useRef, useState } from "react"

import staticMapImage from "../../assets/images/static_map.png"
import Button from "../../components/common/Button"
import Modal from "../../components/common/Modal"
import ToastContainer from "../../components/common/ToastContainer"
import ProjectGrid from "../../components/dashboard/ProjectGrid"
import Main from "../../components/layout/Main"
import PageLayout from "../../components/layout/PageLayout"
import { useInfiniteProjects } from "../../hooks/use-api"
import DashboardTour from "../../components/tour/DashboardTour"
import { clearAllLayers } from "../../utils/clear-all-layers"
import HelpOutlineIcon from "@mui/icons-material/HelpOutline"
import { IconButton, Tooltip, Typography } from "@mui/material"
import { useSessionId } from "../../hooks/use-session-id"

const DISCLAIMER_STORAGE_KEY = "route_registration_tool_disclaimer_seen"

function getDisclaimerMessage(): string {
  const windowMessage = (window as unknown as Record<string, unknown>)
    .DISCLAIMER_MESSAGE
  const envMessage = import.meta.env.VITE_DISCLAIMER_MESSAGE
  return String(windowMessage ?? envMessage ?? "").trim()
}

function hasDisclaimerBeenSeen(): boolean {
  try {
    return window.localStorage.getItem(DISCLAIMER_STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

export default function DashboardPage() {
  const sessionId = useSessionId()
  const [searchQuery, setSearchQuery] = useState("")
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)
  const [disclaimerMessage, setDisclaimerMessage] = useState<string | null>(null)
  const deferTourUntilDisclaimerRef = useRef(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourStepId, setTourStepId] = useState<string | null>(null)
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteProjects(searchQuery, 24)
  const projects = useMemo(
    () => data?.pages.flatMap((p) => p.projects) ?? [],
    [data],
  )
  const totalProjects = data?.pages[0]?.pagination.total ?? 0
  const routeSummaries = useMemo(
    () =>
      (data?.pages ?? []).reduce<
        Record<string, { total: number; deleted: number; added: number }>
      >((acc, page) => {
        Object.assign(acc, page.route_summaries || {})
        return acc
      }, {}),
    [data],
  )

  // Clear all layers when dashboard mounts
  useEffect(() => {
    clearAllLayers()
  }, [])

  useEffect(() => {
    if (!sessionId) return
    const key = `rst_dashboard_tour_seen_${sessionId}`
    try {
      const seen = window.localStorage.getItem(key) === "true"
      if (seen) return

      const disclaimerMsg = getDisclaimerMessage()
      const disclaimerMustShowFirst =
        disclaimerMsg.length > 0 && !hasDisclaimerBeenSeen()

      if (disclaimerMustShowFirst) {
        deferTourUntilDisclaimerRef.current = true
        return
      }
      deferTourUntilDisclaimerRef.current = false
      queueMicrotask(() => setTourOpen(true))
    } catch {
      deferTourUntilDisclaimerRef.current = false
      queueMicrotask(() => setTourOpen(true))
    }
  }, [sessionId])

  useEffect(() => {
    const message = getDisclaimerMessage()
    if (!message) return
    queueMicrotask(() => setDisclaimerMessage(message))

    try {
      const hasSeen = hasDisclaimerBeenSeen()
      if (!hasSeen) queueMicrotask(() => setDisclaimerOpen(true))
    } catch {
      queueMicrotask(() => setDisclaimerOpen(true))
    }
  }, [])

  const handleDisclaimerClose = () => {
    try {
      window.localStorage.setItem(DISCLAIMER_STORAGE_KEY, "true")
    } catch {
      // Ignore storage failures; user will see disclaimer again next time.
    }
    setDisclaimerOpen(false)

    if (deferTourUntilDisclaimerRef.current && sessionId) {
      deferTourUntilDisclaimerRef.current = false
      try {
        const tourKey = `rst_dashboard_tour_seen_${sessionId}`
        if (window.localStorage.getItem(tourKey) !== "true") {
          queueMicrotask(() => setTourOpen(true))
        }
      } catch {
        queueMicrotask(() => setTourOpen(true))
      }
    }
  }

  const handleTourClose = () => {
    if (sessionId) {
      try {
        window.localStorage.setItem(`rst_dashboard_tour_seen_${sessionId}`, "true")
      } catch {
        // ignore
      }
    }
    setTourOpen(false)
  }

  if (error) {
    return (
      <PageLayout>
        <Main>
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-red-600 mb-4">Failed to load projects</p>
              <p className="text-gray-600">Please try refreshing the page</p>
            </div>
          </div>
        </Main>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <Main>
        <DashboardTour
          open={tourOpen}
          onClose={handleTourClose}
          onStepIdChange={setTourStepId}
        />

        {disclaimerMessage && (
          <Modal
            open={disclaimerOpen}
            onClose={handleDisclaimerClose}
            maxWidth="sm"
            title="Disclaimer"
            actions={
              <Button onClick={handleDisclaimerClose} variant="contained">
                I understand
              </Button>
            }
          >
            <Typography
              variant="body2"
              className="text-gray-700 whitespace-pre-wrap"
            >
              {disclaimerMessage}
            </Typography>
          </Modal>
        )}
        <img
          src={staticMapImage}
          alt="World map background"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
        {/* Splash overlay blur */}
        <div className="absolute inset-0 bg-white/30 backdrop-blur-sm z-0" />

        <ProjectGrid
          projects={projects}
          isLoading={isLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onLoadMore={() => fetchNextPage()}
          hasMore={Boolean(hasNextPage)}
          isLoadingMore={isFetchingNextPage}
          totalProjects={totalProjects}
          routeSummaries={routeSummaries}
          tourStepId={tourOpen ? tourStepId : null}
        />

        {/* Tour launcher */}
        <div className="absolute bottom-6 right-6 z-10">
          <Tooltip title="Take a quick tour" arrow>
            <IconButton
              onClick={() => setTourOpen(true)}
              aria-label="Take a quick tour"
              sx={{
                backgroundColor: "rgba(255, 255, 255, 0.92)",
                border: "1px solid #e5e7eb",
                boxShadow:
                  "0 6px 18px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
                "&:hover": {
                  backgroundColor: "#ffffff",
                  boxShadow:
                    "0 10px 26px rgba(0,0,0,0.14), 0 3px 10px rgba(0,0,0,0.10)",
                },
              }}
            >
              <HelpOutlineIcon />
            </IconButton>
          </Tooltip>
        </div>

        {/* Toast notifications */}
        <ToastContainer />
      </Main>
    </PageLayout>
  )
}
