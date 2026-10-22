import { expect, it } from "vitest";
import { needsAdmin, renamesArchived } from "./rules";

it("STD-2: renaming or archiving a project needs an admin; saving its description doesn't", () => {
  expect(needsAdmin({ name: "Web" })).toBe(true);
  expect(needsAdmin({ archived: false })).toBe(true);
  expect(needsAdmin({ description: "Hi", descriptionVersion: 1 })).toBe(false);
});

it("REQ-013: an archived project can't be renamed, but can be unarchived", () => {
  const archived = { archivedAt: new Date() };

  expect(renamesArchived(archived, { name: "Web" })).toBe(true);
  expect(renamesArchived(archived, { archived: false })).toBe(false);
  expect(renamesArchived({ archivedAt: null }, { name: "Web" })).toBe(false);
});