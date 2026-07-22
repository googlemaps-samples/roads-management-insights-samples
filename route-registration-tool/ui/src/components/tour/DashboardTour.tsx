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

import CheckIcon from "@mui/icons-material/Check"
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CloseIcon from "@mui/icons-material/Close"
import { Box, IconButton, Tooltip, Typography } from "@mui/material"
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

type TourStep = {
  id: string
  title: string
  body: string
  /** Single target; ignored when `selectors` is set. */
  selector?: string
  /** Multiple targets (separate spotlight holes). */
  selectors?: string[]
}

type HighlightRect = {
  top: number
  left: number
  width: number
  height: number
  radius: number
}

const TOUR_Z = 1400
const DIM_RGBA = "rgba(32, 33, 36, 0.58)"
const SPOTLIGHT_PAD = 8

/** Largest px radius from computed border-radius (ignores % for simplicity). */
function parseBorderRadiusPx(radiusCss: string, w: number, h: number): number {
  const cap = Math.min(w, h) / 2
  if (!radiusCss || radiusCss === "none") return 0
  let maxPx = 0
  for (const t of radiusCss.trim().split(/\s+/)) {
    if (t.includes("%")) continue
    const v = parseFloat(t)
    if (Number.isFinite(v)) maxPx = Math.max(maxPx, v)
  }
  return Math.min(maxPx, cap)
}

function stepTargetSelectors(step: TourStep): string[] {
  if (step.selectors?.length) return step.selectors
  if (step.selector) return [step.selector]
  return []
}

function queryHighlightRectForElement(el: Element): HighlightRect | null {
  const r = el.getBoundingClientRect()
  if (!r.width || !r.height) return null

  const style = window.getComputedStyle(el)
  const innerR = parseBorderRadiusPx(style.borderRadius || "0", r.width, r.height)
  const pad = SPOTLIGHT_PAD
  const width = r.width + pad * 2
  const height = r.height + pad * 2
  const radius = Math.min(innerR + pad, Math.min(width, height) / 2)

  return {
    top: Math.max(0, r.top - pad),
    left: Math.max(0, r.left - pad),
    width,
    height,
    radius,
  }
}

function queryHighlightRects(selectors: string[]): HighlightRect[] {
  const out: HighlightRect[] = []
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (!el) continue
    const rect = queryHighlightRectForElement(el)
    if (rect) out.push(rect)
  }
  return out
}

/** Prefer top-most target for tooltip / scroll so the card doesn’t sit in a gap. */
function primaryRectForTourCard(rects: HighlightRect[]): HighlightRect | null {
  if (!rects.length) return null
  return rects.reduce((best, r) =>
    r.top < best.top || (r.top === best.top && r.left < best.left) ? r : best,
  )
}

function scrollTourTargetsIntoView(selectors: string[]) {
  if (selectors.length === 0) return
  const preferEmpty = selectors.find((s) => s.includes("add-project-empty"))
  const ordered = preferEmpty
    ? [preferEmpty, ...selectors.filter((s) => s !== preferEmpty)]
    : selectors
  for (const sel of ordered) {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) continue
    try {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" })
      break
    } catch {
      // ignore
    }
  }
}

type CardPlacement = "below" | "above" | "center"

function computeCardPosition(
  hole: HighlightRect | null,
  vw: number,
  vh: number,
  cardH: number,
): { top: number; left: number; placement: CardPlacement; arrowX: number | null } {
  const margin = 16
  const gap = 16
  const defaultW = Math.min(400, vw - margin * 2)

  if (!hole) {
    return {
      top: (vh - cardH) / 2,
      left: (vw - defaultW) / 2,
      placement: "center",
      arrowX: null,
    }
  }

  const holeCx = hole.left + hole.width / 2
  let top = hole.top + hole.height + gap
  let placement: CardPlacement = "below"

  if (top + cardH > vh - margin) {
    top = hole.top - gap - cardH
    placement = "above"
    if (top < margin) {
      placement = "center"
      top = Math.max(margin, (vh - cardH) / 2)
    }
  }

  const w = Math.min(400, vw - margin * 2)
  let left = holeCx - w / 2
  left = Math.min(Math.max(margin, left), vw - w - margin)

  const arrowX =
    placement === "center"
      ? null
      : Math.min(Math.max(24, holeCx - left), w - 24)

  return { top, left, placement, arrowX }
}

/** Dim + blur with one or more rounded-rect cutouts. */
function TourDimOverlay({ holes }: { holes: HighlightRect[] }) {
  const rawId = useId()
  const maskId = rawId.replace(/:/g, "")
  const vw = typeof window !== "undefined" ? window.innerWidth : 0
  const vh = typeof window !== "undefined" ? window.innerHeight : 0

  const dimStyle = {
    position: "absolute" as const,
    inset: 0,
    background: DIM_RGBA,
    backdropFilter: "blur(5px)",
    WebkitBackdropFilter: "blur(5px)",
    pointerEvents: "auto" as const,
  }

  if (!holes.length || vw <= 0 || vh <= 0) {
    return (
      <div aria-hidden style={dimStyle} />
    )
  }

  return (
    <>
      <svg
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={vw}
            height={vh}
          >
            <rect x={0} y={0} width={vw} height={vh} fill="white" />
            {holes.map((hole, i) => {
              const rx = Math.min(
                hole.radius,
                Math.min(hole.width, hole.height) / 2,
              )
              return (
                <rect
                  key={i}
                  x={hole.left}
                  y={hole.top}
                  width={hole.width}
                  height={hole.height}
                  rx={rx}
                  ry={rx}
                  fill="black"
                />
              )
            })}
          </mask>
        </defs>
      </svg>
      <div
        aria-hidden
        style={{
          ...dimStyle,
          mask: `url(#${maskId})`,
          WebkitMask: `url(#${maskId})`,
          maskMode: "luminance" as const,
        }}
      />
    </>
  )
}

export default function DashboardTour({
  open,
  onClose,
  onStepIdChange,
}: {
  open: boolean
  onClose: () => void
  onStepIdChange?: (stepId: string | null) => void
}) {
  const steps: TourStep[] = useMemo(
    () => [
      {
        id: "search",
        title: "Search projects",
        body: "Use search to quickly find a project by name.",
        selector: "[data-tour='project-search']",
      },
      {
        id: "add",
        title: "Create a project",
        body: "Use New Project in the header, or Create your first project when the list is empty.",
        selectors: [
          "[data-tour='add-project']",
          "[data-tour='add-project-empty']",
        ],
      },
      {
        id: "import",
        title: "Import a project",
        body: "Import a ZIP export to restore a project.",
        selector: "[data-tour='import-project']",
      },
      {
        id: "open-project",
        title: "Open a project",
        body: "Click any project card to open it and start working with routes.",
        selector:
          "[data-tour='first-project-card'], [data-tour='first-project-card-skeleton']",
      },
      {
        id: "share",
        title: "Share projects",
        body: "Use the share icon in the top bar to copy your projects link or add another user so their projects show up here.",
        selector: "[data-tour='session-sharing']",
      },
    ],
    [],
  )

  const [idx, setIdx] = useState(0)
  const step = steps[idx] ?? steps[0]
  const [highlightRects, setHighlightRects] = useState<HighlightRect[]>([])
  const [cardBox, setCardBox] = useState<{
    top: number
    left: number
    width: number
    placement: CardPlacement
    arrowX: number | null
  }>(() => {
    if (typeof window === "undefined") {
      return {
        top: 100,
        left: 24,
        width: 400,
        placement: "center",
        arrowX: null,
      }
    }
    const w = Math.min(400, window.innerWidth - 32)
    return {
      top: Math.max(24, (window.innerHeight - 260) / 2),
      left: (window.innerWidth - w) / 2,
      width: w,
      placement: "center",
      arrowX: null,
    }
  })

  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  const stepSelectors = useMemo(() => stepTargetSelectors(step), [step])

  const updateHighlight = useCallback(() => {
    setHighlightRects(queryHighlightRects(stepTargetSelectors(step)))
  }, [step])

  useEffect(() => {
    if (!onStepIdChange) return
    if (!open) {
      onStepIdChange(null)
      return
    }
    onStepIdChange(step?.id ?? null)
  }, [open, step?.id, onStepIdChange])

  useEffect(() => {
    if (!open) return
    scrollTourTargetsIntoView(stepSelectors)
  }, [open, stepSelectors])

  useEffect(() => {
    if (!open) return
    let raf1 = 0
    let raf2 = 0
    let timeoutId: number | null = null

    updateHighlight()
    raf1 = window.requestAnimationFrame(() => {
      updateHighlight()
      raf2 = window.requestAnimationFrame(updateHighlight)
    })
    timeoutId = window.setTimeout(updateHighlight, 280)

    const observer = new MutationObserver(() => updateHighlight())
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tour", "style", "class"],
    })

    window.addEventListener("resize", updateHighlight)
    window.addEventListener("scroll", updateHighlight, true)
    return () => {
      if (raf1) window.cancelAnimationFrame(raf1)
      if (raf2) window.cancelAnimationFrame(raf2)
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      observer.disconnect()
      window.removeEventListener("resize", updateHighlight)
      window.removeEventListener("scroll", updateHighlight, true)
      setHighlightRects([])
    }
  }, [open, step, updateHighlight])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const cardAnchorRect = useMemo(
    () => primaryRectForTourCard(highlightRects),
    [highlightRects],
  )

  useLayoutEffect(() => {
    if (!open) return
    const el = cardRef.current
    const measure = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const cr = cardRef.current?.getBoundingClientRect()
      const cardH = cr?.height ?? 220
      const pos = computeCardPosition(cardAnchorRect, vw, vh, cardH)
      setCardBox({
        top: pos.top,
        left: pos.left,
        width: Math.min(400, vw - 32),
        placement: pos.placement,
        arrowX: pos.arrowX,
      })
    }
    measure()
    const id = window.requestAnimationFrame(measure)
    let resizeObserver: ResizeObserver | undefined
    if (el && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => measure())
      resizeObserver.observe(el)
    }
    return () => {
      window.cancelAnimationFrame(id)
      resizeObserver?.disconnect()
    }
  }, [open, cardAnchorRect, idx, step.id])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => nextRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open, idx])

  useEffect(() => {
    if (open) return
    queueMicrotask(() => setIdx(0))
  }, [open])

  const isFirst = idx === 0
  const isLast = idx === steps.length - 1

  if (typeof document === "undefined" || !open) return null

  const portal = (
    <div
      className="rst-tour-root"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: TOUR_Z,
        pointerEvents: "none",
      }}
    >
      <TourDimOverlay holes={highlightRects} />

      {highlightRects.map((hr, i) => (
        <div
          key={i}
          aria-hidden
          className="rst-tour-pulse rst-tour-spotlight-ring"
          style={{
            position: "fixed",
            top: hr.top,
            left: hr.left,
            width: hr.width,
            height: hr.height,
            borderRadius: hr.radius,
            pointerEvents: "none",
            zIndex: TOUR_Z + 1,
          }}
        />
      ))}

      <Box
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rst-tour-title"
        className="rst-tour-card-shell"
        sx={{
          position: "fixed",
          top: cardBox.top,
          left: cardBox.left,
          width: cardBox.width,
          maxWidth: "calc(100vw - 32px)",
          zIndex: TOUR_Z + 2,
          pointerEvents: "auto",
          borderRadius: "16px",
          backgroundColor: "#fff",
          boxShadow:
            "0 4px 24px rgba(32, 33, 36, 0.18), 0 12px 48px rgba(32, 33, 36, 0.12)",
          border: "1px solid rgba(32, 33, 36, 0.08)",
          overflow: "hidden",
        }}
      >
        {cardBox.placement === "below" && cardBox.arrowX !== null && (
          <span
            className="rst-tour-arrow rst-tour-arrow--up"
            style={{ left: cardBox.arrowX }}
            aria-hidden
          />
        )}
        {cardBox.placement === "above" && cardBox.arrowX !== null && (
          <span
            className="rst-tour-arrow rst-tour-arrow--down"
            style={{ left: cardBox.arrowX }}
            aria-hidden
          />
        )}

        <Box
          key={step.id}
          className="rst-tour-card-inner"
          sx={{ px: 2.5, pt: 2.25, pb: 1.5 }}
        >
          <Typography
            variant="overline"
            sx={{
              letterSpacing: "0.12em",
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "primary.main",
              display: "block",
              mb: 1,
            }}
          >
            Quick tour · Step {idx + 1} of {steps.length}
          </Typography>

          <Box
            sx={{
              display: "flex",
              gap: 0.75,
              mb: 1.5,
            }}
            aria-hidden
          >
            {steps.map((_, i) => (
              <Box
                key={steps[i].id}
                sx={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor:
                    i === idx ? "primary.main" : "action.hover",
                  opacity: i <= idx ? 1 : 0.45,
                  transition: "background-color 160ms ease, opacity 160ms ease",
                }}
              />
            ))}
          </Box>

          <Typography
            id="rst-tour-title"
            component="h2"
            sx={{
              fontSize: "1.375rem",
              fontFamily: '"Google Sans", sans-serif',
              fontWeight: 500,
              color: "#202124",
              lineHeight: 1.25,
              mb: 1,
            }}
          >
            {step.title}
          </Typography>

          <Typography
            variant="body1"
            sx={{
              color: "text.secondary",
              lineHeight: 1.6,
              fontSize: "0.9375rem",
              mb: 0.5,
            }}
          >
            {step.body}
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 0.75,
            px: 2,
            py: 1.75,
            pt: 1.25,
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "rgba(0, 0, 0, 0.02)",
          }}
        >
          <Tooltip title="Back" arrow>
            <span>
              <IconButton
                onClick={() => setIdx((v) => Math.max(0, v - 1))}
                disabled={isFirst}
                aria-label="Back"
                size="medium"
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  color: "text.primary",
                  bgcolor: "background.paper",
                  "&:hover": {
                    bgcolor: "action.hover",
                    borderColor: "text.secondary",
                  },
                  "&.Mui-disabled": {
                    borderColor: "action.disabledBackground",
                  },
                }}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Close" arrow>
            <IconButton
              onClick={onClose}
              aria-label="Close tour"
              size="medium"
              sx={{
                border: "1px solid",
                borderColor: "divider",
                color: "text.primary",
                bgcolor: "background.paper",
                "&:hover": {
                  bgcolor: "action.hover",
                  borderColor: "text.secondary",
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={isLast ? "Finish" : "Next"} arrow>
            <IconButton
              ref={nextRef}
              onClick={() => {
                if (isLast) onClose()
                else setIdx((v) => Math.min(steps.length - 1, v + 1))
              }}
              aria-label={isLast ? "Finish tour" : "Next step"}
              color="primary"
              size="medium"
              sx={{
                bgcolor: "primary.main",
                color: "primary.contrastText",
                "&:hover": { bgcolor: "primary.dark" },
              }}
            >
              {isLast ? (
                <CheckIcon fontSize="small" />
              ) : (
                <ChevronRightIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </div>
  )

  return createPortal(portal, document.body)
}
