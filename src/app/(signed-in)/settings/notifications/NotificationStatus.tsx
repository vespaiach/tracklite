"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { formatExact, formatUpdated, formatWait } from "../../../../client/dates";
import {
  AppBar,
  AppBarTitle,
  Button,
  Fact,
  FactList,
  Mono,
  SettingsEmpty,
  SettingsGrid,
  SettingsLayout,
  SettingsSection,
  Table,
  WarningNote,
} from "../../../../components/ui/track-lite";
import type {
  ChannelStats,
  NotificationChannel,
  NotificationStats,
  ProblemDelivery,
} from "../../../../contract";

const channelNames: Record<NotificationChannel, string> = { email: "Email" };

const channelColumns = {
  channel: "auto",
  sent: "110px",
  dropped: "110px",
  failed: "110px",
  bounced: "110px",
};

const problemColumns = {
  recipient: "auto",
  channel: "auto",
  target: "auto",
  attempts: "110px",
  when: "140px",
};

export function NotificationStatusBar() {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  return (
    <AppBar
      end={
        <Button
          size="sm"
          disabled={refreshing}
          aria-busy={refreshing || undefined}
          onClick={() => startRefresh(() => router.refresh())}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      }>
      <AppBarTitle>Notification status</AppBarTitle>
    </AppBar>
  );
}

export function StatsReport({ stats }: { stats: NotificationStats }) {
  return (
    <SettingsLayout wide>
      <SettingsGrid>
        <SettingsSection title="Worker">
          <WorkerFacts stats={stats} />
        </SettingsSection>
        <SettingsSection title="Queue">
          <QueueFacts queue={stats.queue} />
        </SettingsSection>
      </SettingsGrid>
      <SettingsSection title="Last 24 hours">
        <ChannelTable channels={stats.channels} />
      </SettingsSection>
      <SettingsSection title="Recent problems">
        {stats.recentProblems.length > 0 ? (
          <ProblemTable problems={stats.recentProblems} />
        ) : (
          <SettingsEmpty>No failed or bounced notifications.</SettingsEmpty>
        )}
      </SettingsSection>
    </SettingsLayout>
  );
}

function WorkerFacts({ stats }: { stats: NotificationStats }) {
  const lastPassAt = stats.outboxLastRunAt;
  const warning = workerWarning(stats);

  return (
    <>
      <FactList split>
        <Fact
          label="Last seen"
          mono>
          <span className={warning ? "tl-warning" : undefined}>
            {lastPassAt ? <RelativeTime at={lastPassAt} /> : "Never"}
          </span>
        </Fact>
      </FactList>
      {warning && <WarningNote>{warning}</WarningNote>}
    </>
  );
}

function workerWarning({ outboxLastRunAt, outboxStaleMinutes }: NotificationStats) {
  if (!outboxLastRunAt) return "The outbox has never run. No notifications are sent until it does.";
  if (outboxStaleMinutes != null) {
    return (
      <>
        No outbox run for <Mono>{outboxStaleMinutes}</Mono> min. Notifications wait in the queue until it
        runs.
      </>
    );
  }
  return undefined;
}

function QueueFacts({ queue }: { queue: NotificationStats["queue"] }) {
  return (
    <FactList split>
      <Fact
        label="Pending"
        mono>
        {queue.pending}
      </Fact>
      <Fact
        label="Due"
        mono>
        {queue.due}
      </Fact>
      <Fact
        label="Oldest due has waited"
        mono>
        {queue.due > 0 ? formatWait(queue.oldestDueSeconds) : "None"}
      </Fact>
    </FactList>
  );
}

function ChannelTable({ channels }: { channels: ChannelStats[] }) {
  return (
    <Table
      aria-label="Last 24 hours"
      columns={channelColumns}>
      <thead>
        <tr>
          <th scope="col">Channel</th>
          <NumberHead>Sent</NumberHead>
          <NumberHead>Dropped</NumberHead>
          <NumberHead>Failed</NumberHead>
          <NumberHead>Bounced</NumberHead>
        </tr>
      </thead>
      <tbody>
        {channels.map((row) => (
          <tr key={row.channel}>
            <th scope="row">{channelNames[row.channel]}</th>
            <td className="tl-table__num">{row.sent}</td>
            <td className="tl-table__num">{row.dropped}</td>
            <td className="tl-table__num">{row.failed}</td>
            <td className="tl-table__num">{row.bounced}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function ProblemTable({ problems }: { problems: ProblemDelivery[] }) {
  return (
    <Table
      aria-label="Recent problems"
      columns={problemColumns}>
      <thead>
        <tr>
          <th scope="col">Recipient</th>
          <th scope="col">Channel</th>
          <th scope="col">Issue or project</th>
          <NumberHead>Attempts</NumberHead>
          <NumberHead>When</NumberHead>
        </tr>
      </thead>
      <tbody>
        {problems.map((problem) => (
          <tr key={problem.id}>
            <td className="tl-table__mono">{problem.username}</td>
            <td>{channelNames[problem.channel]}</td>
            <td className="tl-table__mono">{problem.target}</td>
            <td className="tl-table__num">{problem.attempts}</td>
            <td className="tl-table__num">
              <RelativeTime at={problem.at} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function NumberHead({ children }: { children: string }) {
  return (
    <th
      scope="col"
      className="tl-table__num">
      {children}
    </th>
  );
}

function RelativeTime({ at }: { at: string }) {
  return (
    <time
      dateTime={at}
      title={formatExact(at)}>
      {formatUpdated(at)}
    </time>
  );
}