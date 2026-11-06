import type { ReactElement, ReactNode } from "react";
import { expect, it } from "vitest";
import { Region } from "../../../../components/region/Region";
import { createSession, sessionCookieName } from "../../../../infrastructure/identity/session";
import { createLabel, createMember, createProject } from "../../../../test/factories";
import { setNextRequest } from "../../../../test/next-request";
import { NoPermission } from "../../settings/SettingsTitle";
import { Labels } from "./labels/Labels";
import LabelsPage from "./labels/page";
import SettingsPage from "./settings/page";
import { ProjectSettings } from "./settings/ProjectSettings";

type Element = ReactElement<{ children?: ReactNode } & Record<string, unknown>>;

async function signedInAs(role: "admin" | "member") {
  const member = await createMember({ role });
  setNextRequest({ cookies: { [sessionCookieName()]: await createSession(member.id) } });
  return member;
}

function paramsFor(key: string) {
  return { params: Promise.resolve({ key }), searchParams: Promise.resolve({}) };
}

async function regionContent(region: Element) {
  const loader = region.props.children as ReactElement<Record<string, unknown>>;
  return (await (loader.type as (props: unknown) => Promise<unknown>)(loader.props)) as Element;
}

it("REQ-021, REQ-013.5: the labels page reads the project's labels inside a region, for an archived project too", async () => {
  await signedInAs("member");
  const project = await createProject({ name: "Old site", archivedAt: new Date() });
  const bug = await createLabel(project.id, { name: "bug" });

  const region = (await LabelsPage(paramsFor(project.key))) as Element;
  const labels = await regionContent(region);

  expect(region.type).toBe(Region);
  expect(labels.type).toBe(Labels);
  expect(labels.props.project).toMatchObject({ key: project.key, archivedAt: expect.any(String) });
  expect(labels.props.labels).toEqual([{ id: bug.id, name: "bug", color: "gray", issueCount: 0 }]);
});

it("STD-2: a member opening project settings sees no permission; an admin gets the settings for the project", async () => {
  const project = await createProject({ name: "Website" });

  await signedInAs("member");
  expect(((await SettingsPage(paramsFor(project.key))) as Element).type).toBe(NoPermission);

  await signedInAs("admin");
  const settings = (await SettingsPage(paramsFor(project.key))) as Element;
  expect(settings.type).toBe(ProjectSettings);
  expect(settings.props.project).toEqual({ key: project.key, name: "Website", archivedAt: null });
});

it("STD-4: the labels and settings pages of an unknown project show Not found", async () => {
  await signedInAs("admin");

  await expect(LabelsPage(paramsFor("NOPE"))).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(SettingsPage(paramsFor("NOPE"))).rejects.toThrow("NEXT_NOT_FOUND");
});