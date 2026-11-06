"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const ClientApp = dynamic(() => import("./ClientApp"), { ssr: false });

export function ClientPage() {
  const router = useRouter();
  return <ClientApp refreshServer={router.refresh} />;
}