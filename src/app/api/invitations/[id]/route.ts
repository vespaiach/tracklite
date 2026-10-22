import { apiRoute } from "../../../../server/shared/api-route";
import { revokeInvitation } from "../../../../server/identity";

export async function DELETE(request: Request, { params }: RouteContext<"/api/invitations/[id]">) {
  const { id } = await params;
  return apiRoute("member", async (_request, member) => {
    await revokeInvitation(member, id);
    return new Response(null, { status: 204 });
  })(request);
}