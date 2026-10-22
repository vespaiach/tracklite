import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path/posix";
import { expect, it } from "vitest";

type Import = { file: string; specifier: string; target: string };

const allowedDependencies: Record<string, string[]> = {
  comments: ["issues", "projects", "identity", "notifications", "shared"],
  issues: ["projects", "identity", "notifications", "shared"],
  projects: ["identity", "notifications", "shared"],
  notifications: ["identity", "shared"],
  identity: ["notifications", "shared"],
  shared: [],
};
const allowedFileDependencies = ["src/server/shared/api-route.ts -> identity"];
const importSpecifier = /(?:\bfrom|\bimport\(?|\bvi\.mock\()\s*["']([^"']+)["']/g;

const sourceFiles = execFileSync("git", ["ls-files", "-z", "src/server", "src/app", "src/test", "scripts"], {
  encoding: "utf8",
})
  .split("\0")
  .filter((file) => /\.tsx?$/.test(file));
const imports = sourceFiles.flatMap(relativeImportsOf);

function relativeImportsOf(file: string): Import[] {
  const specifiers = [...readFileSync(file, "utf8").matchAll(importSpecifier)].map(
    ([, specifier]) => specifier,
  );

  return specifiers
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => ({ file, specifier, target: modulePath(join(dirname(file), specifier)) }));
}

function modulePath(path: string) {
  return path.replace(/\.tsx?$/, "").replace(/\/index$/, "");
}

function contextOf(path: string) {
  return /^src\/server\/([^/.]+)(?:\/|$)/.exec(path)?.[1];
}

function isTestCode(file: string) {
  return /\.test\.tsx?$/.test(file) || file.startsWith("src/test/");
}

function reachesPastIndex({ file, target }: Import) {
  const context = contextOf(target);
  return (
    context !== undefined &&
    context !== "shared" &&
    context !== contextOf(file) &&
    target !== `src/server/${context}`
  );
}

function breaksContextMap({ file, target }: Import) {
  const from = contextOf(file);
  const to = contextOf(target);
  if (from === undefined || to === undefined || from === to || isTestCode(file)) return false;

  return !allowedDependencies[from].includes(to) && !allowedFileDependencies.includes(`${file} -> ${to}`);
}

function describeImport({ file, specifier }: Import) {
  return `${file} imports "${specifier}"`;
}

it("M15: a context imports another only through its index.ts", () => {
  expect(imports.filter(reachesPastIndex).map(describeImport)).toEqual([]);
});

it("M15: context dependencies follow the context map", () => {
  expect(imports.filter(breaksContextMap).map(describeImport)).toEqual([]);
});