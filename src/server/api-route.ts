import * as v from "valibot";
import { ApiError } from "./api-error";
import { readConfig } from "./config";
import { logRequest } from "./log";
import { type Member, requireAdmin, requireMember } from "./sessions";

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

async function readInput(request: Request, schema: v.GenericSchema) {
  const unreadable = new ApiError(422, "Couldn't read the request.");
  const body: unknown = await request.json().catch(() => {
    throw unreadable;
  });
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw unreadable;
  const result = v.safeParse(schema, body, { abortPipeEarly: true });
  if (result.success) return result.output;
  const issues = result.issues.map((issue) =>
    issue.type === "object" && issue.input === undefined ? { ...issue, message: "Required" } : issue,
  ) as typeof result.issues;
  const { root, nested } = v.flatten(issues);
  if (root || !nested) throw unreadable;
  const fields = Object.fromEntries(
    Object.entries(nested).flatMap(([field, messages]) => (messages ? [[field, messages[0]]] : [])),
  );
  throw new ApiError(422, "Check the highlighted fields", fields);
}

type Handler<Args extends unknown[]> = (...args: Args) => Response | Promise<Response>;
type AnyHandler = Handler<never[]>;
type Route = (request: Request) => Promise<Response>;

export function apiRoute(access: "public", handler: Handler<[Request]>): Route;
export function apiRoute<Schema extends v.GenericSchema>(
  access: "public",
  schema: Schema,
  handler: Handler<[Request, v.InferOutput<Schema>]>,
): Route;
export function apiRoute(access: "member" | "admin", handler: Handler<[Request, Member]>): Route;
export function apiRoute<Schema extends v.GenericSchema>(
  access: "member" | "admin",
  schema: Schema,
  handler: Handler<[Request, Member, v.InferOutput<Schema>]>,
): Route;
export function apiRoute(
  access: "public" | "member" | "admin",
  schemaOrHandler: v.GenericSchema | AnyHandler,
  schemaHandler?: AnyHandler,
) {
  const schema = schemaHandler ? (schemaOrHandler as v.GenericSchema) : undefined;
  const handler = (schemaHandler ?? schemaOrHandler) as Handler<unknown[]>;
  return async (request: Request) => {
    const started = performance.now();
    let response: Response;
    let failure: string | undefined;
    let renewedCookie: string | undefined;
    try {
      if (isCrossSiteWrite(request)) {
        throw new ApiError(403, "You don't have permission to do that.");
      }
      if (access === "public") {
        const input = schema ? [await readInput(request, schema)] : [];
        response = await handler(request, ...input);
      } else {
        const session = await requireMember(request);
        renewedCookie = session.cookie;
        const input = schema ? [await readInput(request, schema)] : [];
        if (access === "admin") requireAdmin(session.member);
        response = await handler(request, session.member, ...input);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        response = errorResponse(error.status, error.message, error.fields);
      } else {
        failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        response = errorResponse(500, "Something went wrong.");
      }
    }
    if (renewedCookie) response.headers.append("set-cookie", renewedCookie);
    logRequest({
      level: failure ? "error" : "info",
      method: request.method,
      path: new URL(request.url).pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      error: failure,
    });
    return response;
  };
}