import {
  AppBar,
  AppBarTitle,
  Button,
  Fact,
  FactList,
  FormStatus,
  Mono,
  SettingsEmpty,
  SettingsGrid,
  SettingsLayout,
  SettingsSection,
  Table,
  WarningNote,
} from "../../components/ui/track-lite";
import {
  type ChannelStats,
  type NotificationChannel,
  type NotificationStats,
  type ProblemDelivery,
  useMeQuery,
  useNotificationStatsQuery,
} from "../api";
import { formatExact, formatUpdated, formatWait } from "../dates";
import { LoadFailed, Loading } from "../LoadStates";
import { useShowLoading } from "../useShowLoading";

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

export function NotificationStatus() {
  const { data: me } = useMeQuery();
  if (me?.role === "admin") return <NotificationStatusAdmin />;
  return (
    <>
      <AppBar>
        <AppBarTitle>Notification status</AppBarTitle>
      </AppBar>
      <SettingsLayout>
        <FormStatus>You don't have permission to do that.</FormStatus>
      </SettingsLayout>
    </>
  );
}

function NotificationStatusAdmin() {
  const { data, isLoading, isFetching, isError, refetch } = useNotificationStatsQuery();
  const showLoading = useShowLoading(isLoading);
  const refreshing = isFetching && !isLoading;

  return (
    <>
      <AppBar
        end={
          <Button
            size="sm"
            disabled={isFetching}
            aria-busy={refreshing || undefined}
            onClick={refetch}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        }>
        <AppBarTitle>Notification status</AppBarTitle>
      </AppBar>
      {isError ? (
        <LoadFailed onRetry={refetch} />
      ) : data ? (
        <StatsReport stats={data} />
      ) : (
        <Loading show={showLoading} />
      )}
    </>
  );
}

function StatsReport({ stats }: { stats: NotificationStats }) {
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
  const lastPassAt = stats.workerLastPassAt;
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

function workerWarning({ workerLastPassAt, workerStaleMinutes }: NotificationStats) {
  if (!workerLastPassAt) return "The worker has never run. No notifications are sent until it does.";
  if (workerStaleMinutes != null) {
    return (
      <>
        No pass for <Mono>{workerStaleMinutes}</Mono> min. Notifications wait in the queue until the worker
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