import type { RouteObject } from "react-router";
import { RouteCrashScreen } from "./CrashScreen";

export const routes: RouteObject[] = [
  {
    errorElement: <RouteCrashScreen />,
    children: [
      {
        children: [
          {
            path: "project/:key",
            lazy: async () => ({ Component: (await import("./screens/Project")).ProjectBoard }),
          },
          {
            path: "project/:key/list",
            lazy: async () => ({ Component: (await import("./screens/Project")).ProjectList }),
          },
          {
            path: "project/:key/detail",
            lazy: async () => ({ Component: (await import("./screens/ProjectDetail")).ProjectDetail }),
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
          { path: "*", lazy: async () => ({ Component: (await import("./screens/NotFound")).NotFound }) },
        ],
      },
    ],
  },
];