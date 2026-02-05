import { getColorsForMapType } from "../../../../stores/layer-store/utils/color-utils"
import { useProjectWorkspaceStore } from "../../../../stores/project-workspace-store"
import { getSyncStatusLabel } from "../../../../utils/formatter"

interface SyncStatusChipProps {
  status:
    | "synced"
    | "pending"
    | "error"
    | "failed"
    | "unsynced"
    | "validating"
    | "invalid"
    | string
    | undefined
}

export function SyncStatusChip({ status }: SyncStatusChipProps) {
  const mapType = useProjectWorkspaceStore((state) => state.mapType)
  const colors = getColorsForMapType(mapType)

  // Convert RGBA array to CSS color with opacity for background
  const rgbaToCssWithOpacity = (
    [r, g, b]: [number, number, number, number],
    opacity: number = 0.15,
  ): string => `rgba(${r}, ${g}, ${b}, ${opacity})`

  // Convert RGBA array to CSS color for text
  const rgbaToCss = ([r, g, b]: [number, number, number, number]): string =>
    `rgb(${r}, ${g}, ${b})`

  // Match colors from route status constants (same as legend)
  const getStatusStyles = (
    status: string | undefined,
  ): { backgroundColor: string; color: string } => {
    if (!status) {
      const unsyncedColor = colors.routeStatusColors.unsynced
      return {
        backgroundColor: rgbaToCssWithOpacity(unsyncedColor, 0.15),
        color: rgbaToCss(unsyncedColor),
      }
    }

    const normalizedStatus = status.toLowerCase()

    switch (normalizedStatus) {
      case "synced":
      case "running":
        return {
          backgroundColor: rgbaToCssWithOpacity(
            colors.routeStatusColors.synced,
            0.15,
          ),
          color: rgbaToCss(colors.routeStatusColors.synced),
        }
      case "validating":
        return {
          backgroundColor: rgbaToCssWithOpacity(
            colors.routeStatusColors.validating,
            0.15,
          ),
          color: rgbaToCss(colors.routeStatusColors.validating),
        }
      case "invalid":
        return {
          backgroundColor: rgbaToCssWithOpacity(
            colors.routeStatusColors.invalid,
            0.15,
          ),
          color: rgbaToCss(colors.routeStatusColors.invalid),
        }
      case "unsynced":
      default:
        return {
          backgroundColor: rgbaToCssWithOpacity(
            colors.routeStatusColors.unsynced,
            0.15,
          ),
          color: rgbaToCss(colors.routeStatusColors.unsynced),
        }
    }
  }

  if (!status) return null

  // Use the same label mapping as RouteDetailsPanel
  const statusLabel = getSyncStatusLabel(status)
  const styles = getStatusStyles(status)

  return (
    <div
      className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
      style={{
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      }}
    >
      {statusLabel}
    </div>
  )
}
