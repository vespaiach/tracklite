import { apiRoute } from "../../../../server/shared/api-route";
import { tryFrom, Uuid } from "../../../../domain/shared/identifiers";
import { revokeInvitation } from "../../../../server/identity";

export async function DELETE(request: Request, { params }: RouteContext<"/api/invitations/[id]">) {
  const id = tryFrom(Uuid, (await params).id);
  return apiRoute("member", async (_request, member) => {
    await revokeInvitation(member, id);
    return new Response(null, { status: 204 });
  })(request);
}