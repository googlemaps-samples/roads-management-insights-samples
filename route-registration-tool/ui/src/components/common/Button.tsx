import {
  Button as MuiButton,
  ButtonProps as MuiButtonProps,
  SxProps,
  Theme,
} from "@mui/material"
import React from "react"

interface ButtonProps extends Omit<MuiButtonProps, "sx"> {
  sx?: SxProps<Theme>
  children?: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ sx, children, ...props }, ref) => {
    return (
      <MuiButton
        ref={ref}
        {...props}
        sx={{
          paddingLeft: "12px",
          paddingRight: "12px",
          textTransform: "none",
          fontSize: "14px",
          fontWeight: 500,
          borderRadius: "999px",
          fontFamily: '"Google Sans", Roboto, Arial, sans-serif',
          ...(sx || {}),
        }}
      >
        {children}
      </MuiButton>
    )
  },
)

Button.displayName = "Button"

export default Button
