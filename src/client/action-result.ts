import type { ActionError, ActionResult } from "../contract";
import type { ApiFailure } from "./api";

const couldNotSave = "Couldn’t save. Try again.";

const kindOfStatus: Record<number, ActionError["kind"]> = {
  401: "signedOut",
  403: "forbidden",
  404: "notFound",
  409: "conflict",
  410: "expired",
  422: "invalid",
  429: "limited",
};

export function settled<Data>(call: Promise<ActionResult<Data>>): Promise<ActionResult<Data>> {
  return call.catch(() => ({ ok: false, error: { kind: "unavailable", message: couldNotSave } }));
}

export async function asActionResult<Data>(request: Promise<Data>): Promise<ActionResult<Data>> {
  try {
    return { ok: true, data: await request };
  } catch (caught) {
    const { status, message, fields } = caught as ApiFailure;
    const kind = typeof status === "number" ? (kindOfStatus[status] ?? "unavailable") : "unavailable";
    return { ok: false, error: fields ? { kind, message, fields } : { kind, message } };
  }
}