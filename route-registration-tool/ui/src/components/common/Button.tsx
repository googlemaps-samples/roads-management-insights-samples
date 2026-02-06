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
