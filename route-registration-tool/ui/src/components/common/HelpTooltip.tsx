import { HelpOutline } from "@mui/icons-material"
import { Box, IconButton, Link, Popover, Typography } from "@mui/material"
import { useEffect, useRef, useState } from "react"

interface HelpTooltipProps {
  title: string
  description: string
  gifUrl?: string
  linkUrl?: string
  linkText?: string
  placement?: "top" | "bottom" | "left" | "right"
}

export default function HelpTooltip({
  title,
  description,
  gifUrl,
  linkUrl,
  linkText,
  placement = "right",
}: HelpTooltipProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isHoveringRef = useRef(false)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleMouseEnter = (event: React.MouseEvent<HTMLElement>) => {
    // Clear any pending close timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    isHoveringRef.current = true
    // Use the button element as anchor, or the current target
    const buttonElement =
      (event.currentTarget as HTMLElement).querySelector("button") ||
      event.currentTarget
    setAnchorEl(buttonElement as HTMLElement)
  }

  const handleMouseLeave = () => {
    // Don't immediately set isHoveringRef to false
    // Give time to move to the popover
    timeoutRef.current = setTimeout(() => {
      if (!isHoveringRef.current) {
        setAnchorEl(null)
      } else {
        // If we're still hovering (over popover), keep it open
        isHoveringRef.current = false
      }
    }, 100)
  }

  const handlePopoverMouseEnter = () => {
    // Cancel any pending close timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    isHoveringRef.current = true
  }

  const handlePopoverMouseLeave = () => {
    isHoveringRef.current = false
    // Close when leaving the popover
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setAnchorEl(null)
  }

  const open = Boolean(anchorEl)

  return (
    <>
      <Box
        component="span"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        sx={{ display: "inline-flex" }}
      >
        <IconButton
          size="small"
          className="p-0.5"
          sx={{ color: "text.secondary" }}
        >
          <HelpOutline className="w-4 h-4 cursor-help" />
        </IconButton>
      </Box>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handlePopoverMouseLeave}
        anchorOrigin={{
          vertical: "center",
          horizontal:
            placement === "left"
              ? "left"
              : placement === "right"
                ? "right"
                : placement === "top"
                  ? "center"
                  : placement === "bottom"
                    ? "center"
                    : "center",
        }}
        transformOrigin={{
          vertical: "center",
          horizontal:
            placement === "left"
              ? "right"
              : placement === "right"
                ? "left"
                : placement === "top"
                  ? "center"
                  : placement === "bottom"
                    ? "center"
                    : "center",
        }}
        disableRestoreFocus
        disableAutoFocus
        disableEnforceFocus
        slotProps={{
          paper: {
            onMouseEnter: handlePopoverMouseEnter,
            onMouseLeave: handlePopoverMouseLeave,
            className: "max-w-xs p-3 rounded-lg",
            elevation: 8,
            sx: {
              boxShadow:
                "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
              marginLeft:
                placement === "right"
                  ? "8px"
                  : placement === "left"
                    ? "-8px"
                    : "0px",
              marginTop:
                placement === "top"
                  ? "-8px"
                  : placement === "bottom"
                    ? "8px"
                    : "0px",
            },
          },
        }}
      >
        <Box
          className="space-y-2"
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
        >
          <Typography variant="caption" className="font-semibold text-xs">
            {title}
          </Typography>
          <Typography
            variant="caption"
            className="text-mui-secondary whitespace-pre-line text-xs leading-relaxed"
          >
            {description}
          </Typography>

          {gifUrl && (
            <Box className="flex justify-center">
              <img
                src={gifUrl}
                alt="Help illustration"
                className="max-w-full h-auto rounded border border-gray-200"
              />
            </Box>
          )}

          {linkUrl && linkText && (
            <Box>
              <Link
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-mui-primary hover:underline text-xs"
              >
                {linkText} →
              </Link>
            </Box>
          )}
        </Box>
      </Popover>
    </>
  )
}
