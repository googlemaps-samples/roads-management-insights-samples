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

import { useEffect, useState } from "react"

import { useLayerStore } from "../stores"

/**
 * Hook for accessing temporal store (undo/redo) functionality
 * Provides reactive updates when temporal state changes
 */
export const useTemporalStore = () => {
  const [temporalState, setTemporalState] = useState(() =>
    useLayerStore.temporal.getState(),
  )

  // Subscribe to temporal store changes for reactive updates
  useEffect(() => {
    const unsubscribe = useLayerStore.temporal.subscribe((state) => {
      setTemporalState(state)
    })

    return unsubscribe
  }, [])

  return {
    undo: temporalState.undo,
    redo: temporalState.redo,
    clear: temporalState.clear,
    canUndo: temporalState.pastStates.length > 0,
    canRedo: temporalState.futureStates.length > 0,
    undoDepth: temporalState.pastStates.length,
    redoDepth: temporalState.futureStates.length,
  }
}
