import { expect, it } from "vitest";
import { formatExact, formatUpdated } from "./dates";

const now = new Date("2026-10-06T12:00:00Z");

function ago(milliseconds: number) {
  return new Date(now.getTime() - milliseconds).toISOString();
}

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

it("formatUpdated: relative for the past 7 days, as in design §6.7", () => {
  expect(formatUpdated(ago(30_000), now)).toBe("just now");
  expect(formatUpdated(ago(5 * minute), now)).toBe("5 min ago");
  expect(formatUpdated(ago(hour), now)).toBe("1 hour ago");
  expect(formatUpdated(ago(3 * hour), now)).toBe("3 hours ago");
  expect(formatUpdated(ago(2 * day), now)).toBe("2 days ago");
  expect(formatUpdated(ago(6 * day + 23 * hour), now)).toBe("6 days ago");
});

it("REQ-031.4: a date after 7 days, with the year only when it isn't this year", () => {
  expect(formatUpdated("2026-09-20T12:00:00Z", now)).toBe("Sep 20");
  expect(formatUpdated("2025-09-20T12:00:00Z", now)).toBe("Sep 20, 2025");
});

it("DATA-003.1: a comment saved at 02:00 UTC shows 09:00 to a member on UTC+7", () => {
  expect(formatExact("2026-10-06T02:00:00Z", "Asia/Bangkok")).toBe("Oct 6, 2026, 09:00 GMT+7");
});