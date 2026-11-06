import { updateMember } from "../../../../application/identity/update-member";
import type { Me } from "../../../../contract";
import { tryFrom, Username } from "../../../../domain/shared/identifiers";
import { identityWork } from "../../../../infrastructure/identity/repositories";
import { memberProfile } from "../../../../queries";
import { MemberChanges } from "../../../../server/identity";
import { apiRoute } from "../../../../server/shared/api-route";

export async function PATCH(request: Request, { params }: RouteContext<"/api/members/[username]">) {
  const username = tryFrom(Username, (await params).username);
  return apiRoute("member", MemberChanges, async (_memberRequest, member, changes) => {
    const updated = await updateMember(member, identityWork, username, changes);
    return Response.json((await memberProfile(updated)) satisfies Me);
  })(request);
}