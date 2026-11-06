"use client";

import { useEffect, useState } from "react";
import { FormStatus } from "../ui/track-lite";

export function DelayedFallback() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return show && <FormStatus>Loading…</FormStatus>;
}