"use client"

import DevSidebar from "@/components/developer/DevSidebar"

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen min-h-0 bg-gray-50">
      <DevSidebar />
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
