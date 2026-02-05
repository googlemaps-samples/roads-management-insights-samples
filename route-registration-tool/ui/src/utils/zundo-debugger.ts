import { useLayerStore } from "../stores/layer-store"

// Update path as needed

export default function zundoDebugger() {
  // 1. Access the specific "temporal" store that Zundo creates
  // Note: Zundo v2 uses 'pastStates' and 'futureStates'
  const temporalState = useLayerStore.temporal.getState()

  // 2. Access the current "present" state from your main store
  const presentState = useLayerStore.getState()

  console.group("🕒 Zundo History Debugger")

  // PAST: Array of partial states (snapshots of what you allowed in 'partialize')
  console.log("⏮️ Past States:", temporalState.pastStates)

  // PRESENT: The active, full state of your application
  console.log("📍 Present State:", presentState.roadImport)

  // FUTURE: Array of states waiting to be 'Redone'
  console.log("⏭️ Future States:", temporalState.futureStates)

  console.groupEnd()
}
