import "server-only";
import * as v from "valibot";

const uuid = v.pipe(v.string(), v.uuid(), v.brand("Uuid"));

export type Uuid = v.InferOutput<typeof uuid>;

export function parseUuid(text: string): Uuid | undefined {
  const result = v.safeParse(uuid, text);
  return result.success ? result.output : undefined;
}