import { randomInt } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../server/identity";
import { createMember } from "../../../test/factories";
import { spyOnLoggedErrors } from "../../../test/log";
import { jsonRequest } from "../../../test/reset-links";
import { POST } from "./route";

let loggedErrors: ReturnType<typeof spyOnLoggedErrors>;

beforeEach(() => {
  loggedErrors = spyOnLoggedErrors();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const chrome =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

const report = {
  event: "uncaught",
  name: "TypeError",
  message: "x is undefined",
  stack: "TypeError: x is undefined\n    at Board (board.js:1:1)",
  page: "/projects/WEB/board",
  build: "b1",
  timeZone: "Europe/Paris",
  occurredAt: "2026-10-29T10:00:00.000Z",
};

async function signedIn() {
  const member = await createMember();
  return { username: member.username, cookie: `session=${await createSession(member.id)}` };
}

function send(body: unknown, headers: Record<string, string> = {}) {
  return POST(jsonRequest("POST", "/api/client-errors", body, { "User-Agent": chrome, ...headers }));
}

it("OPS-008.1: an uncaught error from Sam's page is logged as one client line naming sam, the page, browser and device, and answers 204", async () => {
  const sam = await signedIn();

  const response = await send(report, { Cookie: sam.cookie, "X-Forwarded-For": "203.0.113.57" });

  expect(response.status).toBe(204);
  expect(loggedErrors()).toEqual([
    {
      level: "error",
      time: expect.any(String),
      source: "client",
      event: "uncaught",
      actor: sam.username,
      ip: "203.0.113.0",
      browser: "Chrome",
      device: "desktop",
      userAgent: chrome,
      page: "/projects/WEB/board",
      build: "b1",
      timeZone: "Europe/Paris",
      occurredAt: "2026-10-29T10:00:00.000Z",
      error: { name: "TypeError", message: "x is undefined", stack: report.stack },
    },
  ]);
});

it("OPS-008.2: a report naming another member logs the session's member, or nobody when signed out", async () => {
  const sam = await signedIn();
  const forged = { ...report, actor: "alex", username: "alex" };

  expect((await send(forged, { Cookie: sam.cookie })).status).toBe(204);
  expect((await send(forged)).status).toBe(204);

  const [fromSam, signedOut] = loggedErrors();
  expect(fromSam.actor).toBe(sam.username);
  expect(signedOut).not.toHaveProperty("actor");
});

it("OPS-008.4: a 31st report within 10 minutes, from a member or from a signed-out IP, answers 204 and logs nothing", async () => {
  const sam = await signedIn();
  const ipPrefix = `10.${randomInt(256)}.${randomInt(256)}`;

  for (let i = 0; i < 31; i++) {
    expect((await send(report, { Cookie: sam.cookie })).status).toBe(204);
    expect((await send(report, { "X-Forwarded-For": `${ipPrefix}.${i}` })).status).toBe(204);
  }

  const lines = loggedErrors();
  expect(lines.filter((line) => line.actor === sam.username)).toHaveLength(30);
  expect(lines.filter((line) => line.ip === `${ipPrefix}.0`)).toHaveLength(30);
});

it("OPS-008.5: a report with a missing or over-long field, or a page not starting with /, gets 422; one sent by another site gets 403", async () => {
  const bad = [
    { ...report, event: "crashed" },
    { ...report, message: undefined },
    { ...report, message: "x".repeat(501) },
    { ...report, stack: "x".repeat(4001) },
    { ...report, page: "https://evil.example/" },
    { ...report, occurredAt: "yesterday" },
  ];

  for (const body of bad) expect((await send(body)).status).toBe(422);
  expect((await send(report, { Origin: "https://evil.example" })).status).toBe(403);
  expect(loggedErrors()).toEqual([]);
});