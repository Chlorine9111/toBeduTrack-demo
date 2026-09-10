"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Alert, Button } from "@heroui/react";
import { X } from "lucide-react";

type AssetReadyNotificationProps = {
  notification: { title: string; summary: string } | null;
  onDismiss: () => void;
};

export function AssetReadyNotification({ notification, onDismiss }: AssetReadyNotificationProps) {
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [notification, onDismiss]);

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25 }}
          className="mb-3"
        >
          <Alert color="success" className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-foreground">
                {"\u300A"}{notification.title}{"\u300B"}<span className="font-normal text-default-400"> 已就绪</span>
              </p>
              {notification.summary && (
                <p className="mt-0.5 line-clamp-1 text-[11px] leading-[15px] text-default-400">
                  {notification.summary}
                </p>
              )}
            </div>
            <Button
              isIconOnly
              variant="ghost"
              onPress={onDismiss}
              className="mt-0.5 h-4 w-4 min-w-0 text-default-300"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </Button>
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
