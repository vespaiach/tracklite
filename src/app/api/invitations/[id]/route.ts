import { apiRoute } from "../../../../server/api-route";
import { revokeInvitation } from "../../../../server/invitations";

export async function DELETE(request: Request, { params }: RouteContext<"/api/invitations/[id]">) {
  const { id } = await params;
  return apiRoute("admin", async () => {
    await revokeInvitation(id);
    return new Response(null, { status: 204 });
  })(request);
}