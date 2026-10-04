import { Outlet } from "react-router";
import { AppShell, Rail } from "../components/ui/track-lite";

export function Shell() {
  return (
    <AppShell rail={<Rail head={<span className="tl-nav__brand">Tracklite</span>}>{null}</Rail>}>
      <Outlet />
    </AppShell>
  );
}