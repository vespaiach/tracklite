export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T) {
  return { ok: true as const, value };
}

export function err<E>(error: E) {
  return { ok: false as const, error };
}