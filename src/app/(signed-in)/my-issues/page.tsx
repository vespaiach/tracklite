import { Region } from "../../../components/region/Region";
import type { Member } from "../../../infrastructure/identity/tables";
import { getMyIssues } from "../../../queries";
import { signedInPageMember } from "../../_server/session";
import { MyIssues } from "./MyIssues";

export default async function MyIssuesPage() {
  const member = await signedInPageMember();

  return (
    <Region what="your issues">
      <AssignedIssues member={member} />
    </Region>
  );
}

async function AssignedIssues({ member }: { member: Member }) {
  return (
    <MyIssues
      groups={await getMyIssues(member)}
      me={member.username}
    />
  );
}