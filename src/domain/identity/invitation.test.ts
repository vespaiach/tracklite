import { expect, it } from "vitest";
import { Username } from "../shared/identifiers";
import { FullName } from "./full-name";
import { assertInvitable, Invitation, usableInvitation } from "./invitation";
import { Member } from "./member";
import { Role } from "./role";

function invitation(state: Partial<{ accepted: boolean; revoked: boolean; expired: boolean }> = {}) {
  return Invitation.rehydrate({
    id: "invitation",
    email: "sam@acme.com",
    invitedBy: "alex",
    providerMessageId: null,
    accepted: false,
    revoked: false,
    bounced: false,
    expired: false,
    ...state,
  });
}

it("REQ-001.2, REQ-001.5, REQ-001.6: inviting a member's or a deactivated person's email is refused; a new email isn't", () => {
  const jo = Member.create({
    email: "jo@acme.com",
    fullName: FullName.from("Jo Park"),
    username: Username.from("jo"),
    role: Role.member,
    passwordHash: "hash",
  });

  expect(() => assertInvitable(jo)).toThrow(expect.objectContaining({ message: "Already a member" }));
  jo.deactivate([]);
  expect(() => assertInvitable(jo)).toThrow(
    expect.objectContaining({ message: "This person is deactivated. Reactivate them instead." }),
  );
  expect(() => assertInvitable(undefined)).not.toThrow();
});

it("REQ-002.2, REQ-002.4: a revoked, expired, used or unknown invitation link is refused; an open one is usable", () => {
  const expired = expect.objectContaining({
    kind: "expired",
    message: "This invitation has expired. Ask an admin for a new one.",
  });
  const open = invitation();

  expect(() => usableInvitation(invitation({ revoked: true }))).toThrow(
    expect.objectContaining({ kind: "expired", message: "This invitation is no longer valid." }),
  );
  expect(() => usableInvitation(invitation({ expired: true }))).toThrow(expired);
  expect(() => usableInvitation(invitation({ accepted: true }))).toThrow(expired);
  expect(() => usableInvitation(undefined)).toThrow(expired);
  expect(usableInvitation(open)).toBe(open);
});