import { Close as CloseIcon, Search as SearchIcon } from "@mui/icons-material"
import {
  IconButton,
  InputBase,
  SxProps,
  Theme,
  alpha,
  styled,
} from "@mui/material"
import React from "react"

import { PRIMARY_BLUE } from "../../constants/colors"

const Search = styled("div")(({ theme }) => ({
  position: "relative",
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.15),
  "&:hover": {
    backgroundColor: alpha(theme.palette.common.white, 0.25),
  },
  marginLeft: 0,
  width: "100%",
  [theme.breakpoints.up("sm")]: {
    width: "auto",
  },
}))

const SearchIconWrapper = styled("div")(({ theme }) => ({
  padding: theme.spacing(0, 1),
  height: "100%",
  position: "absolute",
  left: 0,
  top: 0,
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1,
}))

const ClearIconWrapper = styled("div")(({ theme }) => ({
  position: "absolute",
  right: 0,
  top: 0,
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1,
  paddingRight: theme.spacing(0.5),
}))

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: "inherit",
  width: "100%",
  "& .MuiInputBase-input": {
    padding: theme.spacing(1, 1, 1, 0),
    // vertical padding + font size from searchIcon
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    width: "100%",
  },
}))

interface SearchBarProps {
  placeholder?: string
  value: string
  onChange: (value: string) => void
  searchSx?: SxProps<Theme>
  inputSx?: SxProps<Theme>
  iconSx?: SxProps<Theme>
  disabled?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

const searchSx = {
  backgroundColor: "#ffffff",
  borderRadius: "24px",
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
  transition:
    "border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  width: "100%",
  maxWidth: "320px",
  minWidth: "200px",
  "&:hover": {
    backgroundColor: "#ffffff",
    borderColor: "#d1d5db",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.08)",
  },
  "&:focus-within": {
    borderColor: PRIMARY_BLUE,
    boxShadow: "0 0 0 3px rgba(9, 87, 208, 0.1), 0 2px 4px rgba(0, 0, 0, 0.08)",
  },
}
const inputSx = {
  color: "#1f2937",
  width: "100%",
  fontSize: "14px",
  "& .MuiInputBase-input": {
    padding: "8px 12px",
    paddingLeft: "calc(1em + 20px)",
    width: "100%",
    "&::placeholder": {
      color: "#9ca3af",
      opacity: 1,
    },
  },
}

const getInputSxWithClear = (hasClearButton: boolean) => ({
  ...inputSx,
  "& .MuiInputBase-input": {
    ...inputSx["& .MuiInputBase-input"],
    paddingRight: hasClearButton ? "calc(1em + 20px)" : "12px",
  },
})

const iconSx = {
  color: "#6b7280",
  fontSize: "18px",
}

const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = "Search…",
  value,
  onChange,
  searchSx: customSearchSx,
  inputSx: customInputSx,
  iconSx: customIconSx,
  disabled = false,
  onKeyDown,
}) => {
  const hasValue = value.trim().length > 0
  const showClearButton = hasValue && !disabled

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange("")
  }

  // Merge custom inputSx with clear button padding if needed
  const finalInputSx = customInputSx
    ? {
        ...customInputSx,
        "& .MuiInputBase-input": {
          ...(customInputSx as any)["& .MuiInputBase-input"],
          ...(showClearButton
            ? {
                // Override paddingRight to make room for clear button
                // Icon is 18px + button padding 8px + spacing = ~32px minimum
                // Using calc(1em + 20px) for consistency, but ensuring minimum space
                paddingRight: "32px",
              }
            : {}),
        },
      }
    : showClearButton
      ? getInputSxWithClear(true)
      : inputSx

  return (
    <Search sx={customSearchSx || searchSx}>
      <SearchIconWrapper>
        <SearchIcon sx={customIconSx || iconSx} />
      </SearchIconWrapper>
      <StyledInputBase
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        inputProps={{ "aria-label": "search" }}
        sx={finalInputSx}
        disabled={disabled}
      />
      {showClearButton && (
        <ClearIconWrapper>
          <IconButton
            size="small"
            onClick={handleClear}
            sx={{
              padding: "4px",
              color: "#6b7280",
              "&:hover": {
                color: "#374151",
                backgroundColor: "rgba(0, 0, 0, 0.04)",
              },
            }}
            aria-label="clear search"
          >
            <CloseIcon sx={{ fontSize: "18px" }} />
          </IconButton>
        </ClearIconWrapper>
      )}
    </Search>
  )
}

export default SearchBar
