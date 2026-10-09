import * as v from "valibot";
import { ApiError } from "./api-error";
import { readConfig } from "./config";
import { logRequest } from "./log";
import { type Member, requireMember } from "./sessions";

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
  if (error instanceof ApiError) {
    return { response: errorResponse(error.status, error.message, error.fields) };
  }
  return {
    response: errorResponse(500, "Something went wrong."),
    failure: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  };
}

function unreadableRequest() {
  return new ApiError(422, "Couldn't read the request.");
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
  if (root) return new ApiError(422, root[0]);
  if (!nested) return unreadableRequest();
  const fields = Object.fromEntries(
    Object.entries(nested).flatMap(([field, messages]) => (messages ? [[field, messages[0]]] : [])),
  );
  return new ApiError(422, "Check the highlighted fields", fields);
}

function withRequiredMessages(issues: ValidationIssues) {
  return issues.map((issue) =>
    issue.type === "object" && issue.input === undefined ? { ...issue, message: "Required" } : issue,
  ) as ValidationIssues;
}

type ValidationIssues = [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]];
type Outcome = { response: Response; failure?: string };
type Caller = { username?: string; renewedCookie?: string };
type Handler<Args extends unknown[]> = (...args: Args) => Response | Promise<Response>;
type AnyHandler = Handler<never[]>;
type Route = (request: Request) => Promise<Response>;

export function apiRoute(access: "public", handler: Handler<[Request]>): Route;
export function apiRoute<Schema extends v.GenericSchema>(
  access: "public",
  schema: Schema,
  handler: Handler<[Request, v.InferOutput<Schema>]>,
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
    if (isCrossSiteWrite(request)) throw new ApiError(403, "You don't have permission to do that.");

    if (access === "public") return handler(request, ...(await inputOf(request)));

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

    logRequest({
      level: failure ? "error" : "info",
      method: request.method,
      path: new URL(request.url).pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      error: failure,
      actor: caller.username,
    });
    return response;
  };
}