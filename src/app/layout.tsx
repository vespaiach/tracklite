import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import type { ReactNode } from "react";
import "../components/ui/track-lite/styles/index.css";

const text = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Tracklite",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html
      lang="en"
      className={`${text.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}