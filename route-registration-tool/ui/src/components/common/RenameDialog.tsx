import { InfoOutlined } from "@mui/icons-material"
import { Box, TextField, Typography } from "@mui/material"
import React, { useEffect } from "react"
import { useForm } from "react-hook-form"

import { PRIMARY_BLUE, PRIMARY_BLUE_DARK } from "../../constants/colors"
import Button from "./Button"
import Modal from "./Modal"

interface RenameFormData {
  name: string
}

interface RenameDialogProps {
  open: boolean
  currentName: string
  onClose: () => void
  onSave: (newName: string) => Promise<void> | void
  title?: string
  label?: string
  isLoading?: boolean
  maxLength?: number
  minLength?: number
  formId?: string
  warningMessage?: string
}

const RenameDialog: React.FC<RenameDialogProps> = ({
  open,
  currentName,
  onClose,
  onSave,
  title = "Rename",
  label = "Name",
  isLoading = false,
  maxLength = 100,
  minLength,
  formId = "rename-form",
  warningMessage,
}) => {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RenameFormData>({
    defaultValues: {
      name: currentName,
    },
  })

  // Watch the name field to check if it has changed
  const watchedName = watch("name")

  // Reset form when dialog opens or currentName changes
  useEffect(() => {
    if (open) {
      reset({ name: currentName })
    }
  }, [open, currentName, reset])

  const onSubmit = async (data: RenameFormData) => {
    const trimmedName = data.name.trim()

    // Check if name hasn't changed
    if (trimmedName === currentName) {
      onClose()
      reset()
      return
    }

    try {
      await onSave(trimmedName)
      onClose()
      reset()
    } catch (error) {
      // Error handling is expected to be done by the parent component
      // We just need to not close the dialog on error
      console.error("Error renaming:", error)
    }
  }

  const handleCancel = () => {
    onClose()
    reset({ name: currentName })
  }

  const isPending = isSubmitting || isLoading
  // Check if the name has changed (trimmed comparison) and meets validation requirements
  const trimmedWatchedName = watchedName?.trim() || ""
  const hasNameChanged =
    trimmedWatchedName !== currentName.trim() &&
    trimmedWatchedName !== "" &&
    (!minLength || trimmedWatchedName.length >= minLength) &&
    trimmedWatchedName.length <= maxLength

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      title={title}
      sx={{
        zIndex: 20000,
        "& .MuiBackdrop-root": {
          zIndex: 19999,
        },
      }}
      PaperProps={{
        sx: {
          zIndex: 20000,
        },
      }}
      actions={
        <>
          <Button
            onClick={handleCancel}
            variant="text"
            disabled={isPending}
            sx={{
              color: "#5f6368",
              "&:hover": {
                backgroundColor: "rgba(95, 99, 104, 0.08)",
              },
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="contained"
            disabled={isPending || !hasNameChanged}
            sx={{
              backgroundColor: PRIMARY_BLUE,
              color: "#ffffff",
              boxShadow: "0 1px 3px rgba(9, 87, 208, 0.4)",
              "&:hover": {
                backgroundColor: PRIMARY_BLUE_DARK,
                boxShadow: "0 2px 4px rgba(9, 87, 208, 0.4)",
              },
              "&:disabled": {
                backgroundColor: "rgba(0, 0, 0, 0.12)",
                color: "rgba(0, 0, 0, 0.26)",
              },
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {isPending ? "Renaming..." : "Rename"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} id={formId}>
        {warningMessage && (
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1.5,
              backgroundColor: "#e3f2fd",
              borderLeft: "3px solid #1976d2",
              borderRadius: "4px",
              padding: "12px 16px",
              marginTop: "8px",
              marginBottom: "16px",
            }}
          >
            <InfoOutlined
              sx={{
                fontSize: 20,
                color: "#1976d2",
                flexShrink: 0,
              }}
            />
            <Typography
              variant="body2"
              sx={{
                fontSize: "13px",
                color: "#424242",
                lineHeight: 1.6,
                flex: 1,
              }}
            >
              {warningMessage}
            </Typography>
          </Box>
        )}
        <TextField
          autoFocus
          margin="dense"
          label={label}
          type="text"
          fullWidth
          variant="outlined"
          {...register("name", {
            required: `${label} cannot be empty`,
            maxLength: {
              value: maxLength,
              message: `${label} must not exceed ${maxLength} characters`,
            },
            validate: (value) => {
              const trimmed = value.trim()
              if (!trimmed) {
                return `${label} cannot be empty`
              }
              if (minLength && trimmed.length < minLength) {
                return `${label} must be at least ${minLength} characters`
              }
              if (trimmed.length > maxLength) {
                return `${label} must not exceed ${maxLength} characters`
              }
              return true
            },
          })}
          error={!!errors.name}
          helperText={errors.name?.message}
          inputProps={{ maxLength }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleSubmit(onSubmit)()
            }
          }}
          sx={{ mt: warningMessage ? 0 : 2 }}
        />
      </form>
    </Modal>
  )
}

export default RenameDialog
