import type { RouteObject } from "react-router";
import { RouteCrashScreen } from "./CrashScreen";

export const routes: RouteObject[] = [
  {
    errorElement: <RouteCrashScreen />,
    children: [
      {
        children: [
          {
            path: "settings/profile",
            lazy: async () => ({ Component: (await import("./screens/Profile")).Profile }),
          },
          {
            path: "settings/members",
            lazy: async () => ({ Component: (await import("./screens/Members")).Members }),
          },
          {
            path: "settings/notifications",
            lazy: async () => ({
              Component: (await import("./screens/NotificationStatus")).NotificationStatus,
            }),
          },
          {
            path: "project/:key/labels",
            lazy: async () => ({ Component: (await import("./screens/Labels")).Labels }),
          },
          {
            path: "project/:key/settings",
            lazy: async () => ({ Component: (await import("./screens/ProjectSettings")).ProjectSettings }),
          },
          {
            path: "issue/:id",
            lazy: async () => ({ Component: (await import("./screens/Issue")).IssuePage }),
          },
          {
            path: "projects/archived",
            lazy: async () => ({ Component: (await import("./screens/ArchivedProjects")).ArchivedProjects }),
          },
          {
            path: "*",
            lazy: async () => ({ Component: (await import("../app/(signed-in)/not-found")).default }),
          },
        ],
      },
    ],
  },
];