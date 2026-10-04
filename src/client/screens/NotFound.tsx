import { Link } from "react-router";
import { AppBar, AppBarTitle } from "../../components/ui/track-lite";

export function NotFound() {
  return (
    <>
      <AppBar>
        <AppBarTitle>Not found</AppBarTitle>
      </AppBar>
      <p>
        <Link to="/my-issues">My issues</Link>
      </p>
    </>
  );
}