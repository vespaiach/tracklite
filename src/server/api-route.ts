import { ApiError } from "./api-error";
import { readConfig } from "./config";
import { logRequest } from "./log";

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

export function apiRoute(handler: (request: Request) => Response | Promise<Response>) {
  return async (request: Request) => {
    const started = performance.now();
    let response: Response;
    let failure: string | undefined;
    try {
      if (isCrossSiteWrite(request)) {
        throw new ApiError(403, "You don't have permission to do that.");
      }
      response = await handler(request);
    } catch (error) {
      if (error instanceof ApiError) {
        response = errorResponse(error.status, error.message, error.fields);
      } else {
        failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        response = errorResponse(500, "Something went wrong.");
      }
    }
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