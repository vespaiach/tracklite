"use client";

import { useEffect } from "react";

export function useTokenOutOfAddress() {
  useEffect(() => {
    const address = new URL(window.location.href);
    if (!address.searchParams.has("token")) return;

    address.searchParams.delete("token");
    window.history.replaceState(null, "", address);
  }, []);
}