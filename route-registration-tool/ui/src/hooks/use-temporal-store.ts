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
