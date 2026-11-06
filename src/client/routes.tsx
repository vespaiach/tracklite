import type { RouteObject } from "react-router";
import { RouteCrashScreen } from "./CrashScreen";

export const routes: RouteObject[] = [
  {
    errorElement: <RouteCrashScreen />,
    children: [
      {
        children: [
          {
            path: "project/:key/list",
            lazy: async () => ({ Component: (await import("./screens/Project")).ProjectList }),
          },
          {
            path: "project/:key/detail",
            lazy: async () => ({ Component: (await import("./screens/ProjectDetail")).ProjectDetail }),
          },
          {
            path: "issue/:id",
            lazy: async () => ({ Component: (await import("./screens/Issue")).IssuePage }),
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