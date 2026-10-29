import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function buildId() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  logging: { incomingRequests: false },
  productionBrowserSourceMaps: true,
  env: { BUILD_ID: process.env.BUILD_ID ?? buildId() },
};

export default nextConfig;