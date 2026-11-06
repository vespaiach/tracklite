import { type ClientErrorEvent, describeUserAgent, maskIp } from "../../domain/identity/client-error";
import type { UnitOfWork } from "../shared/unit-of-work";
import type { ClientErrorLog, ClientErrorReporter, RequestLimits } from "./ports";

type Repositories = { clientErrorLimits: RequestLimits<ClientErrorReporter>; clientErrorLog: ClientErrorLog };

type ClientErrorReport = {
  event: ClientErrorEvent;
  name: string;
  message: string;
  stack?: string;
  page: string;
  component?: string;
  digest?: string;
  build?: string;
  timeZone?: string;
  occurredAt: string;
};

type Sender = { ip: string; userAgent: string };

export async function reportClientError(
  actor: { username: string } | undefined,
  work: UnitOfWork<Repositories>,
  report: ClientErrorReport,
  sender: Sender,
) {
  const reporter = { username: actor?.username ?? null, ip: maskIp(sender.ip) };

  await work.run(async ({ clientErrorLimits, clientErrorLog }) => {
    if (await clientErrorLimits.reached(reporter)) return;
    await clientErrorLimits.record(reporter);

    const { event, name, message, stack, page, build, component, digest, timeZone, occurredAt } = report;
    clientErrorLog.write(
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
  });
}