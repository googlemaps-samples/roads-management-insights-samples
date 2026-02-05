export type RoadPriority =
  | "ROAD_PRIORITY_CONTROLLED_ACCESS"
  | "ROAD_PRIORITY_LIMITED_ACCESS"
  | "ROAD_PRIORITY_PRIMARY_HIGHWAY"
  | "ROAD_PRIORITY_SECONDARY_ROAD"
  | "ROAD_PRIORITY_MAJOR_ARTERIAL"
  | "ROAD_PRIORITY_MINOR_ARTERIAL"
  | "ROAD_PRIORITY_LOCAL"
  | "ROAD_PRIORITY_TERMINAL"
  | "ROAD_PRIORITY_NON_TRAFFIC"
  | "ROAD_PRIORITY_UNSPECIFIED"

export type RoadPriorityCategory = "local" | "arterial" | "highway"

export interface RoadPriorityInfo {
  value: RoadPriority
  label: string
  description: string
  category: RoadPriorityCategory
}

export interface RoadPriorityCategoryInfo {
  id: RoadPriorityCategory
  label: string
  description: string
}

const ROAD_PRIORITY_CATEGORY_LABELS: Record<RoadPriorityCategory, string> = {
  local: "Local Roads",
  arterial: "Arterial Roads",
  highway: "Highways",
}

const ROAD_PRIORITY_CATEGORY_DESCRIPTIONS: Record<
  RoadPriorityCategory,
  string
> = {
  local: "Typically neighborhood streets and small rural roads for local use.",
  arterial: "Major urban roads between neighborhoods.",
  highway: "Major highways running through the country.",
}

export const ROAD_PRIORITIES: RoadPriorityInfo[] = [
  {
    value: "ROAD_PRIORITY_UNSPECIFIED",
    label: "Unspecified",
    description: "Default placeholder when priority is unknown.",
    category: "local",
  },
  {
    value: "ROAD_PRIORITY_NON_TRAFFIC",
    label: "Non-Traffic",
    description: "Pedestrian malls, utility, or emergency-only paths.",
    category: "local",
  },
  {
    value: "ROAD_PRIORITY_TERMINAL",
    label: "Terminal",
    description: "Dead-end accesses meant only for reaching a destination.",
    category: "local",
  },
  {
    value: "ROAD_PRIORITY_LOCAL",
    label: "Local",
    description: "Neighborhood streets and small rural roads for local use.",
    category: "local",
  },
  {
    value: "ROAD_PRIORITY_MINOR_ARTERIAL",
    label: "Minor Arterial",
    description: "Collectors guiding traffic from locals to larger arterials.",
    category: "arterial",
  },
  {
    value: "ROAD_PRIORITY_MAJOR_ARTERIAL",
    label: "Major Arterial",
    description: "High-capacity urban roads between neighborhoods.",
    category: "arterial",
  },
  {
    value: "ROAD_PRIORITY_SECONDARY_ROAD",
    label: "Secondary Road",
    description: "Connects arterials to primary highways or regional routes.",
    category: "arterial",
  },
  {
    value: "ROAD_PRIORITY_PRIMARY_HIGHWAY",
    label: "Primary Highway",
    description: "Major highways with few access restrictions.",
    category: "highway",
  },
  {
    value: "ROAD_PRIORITY_LIMITED_ACCESS",
    label: "Limited Access",
    description: "Expressways with spaced intersections and frontage roads.",
    category: "highway",
  },
  {
    value: "ROAD_PRIORITY_CONTROLLED_ACCESS",
    label: "Controlled Access",
    description: "Freeways accessible only via grade-separated ramps.",
    category: "highway",
  },
]

export const ROAD_PRIORITY_CATEGORIES: RoadPriorityCategoryInfo[] =
  Object.entries(ROAD_PRIORITY_CATEGORY_LABELS).map(([id, label]) => ({
    id: id as RoadPriorityCategory,
    label,
    description:
      ROAD_PRIORITY_CATEGORY_DESCRIPTIONS[id as RoadPriorityCategory],
  }))

export const ROAD_PRIORITY_LABELS = ROAD_PRIORITIES.reduce<
  Record<string, string>
>((acc, priority) => {
  acc[priority.value] = priority.label
  return acc
}, {})

export const ROAD_PRIORITY_FALLBACK = "ROAD_PRIORITY_UNSPECIFIED"
