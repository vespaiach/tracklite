"use client";

import dynamic from "next/dynamic";
import type { CreateIssue } from "../app/(signed-in)/project/[key]/NewIssueDialog";

const ClientApp = dynamic(() => import("./ClientApp"), { ssr: false });

export function ClientPage({ createIssue }: { createIssue: CreateIssue }) {
  return <ClientApp createIssue={createIssue} />;
}