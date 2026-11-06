import { expect, it } from "vitest";
import { Username } from "../shared/identifiers";
import { FullName } from "./full-name";
import { Member } from "./member";
import { Role } from "./role";

function member(role: Role = Role.admin) {
  return Member.create({
    email: "sam@x.com",
    fullName: FullName.from("Sam Lee"),
    username: Username.from("sam"),
    role,
    passwordHash: "hash",
  });
}

const lastAdmin = { kind: "invalid", message: "There must be at least one admin." };

it("REQ-007.3, REQ-052.3: the one active admin left can't lose the admin role or be deactivated", () => {
  const sam = member();

  expect(() => sam.removeAdmin([sam.props.id])).toThrow(expect.objectContaining(lastAdmin));
  expect(() => sam.deactivate([sam.props.id])).toThrow(expect.objectContaining(lastAdmin));
  expect(sam.props.role).toBe(Role.admin);
  expect(sam.props.deactivatedAt).toBeNull();
});

it("REQ-052.1, REQ-052, REQ-007: with another active admin, an admin can be made a member or deactivated; a member can be made admin", () => {
  const sam = member();
  const alex = member(Role.member);

  sam.removeAdmin([sam.props.id, "jo"]);
  alex.makeAdmin();
  alex.deactivate([]);

  expect(sam.props.role).toBe(Role.member);
  expect(alex.props.role).toBe(Role.admin);
  expect(alex.props.deactivatedAt).toBeInstanceOf(Date);
});

it("REQ-007, REQ-008: deactivating twice keeps the first time, and reactivating clears it", () => {
  const alex = member(Role.member);
  alex.deactivate([]);
  const firstTime = alex.props.deactivatedAt;

  alex.deactivate([]);
  expect(alex.props.deactivatedAt).toBe(firstTime);

  alex.reactivate();
  expect(alex.props.deactivatedAt).toBeNull();
});

it("REQ-003, REQ-052: a full name is trimmed, required and at most 60 characters; a role is admin or member", () => {
  expect(FullName.from("  Sam Lee ").value).toBe("Sam Lee");
  expect(() => FullName.from("   ")).toThrow(expect.objectContaining({ message: "Name required" }));
  expect(FullName.from("李".repeat(60)).value).toHaveLength(60);
  expect(() => FullName.from("a".repeat(61))).toThrow(
    expect.objectContaining({ message: "Too long (max 60)" }),
  );
  expect(Role.from("member")).toBe(Role.member);
  expect(() => Role.from("owner")).toThrow(expect.objectContaining({ message: "Choose admin or member" }));
});