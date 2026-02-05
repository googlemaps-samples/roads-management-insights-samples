import { create } from "zustand"

export type MessageType = "success" | "error" | "info" | "warning" | "loading"

export interface Message {
  id: string | number
  type: MessageType
  message: string
  description?: string
  timestamp: number
  duration?: number
}

// Store timeout IDs for messages so we can clear them when updating
const messageTimeouts = new Map<string | number, NodeJS.Timeout>()

interface MessageStore {
  messages: Message[]
  addMessage: (
    type: MessageType,
    message: string,
    options?: {
      id?: string | number
      description?: string
      duration?: number
    },
  ) => string | number
  updateMessage: (
    id: string | number,
    type: MessageType,
    message: string,
    options?: {
      description?: string
      duration?: number
    },
  ) => void
  dismissMessage: (id?: string | number) => void
  dismissAll: () => void
  clearExpiredMessages: () => void
  dismissMessagesByPattern: (
    pattern: string | RegExp,
    type?: MessageType,
  ) => void
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: [],

  addMessage: (type, message, options = {}) => {
    const id = options.id || Date.now() + Math.random()
    const duration = options.duration || (type === "loading" ? Infinity : 5000)
    const newMessage: Message = {
      id,
      type,
      message,
      description: options.description,
      timestamp: Date.now(),
      duration,
    }

    set((state) => ({
      messages: [...state.messages, newMessage],
    }))

    // Auto-dismiss non-loading messages after duration
    if (type !== "loading" && duration !== Infinity && duration > 0) {
      // Clear any existing timeout for this message
      const existingTimeout = messageTimeouts.get(id)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
        messageTimeouts.delete(id)
      }

      const timeoutId = setTimeout(() => {
        // When timeout fires, always dismiss the message
        const store = get()
        // Force dismiss - don't check if exists, just remove it
        store.dismissMessage(id)
        messageTimeouts.delete(id)
      }, duration)

      messageTimeouts.set(id, timeoutId)
    }

    return id
  },

  updateMessage: (id, type, message, options = {}) => {
    const duration = options.duration || (type === "loading" ? Infinity : 5000)

    // Clear any existing timeout for this message before updating
    const existingTimeout = messageTimeouts.get(id)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
      messageTimeouts.delete(id)
    }

    const newTimestamp = Date.now()

    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id
          ? {
              ...msg,
              type,
              message,
              description: options.description,
              duration,
              timestamp: newTimestamp,
            }
          : msg,
      ),
    }))

    // Auto-dismiss after duration - ALWAYS set timeout for non-infinite durations
    if (duration !== Infinity && duration > 0) {
      const timeoutId = setTimeout(() => {
        // When timeout fires, always dismiss the message
        // Use getState() to ensure we have the latest store instance
        const currentMessages = get().messages
        const messageStillExists = currentMessages.some((msg) => msg.id === id)

        if (messageStillExists) {
          // Double-check the message hasn't exceeded its duration
          const msg = currentMessages.find((m) => m.id === id)
          if (msg) {
            const elapsed = Date.now() - msg.timestamp
            if (elapsed >= duration) {
              get().dismissMessage(id)
            }
          }
        }
        messageTimeouts.delete(id)
      }, duration)

      messageTimeouts.set(id, timeoutId)
    } else {
      // If duration is Infinity or 0, make sure no timeout exists
      const existingTimeout = messageTimeouts.get(id)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
        messageTimeouts.delete(id)
      }
    }
  },

  dismissMessage: (id) => {
    if (id === undefined) {
      // Clear all timeouts
      messageTimeouts.forEach((timeout) => clearTimeout(timeout))
      messageTimeouts.clear()
      set({ messages: [] })
      return
    }

    // Clear timeout for this specific message
    const timeout = messageTimeouts.get(id)
    if (timeout) {
      clearTimeout(timeout)
      messageTimeouts.delete(id)
    }

    set((state) => {
      const filtered = state.messages.filter((msg) => msg.id !== id)
      // Only update if message was actually removed
      if (filtered.length !== state.messages.length) {
        return { messages: filtered }
      }
      return state
    })
  },

  dismissAll: () => {
    // Clear all timeouts
    messageTimeouts.forEach((timeout) => clearTimeout(timeout))
    messageTimeouts.clear()
    set({ messages: [] })
  },

  dismissMessagesByPattern: (pattern, type) => {
    const regex =
      typeof pattern === "string" ? new RegExp(pattern, "i") : pattern
    const state = get()
    const messagesToDismiss: Array<string | number> = []

    state.messages.forEach((msg) => {
      const matchesPattern =
        regex.test(msg.message) ||
        (msg.description && regex.test(msg.description))
      const matchesType = type === undefined || msg.type === type

      if (matchesPattern && matchesType) {
        messagesToDismiss.push(msg.id)
      }
    })

    // Dismiss all matching messages
    messagesToDismiss.forEach((id) => {
      const timeout = messageTimeouts.get(id)
      if (timeout) {
        clearTimeout(timeout)
        messageTimeouts.delete(id)
      }
    })

    if (messagesToDismiss.length > 0) {
      set((state) => ({
        messages: state.messages.filter(
          (msg) => !messagesToDismiss.includes(msg.id),
        ),
      }))
    }
  },

  clearExpiredMessages: () => {
    const now = Date.now()
    const state = get()
    const expiredMessages: Array<string | number> = []

    state.messages.forEach((msg) => {
      if (msg.type === "loading" || msg.duration === Infinity) {
        return // Keep loading messages and infinite duration messages
      }
      const duration = msg.duration || 5000
      const elapsed = now - msg.timestamp
      const isExpired = elapsed >= duration

      if (isExpired) {
        expiredMessages.push(msg.id)
        // Clear timeout if message is expired
        const timeout = messageTimeouts.get(msg.id)
        if (timeout) {
          clearTimeout(timeout)
          messageTimeouts.delete(msg.id)
        }
      }
    })

    // Remove all expired messages at once - force removal
    if (expiredMessages.length > 0) {
      expiredMessages.forEach((id) => {
        // Force dismiss - clear timeout and remove from messages
        const timeout = messageTimeouts.get(id)
        if (timeout) {
          clearTimeout(timeout)
          messageTimeouts.delete(id)
        }

        // Remove message from state
        set((state) => ({
          messages: state.messages.filter((msg) => msg.id !== id),
        }))
      })
    }
  },
}))
