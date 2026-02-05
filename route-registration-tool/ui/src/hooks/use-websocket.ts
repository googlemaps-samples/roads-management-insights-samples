import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import { type Route, useProjectWorkspaceStore } from "../stores"
import { useLayerStore } from "../stores/layer-store"
import { WebSocketConnectionState, WebSocketMessage } from "../types/websocket"
import { getWebSocketUrl } from "../utils/websocket-helpers"

interface UseWebSocketOptions {
  projectId: string
  projectNumber: number
  enabled?: boolean
}

interface UseWebSocketReturn {
  connectionState: WebSocketConnectionState
  error: string | null
}

/**
 * WebSocket hook for live route updates
 * Manages connection lifecycle, sends initial message, handles batch updates
 * Auto-reconnects on error with exponential backoff
 */
export function useWebSocket({
  projectId,
  projectNumber,
  enabled = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [connectionState, setConnectionState] =
    useState<WebSocketConnectionState>("disconnected")
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const isConnectingRef = useRef(false)

  const updateRoute = useProjectWorkspaceStore((state) => state.updateRoute)
  const updateRouteTilesFromWebSocket = useLayerStore(
    (state) => state.updateRouteTilesFromWebSocket,
  )
  const queryClient = useQueryClient()

  // Maximum reconnect attempts before giving up
  const MAX_RECONNECT_ATTEMPTS = 2
  // Base delay for exponential backoff (in milliseconds)
  const BASE_RECONNECT_DELAY = 1000

  const connect = () => {
    // Prevent multiple connections - check all active states
    if (wsRef.current) {
      const readyState = wsRef.current.readyState
      if (readyState === WebSocket.OPEN) {
        console.log("🔄 WebSocket already connected, skipping connect")
        return
      }
      if (readyState === WebSocket.CONNECTING) {
        console.log("🔄 WebSocket connection already in progress, skipping")
        return
      }
      // If connection exists but is closing/closed, clean it up first
      if (readyState === WebSocket.CLOSING) {
        console.log("🔄 WebSocket is closing, waiting for cleanup...")
        return
      }
      // Clean up closed connection
      if (readyState === WebSocket.CLOSED) {
        wsRef.current = null
      }
    }

    if (isConnectingRef.current) {
      console.log("🔄 WebSocket connection in progress, skipping")
      return
    }

    if (!enabled) {
      console.log("🔄 WebSocket disabled, skipping connect")
      return
    }

    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    isConnectingRef.current = true
    setConnectionState("connecting")
    setError(null)

    try {
      const wsUrl = getWebSocketUrl()
      console.log("🔌 Connecting to WebSocket:", wsUrl)

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log("✅ WebSocket connected")
        setConnectionState("connected")
        setError(null)
        reconnectAttemptsRef.current = 0
        isConnectingRef.current = false

        // Send initial message
        const initialMessage = {
          project_id: projectId,
          project_number: projectNumber,
        }

        try {
          ws.send(JSON.stringify(initialMessage))
          console.log("📤 Sent initial WebSocket message:", initialMessage)
          console.log(
            "🔍 WebSocket enabled:",
            enabled,
            "projectId:",
            projectId,
            "projectNumber:",
            projectNumber,
          )
        } catch (err) {
          console.error("❌ Failed to send initial message:", err)
          setError("Failed to send initial message")
        }
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          console.log("📥 Received WebSocket message:", message)

          // Handle status messages (connection confirmation)
          if (message.status && !message.type) {
            console.log(
              "✅ WebSocket status:",
              message.status,
              message.warning || "",
            )
            setConnectionState("connected")
            return
          }

          // Handle route status updates
          if (message.type === "route_status_update" && message.data) {
            const statusUpdate = message.data
            console.log(
              "🔄 Received route status update:",
              statusUpdate.route_id,
              statusUpdate.sync_status,
            )

            // Update route in store
            const routeUpdates: Partial<Route> = {
              sync_status: statusUpdate.sync_status,
              lastSyncedAt: statusUpdate.updated_at,
            }

            // Only add route_status if it's a valid value
            if (
              statusUpdate.routes_status === "STATUS_RUNNING" ||
              statusUpdate.routes_status === "STATUS_VALIDATING" ||
              statusUpdate.routes_status === "STATUS_INVALID" ||
              statusUpdate.routes_status === "STATUS_DELETING" ||
              statusUpdate.routes_status === "STATUS_UNSPECIFIED"
            ) {
              routeUpdates.route_status =
                statusUpdate.routes_status as Route["route_status"]
            }

            // Add is_enabled if provided (for segment status updates)
            if (statusUpdate.is_enabled !== undefined) {
              routeUpdates.is_enabled = statusUpdate.is_enabled
            }

            // Update route in Zustand store
            // This will automatically update selectedRoute if it matches (handled in updateRoute)
            updateRoute(statusUpdate.route_id, routeUpdates)

            // CRITICAL: Force refresh selectedRoute if it matches the updated route
            // This ensures React re-renders even if the route was selected before the update
            const store = useProjectWorkspaceStore.getState()
            if (store.selectedRoute?.id === statusUpdate.route_id) {
              // Get the updated route from the routes array (which was just updated)
              const updatedRoute = store.routes.find(
                (r) => r.id === statusUpdate.route_id,
              )
              if (updatedRoute) {
                // Create a new object reference to force React re-render
                useProjectWorkspaceStore.setState({
                  selectedRoute: { ...updatedRoute },
                })
                console.log(
                  "✅ Refreshed selectedRoute from WebSocket:",
                  statusUpdate.route_id,
                  "sync_status:",
                  updatedRoute.sync_status,
                  "route_status:",
                  updatedRoute.route_status,
                )
              }
            }

            // If this is a segment (has parent_route_id), also update the parent route's segments array
            if (statusUpdate.parent_route_id) {
              const parentRoute = useProjectWorkspaceStore
                .getState()
                .routes.find((r) => r.id === statusUpdate.parent_route_id)

              if (parentRoute && parentRoute.segments) {
                const updatedSegments = parentRoute.segments.map((segment) =>
                  segment.uuid === statusUpdate.route_id
                    ? {
                        ...segment,
                        sync_status: statusUpdate.sync_status,
                        routes_status:
                          statusUpdate.routes_status || segment.routes_status,
                        is_enabled:
                          statusUpdate.is_enabled !== undefined
                            ? statusUpdate.is_enabled
                            : segment.is_enabled,
                      }
                    : segment,
                )
                updateRoute(statusUpdate.parent_route_id, {
                  segments: updatedSegments,
                })

                // CRITICAL: Also update selectedRoute if it's the parent route
                const store = useProjectWorkspaceStore.getState()
                if (store.selectedRoute?.id === statusUpdate.parent_route_id) {
                  const updatedParentRoute = store.routes.find(
                    (r) => r.id === statusUpdate.parent_route_id,
                  )
                  if (updatedParentRoute) {
                    useProjectWorkspaceStore.setState({
                      selectedRoute: updatedParentRoute,
                    })
                    console.log(
                      "✅ Updated selectedRoute (parent) from WebSocket segment update:",
                      statusUpdate.parent_route_id,
                    )
                  }
                }

                console.log(
                  "✅ Updated segment in parent route:",
                  statusUpdate.parent_route_id,
                  "segment:",
                  statusUpdate.route_id,
                  "sync_status:",
                  statusUpdate.sync_status,
                  "routes_status:",
                  statusUpdate.routes_status,
                )
              } else {
                console.warn(
                  "⚠️ Parent route not found or has no segments:",
                  statusUpdate.parent_route_id,
                  "parentRoute:",
                  parentRoute,
                )
              }
            }

            // CRITICAL: Invalidate React Query cache to refresh the UI
            // This ensures the infinite routes query refetches and shows updated status
            queryClient.invalidateQueries({
              queryKey: ["routes-infinite"],
            })
            queryClient.invalidateQueries({
              queryKey: ["route", statusUpdate.route_id],
            })
            queryClient.invalidateQueries({
              queryKey: ["routes"],
            })

            // Also update the specific route in cache if it exists
            queryClient.setQueriesData(
              { queryKey: ["route", statusUpdate.route_id] },
              (oldData: Route | undefined) => {
                if (oldData) {
                  return {
                    ...oldData,
                    ...routeUpdates,
                  }
                }
                return oldData
              },
            )

            // Update routes in infinite query cache
            queryClient.setQueriesData(
              { queryKey: ["routes-infinite"] },
              (
                oldData:
                  | {
                      pages: Array<{
                        routes: Route[]
                        pagination: { page: number; hasMore: boolean }
                      }>
                      pageParams: unknown[]
                    }
                  | undefined,
              ) => {
                if (!oldData) return oldData

                return {
                  ...oldData,
                  pages: oldData.pages.map((page) => ({
                    ...page,
                    routes: page.routes.map((route: Route) => {
                      // Update the route itself if it matches
                      if (route.id === statusUpdate.route_id) {
                        return { ...route, ...routeUpdates }
                      }
                      // If this route has segments and the updated route is one of its segments, update the segment
                      if (
                        route.segments &&
                        statusUpdate.parent_route_id === route.id
                      ) {
                        const segmentFound = route.segments.find(
                          (s) => s.uuid === statusUpdate.route_id,
                        )
                        if (segmentFound) {
                          console.log(
                            "🔄 Updating segment in infinite query cache:",
                            statusUpdate.route_id,
                            "in parent:",
                            route.id,
                            "sync_status:",
                            statusUpdate.sync_status,
                          )
                          return {
                            ...route,
                            segments: route.segments.map((segment) =>
                              segment.uuid === statusUpdate.route_id
                                ? {
                                    ...segment,
                                    sync_status: statusUpdate.sync_status,
                                    routes_status:
                                      statusUpdate.routes_status ||
                                      segment.routes_status,
                                    is_enabled:
                                      statusUpdate.is_enabled !== undefined
                                        ? statusUpdate.is_enabled
                                        : segment.is_enabled,
                                  }
                                : segment,
                            ),
                          }
                        }
                      }
                      return route
                    }),
                  })),
                }
              },
            )

            console.log(
              "✅ Updated route status from WebSocket and invalidated React Query cache:",
              statusUpdate.route_id,
            )
          } else if (message.batch && Array.isArray(message.batch)) {
            // Update route tiles with batch updates
            const updates = message.batch.map((item) => ({
              selected_route_id: item.selected_route_id,
              current_duration_in_seconds: item.current_duration_in_seconds,
              static_duration_in_seconds: item.static_duration_in_seconds,
              speed_reading_intervals: item.speed_reading_intervals,
              retrieval_time: item.retrieval_time,
            }))

            // Update route tiles for each route in the batch
            updates.forEach((update) => {
              updateRouteTilesFromWebSocket(update.selected_route_id)
            })
            console.log(
              "✅ Updated route tiles from WebSocket batch:",
              updates.length,
              "updates",
            )
          } else {
            console.warn(
              "⚠️ Received unexpected WebSocket message format:",
              message,
            )
          }
        } catch (err) {
          console.error("❌ Failed to parse WebSocket message:", err)
          setError("Failed to parse WebSocket message")
        }
      }

      ws.onerror = (event) => {
        console.error("❌ WebSocket error:", event)
        setConnectionState("error")
        setError("WebSocket connection error")
        isConnectingRef.current = false
      }

      ws.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason)
        setConnectionState("disconnected")
        isConnectingRef.current = false

        // Clean up the reference
        if (wsRef.current === ws) {
          wsRef.current = null
        }

        // Attempt reconnection if enabled and not a normal closure
        // Only reconnect if we don't already have an active connection
        if (enabled && event.code !== 1000) {
          // Double-check we don't have another connection
          if (
            wsRef.current?.readyState === WebSocket.OPEN ||
            wsRef.current?.readyState === WebSocket.CONNECTING
          ) {
            console.log("🔄 Another connection exists, skipping reconnect")
            return
          }

          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            const delay =
              BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current)

            console.log(
              `🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`,
            )

            reconnectTimeoutRef.current = setTimeout(() => {
              // Check again before reconnecting
              if (
                !wsRef.current ||
                (wsRef.current.readyState !== WebSocket.OPEN &&
                  wsRef.current.readyState !== WebSocket.CONNECTING)
              ) {
                reconnectAttemptsRef.current++
                connect()
              } else {
                console.log("🔄 Connection already exists, skipping reconnect")
                reconnectAttemptsRef.current = 0 // Reset counter if connection exists
              }
            }, delay)
          } else {
            console.error("❌ Max reconnection attempts reached, giving up")
            setError("Failed to reconnect after multiple attempts")
            reconnectAttemptsRef.current = 0 // Reset for future attempts
          }
        }
      }

      wsRef.current = ws
    } catch (err) {
      console.error("❌ Failed to create WebSocket:", err)
      setConnectionState("error")
      setError(
        err instanceof Error ? err.message : "Failed to create WebSocket",
      )
      isConnectingRef.current = false
    }
  }

  const disconnect = () => {
    // Clear reconnect timeout to prevent reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    // Close WebSocket connection if it exists
    if (wsRef.current) {
      const readyState = wsRef.current.readyState
      if (
        readyState === WebSocket.OPEN ||
        readyState === WebSocket.CONNECTING
      ) {
        // Remove event handlers to prevent reconnection logic from firing
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.close(1000, "Client disconnecting")
      }
      wsRef.current = null
    }

    setConnectionState("disconnected")
    setError(null)
    reconnectAttemptsRef.current = 0
    isConnectingRef.current = false
  }

  // Connect when enabled and projectId/projectNumber are available
  useEffect(() => {
    // Only connect if enabled and we have valid project data
    if (enabled && projectId && projectNumber) {
      // Double-check no connection exists before connecting
      if (
        !wsRef.current ||
        (wsRef.current.readyState !== WebSocket.OPEN &&
          wsRef.current.readyState !== WebSocket.CONNECTING)
      ) {
        connect()
      } else {
        console.log(
          "🔄 WebSocket connection already exists, skipping useEffect connect",
        )
      }
    } else {
      disconnect()
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectId, projectNumber])

  return {
    connectionState,
    error,
  }
}
