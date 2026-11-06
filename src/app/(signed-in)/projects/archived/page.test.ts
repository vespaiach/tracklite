import type { ReactElement, ReactNode } from "react";
import { expect, it } from "vitest";
import { Region } from "../../../../components/region/Region";
import { createSession, sessionCookieName } from "../../../../infrastructure/identity/session";
import { createMember, createProject } from "../../../../test/factories";
import { setNextRequest } from "../../../../test/next-request";
import { SettingsTitle } from "../../settings/SettingsTitle";
import { ArchivedProjects } from "./ArchivedProjects";
import ArchivedProjectsPage from "./page";

type Element = ReactElement<{ children?: ReactNode } & Record<string, unknown>>;

it("REQ-013.1: the archived projects page has its title and reads the archived projects inside a region", async () => {
  const member = await createMember();
  setNextRequest({ cookies: { [sessionCookieName()]: await createSession(member.id) } });
  const old = await createProject({ archivedAt: new Date() });
  const active = await createProject();

  const [title, region] = ((await ArchivedProjectsPage()) as Element).props.children as Element[];
  const loader = region.props.children as ReactElement<Record<string, unknown>>;
  const list = (await (loader.type as (props: unknown) => Promise<unknown>)(loader.props)) as Element;

  expect(title.type).toBe(SettingsTitle);
  expect(title.props.title).toBe("Archived projects");
  expect(region.type).toBe(Region);
  expect(list.type).toBe(ArchivedProjects);
  const keys = (list.props.projects as { key: string }[]).map((project) => project.key);
  expect(keys).toContain(old.key);
  expect(keys).not.toContain(active.key);
});