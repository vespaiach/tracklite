import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

const stubs = {
  runuser: 'while [ "$1" != "--" ]; do shift; done\nshift\nexec "$@"',
  systemctl: 'echo "systemctl $*" >> "$STUB_LOG"',
  curl: 'echo "curl $*" >> "$STUB_LOG"',
  npm: [
    'echo "npm $* current=$(readlink "$TRACKLITE_ROOT/current" || echo none) db=$DATABASE_URL" >> "$STUB_LOG"',
    'if [ "$*" = "run db:migrate" ] && [ -n "$STUB_MIGRATE_FAIL" ]; then',
    "  echo 'relation \"issues\" already exists' >&2",
    "  exit 1",
    "fi",
  ].join("\n"),
};

let dir: string;
let root: string;
let origin: string;
let log: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tracklite-deploy-"));
  root = join(dir, "opt");
  origin = join(dir, "origin");
  log = join(dir, "log");
  mkdirSync(join(root, "releases"), { recursive: true });
  mkdirSync(join(dir, "bin"));
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(dir, "bin", name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(dir, "bin", name), 0o755);
  }
  writeFileSync(join(dir, "env"), "DATABASE_URL=postgres://tracklite@localhost/tracklite\n");
  writeFileSync(log, "");
  git("init", "--quiet", "--initial-branch=main", origin);
  commit();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function git(...args: string[]) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function commit() {
  writeFileSync(join(origin, "version"), String(Date.now() + Math.random()));
  git("-C", origin, "add", "version");
  git("-C", origin, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "release");
  return git("-C", origin, "rev-parse", "--short", "HEAD");
}

function run(script: string, extraEnv: Record<string, string> = {}) {
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(dir, "bin")}:${process.env.PATH}`,
      TRACKLITE_ROOT: root,
      TRACKLITE_ENV_FILE: join(dir, "env"),
      TRACKLITE_REPO: origin,
      STUB_LOG: log,
      ...extraEnv,
    },
  });
  writeFileSync(log, `${readFileSync(log, "utf8")}exit ${result.status}\n`);
  return result;
}

const deploy = (extraEnv?: Record<string, string>) => run("ops/deploy.sh", extraEnv);
const rollback = () => run("ops/rollback.sh");
const current = () => readlinkSync(join(root, "current"));
const logLines = () => readFileSync(log, "utf8").split("\n").filter(Boolean);
const restarts = () =>
  logLines().filter((line) => line === "systemctl restart tracklite-web tracklite-worker");

it("OPS-002.1: successful migrations switch current to the new release and restart web and worker", () => {
  const sha = git("-C", origin, "rev-parse", "--short", "HEAD");

  const result = deploy();

  expect(result.status, result.stderr).toBe(0);
  expect(basename(current())).toMatch(new RegExp(`-${sha}$`));
  expect(readFileSync(join(current(), "version"), "utf8")).toBe(
    readFileSync(join(origin, "version"), "utf8"),
  );
  expect(restarts()).toHaveLength(1);
});

it("OPS-002.1: migrations run before the switch", () => {
  deploy();
  const old = current();
  commit();
  writeFileSync(log, "");

  deploy();

  const lines = logLines();
  const migrate = lines.findIndex((line) => line.startsWith("npm run db:migrate"));
  const restart = lines.indexOf("systemctl restart tracklite-web tracklite-worker");
  expect(migrate).toBeGreaterThanOrEqual(0);
  expect(lines[migrate]).toContain(`current=${old} `);
  expect(lines[migrate]).toContain("db=postgres://tracklite@localhost/tracklite");
  expect(restart).toBeGreaterThan(migrate);
  expect(current()).not.toBe(old);
});

it("OPS-002.2: a failed migration leaves current and the services unchanged and exits non-zero", () => {
  deploy();
  const old = current();
  const sha = commit();
  writeFileSync(log, "");

  const result = deploy({ STUB_MIGRATE_FAIL: "1" });

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('relation "issues" already exists');
  expect(current()).toBe(old);
  expect(restarts()).toHaveLength(0);
  expect(readdirSync(join(root, "releases")).filter((name) => name.endsWith(`-${sha}`))).toEqual([]);
});

it("OPS-004: deploy keeps the previous release and prunes older ones", () => {
  deploy();
  commit();
  deploy();
  const previous = current();
  commit();
  deploy();

  const releases = readdirSync(join(root, "releases")).map((name) => join(root, "releases", name));
  expect(releases.sort()).toEqual([previous, current()].sort());
});

it("OPS-004.1: rollback switches current to the previous release and restarts", () => {
  deploy();
  const previous = current();
  commit();
  deploy();
  writeFileSync(log, "");

  const result = rollback();

  expect(result.status, result.stderr).toBe(0);
  expect(current()).toBe(previous);
  expect(restarts()).toHaveLength(1);
  expect(logLines().some((line) => line.startsWith("npm"))).toBe(false);
});

it("OPS-004.1: rollback with no previous release refuses and changes nothing", () => {
  deploy();
  const only = current();
  writeFileSync(log, "");

  const result = rollback();

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("No previous release");
  expect(current()).toBe(only);
  expect(restarts()).toHaveLength(0);
  expect(existsSync(only)).toBe(true);
});