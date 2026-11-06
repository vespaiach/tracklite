import { expect, it } from "vitest";
import { ProjectKey } from "../domain/shared/identifiers";
import { createIssue, createLabel, createMember, createProject } from "../test/factories";
import { listLabels } from "./labels";

it("REQ-021.5: the label list shows how many issues have each label, sorted by name ignoring capitals", async () => {
  const member = await createMember();
  const project = await createProject();
  const frontend = await createLabel(project.id, { name: "frontend", color: "blue" });
  const bug = await createLabel(project.id, { name: "Bug", color: "red" });
  for (let i = 0; i < 12; i++) await createIssue(project.id, [frontend.id]);
  await createIssue(project.id, [frontend.id, bug.id]);
  await createIssue(project.id);

  expect(await listLabels(member, ProjectKey.from(project.key.toLowerCase()))).toEqual([
    { id: bug.id, name: "Bug", color: "red", issueCount: 1 },
    { id: frontend.id, name: "frontend", color: "blue", issueCount: 13 },
  ]);
});

it("REQ-013.5: an archived project's labels are still listed", async () => {
  const member = await createMember();
  const project = await createProject({ archivedAt: new Date() });
  const bug = await createLabel(project.id, { name: "bug" });

  expect(await listLabels(member, ProjectKey.from(project.key))).toEqual([
    { id: bug.id, name: "bug", color: "gray", issueCount: 0 },
  ]);
});

it("STD-4: labels of an unknown project are Not found", async () => {
  const member = await createMember();

  await expect(listLabels(member, ProjectKey.from("NOPE"))).rejects.toMatchObject({
    kind: "notFound",
    message: "Not found",
  });
});