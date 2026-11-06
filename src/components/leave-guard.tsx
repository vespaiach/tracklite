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
      window.removeEventListener("beforeunload", holdForPrompt);
    };
  }, [message]);
}

function holdForPrompt(event: BeforeUnloadEvent) {
  event.preventDefault();
}

export function Link({ onNavigate, ...props }: ComponentProps<typeof NextLink>) {
  return (
    <NextLink
      {...props}
      onNavigate={(event) => {
        const [guard] = activeGuards;
        if (guard && !window.confirm(guard.message)) return event.preventDefault();
        onNavigate?.(event);
      }}
    />
  );
}