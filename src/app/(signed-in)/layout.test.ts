import { expect, it } from "vitest";
import { createSession, sessionCookieName } from "../../infrastructure/identity/session";
import { requestPathHeader } from "../../proxy";
import { createMember } from "../../test/factories";
import { setNextRequest } from "../../test/next-request";
import SignedInLayout from "./layout";

function visit(path: string | undefined, cookies: Record<string, string> = {}) {
  setNextRequest({ cookies, headers: path === undefined ? {} : { [requestPathHeader]: path } });
  return SignedInLayout({ children: "the page" });
}

it("STD-1, REQ-006.2: a signed-out visitor is sent to /sign-in with the requested path and query as next; a signed-in member gets the page", async () => {
  const sam = await createMember();
  const token = await createSession(sam.id);

  await expect(visit("/project/WEB/list?status=todo")).rejects.toMatchObject({
    url: `/sign-in?next=${encodeURIComponent("/project/WEB/list?status=todo")}`,
  });
  await expect(visit("/issue/WEB-42", { [sessionCookieName()]: "unknown-token" })).rejects.toMatchObject({
    url: `/sign-in?next=${encodeURIComponent("/issue/WEB-42")}`,
  });
  expect(await visit("/issue/WEB-42", { [sessionCookieName()]: token })).toBe("the page");
});

it("SEC-009, SEC-009.1: a requested address that isn't an in-app path, or none, sends a signed-out visitor to /sign-in without next", async () => {
  for (const path of ["//evil.example", "/\\evil.example", "https://evil.example", undefined]) {
    await expect(visit(path)).rejects.toMatchObject({ url: "/sign-in" });
  }
});