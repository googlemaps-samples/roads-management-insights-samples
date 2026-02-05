import React from "react"

interface MainProps {
  children: React.ReactNode
}

export default function Main({ children }: MainProps) {
  return (
    <main className="flex-1 flex relative overflow-hidden">{children}</main>
  )
}
