import { Link } from "react-router";

export function NotFound() {
  return (
    <main className="tl-page-message">
      <h1 className="tl-page-message__title">Not found</h1>
      <p>
        <Link to="/my-issues">Go to My issues</Link>
      </p>
    </main>
  );
}