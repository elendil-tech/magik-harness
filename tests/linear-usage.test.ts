/**
 * tests/linear-usage.test.ts: coverage for packs/linear/skills/linear/scripts/linear_usage.py.
 *
 * The tool talks to a local fake of the Linear GraphQL API (LINEAR_API_URL), so nothing leaves the
 * machine and no real key is involved. The fake records every request body, which lets the suite
 * pin the one property that matters most: the census is read-only and never sends a mutation.
 */

import { execFile, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TEST_DIR);
const TOOL = join(ROOT, "packs", "linear", "skills", "linear", "scripts", "linear_usage.py");

const opts = {
  skip: spawnSync("python3", ["--version"]).status === 0 ? false : "python3 is required",
};

const KEY = "lin_api_TESTKEY_do_not_leak";
const day = 86400 * 1000;
const ago = (days: number): string => new Date(Date.now() - days * day).toISOString();

type Issue = { identifier: string; createdAt: string; completedAt: string | null; canceledAt: string | null; state: { type: string }; team: { key: string } };
const issue = (id: string, team: string, type: string, created: number, closed: number | null = null): Issue => ({
  identifier: id,
  createdAt: ago(created),
  completedAt: type === "completed" && closed !== null ? ago(closed) : null,
  canceledAt: type === "canceled" && closed !== null ? ago(closed) : null,
  state: { type },
  team: { key: team },
});

// ENG: 3 open + 2 closed. OPS: 1 open + 1 closed. 7 active in all; 5 of them created in the last 30 days.
const ISSUES: Issue[] = [
  issue("ENG-1", "ENG", "backlog", 5),
  issue("ENG-2", "ENG", "unstarted", 20),
  issue("ENG-3", "ENG", "started", 50),
  issue("ENG-4", "ENG", "completed", 60, 40),
  issue("ENG-5", "ENG", "canceled", 10, 3),
  issue("OPS-1", "OPS", "triage", 2),
  issue("OPS-2", "OPS", "completed", 15, 10),
];
const TEAMS = [
  { key: "ENG", name: "Engineering", autoArchivePeriod: 1 },
  { key: "OPS", name: "Operations", autoArchivePeriod: 6 },
];

let server: Server;
let url = "";
let bodies: string[] = [];
let authHeaders: (string | undefined)[] = [];
let mode: "ok" | "graphql-error" | "http-error" = "ok";

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      bodies.push(raw);
      authHeaders.push(req.headers.authorization);
      if (mode === "http-error") {
        res.writeHead(500).end("boom");
        return;
      }
      const { query, variables } = JSON.parse(raw) as { query: string; variables?: { after?: string | null } };
      res.setHeader("Content-Type", "application/json");
      if (mode === "graphql-error") {
        res.end(JSON.stringify({ errors: [{ message: "Authentication required" }] }));
      } else if (/\bteams\b/.test(query)) {
        res.end(JSON.stringify({ data: { teams: { nodes: TEAMS } } }));
      } else {
        // Two pages (4 + 3) so pagination is exercised.
        const second = variables?.after === "cursor-1";
        res.end(
          JSON.stringify({
            data: {
              issues: {
                pageInfo: second ? { hasNextPage: false, endCursor: null } : { hasNextPage: true, endCursor: "cursor-1" },
                nodes: second ? ISSUES.slice(4) : ISSUES.slice(0, 4),
              },
            },
          }),
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/graphql`;
});

after(() => {
  server?.close();
});

function run(args: string[], env: Record<string, string | undefined> = {}): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const e: NodeJS.ProcessEnv = { ...process.env, LINEAR_API_URL: url, LINEAR_API_KEY: KEY, ...env };
    for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
    execFile("python3", [TOOL, ...args], { env: e }, (error, out, err) => {
      const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      resolve({ code, out, err });
    });
  });
}

const reset = (): void => {
  bodies = [];
  authHeaders = [];
  mode = "ok";
};

test("counts active issues across pages, per team, with open/closed split", opts, async () => {
  reset();
  const r = await run(["--json", "--cap", "10", "--warn", "8", "--act", "9"]);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.total, 7);
  assert.equal(j.headroom, 3);
  assert.equal(j.level, "ok");
  assert.deepEqual(
    { active: j.teams.ENG.active, open: j.teams.ENG.open, closed: j.teams.ENG.closed },
    { active: 5, open: 3, closed: 2 },
  );
  assert.deepEqual(
    { active: j.teams.OPS.active, open: j.teams.OPS.open, closed: j.teams.OPS.closed },
    { active: 2, open: 1, closed: 1 },
  );
  assert.ok(bodies.some((b) => b.includes("cursor-1")), "the second page was requested with the cursor");
});

test("reports the creation rate, days to the cap, and the archive forecast", opts, async () => {
  reset();
  const j = JSON.parse((await run(["--json", "--cap", "10", "--warn", "8", "--act", "9"])).out);
  assert.equal(j.created_in_window, 5);
  assert.equal(j.created_per_day, 0.17);
  assert.equal(j.days_to_cap, 18, "3 free slots at 5 per 30 days");
  assert.equal(j.closed_older_than_window, 1, "only ENG-4 was closed more than 30 days ago");
  // ENG archives after 1 month, so both closed ENG issues are due within 30 days; OPS archives after 6 months, so OPS-2 is not.
  assert.equal(j.archiving_soon, 2);
});

test("exit code follows the warn and act lines", opts, async () => {
  reset();
  assert.equal((await run(["--cap", "10", "--warn", "8", "--act", "9"])).code, 0);
  assert.equal((await run(["--cap", "10", "--warn", "6", "--act", "8"])).code, 1);
  assert.equal((await run(["--cap", "10", "--warn", "3", "--act", "7"])).code, 2);
  assert.equal((await run([])).code, 0, "7 of 250 is far below the default warn line");
});

test("--team narrows the table but not the cap", opts, async () => {
  reset();
  const j = JSON.parse((await run(["--json", "--team", "OPS"])).out);
  assert.deepEqual(Object.keys(j.teams), ["OPS"]);
  assert.equal(j.total, 7, "the cap is workspace-wide");
});

test("the text report names the level and the next step", opts, async () => {
  reset();
  const r = await run(["--cap", "10", "--warn", "6", "--act", "8"]);
  assert.match(r.out, /7 active of 10 \(3 left\)\s+\[WARN/);
  assert.match(r.out, /ENG\s+5\s+3\s+2/);
  assert.match(r.out, /Relieve the cap/);
});

test("is read-only: it never sends a mutation, and it sends the key raw without echoing it", opts, async () => {
  reset();
  const r = await run(["--json"]);
  assert.equal(r.code, 0, r.err);
  assert.ok(bodies.length >= 3, "teams plus two issue pages");
  for (const b of bodies) {
    assert.doesNotMatch(b, /\bmutation\b/i, "a census must not write");
    assert.ok(!b.includes(KEY), "the key travels in the header, never in the body");
  }
  assert.ok(authHeaders.every((h) => h === KEY), "the key is the raw Authorization header, no Bearer");
  assert.ok(!r.out.includes(KEY) && !r.err.includes(KEY), "the key is never printed");
});

test("exits 3 with a clear message when it cannot run", opts, async () => {
  reset();
  const noKey = await run([], { LINEAR_API_KEY: undefined });
  assert.equal(noKey.code, 3);
  assert.match(noKey.err, /LINEAR_API_KEY is not set/);

  mode = "graphql-error";
  const gqlErr = await run([]);
  assert.equal(gqlErr.code, 3);
  assert.match(gqlErr.err, /Authentication required/);
  assert.ok(!gqlErr.err.includes(KEY));

  mode = "http-error";
  const httpErr = await run([]);
  assert.equal(httpErr.code, 3);
  assert.match(httpErr.err, /HTTP 500/);

  const unreachable = await run([], { LINEAR_API_URL: "http://127.0.0.1:1/graphql" });
  assert.equal(unreachable.code, 3);
  assert.match(unreachable.err, /could not reach the Linear API/);
  reset();
});
