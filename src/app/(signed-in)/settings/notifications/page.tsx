import { Region } from "../../../../components/region/Region";
import type { Member } from "../../../../infrastructure/identity/tables";
import { notificationStats } from "../../../../queries";
import { signedInPageMember } from "../../../_server/session";
import { NoPermission, SettingsTitle } from "../SettingsTitle";
import { NotificationStatusBar, StatsReport } from "./NotificationStatus";

export default async function NotificationStatusPage() {
  const member = await signedInPageMember();

  if (member.role !== "admin") {
    return (
      <>
        <SettingsTitle title="Notification status" />
        <NoPermission />
      </>
    );
  }

  return (
    <>
      <NotificationStatusBar />
      <Region what="notification status">
        <Stats member={member} />
      </Region>
    </>
  );
}

async function Stats({ member }: { member: Member }) {
  return <StatsReport stats={await notificationStats(member)} />;
}