import { Box, ClickAwayListener, Paper, TextField } from "@mui/material"
import React from "react"
import { createPortal } from "react-dom"

interface TagSelectorProps {
  value: string | null
  onChange: (value: string | null) => void
  onInputChange?: (value: string) => void
  tags: string[]
  error?: string
  helperText?: string
  required?: boolean
  placeholder?: string
  showTagsCount?: boolean
  label?: string
  excludeTags?: string[]
}

const TagSelector: React.FC<TagSelectorProps> = ({
  value,
  onChange,
  onInputChange,
  tags,
  error,
  helperText,
  required = true,
  placeholder,
  label,
  excludeTags = [],
}) => {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value || "")
  const [dropdownPosition, setDropdownPosition] = React.useState<{
    top: number
    left: number
    width: number
  } | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  const MAX_FOLDER_NAME_LENGTH = 100
  const validationError = React.useMemo(() => {
    if (inputValue.length > MAX_FOLDER_NAME_LENGTH) {
      return `Folder name should not exceed ${MAX_FOLDER_NAME_LENGTH} characters`
    }
    return null
  }, [inputValue])

  React.useEffect(() => {
    setInputValue(value || "")
  }, [value])

  const filteredTags = React.useMemo(() => {
    const excludedSet = new Set(excludeTags)
    // Filter out empty string tags from dropdown (keep them separate from "Untagged" but don't show in selector)
    const availableTags = tags.filter(
      (tag) =>
        tag !== "" &&
        !excludedSet.has(tag) &&
        tag.length <= MAX_FOLDER_NAME_LENGTH,
    )

    if (!inputValue) {
      return availableTags
    }
    const lowerInput = inputValue.toLowerCase()
    return availableTags.filter((tag) => tag.toLowerCase().includes(lowerInput))
  }, [tags, inputValue, excludeTags])

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      // Prevent input from exceeding max length
      if (newValue.length > MAX_FOLDER_NAME_LENGTH) {
        return
      }
      setInputValue(newValue)
      if (onInputChange) {
        onInputChange(newValue)
      } else {
        onChange(newValue)
      }
      // Keep dropdown open when typing if there are tags
      const excludedSet = new Set(excludeTags)
      // Filter out empty string tags from dropdown
      const availableTags = tags.filter(
        (tag) => tag !== "" && !excludedSet.has(tag),
      )
      if (availableTags.length > 0 && !open) {
        setOpen(true)
      }
    },
    [onChange, onInputChange, open, tags, excludeTags],
  )

  const updateDropdownPosition = React.useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }
  }, [])

  const handleInputFocus = React.useCallback(() => {
    if (filteredTags.length > 0) {
      updateDropdownPosition()
      setOpen(true)
    }
  }, [filteredTags.length, updateDropdownPosition])

  const handleInputClick = React.useCallback(() => {
    if (filteredTags.length > 0) {
      updateDropdownPosition()
      setOpen(true)
    }
  }, [filteredTags.length, updateDropdownPosition])

  const handleTagClick = React.useCallback(
    (tag: string) => {
      // Prevent selecting tags that exceed max length
      if (tag.length > MAX_FOLDER_NAME_LENGTH) {
        return
      }
      onChange(tag)
      setInputValue(tag)
      setOpen(false)
    },
    [onChange],
  )

  const handleClickAway = React.useCallback(
    (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (
        inputRef.current &&
        !inputRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false)
      }
    },
    [],
  )

  const excludedSet = new Set(excludeTags)
  // Filter out empty string tags when counting available tags
  const availableTagsCount = tags.filter(
    (tag) => tag !== "" && !excludedSet.has(tag),
  ).length
  const defaultPlaceholder =
    availableTagsCount > 0
      ? "Select a folder or type to create new"
      : "Type to create a new folder"

  return (
    <ClickAwayListener onClickAway={handleClickAway}>
      <Box sx={{ position: "relative", width: "100%" }}>
        <TextField
          inputRef={inputRef}
          label={label}
          placeholder={placeholder || defaultPlaceholder}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false)
            }
          }}
          error={!!error || !!validationError}
          helperText={error || validationError || helperText || undefined}
          variant="standard"
          fullWidth
          required={required}
          slotProps={{
            input: {
              sx: {
                fontSize: "0.813rem",
                fontFamily: '"Google Sans", sans-serif',
              },
            },
            inputLabel: {
              sx: {
                fontSize: "0.813rem",
                fontFamily: '"Google Sans", sans-serif',
              },
            },
          }}
        />
        {open &&
          filteredTags.length > 0 &&
          dropdownPosition &&
          createPortal(
            <Paper
              ref={dropdownRef}
              elevation={3}
              sx={{
                position: "absolute",
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`,
                zIndex: 1500,
                borderRadius: "8px",
                border: "1px solid #e0e0e0",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                maxHeight: "300px",
                overflowY: "auto",
              }}
              className="pretty-scrollbar"
            >
              {filteredTags.map((tag) => (
                <Box
                  key={tag}
                  onClick={() => handleTagClick(tag)}
                  sx={{
                    padding: "8px 16px",
                    cursor: "pointer",
                    fontSize: "0.813rem",
                    fontFamily: '"Google Sans", sans-serif',
                    color: "#202124",
                    "&:hover": {
                      backgroundColor: "#f8f9fa",
                    },
                    "&:first-of-type": {
                      borderTopLeftRadius: "8px",
                      borderTopRightRadius: "8px",
                    },
                    "&:last-of-type": {
                      borderBottomLeftRadius: "8px",
                      borderBottomRightRadius: "8px",
                    },
                  }}
                >
                  {tag}
                </Box>
              ))}
            </Paper>,
            document.body,
          )}
      </Box>
    </ClickAwayListener>
  )
}

export default TagSelector
