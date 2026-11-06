"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { CreateIssue } from "../app/(signed-in)/project/[key]/NewIssueDialog";

const ClientApp = dynamic(() => import("./ClientApp"), { ssr: false });

export function ClientPage({ createIssue }: { createIssue: CreateIssue }) {
  const router = useRouter();
  return (
    <ClientApp
      refreshServer={router.refresh}
      createIssue={createIssue}
    />
  );
}