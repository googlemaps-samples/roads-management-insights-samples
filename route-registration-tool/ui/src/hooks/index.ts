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

// Custom hooks exports
export { useFileUploadHandlers } from "./use-file-upload-handlers"
export { useLayerManagement } from "./use-layer-management"
export { useMapModeHandlers } from "./use-map-mode-handlers"
export { usePolygonHandlers } from "./use-polygon-handlers"
export { useSyncRoutesHandler } from "./use-sync-routes"
export { useTemporalStore } from "./use-temporal-store"

// Existing hooks - use-api.ts exports individual hooks, not a single useApi hook
export * from "./use-api"
export { useDebouncedValue } from "./use-debounced-value"
export { useDeckLayers } from "./use-deck-layers"
export { useMapEvents } from "./useMapEvents"
export { useNavigateToGeometry } from "./use-navigate-to-geometry"
export { useRouteGeneration } from "./use-route-generation"
export { useTerraDraw } from "./useTerraDraw"
export { useWebSocket } from "./use-websocket"
