"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Toasts } from "./ui/track-lite";

type ShowToast = (message: string) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const show = useCallback<ShowToast>(
    (message) => setToast((previous) => ({ id: (previous?.id ?? 0) + 1, message })),
    [],
  );

  return (
    <ToastContext value={show}>
      {children}
      <Toasts items={toast ? [{ ...toast, tone: "err" }] : []} />
    </ToastContext>
  );
}

export function useToast() {
  return useContext(ToastContext);
}