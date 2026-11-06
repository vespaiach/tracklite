"use client";

import { useState } from "react";

export function useRequestId() {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  return [requestId, () => setRequestId(crypto.randomUUID())] as const;
}