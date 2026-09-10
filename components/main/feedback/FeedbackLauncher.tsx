"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Button, Drawer } from "@heroui/react"
import { MessageSquarePlus } from "lucide-react"
import { useAppI18n } from "@/lib/app-i18n/provider"
import FeedbackCenter from "@/components/main/feedback/FeedbackCenter"
import { cn } from "@/lib/utils"

export default function FeedbackLauncher() {
  const pathname = usePathname()
  const { isZh } = useAppI18n()
  const [open, setOpen] = useState(false)

  if (pathname.startsWith("/main/feedback")) {
    return null
  }

  return (
    <>
      <Button
        variant="primary"
        onPress={() => setOpen(true)}
        isIconOnly
        aria-label={isZh ? "打开反馈" : "Open feedback"}
        className={cn(
          "fixed right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-xs",
          "bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] md:bottom-5",
          "bg-accent hover:bg-accent/90",
        )}
      >
        <MessageSquarePlus className="h-4 w-4" />
      </Button>

      <Drawer isOpen={open} onOpenChange={setOpen}>
        <Drawer.Backdrop>
          <Drawer.Content placement="right" className="w-full sm:max-w-[520px]">
            <Drawer.Dialog className="h-full">
              <Drawer.Body className="min-h-0 p-0">
                <FeedbackCenter
                  mode="panel"
                  onClose={() => {
                    setOpen(false)
                  }}
                />
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </>
  )
}
