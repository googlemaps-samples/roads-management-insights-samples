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
import SessionManagerDialog from "../../components/session/SessionManagerDialog"
import DashboardTour from "../../components/tour/DashboardTour"
import { clearAllLayers } from "../../utils/clear-all-layers"
import { toast } from "../../utils/toast"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import HelpOutlineIcon from "@mui/icons-material/HelpOutline"
import LinkIcon from "@mui/icons-material/Link"
import ShareIcon from "@mui/icons-material/Share"
import {
  Box,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material"
import { alpha } from "@mui/material/styles"
import { useSessionId } from "../../hooks/use-session-id"
import { buildSessionPath } from "../../utils/session"

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
  const [sessionIntroOpen, setSessionIntroOpen] = useState(false)
  const deferSessionIntroUntilDisclaimerRef = useRef(false)
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [pendingTourAfterIntro, setPendingTourAfterIntro] = useState(false)
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
    const key = `rst_session_intro_seen_${sessionId}`
    try {
      const seen = window.localStorage.getItem(key) === "true"
      if (seen) return

      const disclaimerMsg = getDisclaimerMessage()
      const disclaimerMustShowFirst =
        disclaimerMsg.length > 0 && !hasDisclaimerBeenSeen()

      if (disclaimerMustShowFirst) {
        deferSessionIntroUntilDisclaimerRef.current = true
        return
      }
      deferSessionIntroUntilDisclaimerRef.current = false
      queueMicrotask(() => setSessionIntroOpen(true))
    } catch {
      deferSessionIntroUntilDisclaimerRef.current = false
      queueMicrotask(() => setSessionIntroOpen(true))
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    const key = `rst_dashboard_tour_seen_${sessionId}`
    try {
      const seen = window.localStorage.getItem(key) === "true"
      if (!seen) {
        // Avoid stacking dialogs on first load by keying off intro "seen" state
        // (not the React state, which may not be set yet due to effect timing).
        const introSeen =
          window.localStorage.getItem(`rst_session_intro_seen_${sessionId}`) ===
          "true"
        if (!introSeen) queueMicrotask(() => setPendingTourAfterIntro(true))
        else queueMicrotask(() => setTourOpen(true))
      }
    } catch {
      queueMicrotask(() => setPendingTourAfterIntro(true))
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

    if (deferSessionIntroUntilDisclaimerRef.current && sessionId) {
      deferSessionIntroUntilDisclaimerRef.current = false
      try {
        const introKey = `rst_session_intro_seen_${sessionId}`
        if (window.localStorage.getItem(introKey) !== "true") {
          queueMicrotask(() => setSessionIntroOpen(true))
        }
      } catch {
        queueMicrotask(() => setSessionIntroOpen(true))
      }
    }
  }

  const handleSessionIntroClose = () => {
    if (sessionId) {
      try {
        window.localStorage.setItem(`rst_session_intro_seen_${sessionId}`, "true")
      } catch {
        // ignore
      }
    }
    setSessionIntroOpen(false)

    if (pendingTourAfterIntro) {
      setPendingTourAfterIntro(false)
      queueMicrotask(() => setTourOpen(true))
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

  const dashboardLink =
    sessionId && typeof window !== "undefined"
      ? `${window.location.origin}${buildSessionPath(sessionId, "/dashboard")}`
      : ""

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copied to clipboard", { duration: 1500 })
    } catch {
      toast.error("Failed to copy", { duration: 2500 })
    }
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
        {sessionId && (
          <Modal
            open={sessionIntroOpen}
            onClose={handleSessionIntroClose}
            maxWidth="sm"
            title={
              <Typography
                component="div"
                sx={{
                  fontSize: 18,
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 500,
                  color: "#202124",
                  lineHeight: "24px",
                  letterSpacing: "0",
                }}
              >
                Your session workspace
              </Typography>
            }
            titleSx={{ paddingBottom: "4px" }}
            contentSx={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflowY: "auto",
              paddingTop: "16px",
              paddingBottom: "8px",
            }}
            actionsSx={{ paddingTop: "4px", paddingBottom: "16px" }}
            actions={
              <div className="flex gap-2">
                <Button variant="contained" onClick={handleSessionIntroClose}>
                  Got it
                </Button>
              </div>
            }
          >
            <Stack spacing={3} sx={{ minHeight: 0, flex: 1 }}>
              <Typography
                variant="body1"
                sx={{
                  lineHeight: 1.55,
                  color: "text.primary",
                  letterSpacing: "0.1px",
                }}
              >
                This dashboard is tied to a session link. Anyone with the link can
                access it (link-based sharing).
              </Typography>

              <Stack spacing={1.75}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    color: "text.primary",
                    letterSpacing: "0.15px",
                    fontSize: 13,
                    display: "block",
                    mb: 0.25,
                  }}
                >
                  Your session
                </Typography>

                <Stack spacing={1.75}>
                  <TextField
                    label="Session ID"
                    value={sessionId}
                    fullWidth
                    size="small"
                    InputProps={{
                      readOnly: true,
                      sx: {
                        fontSize: 13,
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      },
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="Copy session ID" arrow>
                            <span>
                              <IconButton
                                size="small"
                                aria-label="Copy session ID"
                                onClick={() => void copyToClipboard(sessionId)}
                                sx={{
                                  borderRadius: 2,
                                  color: "text.secondary",
                                  "&:hover": { backgroundColor: "action.hover" },
                                }}
                              >
                                <ContentCopyIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      "& .MuiInputLabel-root": { fontSize: 12 },
                    }}
                  />

                  <TextField
                    label="Dashboard link"
                    value={dashboardLink}
                    fullWidth
                    size="small"
                    InputProps={{
                      readOnly: true,
                      startAdornment: (
                        <InputAdornment position="start">
                          <LinkIcon fontSize="small" style={{ opacity: 0.7 }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="Copy dashboard link" arrow>
                            <span>
                              <IconButton
                                size="small"
                                disabled={!dashboardLink}
                                aria-label="Copy dashboard link"
                                onClick={() => {
                                  if (!dashboardLink) return
                                  void copyToClipboard(dashboardLink)
                                }}
                                sx={{
                                  borderRadius: 2,
                                  color: "text.secondary",
                                  "&:hover": { backgroundColor: "action.hover" },
                                }}
                              >
                                <ShareIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      "& .MuiInputLabel-root": { fontSize: 12 },
                      "& .MuiInputBase-input": {
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      },
                    }}
                  />
                </Stack>
              </Stack>

              <Box
                sx={(theme) => {
                  const br = theme.shape.borderRadius
                  return {
                  borderRadius:
                    typeof br === "number" ? `${br}px` : br,
                  border: `1px solid ${alpha(theme.palette.text.primary, 0.23)}`,
                  backgroundColor: theme.palette.background.paper,
                  px: 1.75,
                  py: 1.5,
                  transition: theme.transitions.create(["border-color"], {
                    duration: theme.transitions.duration.shorter,
                  }),
                  "@media (hover: hover)": {
                    "&:hover": {
                      borderColor: alpha(theme.palette.text.primary, 0.87),
                    },
                  },
                }
                }}
              >
                <Stack spacing={1}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: "text.primary",
                      letterSpacing: "0.15px",
                      fontSize: 13,
                    }}
                  >
                    Link another session
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      lineHeight: 1.55,
                      fontSize: 13,
                    }}
                  >
                    View projects from another session in this workspace. The other
                    person must open their session link at least once.
                  </Typography>
                  <Button
                    variant="text"
                    onClick={() => setSessionManagerOpen(true)}
                    startIcon={
                      <LinkIcon sx={{ fontSize: 18, opacity: 0.85 }} />
                    }
                    sx={{
                      alignSelf: "flex-start",
                      mt: 0.25,
                      ml: -1,
                      minHeight: 36,
                      py: 0.5,
                      px: 1,
                      fontSize: 13,
                      fontWeight: 500,
                      textTransform: "none",
                      color: "primary.main",
                      "& .MuiButton-startIcon": { mr: 0.75 },
                    }}
                  >
                    Manage session sharing
                  </Button>
                </Stack>
              </Box>
            </Stack>
          </Modal>
        )}

        {sessionId && (
          <SessionManagerDialog
            open={sessionManagerOpen}
            onClose={() => setSessionManagerOpen(false)}
          />
        )}

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
