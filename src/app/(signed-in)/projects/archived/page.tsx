import { Region } from "../../../../components/region/Region";
import type { Member } from "../../../../infrastructure/identity/tables";
import { listProjects } from "../../../../queries";
import { signedInPageMember } from "../../../_server/session";
import { SettingsTitle } from "../../settings/SettingsTitle";
import { ArchivedProjects } from "./ArchivedProjects";

export default async function ArchivedProjectsPage() {
  const member = await signedInPageMember();

  return (
    <>
      <SettingsTitle title="Archived projects" />
      <Region what="archived projects">
        <ArchivedList member={member} />
      </Region>
    </>
  );
}

async function ArchivedList({ member }: { member: Member }) {
  return <ArchivedProjects projects={await listProjects(member, true)} />;
}