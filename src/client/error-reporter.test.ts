import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createErrorReporter } from "./error-reporter";

const hour = 60 * 60 * 1000;

function setup({ online = true } = {}) {
  const fetch = vi.fn(async () => new Response(null, { status: 204 }));
  const events = new EventTarget();
  const state = { online, now: Date.parse("2026-10-29T10:00:00.000Z") };
  const report = createErrorReporter({
    fetch,
    events,
    online: () => state.online,
    page: () => "/issue/WEB-42",
    build: "abc123",
    now: () => state.now,
    timeZone: "Europe/Berlin",
  });
  const sent = () =>
    fetch.mock.calls.map(([, init]: unknown[]) => JSON.parse((init as RequestInit).body as string));
  return { fetch, events, state, report, sent };
}

function thrown(message: string, frame = "at render (app.js:1:1)") {
  const error = new Error(message);
  error.stack = `Error: ${message}\n    ${frame}\n    at main (app.js:9:9)`;
  return error;
}

it("OPS-008.1: a report posts the error, page, build and time zone to the endpoint with keepalive", () => {
  const { fetch, report, sent } = setup();

  report("uncaught", thrown("boom"));

  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/client-errors");
  expect(init).toMatchObject({ method: "POST", keepalive: true });
  expect(sent()[0]).toMatchObject({
    event: "uncaught",
    name: "Error",
    message: "boom",
    page: "/issue/WEB-42",
    build: "abc123",
    timeZone: "Europe/Berlin",
    occurredAt: "2026-10-29T10:00:00.000Z",
  });
});

it("OPS-008.6: the same error thrown 50 times is reported once; another first frame is a new report", () => {
  const { report, sent } = setup();

  for (let i = 0; i < 50; i++) report("uncaught", thrown("boom"));
  report("uncaught", thrown("boom", "at other (app.js:2:2)"));

  expect(sent()).toHaveLength(2);
});

it("OPS-008.6: 25 different errors in an hour send 20; an hour later the count and the de-dupe start again", () => {
  const { report, sent, state } = setup();

  for (let i = 0; i < 25; i++) report("uncaught", thrown(`boom ${i}`));
  expect(sent()).toHaveLength(20);

  state.now += hour;
  report("uncaught", thrown("boom 0"));

  expect(sent()).toHaveLength(21);
});

it("STD-10.5: a crash report carries the digest and component", () => {
  const { report, sent } = setup();

  report("page-crashed", thrown("boom"), { digest: "d1", component: "IssueScreen" });

  expect(sent()[0]).toMatchObject({ event: "page-crashed", digest: "d1", component: "IssueScreen" });
});

it("OPS-008.7: a report made offline is sent on online, with the time of the error", () => {
  const { events, report, sent, state } = setup({ online: false });

  report("uncaught", thrown("boom"));
  expect(sent()).toHaveLength(0);

  state.now += 5 * 60 * 1000;
  state.online = true;
  events.dispatchEvent(new Event("online"));

  expect(sent()).toHaveLength(1);
  expect(sent()[0].occurredAt).toBe("2026-10-29T10:00:00.000Z");
  events.dispatchEvent(new Event("online"));
  expect(sent()).toHaveLength(1);
});

it("OPS-008.8: a send that rejects or throws is dropped and nothing is thrown", async () => {
  const { fetch, report } = setup();
  fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  fetch.mockImplementationOnce(() => {
    throw new TypeError("bad");
  });

  expect(() => report("uncaught", thrown("one"))).not.toThrow();
  expect(() => report("uncaught", thrown("two"))).not.toThrow();
  await Promise.resolve();

  expect(fetch).toHaveBeenCalledTimes(2);
});

it("OPS-008: a non-Error value is reported by its text, and long strings are cut to the server's caps", () => {
  const { report, sent } = setup();

  report("uncaught", "plain reason");
  report("uncaught", { toString: () => "x".repeat(600) });
  const long = new Error("m");
  long.name = "N".repeat(150);
  long.stack = "s".repeat(5000);
  report("zone-crashed", long, { component: "C".repeat(300), digest: "d".repeat(150) });

  const [plain, object, cut] = sent();
  expect(plain).toMatchObject({ name: "Error", message: "plain reason" });
  expect(plain.stack).toBeUndefined();
  expect(object.message).toHaveLength(500);
  expect(cut.name).toHaveLength(100);
  expect(cut.stack).toHaveLength(4000);
  expect(cut.component).toHaveLength(200);
  expect(cut.digest).toHaveLength(100);
});

it("OPS-008: only the reporter names the client error endpoint", () => {
  const endpoint = "/api/client-errors";
  const allowed = [join("src", "client", "error-reporter."), join("src", "app", "api", "client-errors")];
  const files = readdirSync("src", { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));

  const naming = files.filter(
    (file) => !allowed.some((path) => file.startsWith(path)) && readFileSync(file, "utf8").includes(endpoint),
  );

  expect(naming).toEqual([]);
});