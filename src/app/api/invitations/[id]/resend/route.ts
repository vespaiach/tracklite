import { apiRoute } from "../../../../../server/api-route";
import { resendInvitation } from "../../../../../server/invitations";

export async function POST(request: Request, { params }: RouteContext<"/api/invitations/[id]/resend">) {
  const { id } = await params;
  return apiRoute("admin", async (_request, member) => Response.json(await resendInvitation(member, id)))(
    request,
  );
}