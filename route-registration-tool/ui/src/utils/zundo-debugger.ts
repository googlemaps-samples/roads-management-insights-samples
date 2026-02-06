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
