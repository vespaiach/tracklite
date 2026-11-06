import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { ProjectKey, tryFrom } from "../../../../domain/shared/identifiers";
import { findProject, listMembers } from "../../../../queries";
import { requestPathHeader } from "../../../../proxy";
import { signedInPageMember } from "../../../_server/session";

export const projectAt = cache(async (typedKey: string) => {
  const member = await signedInPageMember();

  const project = await findProject(member, tryFrom(ProjectKey, typedKey));
  if (!project) notFound();

  if (project.key !== typedKey) redirect(await canonicalAddress(typedKey, project.key));
  return project;
});

async function canonicalAddress(typedKey: string, key: string) {
  const typedPrefix = `/project/${typedKey}`;
  const path = (await headers()).get(requestPathHeader) ?? "";
  const rest = path.slice(typedPrefix.length);
  const addressedByTypedKey = path.startsWith(typedPrefix) && (rest === "" || /^[/?]/.test(rest));
  return `/project/${key}${addressedByTypedKey ? rest : ""}`;
}

export const assignableMembers = cache(async () => listMembers(await signedInPageMember()));