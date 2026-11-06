import type { DomainErrorKind } from "../domain/shared/domain-error";

export type ActionError = { kind: DomainErrorKind; message: string; fields?: Record<string, string> };

export type ActionResult<Data> = { ok: true; data: Data } | { ok: false; error: ActionError };