/**
 * Form action buttons component
 */
import { Box, Button, CircularProgress } from "@mui/material"

interface FormActionsProps {
  isLoading: boolean
  canSubmit: boolean
  onSubmit: () => void
  onCancel: () => void
}

export default function FormActions({
  isLoading,
  canSubmit,
  onSubmit,
  onCancel,
}: FormActionsProps) {
  return (
    <Box className="flex gap-2 w-full">
      <Button
        onClick={onCancel}
        disabled={isLoading}
        variant="outlined"
        size="small"
        className="flex-1 text-xs py-1.5 rounded-full"
      >
        Cancel
      </Button>
      <Button
        onClick={onSubmit}
        disabled={isLoading || !canSubmit}
        variant="contained"
        size="small"
        className="flex-1 text-xs py-1.5 rounded-full"
      >
        {isLoading ? (
          <>
            <CircularProgress size={12} className="mr-1 text-white" />
            Creating...
          </>
        ) : (
          "Create Project"
        )}
      </Button>
    </Box>
  )
}
