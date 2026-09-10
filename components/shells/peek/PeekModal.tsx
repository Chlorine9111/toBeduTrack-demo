"use client";

import { type ReactNode } from "react";
import { ArrowLeft, Expand, Loader2 } from "lucide-react";
import { Modal } from "@heroui/react";

type PeekModalProps = {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onBack?: () => void;
  onExpand?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
};

export default function PeekModal({
  open,
  loading,
  error,
  onClose,
  onBack,
  onExpand,
  children,
  footer,
}: PeekModalProps) {
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Modal.Container>
        <Modal.Dialog
          className="sm:max-w-[720px]"
          style={{ maxHeight: "819px" }}
          data-testid="peek-modal"
        >
          {/* Header */}
          <header className="flex shrink-0 items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-[rgba(55,53,47,0.6)] transition-colors hover:bg-[rgba(55,53,47,0.04)] active:scale-95"
                  data-testid="peek-modal-back"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>返回搜索</span>
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              {onExpand ? (
                <button
                  type="button"
                  onClick={onExpand}
                  className="rounded-lg p-2 text-[rgba(55,53,47,0.6)] transition-colors hover:bg-[rgba(55,53,47,0.04)] active:scale-95"
                  title="打开详情"
                  data-testid="peek-modal-expand"
                >
                  <Expand className="h-5 w-5" />
                </button>
              ) : null}
              <Modal.CloseTrigger data-testid="peek-modal-close" />
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-[rgba(55,53,47,0.35)]" />
              </div>
            ) : error ? (
              <div className="px-10 py-16 text-center text-sm text-danger">
                {error}
              </div>
            ) : (
              children
            )}
          </div>

          {/* Footer */}
          {!loading && !error && footer ? (
            <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-[rgba(55,53,47,0.06)] px-6 py-5">
              {footer}
            </footer>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
