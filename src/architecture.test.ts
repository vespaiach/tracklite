import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path/posix";
import { expect, it } from "vitest";

type Import = { file: string; specifier: string; target: string };

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
const importSpecifier = /(?:\bfrom|\bimport\(?|\bvi\.mock\()\s*["']([^"']+)["']/g;

const sourceFiles = execFileSync("git", ["ls-files", "-z", "src/domain", "src/application", "src/queries"], {
  encoding: "utf8",
})
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

function layerOf(path: string) {
  return /^src\/(domain|application|queries)(?:\/|$)/.exec(path)?.[1];
}

function isTestCode(file: string) {
  return /\.test\.tsx?$/.test(file) || file.startsWith("src/test/");
}

function breaksLayerRule(layer: string) {
  return ({ file, target }: Import) =>
    layerOf(file) === layer && !isTestCode(file) && !layerRules[layer].allows(target);
}

function describeImport({ file, specifier }: Pick<Import, "file" | "specifier">) {
  return `${file} imports "${specifier}"`;
}

for (const [layer, { mayImport }] of Object.entries(layerRules)) {
  it(`D-60: ${layer} imports only ${mayImport}`, () => {
    expect(imports.filter(breaksLayerRule(layer)).map(describeImport)).toEqual([]);
  });
}