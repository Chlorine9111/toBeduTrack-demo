"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertDialog, Button } from "@heroui/react";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: () => Promise.resolve(false),
});

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setOptions(opts);
      setResolveRef(() => resolve);
    });
  }, []);

  const handleClose = (result: boolean) => {
    resolveRef?.(result);
    setOptions(null);
    setResolveRef(null);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      handleClose(false);
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      <AlertDialog.Backdrop isOpen={!!options} onOpenChange={handleOpenChange}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status={options?.variant === "danger" ? "danger" : "warning"} />
              <AlertDialog.Heading>{options?.title}</AlertDialog.Heading>
            </AlertDialog.Header>
            {options?.description ? (
              <AlertDialog.Body>
                <p>{options.description}</p>
              </AlertDialog.Body>
            ) : null}
            <AlertDialog.Footer>
              <Button variant="secondary" onPress={() => handleClose(false)}>
                {options?.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={options?.variant === "danger" ? "danger" : "primary"}
                onPress={() => handleClose(true)}
              >
                {options?.confirmLabel ?? "Confirm"}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </ConfirmContext.Provider>
  );
}
