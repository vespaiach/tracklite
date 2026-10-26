import { useEffect, useRef } from "react";

export function useReturnFocus<T extends HTMLElement>(open: boolean) {
  const opener = useRef<T>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) opener.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return opener;
}