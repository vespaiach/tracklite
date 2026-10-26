import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path/posix";
import { expect, it } from "vitest";

type Import = { file: string; specifier: string; target: string };

const allowedDependencies: Record<string, string[]> = {
  comments: ["issues", "projects", "identity", "shared"],
  issues: ["projects", "identity", "shared"],
  projects: ["identity", "shared"],
  notifications: ["comments", "issues", "projects", "identity", "shared"],
  identity: ["shared"],
  shared: [],
};
const allowedFileDependencies = [
  "src/server/shared/api-route.ts -> identity",
  "src/server/shared/api-route.ts -> notifications",
];
const tableReadsAgainstMap = [
  "src/server/comments/comments.ts -> notifications",
  "src/server/issues/rows.ts -> notifications",
  "src/server/projects/labels.ts -> issues",
  "src/server/projects/projects.ts -> issues",
  "src/server/projects/projects.ts -> notifications",
];
const tableWrite = /\.(?:insert|update|delete)\((\w+)\)/g;
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

function importsTablesOnly({ file, target }: Import) {
  return (
    target.endsWith("/tables") &&
    (file.endsWith("/tables.ts") || tableReadsAgainstMap.includes(`${file} -> ${contextOf(target)}`))
  );
}

function contextOf(path: string) {
  return /^src\/server\/([^/.]+)(?:\/|$)/.exec(path)?.[1];
}

function isTestCode(file: string) {
  return /\.test\.tsx?$/.test(file) || file.startsWith("src/test/");
}

function reachesPastIndex(dependency: Import) {
  const { file, target } = dependency;
  const context = contextOf(target);
  return (
    !importsTablesOnly(dependency) &&
    context !== undefined &&
    context !== "shared" &&
    context !== contextOf(file) &&
    target !== `src/server/${context}`
  );
}

function breaksContextMap(dependency: Import) {
  const { file, target } = dependency;
  const from = contextOf(file);
  const to = contextOf(target);
  if (from === undefined || to === undefined || from === to || isTestCode(file)) return false;
  if (importsTablesOnly(dependency)) return false;

  return !allowedDependencies[from].includes(to) && !allowedFileDependencies.includes(`${file} -> ${to}`);
}

function tableOwners() {
  const owners = new Map<string, string>();
  for (const file of sourceFiles.filter((path) => /^src\/server\/[^/]+\/tables\.ts$/.test(path))) {
    const context = contextOf(file) ?? "";
    for (const [, table] of readFileSync(file, "utf8").matchAll(/export const (\w+) = pgTable/g)) {
      owners.set(table, context);
    }
  }
  return owners;
}

function foreignTableWrites(owners: Map<string, string>) {
  return sourceFiles
    .filter((file) => !isTestCode(file))
    .flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(tableWrite)]
        .map(([write, table]) => ({ file, write, owner: owners.get(table) }))
        .filter(({ owner }) => owner !== undefined && owner !== contextOf(file)),
    )
    .map(({ file, write, owner }) => `${file} calls ${write} on a table ${owner} owns`);
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

it("M16: a context writes only its own tables", () => {
  const owners = tableOwners();

  expect(owners.size).toBe(18);
  expect(foreignTableWrites(owners)).toEqual([]);
});