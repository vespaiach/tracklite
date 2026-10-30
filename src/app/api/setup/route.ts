import type { Me, SetupStatus } from "../../../contract";
import {
  createFirstAdmin,
  FirstAdmin,
  profileResponse,
  sessionCookie,
  setupNeeded,
} from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const GET = apiRoute("public", async () =>
  Response.json({ needed: await setupNeeded() } satisfies SetupStatus),
);

export const POST = apiRoute("public", FirstAdmin, async (_request, firstAdmin) => {
  const { member, sessionToken } = await createFirstAdmin(firstAdmin);
  return Response.json(profileResponse(member) satisfies Me, {
    status: 201,
    headers: { "set-cookie": sessionCookie(sessionToken) },
  });
});