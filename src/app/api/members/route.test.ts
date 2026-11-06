import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../infrastructure/db";
import { members } from "../../../infrastructure/identity/tables";
import { createSession } from "../../../infrastructure/identity/session";
import { createMember } from "../../../test/factories";
import { GET } from "./route";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function listAs(role: "admin" | "member") {
  const viewer = await createMember({ role });
  const response = await GET(
    new Request("http://localhost:3000/api/members", {
      headers: { Cookie: `session=${await createSession(viewer.id)}` },
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { username: string }[];
}

function rowFor(list: { username: string }[], username: string) {
  return list.find((row) => row.username === username);
}

it("§3.3, REQ-007.2, REQ-008.2: members get every member, a deactivated one marked and a reactivated one not, without emails or roles", async () => {
  const sam = await createMember({ fullName: "Sam Lee", role: "admin" });
  const jo = await createMember({ fullName: "Jo Park", deactivatedAt: new Date() });
  const reactivated = await createMember({ deactivatedAt: new Date() });
  await db.update(members).set({ deactivatedAt: null }).where(eq(members.id, reactivated.id));

  const list = await listAs("member");

  expect(rowFor(list, sam.username)).toEqual({
    username: sam.username,
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: false,
  });
  expect(rowFor(list, jo.username)).toEqual({
    username: jo.username,
    fullName: "Jo Park",
    initials: "JP",
    deactivated: true,
  });
  expect(rowFor(list, reactivated.username)).toMatchObject({ deactivated: false });
});

it("REQ-051: admins get every member with email and role", async () => {
  const sam = await createMember({ fullName: "Sam Lee", role: "admin" });

  const list = await listAs("admin");

  expect(rowFor(list, sam.username)).toEqual({
    username: sam.username,
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: false,
    email: sam.email,
    role: "admin",
  });
});