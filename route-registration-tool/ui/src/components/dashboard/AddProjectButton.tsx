import { Add, AddLocationAltRounded } from "@mui/icons-material"
import { Box, Card, CardActionArea, Typography, alpha } from "@mui/material"

interface AddProjectButtonProps {
  onClick: () => void
}

export default function AddProjectButton({ onClick }: AddProjectButtonProps) {
  return (
    <Card
      elevation={0}
      sx={{
        border: "2px dashed",
        borderColor: "divider",
        borderRadius: 2,
        bgcolor: "transparent",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        "&:hover": {
          borderColor: "primary.main",
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
          transform: "translateY(-1px)",
        },
      }}
    >
      <CardActionArea
        onClick={onClick}
        sx={{
          p: 0,
          "&:hover .MuiCardActionArea-focusHighlight": {
            opacity: 0,
          },
        }}
      >
        <Box sx={{ px: 2.5, py: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {/* Add icon without background */}
            <AddLocationAltRounded
              sx={{
                fontSize: 20,
                color: "primary.main",
                transition: "all 0.2s ease",
              }}
            />

            {/* Text */}
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 500,
                  color: "text.secondary",
                  transition: "color 0.2s ease",
                }}
              >
                Add new project
              </Typography>
            </Box>

            {/* Plus icon */}
            <Add
              sx={{
                color: "text.disabled",
                fontSize: 20,
                transition: "all 0.2s ease",
              }}
            />
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  )
}
