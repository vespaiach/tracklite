import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/db";
import { members } from "../../../server/schema";
import { createSession } from "../../../server/sessions";
import { createMember } from "../../../test/factories";
import { GET } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
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

it("§3.3: members get every member, active and deactivated, without emails or roles", async () => {
  const sam = await createMember({ fullName: "Sam Lee", role: "admin" });
  const jo = await createMember({ fullName: "Jo Park", deactivatedAt: new Date() });

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

it("REQ-007.2: the member list marks a deactivated member", async () => {
  const sam = await createMember({ deactivatedAt: new Date() });

  expect(rowFor(await listAs("member"), sam.username)).toMatchObject({ deactivated: true });
});

it("REQ-008.2: the member list no longer marks a reactivated member", async () => {
  const sam = await createMember({ deactivatedAt: new Date() });
  await db.update(members).set({ deactivatedAt: null }).where(eq(members.id, sam.id));

  expect(rowFor(await listAs("member"), sam.username)).toMatchObject({ deactivated: false });
});

it("STD-1: signed out gets 401", async () => {
  expect((await GET(new Request("http://localhost:3000/api/members"))).status).toBe(401);
});