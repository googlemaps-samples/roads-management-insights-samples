import { useMessageStore } from "../stores/message-store"

export type ToastType = "success" | "error" | "info" | "warning" | "loading"

export interface ToastOptions {
  duration?: number
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

/**
 * Common toast utility for all notifications
 * Now routes messages to the message store for display in DynamicIsland
 */
export const toast = {
  /**
   * Show a success toast
   */
  success: (message: string, options?: ToastOptions) => {
    return useMessageStore.getState().addMessage("success", message, {
      description: options?.description,
      duration: options?.duration,
    })
  },

  /**
   * Show an error toast
   */
  error: (message: string, options?: ToastOptions) => {
    return useMessageStore.getState().addMessage("error", message, {
      description: options?.description,
      duration: options?.duration,
    })
  },

  /**
   * Show an info toast
   */
  info: (message: string, options?: ToastOptions) => {
    return useMessageStore.getState().addMessage("info", message, {
      description: options?.description,
      duration: options?.duration,
    })
  },

  /**
   * Show a warning toast
   */
  warning: (message: string, options?: ToastOptions) => {
    return useMessageStore.getState().addMessage("warning", message, {
      description: options?.description,
      duration: options?.duration,
    })
  },

  /**
   * Show a loading toast (returns a toast ID that can be used to update/dismiss)
   */
  loading: (
    message: string,
    options?: ToastOptions & { id?: string | number },
  ) => {
    return useMessageStore.getState().addMessage("loading", message, {
      id: options?.id,
      description: options?.description,
      duration: Infinity, // Loading toasts don't auto-dismiss
    })
  },

  /**
   * Update an existing toast (useful for loading -> success/error transitions)
   */
  update: (
    toastId: string | number,
    message: string,
    type: ToastType,
    options?: ToastOptions,
  ) => {
    useMessageStore.getState().updateMessage(toastId, type, message, {
      description: options?.description,
      duration: options?.duration,
    })
  },

  /**
   * Dismiss a toast by ID
   */
  dismiss: (toastId?: string | number) => {
    useMessageStore.getState().dismissMessage(toastId)
  },

  /**
   * Dismiss all toasts
   */
  dismissAll: () => {
    useMessageStore.getState().dismissAll()
  },

  /**
   * Dismiss error messages matching a pattern (useful for clearing validation errors)
   */
  dismissErrorsByPattern: (pattern: string | RegExp) => {
    useMessageStore.getState().dismissMessagesByPattern(pattern, "error")
  },
}
