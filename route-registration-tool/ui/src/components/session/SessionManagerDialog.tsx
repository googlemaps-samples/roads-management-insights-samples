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

import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined"
import LinkIcon from "@mui/icons-material/Link"
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined"
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined"
import ShareIcon from "@mui/icons-material/Share"
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material"
import { alpha } from "@mui/material/styles"
import type { Theme } from "@mui/material/styles"
import type { ReactNode } from "react"
import { useCallback, useMemo, useState } from "react"

import { useSessionId } from "../../hooks/use-session-id"
import { useLinkSession, useLinkedSessions, useUnlinkSession } from "../../hooks/use-api"
import { buildSessionPath } from "../../utils/session"
import { isValidUuid } from "../../utils/session"
import { toast } from "../../utils/toast"
import Button from "../common/Button"
import Modal from "../common/Modal"

function sectionShellSx(theme: Theme) {
  return {
    p: 2,
    borderRadius: "12px",
    border: `1px solid ${theme.palette.divider}`,
    bgcolor:
      theme.palette.mode === "light"
        ? alpha(theme.palette.primary.main, 0.04)
        : alpha(theme.palette.common.white, 0.06),
  } as const
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode
  title: string
  action?: ReactNode
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={1}
      sx={{ mb: 1.25 }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "primary.main",
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
          }}
        >
          {icon}
        </Box>
        <Typography
          component="span"
          sx={{
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: "0.01em",
            color: "text.primary",
            fontFamily: '"Google Sans", sans-serif',
          }}
        >
          {title}
        </Typography>
      </Stack>
      {action}
    </Stack>
  )
}

const fieldSlotProps = {
  input: {
    sx: {
      fontSize: 12,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
  },
} as const

/** Opaque white so fields don’t pick up the section tint behind them. */
const outlinedInputWhiteSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "10px",
    backgroundColor: "#ffffff",
    "&:hover": { backgroundColor: "#ffffff" },
    "&.Mui-focused": { backgroundColor: "#ffffff" },
    "&.Mui-disabled": { backgroundColor: "#ffffff" },
    "&.MuiInputBase-readOnly": { backgroundColor: "#ffffff" },
  },
  "& .MuiInputLabel-root": { fontSize: 11 },
} as const

export default function SessionManagerDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const sessionId = useSessionId()
  const [linkInput, setLinkInput] = useState("")
  const { data: linkedSessions = [] } = useLinkedSessions(sessionId)
  const linkSessionMutation = useLinkSession()
  const unlinkSessionMutation = useUnlinkSession()

  const handleClose = useCallback(() => {
    setLinkInput("")
    onClose()
  }, [onClose])

  const linkedSet = useMemo(() => {
    return new Set(linkedSessions.map((s) => s.toLowerCase()))
  }, [linkedSessions])

  const dashboardLink = useMemo(() => {
    if (!sessionId) return ""
    return `${window.location.origin}${buildSessionPath(sessionId, "/dashboard")}`
  }, [sessionId])

  const linkInputTrimmed = linkInput.trim()

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copied to clipboard", { duration: 1500 })
    } catch {
      toast.error("Failed to copy", { duration: 2500 })
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      PaperProps={{
        sx: {
          borderRadius: "12px",
          overflow: "hidden",
        },
      }}
      title={
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "primary.main",
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
            }}
          >
            <ShareIcon sx={{ fontSize: 20 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="div"
              sx={{
                fontSize: 18,
                fontFamily: '"Google Sans", sans-serif',
                fontWeight: 500,
                color: "#202124",
                lineHeight: 1.3,
                letterSpacing: "0",
              }}
            >
              Share projects
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", fontSize: 12, mt: 0.25, lineHeight: 1.4 }}
            >
              Your link and user ID for this project list
            </Typography>
          </Box>
        </Stack>
      }
      titleSx={{ paddingBottom: "8px" }}
      contentSx={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflowY: "auto",
        paddingTop: "8px",
        paddingBottom: "16px",
      }}
      actionsSx={{
        paddingTop: "8px",
        paddingBottom: "24px",
        borderTop: "none",
      }}
      actions={
        <Button
          variant="contained"
          onClick={handleClose}
          sx={{ minWidth: 88, fontSize: "0.8125rem" }}
        >
          Done
        </Button>
      }
    >
      <Stack spacing={2} sx={{ minHeight: 0, flex: 1 }}>
        <Typography
          variant="body2"
          sx={{
            lineHeight: 1.5,
            color: "text.secondary",
            fontSize: 12,
          }}
        >
          Share your project list with a link, or add another user so their
          projects appear here.
        </Typography>

        <Box sx={(theme) => ({ ...sectionShellSx(theme) })}>
          <SectionHeader
            icon={<PersonOutlinedIcon sx={{ fontSize: 16 }} />}
            title="You"
          />
          <Stack spacing={1.25}>
            <TextField
              label="User ID"
              value={sessionId ?? ""}
              placeholder="No active link"
              fullWidth
              size="small"
              slotProps={fieldSlotProps}
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy user ID" arrow>
                      <span>
                        <IconButton
                          size="small"
                          disabled={!sessionId}
                          aria-label="Copy user ID"
                          onClick={() => {
                            if (!sessionId) return
                            void copyToClipboard(sessionId)
                          }}
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
              sx={outlinedInputWhiteSx}
            />

            <TextField
              label="Projects link"
              value={dashboardLink}
              placeholder="No active link"
              fullWidth
              size="small"
              InputProps={{
                readOnly: true,
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkIcon fontSize="small" sx={{ opacity: 0.65, color: "text.secondary" }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy projects link" arrow>
                      <span>
                        <IconButton
                          size="small"
                          disabled={!dashboardLink}
                          aria-label="Copy projects link"
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
                          <ContentCopyIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
              sx={{
                ...outlinedInputWhiteSx,
                "& .MuiInputBase-input": {
                  fontSize: 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                },
              }}
            />
          </Stack>
        </Box>

        <Box sx={(theme) => ({ ...sectionShellSx(theme) })}>
          <SectionHeader
            icon={<PersonAddOutlinedIcon sx={{ fontSize: 16 }} />}
            title="Link another user"
            action={
              <Chip
                size="small"
                label={`${linkedSessions.length} linked`}
                variant="outlined"
                sx={{
                  height: 24,
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  borderColor: "divider",
                  bgcolor: "background.paper",
                }}
              />
            }
          />
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", mb: 1.5, lineHeight: 1.5, fontSize: 12 }}
          >
            Paste their user ID. They need to open their projects link at least
            once before you can link.
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.25}
            alignItems={{ xs: "stretch", sm: "flex-start" }}
          >
            <TextField
              value={linkInput}
              onChange={(e) => {
                setLinkInput(e.target.value)
              }}
              fullWidth
              size="small"
              placeholder="3f2504e0-4f89-11d3-9a0c-0305e82c3301"
              label="User ID"
              inputProps={{
                "aria-label": "User ID to link",
                spellCheck: false,
              }}
              slotProps={fieldSlotProps}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkIcon fontSize="small" sx={{ opacity: 0.65, color: "text.secondary" }} />
                  </InputAdornment>
                ),
              }}
              sx={outlinedInputWhiteSx}
            />

            <Button
              variant="contained"
              disabled={!sessionId || !linkInputTrimmed || linkSessionMutation.isPending}
              sx={{
                minWidth: { xs: "100%", sm: 118 },
                height: 36,
                fontSize: "0.8125rem",
                whiteSpace: "nowrap",
                flexShrink: 0,
                borderRadius: "10px",
              }}
              onClick={async () => {
                const other = linkInputTrimmed
                if (!isValidUuid(other)) {
                  const msg = "Please enter a valid user ID (UUID)."
                  toast.error(msg)
                  return
                }
                if (sessionId && other.toLowerCase() === sessionId.toLowerCase()) {
                  const msg = "You can’t link to your own user ID."
                  toast.error(msg)
                  return
                }
                if (linkedSet.has(other.toLowerCase())) {
                  const msg = "That user is already linked."
                  toast.info(msg, { duration: 2500 })
                  return
                }

                try {
                  await linkSessionMutation.mutateAsync(other)
                  toast.success("User linked", { duration: 2000 })
                  setLinkInput("")
                } catch (e) {
                  let msg = e instanceof Error ? e.message : "Failed to link user"
                  if (msg === "Session not found." || msg === "Session not found") {
                    msg =
                      "User not found. Ask the other person to open their projects link first."
                  } else if (
                    msg === "Session already linked." ||
                    msg === "Session already linked"
                  ) {
                    msg = "That user is already linked."
                  }
                  toast.error(msg)
                }
              }}
            >
              {linkSessionMutation.isPending ? (
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ py: 0.125 }}>
                  <CircularProgress size={16} thickness={4} sx={{ color: "inherit" }} />
                  <span>Linking…</span>
                </Stack>
              ) : (
                "Link user"
              )}
            </Button>
          </Stack>
        </Box>

        <Box sx={(theme) => ({ ...sectionShellSx(theme) })}>
          <SectionHeader
            icon={<GroupsOutlinedIcon sx={{ fontSize: 16 }} />}
            title="Linked users"
            action={
              <Chip
                size="small"
                label={`${linkedSessions.length} total`}
                variant="outlined"
                sx={{
                  height: 24,
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  borderColor: "divider",
                  bgcolor: "background.paper",
                }}
              />
            }
          />

          {linkedSessions.length === 0 ? (
            <Box
              sx={{
                py: 2.5,
                px: 1.5,
                textAlign: "center",
                borderRadius: "10px",
                border: "1px dashed",
                borderColor: "divider",
                bgcolor: (theme) => alpha(theme.palette.action.hover, 0.2),
              }}
            >
              <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12 }}>
                No one linked yet. Add a user ID above to see their projects here.
              </Typography>
            </Box>
          ) : (
            <Box
              className="pretty-scrollbar"
              sx={{
                maxHeight: 220,
                overflow: "auto",
                borderRadius: "10px",
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
              }}
            >
              <List disablePadding>
                {linkedSessions.map((sid, idx) => (
                  <Box key={sid}>
                    <ListItemButton
                      disableRipple
                      sx={{
                        px: 1.5,
                        py: 1.1,
                        alignItems: "center",
                        "&:hover": { backgroundColor: "action.hover" },
                      }}
                    >
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: "8px",
                          flexShrink: 0,
                          mr: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "primary.main",
                          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                        }}
                      >
                        <ShareIcon sx={{ fontSize: 16 }} />
                      </Box>
                      <ListItemText
                        primary={
                          <Typography
                            variant="body2"
                            sx={{
                              color: "text.primary",
                              fontSize: 12,
                              fontFamily:
                                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                              lineHeight: 1.45,
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {sid}
                          </Typography>
                        }
                        secondary="Linked user"
                        secondaryTypographyProps={{
                          variant: "caption",
                          sx: { mt: 0.25, fontSize: "0.65rem", letterSpacing: "0.02em" },
                        }}
                        sx={{ m: 0, pr: 1 }}
                      />

                      <Stack direction="row" spacing={0.25} alignItems="center">
                        <Tooltip title="Copy ID" arrow>
                          <IconButton
                            size="small"
                            aria-label="Copy linked user ID"
                            onClick={(e) => {
                              e.stopPropagation()
                              void copyToClipboard(sid)
                            }}
                            sx={{
                              borderRadius: 2,
                              color: "text.secondary",
                              "&:hover": { backgroundColor: "action.selected" },
                            }}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove" arrow>
                          <span>
                            <IconButton
                              size="small"
                              disabled={unlinkSessionMutation.isPending}
                              aria-label="Remove linked user"
                              onClick={async (e) => {
                                e.stopPropagation()
                                await unlinkSessionMutation.mutateAsync(sid)
                                toast.success("User unlinked", { duration: 2000 })
                              }}
                              sx={{
                                borderRadius: 2,
                                color: "error.main",
                                "&:hover": {
                                  backgroundColor: (theme) => alpha(theme.palette.error.main, 0.08),
                                },
                              }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </ListItemButton>
                    {idx < linkedSessions.length - 1 && <Divider />}
                  </Box>
                ))}
              </List>
            </Box>
          )}
        </Box>
      </Stack>
    </Modal>
  )
}
