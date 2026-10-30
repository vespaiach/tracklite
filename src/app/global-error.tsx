"use client";

import { useState } from "react";
import { CrashScreen } from "../client/CrashScreen";
import { createBrowserErrorReporter } from "../client/error-reporter";
import "../components/ui/track-lite/styles/index.css";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [report] = useState(createBrowserErrorReporter);
  return (
    <html lang="en">
      <body>
        <title>Tracklite</title>
        <CrashScreen
          error={error}
          report={report}
        />
      </body>
    </html>
  );
}