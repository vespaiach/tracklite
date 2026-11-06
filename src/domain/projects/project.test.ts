import { expect, it } from "vitest";
import { ProjectKey } from "../shared/identifiers";
import { LabelColor } from "./label-color";
import { LabelName } from "./label-name";
import { Project } from "./project";
import { needsAdmin } from "./project-change";
import { ProjectName } from "./project-name";

function website() {
  return Project.create({ id: "admin" }, { key: ProjectKey.from("WEB"), name: ProjectName.from("Website") });
}

function archivedWebsite() {
  const project = website();
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

it("REQ-013.3: an archived project refuses description saves and label changes", () => {
  const project = archivedWebsite();

  for (const change of [
    () => project.saveDescription({ id: "admin" }, "Hi", 0),
    () => project.addLabel(LabelName.from("bug"), LabelColor.from("red")),
  ]) {
    expect(change).toThrow(expect.objectContaining({ kind: "forbidden" }));
  }
});

it("REQ-021: a label is edited in place, and editing or removing a missing one says it no longer exists", () => {
  const project = website();
  const labelId = project.addLabel(LabelName.from("bug"), LabelColor.from("red"));

  project.editLabel(labelId, { color: LabelColor.from("blue") });
  expect(project.props.labels.map(({ name, color }) => [name.value, color.value])).toEqual([["bug", "blue"]]);
  for (const change of [() => project.editLabel("gone", {}), () => project.removeLabel("gone")]) {
    expect(change).toThrow("That label no longer exists");
  }
  project.removeLabel(labelId);
  expect(project.props.labels).toEqual([]);
});