import { Region } from "../../../../components/region/Region";
import type { Me } from "../../../../contract";
import type { Member } from "../../../../infrastructure/identity/tables";
import { listInvitations, listMembers } from "../../../../queries";
import { signedInPageMember } from "../../../_server/session";
import { NoPermission, SettingsTitle } from "../SettingsTitle";
import { createInvitation, resendInvitation, revokeInvitation, updateMember } from "./actions";
import { Members } from "./Members";

export default async function MembersPage() {
  const member = await signedInPageMember();

  return (
    <>
      <SettingsTitle title="Members" />
      {member.role === "admin" ? (
        <Region what="members">
          <MembersAndInvitations member={member} />
        </Region>
      ) : (
        <NoPermission />
      )}
    </>
  );
}

async function MembersAndInvitations({ member }: { member: Member }) {
  const [members, invitations] = await Promise.all([listMembers(member), listInvitations(member)]);

  return (
    <Members
      you={member.username}
      members={members as Me[]}
      invitations={invitations}
      createInvitation={createInvitation}
      resendInvitation={resendInvitation}
      revokeInvitation={revokeInvitation}
      updateMember={updateMember}
    />
  );
}