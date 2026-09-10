"use client";

import { DURATION_PANEL, EASING_DEFAULT } from "./animation-constants";

type ConversationOverlayBackdropProps = {
  open: boolean;
  onClose: () => void;
};

export default function ConversationOverlayBackdrop({
  open,
  onClose,
}: ConversationOverlayBackdropProps) {
  return (
    <div
      aria-hidden="true"
      onClick={onClose}
      className="fixed inset-0 z-40 bg-black/20"
      style={{
        opacity: open ? 1 : 0,
        visibility: open ? "visible" : "hidden",
        transition: `opacity ${DURATION_PANEL}ms ${EASING_DEFAULT}, visibility ${DURATION_PANEL}ms ${EASING_DEFAULT}`,
      }}
    />
  );
}
