import { Outlet } from "react-router";
import { AppShell, Rail } from "../components/ui/track-lite";
import { useMeQuery } from "./api";

export function Shell() {
  const { isSuccess } = useMeQuery();
  return (
    <AppShell rail={<Rail head={<span className="tl-nav__brand">Tracklite</span>}>{null}</Rail>}>
      {isSuccess && <Outlet />}
    </AppShell>
  );
}