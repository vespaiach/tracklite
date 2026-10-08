import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { expect, it } from "vitest";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const resendApiKey = /\bre_[A-Za-z0-9_]{16,}/;

it("OPS-006.1: no email API key in the repository", () => {
  const filesWithKey = trackedFiles.filter((file) => resendApiKey.test(readFileSync(file, "utf8")));
  expect(filesWithKey).toEqual([]);
});

it("OPS-006.1: no env file with secrets is tracked", () => {
  const envFiles = trackedFiles.filter(
    (file) => /^\.env/.test(basename(file)) && basename(file) !== ".env.example",
  );
  expect(envFiles).toEqual([]);
});