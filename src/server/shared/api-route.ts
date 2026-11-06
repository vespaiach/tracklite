import * as v from "valibot";
import { DomainError, type DomainErrorKind } from "../../domain/shared/domain-error";
import { readConfig } from "../../infrastructure/config";
import { logError, logInfo } from "../../infrastructure/log";
import { type Member, requireMember } from "../identity";
import "../notifications";

const statusOfKind: Record<DomainErrorKind, number> = {
  signedOut: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  expired: 410,
  invalid: 422,
  limited: 429,
  unavailable: 503,
};

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isCrossSiteWrite(request: Request) {
  if (!writeMethods.has(request.method)) return false;
  const origin = request.headers.get("origin");
  if (origin !== null) return origin !== new URL(readConfig().appUrl).origin;
  return request.headers.get("sec-fetch-site") !== "same-origin";
}

function errorResponse(status: number, message: string, fields?: Record<string, string>) {
  return Response.json({ error: fields ? { message, fields } : { message } }, { status });
}

function errorOutcome(error: unknown): Outcome {
  if (error instanceof DomainError) {
    return { response: errorResponse(statusOfKind[error.kind], error.message, error.fields) };
  }
  return {
    response: errorResponse(500, "Something went wrong."),
    failure: { error },
  };
}

function unreadableRequest() {
  return new DomainError("invalid", "Couldn’t read the request.");
}

async function readInput(request: Request, schema: v.GenericSchema) {
  const body = await readJsonObject(request);

  const result = v.safeParse(schema, body, { abortPipeEarly: true });
  if (result.success) return result.output;

  throw inputError(result.issues);
}

async function readJsonObject(request: Request) {
  const body: unknown = await request.json().catch(() => {
    throw unreadableRequest();
  });
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw unreadableRequest();
  return body;
}

function inputError(issues: ValidationIssues) {
  const { root, nested } = v.flatten(withRequiredMessages(issues));
  if (root) return new DomainError("invalid", root[0]);
  if (!nested) return unreadableRequest();
  const fields = Object.fromEntries(
    Object.entries(nested).flatMap(([field, messages]) => (messages ? [[field, messages[0]]] : [])),
  );
  return new DomainError("invalid", "Check the highlighted fields", fields);
}

function withRequiredMessages(issues: ValidationIssues) {
  return issues.map((issue) =>
    issue.type === "object" && issue.input === undefined ? { ...issue, message: "Required" } : issue,
  ) as ValidationIssues;
}

type ValidationIssues = [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]];
type Outcome = { response: Response; failure?: { error: unknown } };
type Caller = { username?: string; renewedCookie?: string };
type NameActor = (username: string) => void;
type Handler<Args extends unknown[]> = (...args: Args) => Response | Promise<Response>;
type AnyHandler = Handler<never[]>;
type Route = (request: Request) => Promise<Response>;

export function apiRoute(access: "public", handler: Handler<[Request, NameActor]>): Route;
export function apiRoute<Schema extends v.GenericSchema>(
  access: "public",
  schema: Schema,
  handler: Handler<[Request, v.InferOutput<Schema>, NameActor]>,
): Route;
export function apiRoute(access: "member", handler: Handler<[Request, Member]>): Route;
export function apiRoute<Schema extends v.GenericSchema>(
  access: "member",
  schema: Schema,
  handler: Handler<[Request, Member, v.InferOutput<Schema>]>,
): Route;
export function apiRoute(
  access: "public" | "member",
  schemaOrHandler: v.GenericSchema | AnyHandler,
  schemaHandler?: AnyHandler,
) {
  const schema = schemaHandler ? (schemaOrHandler as v.GenericSchema) : undefined;
  const handler = (schemaHandler ?? schemaOrHandler) as Handler<unknown[]>;

  const inputOf = async (request: Request) => (schema ? [await readInput(request, schema)] : []);

  const respond = async (request: Request, caller: Caller) => {
    if (isCrossSiteWrite(request))
      throw new DomainError("forbidden", "You don't have permission to do that.");

    if (access === "public") {
      const nameActor: NameActor = (username) => {
        caller.username = username;
      };
      return handler(request, ...(await inputOf(request)), nameActor);
    }

    const session = await requireMember(request);
    caller.username = session.member.username;
    caller.renewedCookie = session.cookie;

    return handler(request, session.member, ...(await inputOf(request)));
  };

  return async (request: Request) => {
    const started = performance.now();
    const caller: Caller = {};

    const { response, failure } = await respond(request, caller).then(
      (response): Outcome => ({ response }),
      errorOutcome,
    );

    if (caller.renewedCookie) response.headers.append("set-cookie", caller.renewedCookie);

    const method = request.method;
    const path = new URL(request.url).pathname;
    const actor = caller.username;
    if (failure) logError("route", "request-failed", failure.error, { method, path, actor });
    logInfo("route", "request", {
      method,
      path,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      actor,
    });
    return response;
  };
}