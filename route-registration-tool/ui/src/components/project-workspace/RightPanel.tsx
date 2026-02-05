import { ArrowBack, Close } from "@mui/icons-material"
import { Box, IconButton, Paper, Typography } from "@mui/material"
import React from "react"

import { useResponsiveTypography } from "../../utils/typography-utils"

export interface RightPanelProps {
  className?: string
  style?: React.CSSProperties
  dynamicIslandHeight?: number
  maxHeight?: number | string
  title: React.ReactNode
  subtitle?: string
  showBackButton?: boolean
  showCloseButton?: boolean
  headerBackgroundColor?: string
  onBack?: () => void
  onClose?: () => void
  headerContent?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}

const RightPanel: React.FC<RightPanelProps> = ({
  className,
  style,
  dynamicIslandHeight = 0,
  maxHeight,
  title,
  subtitle,
  showBackButton = false,
  showCloseButton = true,
  headerBackgroundColor,
  onBack,
  onClose,
  headerContent,
  children,
  footer,
}) => {
  const typo = useResponsiveTypography()
  const calculatedMaxHeight =
    maxHeight ||
    (dynamicIslandHeight > 0
      ? `calc(100vh - ${dynamicIslandHeight}px - 60px)` // 80px (top) + 22px (DynamicIsland bottom position) + 24px (safety margin)
      : "calc(100vh - 200px - 80px)")

  return (
    <Paper
      elevation={2}
      className={`absolute top-20 right-4 bg-white z-[1000] overflow-hidden ${className || ""}`}
      style={{
        ...style,
        maxHeight:
          typeof calculatedMaxHeight === "number"
            ? `${calculatedMaxHeight}px`
            : calculatedMaxHeight,
      }}
      sx={{
        width: typo.rightPanelWidth,
        borderRadius: "24px",
        border: "none",
        boxShadow:
          "0 4px 16px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1)",
        display: "flex",
        flexDirection: "column",
        height: "fit-content",
        overflow: "hidden",
        overflowX: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #e8eaed",
          backgroundColor: headerBackgroundColor || "#fafafa",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
          {showBackButton && onBack && (
            <IconButton
              size="small"
              onClick={onBack}
              sx={{
                color: "#5f6368",
                "&:hover": {
                  backgroundColor: "#f1f3f4",
                },
              }}
            >
              <ArrowBack fontSize="small" />
            </IconButton>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {typeof title === "string" ? (
              <Typography
                variant="h6"
                component="div"
                sx={{
                  fontSize: "18px",
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 500,
                  color: "#111827",
                  lineHeight: 1.2,
                }}
              >
                {title}
              </Typography>
            ) : (
              <Box
                className="truncate"
                sx={{
                  fontSize: "18px",
                  fontFamily: '"Google Sans", sans-serif',
                  fontWeight: 500,
                  color: "#111827",
                  lineHeight: 1.2,
                  width: "100%",
                  maxWidth: "100%",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {title}
              </Box>
            )}
            {subtitle && (
              <Typography
                variant="body2"
                sx={{
                  fontSize: "0.813rem",
                  fontWeight: 400,
                  color: "#5f6368",
                  fontFamily: '"Google Sans", sans-serif',
                  mt: 0.5,
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {headerContent}
          {showCloseButton && onClose && (
            <IconButton
              size="small"
              onClick={onClose}
              sx={{
                color: "#5f6368",
                "&:hover": {
                  backgroundColor: "#f1f3f4",
                },
              }}
            >
              <Close fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Content */}
      <Box
        className="pretty-scrollbar"
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: 0, // Allow flex children to shrink below content size
        }}
      >
        {children}
      </Box>

      {/* Footer */}
      {footer && (
        <Box
          sx={{
            borderTop: "1px solid #e8eaed",
            backgroundColor: "#ffffff",
          }}
        >
          {footer}
        </Box>
      )}
    </Paper>
  )
}

export default RightPanel
