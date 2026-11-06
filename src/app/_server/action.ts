import "server-only";
import { refresh } from "next/cache";
import type * as v from "valibot";
import type { ActionError, ActionResult } from "../../contract";
import { DomainError, type DomainErrorKind } from "../../domain/shared/domain-error";
import type { Member } from "../../infrastructure/identity/tables";
import { logInfo } from "../../infrastructure/log";
import { parseInput } from "./parse-input";
import { actionMember } from "./session";

type Action<Data> = (input: unknown) => Promise<ActionResult<Data>>;
type Outcome = "ok" | DomainErrorKind | "error";
type AnyUseCase = (...args: never[]) => Promise<unknown>;

export function action<Schema extends v.GenericSchema, Data>(
  name: string,
  access: "member",
  schema: Schema,
  run: (actor: Member, input: v.InferOutput<Schema>) => Promise<Data>,
): Action<Data>;
export function action<Schema extends v.GenericSchema, Data>(
  name: string,
  access: "public",
  schema: Schema,
  run: (input: v.InferOutput<Schema>) => Promise<Data>,
): Action<Data>;
export function action(name: string, access: "member" | "public", schema: v.GenericSchema, run: AnyUseCase) {
  const execute = run as (...args: unknown[]) => Promise<unknown>;

  return async (input: unknown): Promise<ActionResult<unknown>> => {
    const started = performance.now();
    let actor: string | undefined;
    const logCall = (outcome: Outcome) =>
      logInfo("action", "call", {
        action: name,
        outcome,
        durationMs: Math.round(performance.now() - started),
        actor,
      });

    const perform = async () => {
      if (access === "public") return execute(parseInput(schema, formValues(input)));

      const member = await actionMember();
      actor = member.username;
      return execute(member, parseInput(schema, formValues(input)));
    };

    try {
      const data = await perform();
      refresh();
      logCall("ok");
      return { ok: true, data };
    } catch (error) {
      logCall(error instanceof DomainError ? error.kind : "error");
      if (!(error instanceof DomainError)) throw error;
      return { ok: false, error: refusal(error) };
    }
  };
}

function formValues(input: unknown) {
  return input instanceof FormData ? Object.fromEntries(input) : input;
}

function refusal({ kind, message, fields }: DomainError): ActionError {
  return fields ? { kind, message, fields } : { kind, message };
}