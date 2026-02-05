/**
 * Get WebSocket URL from environment variable or fallback to default
 * @returns WebSocket URL string
 */
export function getWebSocketUrl(): string {
  const wsUrl = import.meta.env.VITE_WS_URL
  if (wsUrl) {
    return wsUrl
  }
  // Fallback to default localhost WebSocket URL
  return "ws://127.0.0.1:8000/ws"
}
