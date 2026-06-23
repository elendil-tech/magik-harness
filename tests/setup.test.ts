/**
 * tests/setup.test.ts — coverage for the /setup hook (v1.0).
 *
 * The hook wires a code repo into the light harness:
 *   - repo side: .cursor/harness.json (vault pointer), AGENTS.md primer,
 *     slim .gitignore secret block, .cursor/hooks/session-start.js + hooks.json
 *   - vault side (accessVia=path): <vault>/<km>/_index.md, <vault>/<mm>/,
 *     <vault>/.gitignore (ignores memory), git init
 *
 * It never creates knowledge/, memory/, workspace/, or codebase/ folders in
 * the code repo. Tests spawn the real CLI against tmp dirs.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { escapeRegex, PLUGIN_ROOT_DIR, PLUGIN_VERSION } from "./_version.ts";

const PLUGIN_ROOT = PLUGIN_ROOT_DIR;
const HOOK = join(PLUGIN_ROOT, "hooks", "setup.ts");
const SEEDS_DIR = join(PLUGIN_ROOT, "seeds");
const V = escapeRegex(PLUGIN_VERSION);

function makeTmpProject(): string {
  return mkdtempSync(join(tmpdir(), "magik-setup-repo-"));
}
function makeTmpVault(): string {
  return mkdtempSync(join(tmpdir(), "magik-setup-vault-"));
}

function runHook(
  projectRoot: string,
  extraArgs: string[] = [],
): { stdout: string; stderr: string; status: number } {
  const args = ["--import", "tsx", HOOK, "--project-root", projectRoot, ...extraArgs];
  const result = spawnSync(process.execPath, args, {
    encoding: "utf-8",
    cwd: PLUGIN_ROOT,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

function ensureBuilt(): void {
  if (!existsSync(SEEDS_DIR)) {
    throw new Error(`seeds/ missing — run \`pnpm build\` before the test suite (looked at ${SEEDS_DIR}).`);
  }
}

const PATH_ARGS = (vault: string) => [
  "--vault",
  vault,
  "--knowledge-mount",
  "knowledge",
  "--memory-mount",
  "memory",
  "--access-via",
  "path",
];

// --- Tests -------------------------------------------------------------------

test("empty project — writes the repo-side pointer + primer + hook, not the old folders", () => {
  ensureBuilt();
  const root = makeTmpProject();
  const vault = makeTmpVault();
  try {
    const { stdout, status } = runHook(root, PATH_ARGS(vault));
    assert.equal(status, 0, `hook failed: ${stdout}`);

    // Repo-side artifacts.
    assert.ok(existsSync(join(root, ".cursor", "harness.json")), ".cursor/harness.json missing");
    assert.ok(existsSync(join(root, "AGENTS.md")), "AGENTS.md missing");
    assert.ok(existsSync(join(root, ".gitignore")), ".gitignore missing");
    assert.ok(
      existsSync(join(root, ".cursor", "hooks", "session-start.js")),
      ".cursor/hooks/session-start.js missing",
    );
    assert.ok(existsSync(join(root, ".cursor", "hooks.json")), ".cursor/hooks.json missing");

    // The v0.x in-repo component folders must NOT be created.
    for (const dead of ["knowledge", "memory", "workspace", "codebase"]) {
      assert.ok(
        !existsSync(join(root, dead)),
        `${dead}/ must NOT be created in the code repo (v1.0: those live in the vault, or are gone)`,
      );
    }

    // Primer markers.
    const agents = readFileSync(join(root, "AGENTS.md"), "utf-8");
    assert.match(agents, new RegExp(`<!-- harness:primer:start v=${V} -->`));
    assert.match(agents, /<!-- harness:primer:end -->/);

    // gitignore markers + secret-hygiene line; no memory/ or workspace/ lines.
    const gi = readFileSync(join(root, ".gitignore"), "utf-8");
    assert.match(gi, new RegExp(`^# harness:gitignore:start v=${V}$`, "m"));
    assert.match(gi, /^# harness:gitignore:end$/m);
    assert.match(gi, /^\.cursor\/mcp\.local\.json$/m, ".gitignore must carry .cursor secret hygiene");
    assert.ok(!/^memory\/$/m.test(gi), "v1.0 .gitignore must NOT ignore memory/ in the code repo");
    assert.ok(!/^workspace\/$/m.test(gi), "v1.0 .gitignore must NOT ignore workspace/ in the code repo");

    // hooks.json wires sessionStart only (postToolUse removed in v1.0).
    const hooks = JSON.parse(readFileSync(join(root, ".cursor", "hooks.json"), "utf-8")) as {
      version: number;
      hooks: { sessionStart?: unknown[]; postToolUse?: unknown[] };
    };
    assert.equal(hooks.version, 1);
    assert.ok(Array.isArray(hooks.hooks.sessionStart) && hooks.hooks.sessionStart.length > 0, "sessionStart must be wired");
    assert.ok(hooks.hooks.postToolUse === undefined, "postToolUse must be gone in v1.0");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("empty project — scaffolds the vault (knowledge index, memory dir, gitignore, git init)", () => {
  ensureBuilt();
  const root = makeTmpProject();
  const vault = makeTmpVault();
  try {
    const { stdout, status } = runHook(root, PATH_ARGS(vault));
    assert.equal(status, 0, `hook failed: ${stdout}`);

    assert.ok(existsSync(join(vault, "knowledge", "_index.md")), "vault knowledge/_index.md missing");
    assert.ok(existsSync(join(vault, "memory")), "vault memory/ dir missing");
    assert.ok(existsSync(join(vault, ".gitignore")), "vault .gitignore missing");
    assert.ok(existsSync(join(vault, ".git")), "vault should be a git repo after init");

    const vgi = readFileSync(join(vault, ".gitignore"), "utf-8");
    assert.match(vgi, /^memory\/$/m, "vault .gitignore must ignore the memory mount");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("manifest — well-formed harness@1 with the collected mounts", () => {
  ensureBuilt();
  const root = makeTmpProject();
  const vault = makeTmpVault();
  try {
    runHook(root, [
      "--vault",
      vault,
      "--knowledge-mount",
      "falconproxy/knowledge",
      "--memory-mount",
      "falconproxy/memory",
      "--access-via",
      "path",
    ]);
    const manifest = JSON.parse(readFileSync(join(root, ".cursor", "harness.json"), "utf-8")) as {
      schema: string;
      vault: string;
      knowledge: { mount: string; accessVia: string };
      memory: { mount: string; accessVia: string };
    };
    assert.equal(manifest.schema, "magik-repo/harness@1");
    assert.equal(manifest.vault, vault);
    assert.equal(manifest.knowledge.mount, "falconproxy/knowledge");
    assert.equal(manifest.knowledge.accessVia, "path");
    assert.equal(manifest.memory.mount, "falconproxy/memory");
    assert.equal(manifest.memory.accessVia, "path");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("existing AGENTS.md — primer prepended; user content preserved verbatim", () => {
  ensureBuilt();
  const root = makeTmpProject();
  const vault = makeTmpVault();
  try {
    const userBody = "# My Project\n\nLorem ipsum, do not touch.\n\n- one\n- two\n";
    writeFileSync(join(root, "AGENTS.md"), userBody);

    const { status, stdout } = runHook(root, PATH_ARGS(vault));
    assert.equal(status, 0, `hook failed: ${stdout}`);

    const merged = readFileSync(join(root, "AGENTS.md"), "utf-8");
    assert.ok(merged.startsWith(`<!-- harness:primer:start v=${PLUGIN_VERSION} -->`), "primer must be at top");
    assert.ok(merged.includes(userBody.trim()), "user content preserved verbatim");
    assert.ok(
      merged.indexOf("# My Project") > merged.indexOf("<!-- harness:primer:end -->"),
      "user content must follow the primer block",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("idempotency — a second run does not modify already-written files", () => {
  ensureBuilt();
  const root = makeTmpProject();
  const vault = makeTmpVault();
  try {
    assert.equal(runHook(root, PATH_ARGS(vault)).status, 0);

    const probes = [
      join(root, ".cursor", "harness.json"),
      join(root, "AGENTS.md"),
      join(root, ".gitignore"),
      join(root, ".cursor", "hooks", "session-start.js"),
      join(vault, "knowledge", "_index.md"),
    ];
    const before: Record<string, number> = {};
    for (const p of probes) before[p] = statSync(p).mtimeMs;

    assert.equal(runHook(root, PATH_ARGS(vault)).status, 0);
    for (const p of probes) {
      assert.equal(statSync(p).mtimeMs, before[p], `${p} should be untouched on a second run`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("dry run — writes nothing", () => {
  ensureBuilt();
  const root = makeTmpProject();
  const vault = makeTmpVault();
  try {
    const { status } = runHook(root, [...PATH_ARGS(vault), "--dry-run"]);
    assert.equal(status, 0);
    assert.ok(!existsSync(join(root, ".cursor", "harness.json")), "no manifest in dry-run");
    assert.ok(!existsSync(join(root, "AGENTS.md")), "no AGENTS.md in dry-run");
    assert.ok(!existsSync(join(vault, "knowledge")), "no vault scaffold in dry-run");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("accessVia=mcp — manifest only; no vault filesystem scaffold", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const { status, stdout } = runHook(root, [
      "--access-via",
      "mcp",
      "--knowledge-mount",
      "kb-store",
      "--memory-mount",
      "mem-store",
    ]);
    assert.equal(status, 0, `hook failed: ${stdout}`);
    const manifest = JSON.parse(readFileSync(join(root, ".cursor", "harness.json"), "utf-8")) as {
      vault: string | null;
      knowledge: { accessVia: string };
    };
    assert.equal(manifest.vault, null, "mcp manifest should carry a null vault when none is given");
    assert.equal(manifest.knowledge.accessVia, "mcp");
    assert.match(stdout, /mcp/i, "plan should note mcp access");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing --vault on path access — fails with a clear error", () => {
  ensureBuilt();
  const root = makeTmpProject();
  try {
    const { status, stderr } = runHook(root, ["--access-via", "path"]);
    assert.notEqual(status, 0, "should fail without a vault on path access");
    assert.match(stderr, /--vault is required/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("existing .cursor/hooks.json — preserved verbatim, plan emits a notice", () => {
  ensureBuilt();
  const root = makeTmpProject();
  const vault = makeTmpVault();
  try {
    const userHooks = { version: 1, hooks: { afterFileEdit: [{ command: "./hooks/format.sh" }] } };
    mkdirSync(join(root, ".cursor"), { recursive: true });
    writeFileSync(join(root, ".cursor", "hooks.json"), JSON.stringify(userHooks, null, 2));

    const { status, stdout } = runHook(root, PATH_ARGS(vault));
    assert.equal(status, 0, `hook failed: ${stdout}`);

    const after = JSON.parse(readFileSync(join(root, ".cursor", "hooks.json"), "utf-8"));
    assert.deepEqual(after, userHooks, "user hooks.json must be preserved byte-equivalent");
    assert.match(stdout, /hooks\.json/);
    assert.match(stdout, /not auto-merged|merge/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});
