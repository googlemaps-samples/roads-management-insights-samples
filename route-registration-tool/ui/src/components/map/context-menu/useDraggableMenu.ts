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

// ui/src/components/map/context-menu/useDraggableMenu.ts
import { useEffect, useRef, useState } from "react"

interface UseDraggableMenuProps {
  initialX: number
  initialY: number
  onPositionChange?: (x: number, y: number) => void
}

export const useDraggableMenu = ({
  initialX,
  initialY,
  onPositionChange,
}: UseDraggableMenuProps) => {
  const [position, setPosition] = useState({ x: initialX, y: initialY })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null)

  // Update position when initial props change
  useEffect(() => {
    setPosition({ x: initialX, y: initialY })
  }, [initialX, initialY])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const menuElement = e.currentTarget.closest(
      "[data-draggable-menu]",
    ) as HTMLElement
    if (!menuElement) return

    const rect = menuElement.getBoundingClientRect()
    // Calculate offset from mouse position to menu's top-left corner
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top

    dragOffsetRef.current = { x: offsetX, y: offsetY }
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragOffsetRef.current) return

      const newX = e.clientX - dragOffsetRef.current.x
      const newY = e.clientY - dragOffsetRef.current.y

      // Keep menu within viewport bounds
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const menuElement = document.querySelector(
        "[data-draggable-menu]",
      ) as HTMLElement

      if (menuElement) {
        const menuWidth = menuElement.offsetWidth
        const menuHeight = menuElement.offsetHeight

        const boundedX = Math.max(
          0,
          Math.min(newX, viewportWidth - menuWidth),
        )
        const boundedY = Math.max(
          0,
          Math.min(newY, viewportHeight - menuHeight),
        )

        setPosition({ x: boundedX, y: boundedY })
        onPositionChange?.(boundedX, boundedY)
      } else {
        setPosition({ x: newX, y: newY })
        onPositionChange?.(newX, newY)
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      dragOffsetRef.current = null
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, onPositionChange])

  return {
    position,
    isDragging,
    handleMouseDown,
  }
}

