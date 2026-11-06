import { expect, it } from "vitest";
import { IssueId, ProjectKey, RequestId, tryFrom, Username, Uuid } from "./identifiers";

const uuid = "0b0e6a2c-5d1f-4c8e-9a3b-2f4d6e8a1c3b";

it("REQ-016.5, M16: IssueId.from uppercases a key and number and rejects anything else", () => {
  const id = IssueId.from("web-42");

  expect([id.value, id.key.value, id.number]).toEqual(["WEB-42", "WEB", 42]);
  for (const raw of ["WEB-0", "WEB-042", "WEB42", "W-42", "WEB-1234567890", 42]) {
    expect(() => IssueId.from(raw)).toThrow(expect.objectContaining({ kind: "invalid" }));
  }
});

it("REQ-009.4, M16: ProjectKey.from uppercases 2 to 5 letters and rejects anything else", () => {
  expect(ProjectKey.from("web").value).toBe("WEB");
  for (const raw of ["W", "WEB1", "ÉQ", "WEBSIT"]) {
    expect(() => ProjectKey.from(raw)).toThrow("Key must be 2 to 5 letters");
  }
});

it("REQ-003, M16: Username.from lowercases 2 to 20 letters, digits or hyphens and rejects anything else", () => {
  expect(Username.from("sam-lee2").value).toBe("sam-lee2");
  expect(Username.from("Sam").value).toBe("sam");
  for (const raw of ["s", "sam lee", "sam_lee", "a".repeat(21)]) {
    expect(() => Username.from(raw)).toThrow("Use 2 to 20 letters, digits or hyphens");
  }
});

it("STD-5, M16: a RequestId must be a UUID", () => {
  expect(RequestId.from(uuid).value).toBe(uuid);
  for (const raw of ["retry-1", 42]) {
    expect(() => RequestId.from(raw)).toThrow("Invalid request");
  }
});

it("M16: a Uuid accepts a UUID in either case, and tryFrom gives undefined for anything else", () => {
  expect(Uuid.from(uuid.toUpperCase()).value).toBe(uuid.toUpperCase());
  expect(tryFrom(Uuid, uuid)?.value).toBe(uuid);
  for (const raw of ["not-a-uuid", uuid.replaceAll("-", ""), ""]) {
    expect(tryFrom(Uuid, raw)).toBeUndefined();
  }
});