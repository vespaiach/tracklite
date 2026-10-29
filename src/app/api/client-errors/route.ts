import { ClientErrorReport, clientIp, reportClientError, signedInMember } from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const POST = apiRoute("public", ClientErrorReport, async (request, report, nameActor) => {
  const member = await signedInMember(request);
  if (member) nameActor(member.username);

  const sender = { ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? "" };
  await reportClientError(member, report, sender);

  return new Response(null, { status: 204 });
});