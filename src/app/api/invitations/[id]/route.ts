import { revokeInvitation } from "../../../../application/identity/revoke-invitation";
import { tryFrom, Uuid } from "../../../../domain/shared/identifiers";
import { identityWork } from "../../../../infrastructure/identity/repositories";
import { apiRoute } from "../../../../server/shared/api-route";

export async function DELETE(request: Request, { params }: RouteContext<"/api/invitations/[id]">) {
  const id = tryFrom(Uuid, (await params).id);
  return apiRoute("member", async (_request, member) => {
    await revokeInvitation(member, identityWork, id);
    return new Response(null, { status: 204 });
  })(request);
}