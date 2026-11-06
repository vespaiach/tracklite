import { expect, it } from "vitest";
import { ProjectKey } from "../shared/identifiers";
import { Project } from "./project";
import { needsAdmin } from "./project-change";
import { ProjectName } from "./project-name";

function archivedWebsite() {
  const project = Project.create(
    { id: "admin" },
    { key: ProjectKey.from("WEB"), name: ProjectName.from("Website") },
  );
  project.changeSettings({ archived: true });
  return project;
}

it("STD-2: renaming or archiving a project needs an admin; saving its description doesn't", () => {
  expect(needsAdmin({ name: ProjectName.from("Web") })).toBe(true);
  expect(needsAdmin({ archived: false })).toBe(true);
  expect(needsAdmin({ description: "Hi", descriptionVersion: 1 })).toBe(false);
});

it("REQ-013: an archived project can't be renamed, but can be unarchived", () => {
  const project = archivedWebsite();

  expect(() => project.changeSettings({ name: ProjectName.from("Web") })).toThrow(
    expect.objectContaining({ kind: "forbidden", message: "This project is archived" }),
  );
  project.changeSettings({ archived: false });
  expect(project.props.archived).toBe(false);
  project.changeSettings({ name: ProjectName.from("Web") });
  expect(project.props.name.value).toBe("Web");
});