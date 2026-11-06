import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isInAppPath } from "../../lib/return-to";
import { requestPathHeader } from "../../proxy";
import { pageMember } from "../_server/session";

export default async function SignedInLayout({ children }: { children: ReactNode }) {
  if (!(await pageMember())) redirect(await signInAddress());

  return children;
}

async function signInAddress() {
  const path = (await headers()).get(requestPathHeader);
  return isInAppPath(path) ? `/sign-in?next=${encodeURIComponent(path)}` : "/sign-in";
}