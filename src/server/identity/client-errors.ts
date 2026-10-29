import "server-only";
import { logError } from "../shared/log";
import { clientErrorLimitReached, recordClientErrorReport } from "./limits";
import { describeUserAgent, maskIp } from "./rules";
import type { ClientErrorReport } from "./schemas";
import type { Member } from "./sessions";

type Sender = { ip: string; userAgent: string };

export async function reportClientError(
  actor: Member | undefined,
  report: ClientErrorReport,
  sender: Sender,
) {
  const reporter = { username: actor?.username ?? null, ip: maskIp(sender.ip) };

  if (await clientErrorLimitReached(reporter)) return;
  await recordClientErrorReport(reporter);

  const { event, name, message, stack, page, build, component, digest, timeZone, occurredAt } = report;
  logError(
    "client",
    event,
    { name, message, stack },
    {
      actor: actor?.username,
      ip: reporter.ip,
      ...describeUserAgent(sender.userAgent),
      page,
      build,
      component,
      digest,
      timeZone,
      occurredAt,
    },
  );
}