import { StateCreator } from "zustand"

import { RoadPriority } from "../../../constants/road-priorities"
import { Road as ProjectRoad } from "../../project-workspace-store"
import { ALL_ROAD_PRIORITIES } from "../constants"
import { LayerStore, RoadSelectionState, RoadsNetworkState } from "../types"

const STORAGE_KEY = "selectedRoadPriorities"

// Save priorities to localStorage
const savePriorities = (priorities: RoadPriority[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(priorities))
  } catch (error) {
    console.warn("Failed to save road priorities to localStorage:", error)
  }
}

export interface RoadsNetworkSlice {
  roadsNetwork: RoadsNetworkState
  roadSelection: RoadSelectionState
  selectedRoadPriorities: RoadPriority[]
  setRoadsNetwork: (roads: ProjectRoad[]) => void
  setRoadsLoading: (isLoading: boolean) => void
  setRoadsError: (error: string | undefined) => void
  clearRoadsNetwork: () => void
  startStretchMode: (
    roads: ProjectRoad[],
    options?: { isPreview?: boolean },
  ) => void
  startMultiSelectMode: (initialRoad: ProjectRoad) => void
  addRoadToSelection: (road: ProjectRoad) => void
  removeRoadFromSelection: (roadId: number) => void
  clearRoadSelection: () => void
  setValidationResult: (result: any) => void
  setValidationStatus: (
    status: "idle" | "validating" | "valid" | "invalid",
  ) => void
  setIsValidating: (isValidating: boolean) => void
  setRoadSelectionError: (error: string | null) => void
  exitSelectionMode: () => void
  setSelectedRoadPriorities: (priorities: RoadPriority[]) => void
  toggleRoadPriorityFilter: (priority: RoadPriority) => void
  resetRoadPriorityFilters: () => void
}

export const createRoadsNetworkSlice: StateCreator<
  LayerStore,
  [],
  [],
  RoadsNetworkSlice
> = (set, get) => ({
  roadsNetwork: {
    roads: [],
    isLoading: false,
    error: undefined,
  },

  roadSelection: {
    mode: "none",
    selectedRoadIds: [],
    highlightedRoads: [],
    validationStatus: "idle",
    validationResult: null,
    isValidating: false,
    error: null,
    isPreview: false,
  },

  selectedRoadPriorities: ALL_ROAD_PRIORITIES,

  setRoadsNetwork: (roads) => {
    set((state) => ({
      roadsNetwork: {
        ...state.roadsNetwork,
        roads,
        isLoading: false,
        error: undefined,
      },
    }))
  },

  setRoadsLoading: (isLoading) => {
    set((state) => ({
      roadsNetwork: {
        ...state.roadsNetwork,
        isLoading,
      },
    }))
  },

  setRoadsError: (error) => {
    set((state) => ({
      roadsNetwork: {
        ...state.roadsNetwork,
        error,
        isLoading: false,
      },
    }))
  },

  clearRoadsNetwork: () => {
    set(() => ({
      roadsNetwork: {
        roads: [],
        isLoading: false,
        error: undefined,
      },
    }))
  },

  startStretchMode: (roads, options = {}) => {
    const { isPreview = false } = options
    set((state) => ({
      roadSelection: {
        ...state.roadSelection,
        mode: "stretch",
        selectedRoadIds: roads.map((r) => parseInt(r.id)),
        highlightedRoads: roads,
        validationStatus: "valid",
        validationResult: null,
        isValidating: false,
        error: null,
        isPreview,
      },
    }))
  },

  startMultiSelectMode: (initialRoad) => {
    set((state) => ({
      roadSelection: {
        ...state.roadSelection,
        mode: "multi-select",
        selectedRoadIds: [parseInt(initialRoad.id)],
        highlightedRoads: [initialRoad],
        validationStatus: "idle",
        validationResult: null,
        isValidating: false,
        error: null,
        isPreview: false,
      },
    }))
  },

  addRoadToSelection: (road) => {
    const { roadSelection } = get()
    const roadId = parseInt(road.id)

    if (roadSelection.selectedRoadIds.includes(roadId)) {
      return
    }

    set((state) => ({
      roadSelection: {
        ...state.roadSelection,
        selectedRoadIds: [...state.roadSelection.selectedRoadIds, roadId],
        highlightedRoads: [...state.roadSelection.highlightedRoads, road],
        isPreview: false,
      },
    }))
  },

  removeRoadFromSelection: (roadId) => {
    set((state) => ({
      roadSelection: {
        ...state.roadSelection,
        selectedRoadIds: state.roadSelection.selectedRoadIds.filter(
          (id) => id !== roadId,
        ),
        highlightedRoads: state.roadSelection.highlightedRoads.filter(
          (r) => parseInt(r.id) !== roadId,
        ),
        isPreview: false,
      },
    }))
  },

  clearRoadSelection: () => {
    set(() => ({
      roadSelection: {
        mode: "none",
        selectedRoadIds: [],
        highlightedRoads: [],
        validationStatus: "idle",
        validationResult: null,
        isValidating: false,
        error: null,
        isPreview: false,
      },
    }))
  },

  setValidationResult: (result) => {
    set((state) => ({
      roadSelection: {
        ...state.roadSelection,
        validationResult: result,
        validationStatus: result?.is_continuous ? "valid" : "invalid",
        isPreview: false,
      },
    }))
  },

  setValidationStatus: (status) => {
    set((state) => ({
      roadSelection: {
        ...state.roadSelection,
        validationStatus: status,
        isPreview: false,
      },
    }))
  },

  setIsValidating: (isValidating) => {
    set((state) => ({
      roadSelection: {
        ...state.roadSelection,
        isValidating,
        isPreview: false,
      },
    }))
  },

  setRoadSelectionError: (error) => {
    set((state) => ({
      roadSelection: {
        ...state.roadSelection,
        error,
        isPreview: false,
      },
    }))
  },

  exitSelectionMode: () => {
    set(() => ({
      roadSelection: {
        mode: "none",
        selectedRoadIds: [],
        highlightedRoads: [],
        validationStatus: "idle",
        validationResult: null,
        isValidating: false,
        error: null,
        isPreview: false,
      },
    }))
  },

  setSelectedRoadPriorities: (priorities) => {
    savePriorities(priorities)
    set(() => ({
      selectedRoadPriorities: priorities,
    }))
  },

  toggleRoadPriorityFilter: (priority) => {
    set((state) => {
      const exists = state.selectedRoadPriorities.includes(priority)
      const updated = exists
        ? state.selectedRoadPriorities.filter((p) => p !== priority)
        : [...state.selectedRoadPriorities, priority]

      savePriorities(updated)
      return {
        selectedRoadPriorities: updated,
      }
    })
  },

  resetRoadPriorityFilters: () => {
    savePriorities(ALL_ROAD_PRIORITIES)
    set({
      selectedRoadPriorities: ALL_ROAD_PRIORITIES,
    })
  },
})
