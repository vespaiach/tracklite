"use client";

import NextLink from "next/link";
import { type ComponentProps, useEffect } from "react";

const activeGuards = new Set<{ message: string }>();

export function useLeaveGuard(message: string | null) {
  useEffect(() => {
    if (message === null) return;
    const guard = { message };
    activeGuards.add(guard);
    window.addEventListener("beforeunload", holdForPrompt);
    return () => {
      activeGuards.delete(guard);
    };
  }, [message]);
}

function holdForPrompt(event: BeforeUnloadEvent) {
  if (activeGuards.size > 0) event.preventDefault();
}

export function confirmLeave() {
  const [guard] = activeGuards;
  if (guard && !window.confirm(guard.message)) return false;

  activeGuards.clear();
  return true;
}

export function Link({ onNavigate, ...props }: ComponentProps<typeof NextLink>) {
  return (
    <NextLink
      {...props}
      onNavigate={(event) => {
        if (!confirmLeave()) return event.preventDefault();
        onNavigate?.(event);
      }}
    />
  );
}