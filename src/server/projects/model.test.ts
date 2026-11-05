import { expect, it } from "vitest";
import { changeSettings, needsAdmin, newProject } from "./model";
import type { ProjectKey } from "./schemas";

const archived = {
  ...newProject({ id: "admin" }, { id: "p", key: "WEB" as ProjectKey, name: "Website" }),
  archived: true,
};

it("STD-2: renaming or archiving a project needs an admin; saving its description doesn't", () => {
  expect(needsAdmin({ name: "Web" })).toBe(true);
  expect(needsAdmin({ archived: false })).toBe(true);
  expect(needsAdmin({ description: "Hi", descriptionVersion: 1 })).toBe(false);
});

it("REQ-013: an archived project can't be renamed, but can be unarchived", () => {
  expect(() => changeSettings(archived, { name: "Web" })).toThrow(
    expect.objectContaining({ kind: "forbidden", message: "This project is archived" }),
  );
  expect(changeSettings(archived, { archived: false }).project.archived).toBe(false);
  expect(changeSettings({ ...archived, archived: false }, { name: "Web" }).project.name).toBe("Web");
});