import type { Me, MemberSummary } from "../../../client/api";
import { ApiError } from "../../../server/api-error";
import { apiRoute } from "../../../server/api-route";
import { acceptInvitation } from "../../../server/invitations";
import { listMembers, profileResponse } from "../../../server/members";
import { sessionCookie, signedInMember } from "../../../server/sessions";

export const GET = apiRoute("member", async (_request, member) =>
  Response.json((await listMembers(member)) satisfies (Me | MemberSummary)[]),
);

export const POST = apiRoute("public", async (request) => {
  const signedIn = await signedInMember(request);
  if (signedIn) {
    throw new ApiError(403, `You're signed in as ${signedIn.fullName}. Sign out to accept this invitation.`);
  }

  const body: { token?: unknown; fullName?: unknown; username?: unknown; password?: unknown } =
    await request.json();
  const { member, sessionToken } = await acceptInvitation({
    token: String(body.token ?? ""),
    fullName: String(body.fullName ?? ""),
    username: String(body.username ?? ""),
    password: String(body.password ?? ""),
  });
  return Response.json(profileResponse(member) satisfies Me, {
    status: 201,
    headers: { "set-cookie": sessionCookie(sessionToken) },
  });
});