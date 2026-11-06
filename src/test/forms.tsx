import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { ToastProvider } from "../components/toast";
import type { ActionResult } from "../contract";

export function renderForm(form: ReactNode) {
  return render(<ToastProvider>{form}</ToastProvider>);
}

export function answering(...results: ActionResult<null>[]) {
  return vi.fn(async (_form: FormData) => results.shift() ?? done);
}

export const done: ActionResult<null> = { ok: true, data: null };

export function refused<Data = null>(kind: string, message: string, fields?: Record<string, string>) {
  return { ok: false, error: { kind, message, ...(fields ? { fields } : {}) } } as ActionResult<Data>;
}

export function pendingAction() {
  let settle!: (result: ActionResult<null>) => void;
  const result = new Promise<ActionResult<null>>((resolve) => {
    settle = resolve;
  });
  return { act: vi.fn((_form: FormData) => result), settle };
}

export function sentFields(act: { mock: { calls: [FormData][] } }, call = 0) {
  return Object.fromEntries(act.mock.calls[call][0]);
}