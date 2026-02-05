import React from "react"

import { PRIMARY_RED, PRIMARY_RED_LIGHT } from "../../../constants/colors"

interface MenuButtonProps {
  icon?: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}

const MenuButton: React.FC<MenuButtonProps> = ({
  icon,
  label,
  onClick,
  danger = false,
}) => {
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: "100%",
        padding: "8px 12px",
        border: "none",
        background: isHovered
          ? danger
            ? PRIMARY_RED_LIGHT
            : "#f5f5f5"
          : "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: icon ? "10px" : "0",
        fontSize: "13px",
        color: danger ? PRIMARY_RED : "#333",
        transition: "background 0.15s",
        textAlign: "left",
      }}
    >
      {icon && (
        <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>
      )}
      <span>{label}</span>
    </button>
  )
}

export default MenuButton
