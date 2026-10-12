import {
  AppBar,
  AppBarTitle,
  Button,
  Fact,
  FactList,
  FormStatus,
  SettingsEmpty,
  SettingsLayout,
  SettingsSection,
  Table,
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
      <AppBar>
        <AppBarTitle>Notification status</AppBarTitle>
        <Button
          size="sm"
          disabled={isFetching}
          aria-busy={refreshing || undefined}
          onClick={refetch}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
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
      <SettingsSection title="Worker">
        <FactList>
          <Fact
            label="Last seen"
            mono>
            {stats.workerLastPassAt ? <RelativeTime at={stats.workerLastPassAt} /> : "Never"}
          </Fact>
        </FactList>
      </SettingsSection>
      <SettingsSection title="Queue">
        <QueueFacts queue={stats.queue} />
      </SettingsSection>
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

function QueueFacts({ queue }: { queue: NotificationStats["queue"] }) {
  return (
    <FactList>
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
    <Table aria-label="Last 24 hours">
      <thead>
        <tr>
          <th scope="col">Channel</th>
          <th scope="col">Sent</th>
          <th scope="col">Dropped</th>
          <th scope="col">Failed</th>
          <th scope="col">Bounced</th>
        </tr>
      </thead>
      <tbody>
        {channels.map((row) => (
          <tr key={row.channel}>
            <td>{channelNames[row.channel]}</td>
            <td className="tl-table__mono">{row.sent}</td>
            <td className="tl-table__mono">{row.dropped}</td>
            <td className="tl-table__mono">{row.failed}</td>
            <td className="tl-table__mono">{row.bounced}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function ProblemTable({ problems }: { problems: ProblemDelivery[] }) {
  return (
    <Table aria-label="Recent problems">
      <thead>
        <tr>
          <th scope="col">Recipient</th>
          <th scope="col">Channel</th>
          <th scope="col">Issue or project</th>
          <th scope="col">Attempts</th>
          <th scope="col">When</th>
        </tr>
      </thead>
      <tbody>
        {problems.map((problem) => (
          <tr key={problem.id}>
            <td className="tl-table__mono">{problem.username}</td>
            <td>{channelNames[problem.channel]}</td>
            <td className="tl-table__mono">{problem.target}</td>
            <td className="tl-table__mono">{problem.attempts}</td>
            <td className="tl-table__mono">
              <RelativeTime at={problem.at} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
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