"use client";

import type { ActionResult } from "../contract";
import { useToast } from "./toast";

const couldNotSave = "Couldn’t save. Try again.";

export function useActionCall() {
  const toast = useToast();

  return async <Data>(call: () => Promise<ActionResult<Data>>) => {
    try {
      const result = await call();
      if (result.ok) return true;
      toast(result.error.message);
    } catch {
      toast(couldNotSave);
    }
    return false;
  };
}