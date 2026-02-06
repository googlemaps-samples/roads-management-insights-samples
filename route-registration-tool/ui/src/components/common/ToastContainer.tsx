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

import { CheckCircle, Close, Error, Info, Warning } from "@mui/icons-material"
import { Alert, Box, CircularProgress, IconButton, Slide } from "@mui/material"
import { useEffect } from "react"

import { useMessageStore } from "../../stores/message-store"

const iconMap = {
  success: <CheckCircle className="w-5 h-5" />,
  error: <Error className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
  warning: <Warning className="w-5 h-5" />,
  loading: <CircularProgress size={20} />,
}

export default function ToastContainer() {
  const messages = useMessageStore((state) => state.messages)
  const dismissMessage = useMessageStore((state) => state.dismissMessage)

  // Clear expired messages periodically (every 500ms for more responsive cleanup)
  useEffect(() => {
    const interval = setInterval(() => {
      useMessageStore.getState().clearExpiredMessages()
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <Box
      className="fixed bottom-4 left-4 z-[9999] flex flex-col gap-2"
      style={{ maxWidth: "400px" }}
    >
      {messages.map((message) => (
        <Slide
          key={message.id}
          direction="right"
          in={true}
          mountOnEnter
          unmountOnExit
        >
          <Alert
            severity={message.type === "loading" ? "info" : message.type}
            icon={iconMap[message.type]}
            onClose={() => dismissMessage(message.id)}
            action={
              <IconButton
                size="small"
                onClick={() => dismissMessage(message.id)}
                className="text-current"
              >
                <Close className="w-4 h-4" />
              </IconButton>
            }
            className="shadow-lg min-w-[300px]"
            sx={{
              borderRadius: "24px",
              "& .MuiAlert-message": {
                flex: 1,
              },
            }}
          >
            <Box>
              <Box className="font-semibold text-sm">{message.message}</Box>
              {message.description && (
                <Box className="text-xs mt-1 opacity-90">
                  {message.description}
                </Box>
              )}
            </Box>
          </Alert>
        </Slide>
      ))}
    </Box>
  )
}
