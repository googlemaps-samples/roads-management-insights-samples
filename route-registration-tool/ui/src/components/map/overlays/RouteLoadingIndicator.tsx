// ui/src/components/map/overlays/RouteLoadingIndicator.tsx
import { useLayerStore } from "../../../stores"

const RouteLoadingIndicator: React.FC = () => {
  const individualRoute = useLayerStore((state) => state.individualRoute)

  if (!individualRoute.isGenerating) return null

  return (
    <div
      style={{
        position: "absolute",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0, 0, 0, 0.8)",
        color: "white",
        padding: "10px 20px",
        borderRadius: "8px",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}
    >
      <div
        style={{
          width: "20px",
          height: "20px",
          border: "2px solid #fff",
          borderTop: "2px solid transparent",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      Generating route...
    </div>
  )
}

export default RouteLoadingIndicator
