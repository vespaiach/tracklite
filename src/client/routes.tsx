import { Navigate, type RouteObject } from "react-router";
import { Shell } from "./Shell";

export const routes: RouteObject[] = [
  {
    Component: Shell,
    children: [
      {
        index: true,
        element: (
          <Navigate
            to="/my-issues"
            replace
          />
        ),
      },
      { path: "my-issues", lazy: async () => ({ Component: (await import("./screens/MyIssues")).MyIssues }) },
      { path: "*", lazy: async () => ({ Component: (await import("./screens/NotFound")).NotFound }) },
    ],
  },
];