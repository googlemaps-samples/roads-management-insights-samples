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

// ui/src/components/common/ContextMenu.tsx
import React, { useEffect, useRef } from "react"

import DragHandle from "../map/context-menu/DragHandle"
import { useDraggableMenu } from "../map/context-menu/useDraggableMenu"

export interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  dividerAfter?: boolean
  disabled?: boolean
}

export interface ContextMenuHeader {
  icon?: React.ReactNode
  title: string
  fullTitle?: string // Optional full title for tooltip (defaults to title)
  subtitle?: string
  metadata?: React.ReactNode
}

export interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void

  // Optional header
  header?: ContextMenuHeader

  // Menu items
  items?: ContextMenuItem[]

  // Draggable support
  draggable?: boolean

  // Custom styling
  width?: number | string
  maxHeight?: number | string
  minWidth?: number | string
  maxWidth?: number | string
  // Children for custom content (e.g., FeatureSelectionMenu list)
  children?: React.ReactNode
  hideItems?: boolean // Hide standard items when using children
  className?: string
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  header,
  items = [],
  draggable = false,
  width = 200,
  maxHeight = 400,
  minWidth,
  maxWidth,
  children,
  hideItems = false,
  className,
}) => {
  const menuRef = useRef<HTMLDivElement>(null)

  // Drag functionality (only if draggable)
  const dragResult = useDraggableMenu({
    initialX: x,
    initialY: y,
  })

  const position = draggable ? dragResult.position : { x, y }
  const isDragging = draggable ? dragResult.isDragging : false
  const handleMouseDown = draggable ? dragResult.handleMouseDown : undefined

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if dragging
      if (isDragging) return

      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [onClose, isDragging])

  return (
    <div
      ref={menuRef}
      data-draggable-menu
      className={`fixed bg-white shadow-lg z-[10000] overflow-hidden ${className}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: typeof width === "number" ? `${width}px` : width,
        minWidth: typeof minWidth === "number" ? `${minWidth}px` : minWidth,
        maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth,
        borderRadius: "24px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      {/* Header */}
      {header && (
        <div className="relative px-4 py-3 border-b border-gray-200 bg-gray-50">
          {draggable && handleMouseDown && (
            <DragHandle onMouseDown={handleMouseDown} isDragging={isDragging} />
          )}
          <div
            className="flex items-center gap-2"
            style={{ paddingRight: draggable ? "32px" : "0" }}
          >
            {header.icon && (
              <div className="flex items-center justify-center text-gray-600">
                {header.icon}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-semibold text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis"
                title={header.fullTitle || header.title}
              >
                {header.title}
              </div>
              {header.subtitle && (
                <div className="text-xs text-gray-600 mt-0.5">
                  {header.subtitle}
                </div>
              )}
            </div>
          </div>
          {header.metadata && <div className="mt-1.5">{header.metadata}</div>}
        </div>
      )}

      {/* Menu Items */}
      {!hideItems && items && items.length > 0 && (
        <div
          className="py-0 pretty-scrollbar"
          style={{
            maxHeight:
              typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
            overflowY: "auto",
          }}
        >
          {items.map((item, index) => (
            <React.Fragment key={item.id}>
              <button
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick()
                  }
                }}
                disabled={item.disabled}
                className={`w-full px-4 py-2 border-none flex items-center gap-3 text-left transition-colors text-gray-900 ${
                  item.disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer hover:bg-gray-100"
                }`}
              >
                {item.icon && (
                  <span className="flex items-center justify-center text-gray-600">
                    {item.icon}
                  </span>
                )}
                <span className="text-[12px]">{item.label}</span>
              </button>
              {index < items.length - 1 && <div className="h-px bg-gray-200" />}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Custom Children */}
      {children && (
        <div
          className="pretty-scrollbar"
          style={{
            maxHeight:
              typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
            overflowY: "auto",
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export default ContextMenu
