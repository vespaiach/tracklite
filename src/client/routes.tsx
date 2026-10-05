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
      { path: "*", lazy: async () => ({ Component: (await import("./screens/NotFound")).NotFound }) },
    ],
  },
];