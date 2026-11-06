import { type NextRequest, NextResponse } from "next/server";
import { requireSession, sessionCookieName, sessionCookieOptions } from "./infrastructure/identity/session";

export const requestPathHeader = "x-request-path";

function contentSecurityPolicy(nonce: string) {
  const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", policy);
  requestHeaders.set(requestPathHeader, request.nextUrl.pathname + request.nextUrl.search);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  response.headers.set("referrer-policy", "no-referrer");

  await renewSession(request, response);
  return response;
}

async function renewSession(request: NextRequest, response: NextResponse) {
  const token = request.cookies.get(sessionCookieName())?.value;
  if (!token) return;

  const { renewed } = await requireSession(token).catch(() => ({ renewed: false }));
  if (renewed) response.cookies.set(sessionCookieName(), token, sessionCookieOptions());
}

export const config = {
  matcher: [
    {
      source: "/((?!api|health|webhooks|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};