import { Navigate, type RouteObject } from "react-router";
import { Shell } from "./Shell";

export const routes: RouteObject[] = [
  { path: "sign-in", lazy: async () => ({ Component: (await import("./screens/SignIn")).SignIn }) },
  {
    path: "forgot-password",
    lazy: async () => ({ Component: (await import("./screens/ForgotPassword")).ForgotPassword }),
  },
  {
    path: "reset-password",
    lazy: async () => ({ Component: (await import("./screens/ResetPassword")).ResetPassword }),
  },
  {
    path: "invite",
    lazy: async () => ({ Component: (await import("./screens/AcceptInvitation")).AcceptInvitation }),
  },
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
      {
        path: "settings/profile",
        lazy: async () => ({ Component: (await import("./screens/Profile")).Profile }),
      },
      {
        path: "settings/members",
        lazy: async () => ({ Component: (await import("./screens/Members")).Members }),
      },
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
        path: "projects/archived",
        lazy: async () => ({ Component: (await import("./screens/ArchivedProjects")).ArchivedProjects }),
      },
      { path: "*", lazy: async () => ({ Component: (await import("./screens/NotFound")).NotFound }) },
    ],
  },
];