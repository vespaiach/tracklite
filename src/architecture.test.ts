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
  "src/infrastructure/unit-of-work.ts -> notifications",
];
const layerRules: Record<string, { mayImport: string; allows: (target: string) => boolean }> = {
  domain: {
    mayImport: "domain/**, src/contract, valibot and fractional-indexing",
    allows: (target) =>
      target.startsWith("src/domain/") || ["src/contract", "valibot", "fractional-indexing"].includes(target),
  },
  application: {
    mayImport: "domain/**, application/** and src/contract",
    allows: (target) => /^src\/(?:domain|application)\//.test(target) || target === "src/contract",
  },
  queries: {
    mayImport: "domain/**, infrastructure/**/tables.ts, the db client, src/contract and packages but next",
    allows: (target) =>
      /^src\/(?:domain|queries)\//.test(target) ||
      /^src\/infrastructure\/(?:[^/]+\/)*tables$/.test(target) ||
      ["src/infrastructure/db", "src/infrastructure/transaction", "src/contract"].includes(target) ||
      (!target.startsWith("src/") && !/^next(?:\/|$)/.test(target)),
  },
};
const modelImportBans = [/^drizzle-orm(?:\/|$)/, /^next(?:\/|$)/];
const modelModuleBans = [
  "src/infrastructure/db",
  "src/infrastructure/transaction",
  "src/server/shared/api-route",
];
const tableWrite = /\.(?:insert|update|delete)\((\w+)\)/g;
const importSpecifier = /(?:\bfrom|\bimport\(?|\bvi\.mock\()\s*["']([^"']+)["']/g;

const sourceFiles = execFileSync(
  "git",
  [
    "ls-files",
    "-z",
    "src/server",
    "src/domain",
    "src/application",
    "src/infrastructure",
    "src/queries",
    "src/app",
    "src/test",
    "scripts",
  ],
  { encoding: "utf8" },
)
  .split("\0")
  .filter((file) => /\.tsx?$/.test(file));
const imports = sourceFiles.flatMap(importsOf);

function specifiersOf(file: string) {
  return [...readFileSync(file, "utf8").matchAll(importSpecifier)].map(([, specifier]) => specifier);
}

function importsOf(file: string): Import[] {
  return specifiersOf(file).map((specifier) => ({
    file,
    specifier,
    target: specifier.startsWith(".") ? modulePath(join(dirname(file), specifier)) : specifier,
  }));
}

function modulePath(path: string) {
  return path.replace(/\.tsx?$/, "").replace(/\/index$/, "");
}

function contextOf(path: string) {
  const folder = /^src\/(?:server|domain|application|infrastructure)(?:\/([^/]+))?/.exec(path);
  if (!folder) return undefined;
  return folder[1] !== undefined && folder[1] in allowedDependencies ? folder[1] : "shared";
}

function layerOf(path: string) {
  return /^src\/(domain|application|queries)(?:\/|$)/.exec(path)?.[1];
}

function isTestCode(file: string) {
  return /\.test\.tsx?$/.test(file) || file.startsWith("src/test/");
}

function reachesPastIndex({ file, target }: Import) {
  const context = /^src\/server\/([^/.]+)(?:\/|$)/.exec(target)?.[1];
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

function breaksLayerRule(layer: string) {
  return ({ file, target }: Import) =>
    layerOf(file) === layer && !isTestCode(file) && !layerRules[layer].allows(target);
}

function tableOwners() {
  const owners = new Map<string, string>();
  for (const file of sourceFiles.filter((path) => /^src\/infrastructure\/[^/]+\/tables\.ts$/.test(path))) {
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

function bannedModelImports() {
  return imports.filter(
    ({ file, specifier, target }) =>
      /^src\/server\/.+\/(?:model|rules)\.ts$/.test(file) &&
      (specifier.startsWith(".")
        ? modelModuleBans.includes(target)
        : modelImportBans.some((ban) => ban.test(specifier))),
  );
}

function describeImport({ file, specifier }: Pick<Import, "file" | "specifier">) {
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

  expect(owners.size).toBe(20);
  expect(foreignTableWrites(owners)).toEqual([]);
});

it("G02: model and rules files import no database, HTTP or framework code", () => {
  expect(bannedModelImports().map(describeImport)).toEqual([]);
});

for (const [layer, { mayImport }] of Object.entries(layerRules)) {
  it(`D-60: ${layer} imports only ${mayImport}`, () => {
    expect(imports.filter(breaksLayerRule(layer)).map(describeImport)).toEqual([]);
  });
}