#!/usr/bin/env node
// @ts-check
/**
 * session-start.mjs — magik-harness session hook (zero dependencies, Node >= 18).
 *
 * Resolves the project's harness pointer and emits one context block:
 *   1. harness status: resolved stores with absolute paths, autonomy, warnings
 *   2. today's memory note, capped (the newest part is kept)
 *   3. live git sync state and the multi-machine protocol
 *   4. next steps (which skill to run)
 *
 * Usage:  node session-start.mjs [--format cursor|claude|text] [--max-memory-bytes N]
 *                                [--no-git] [--project-root <dir>]
 *
 * Contract:
 *   - fail open: any error -> stderr + empty output + exit 0. A hook never blocks a session.
 *   - a repo with no harness stays silent; a CONFIGURED harness that is broken says so, loudly.
 *   - when two hooks fire for one session (project + global install) the second is silent.
 *
 * Spec: docs/ARCHITECTURE.md section 6.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { gitSyncContext } from "./gitctx.mjs";
import { RUNTIME_VERSION, readJson, resolveHarness } from "./resolve.mjs";

export const MARKER_LINE = `magik-harness session context v${RUNTIME_VERSION}`;

// ---------------------------------------------------------------------------
// memory
// ---------------------------------------------------------------------------

/** Local calendar date, YYYY-MM-DD (`MAGIK_TODAY` overrides; tests only). */
/** @param {NodeJS.ProcessEnv} env */
export function today(env = process.env) {
  if (env.MAGIK_TODAY && /^\d{4}-\d{2}-\d{2}$/.test(env.MAGIK_TODAY)) return env.MAGIK_TODAY;
  const d = new Date();
  const p = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Read at most `maxBytes` from the END of a file, aligned to a line start.
 * @param {string} path
 * @param {number} maxBytes
 * @returns {{ body: string, size: number, truncated: boolean } | null}  null for an empty file
 */
export function readTail(path, maxBytes) {
  const size = statSync(path).size;
  if (size === 0) return null;
  if (size <= maxBytes) {
    const body = readFileSync(path, "utf8").trim();
    return body ? { body, size, truncated: false } : null;
  }
  const len = Math.min(size, maxBytes + 4);
  const buf = Buffer.alloc(len);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, len, size - len);
  } finally {
    closeSync(fd);
  }
  let text = buf.toString("utf8").replace(/^\uFFFD+/, "");
  const nl = text.indexOf("\n");
  if (nl >= 0 && nl < text.length - 1) text = text.slice(nl + 1);
  text = text.trim();
  return text ? { body: text, size, truncated: true } : null;
}

// ---------------------------------------------------------------------------
// dedupe
// ---------------------------------------------------------------------------

/** A claim only suppresses a duplicate that fires within this window (project + global hook, same event). */
const CLAIM_TTL_MS = 2 * 60 * 1000;

/**
 * Claim the right to emit for this event. Returns false if another hook already did within
 * the last two minutes (the project hook and the global hook both fire for one session start).
 * The claim is keyed on the session id and the event source, so a later event of the same
 * session (Claude's `compact` or `resume`) still gets its context. Without an id there is
 * nothing to dedupe on (returns true); any other failure also lets the hook emit.
 * @param {string|null} id
 * @param {string} [source]
 */
export function claimSession(id, source = "") {
  if (!id) return true;
  try {
    const dir = join(tmpdir(), "magik-harness");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, createHash("sha1").update(`${id}|${source}`).digest("hex").slice(0, 20) + ".lock");
    try {
      closeSync(openSync(file, "wx"));
    } catch (err) {
      if (/** @type {any} */ (err)?.code !== "EEXIST") throw err;
      if (Date.now() - statSync(file).mtimeMs < CLAIM_TTL_MS) return false;
      unlinkSync(file); // stale: an earlier event of the same session
      closeSync(openSync(file, "wx")); // EEXIST here means another hook just took over: it emits, we do not
    }
    pruneLocks(dir);
    return true;
  } catch (err) {
    return /** @type {any} */ (err)?.code !== "EEXIST";
  }
}

/** @param {string} dir */
function pruneLocks(dir) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".lock")) continue;
      const p = join(dir, f);
      try {
        if (statSync(p).mtimeMs < cutoff) unlinkSync(p);
      } catch {
        /* raced with another hook; ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// context
// ---------------------------------------------------------------------------

/** @param {string} p @param {string} root @param {string} home */
function display(p, root, home) {
  const rel = relative(root, p);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.split("\\").join("/");
  return p.startsWith(home) ? "~" + p.slice(home.length).split("\\").join("/") : p;
}

/**
 * @param {import("./resolve.mjs").Store} s
 * @param {string} label
 */
function storeLine(s, label) {
  const auto = s.autonomy ? `, autonomy: ${s.autonomy}` : "";
  if (s.accessVia === "mcp") return `- ${label} (remote${auto}): MCP mount \`${s.mount ?? "?"}\` - use your MCP tools`;
  return `- ${label} (${s.role}${auto}): \`${s.dir ?? "(no mount set)"}\`${s.exists ? "" : " - MISSING"}`;
}

/**
 * Build the session context block.
 *
 * @param {Object} [opts]
 * @param {string} [opts.cwd]
 * @param {string} [opts.home]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {number} [opts.maxMemoryBytes]     overrides the pointer/config cap
 * @param {boolean} [opts.git]               false = never include git state
 * @returns {{ text: string|null, resolution: import("./resolve.mjs").Resolution }}
 */
export function buildContext(opts = {}) {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const res = resolveHarness({ cwd: opts.cwd, home, env });

  const lock = readJson(join(res.projectRoot, ".magik", "lock.json"));
  const projectInstalled = (lock.ok && lock.value?.scope === "project") || res.source === "project";
  /** @type {string} */
  const skillsDir =
    (lock.ok && typeof lock.value?.skillsDir === "string" && lock.value.skillsDir) ||
    (res.source === "global" ? "~/.agents/skills" : ".agents/skills");

  // Git policy: a project install always shows git state unless explicitly turned off.
  const policy = opts.git === false || res.gitPolicy === "never" ? "never" : projectInstalled ? "always" : res.gitPolicy;
  const wantGit = policy === "always" || (policy === "harnessed" && res.active);
  if (!res.active && !wantGit && res.warnings.length === 0) return { text: null, resolution: res };

  /** @type {string[]} */
  const parts = [MARKER_LINE];

  // 1. harness status
  if (res.active) {
    const lines = ["## Harness"];
    const via = res.source === "global" ? `global config ${display(res.configPath ?? "", res.projectRoot, home)}` : `pointer ${display(res.pointerPath ?? "", res.projectRoot, home)}`;
    lines.push(`- Project: \`${res.projectName}\` (${via})`);
    if (res.knowledge) lines.push(storeLine(res.knowledge, "Knowledge base"));
    if (res.memory) lines.push(storeLine(res.memory, "Memory"));
    for (const m of res.mounts) lines.push(storeLine(m, `Mount \`${m.name}\``));
    if (res.overlayPath) lines.push(`- Local overlay applied: \`${display(res.overlayPath, res.projectRoot, home)}\``);
    for (const w of res.warnings) lines.push(`- WARNING: ${w}`);
    parts.push(lines.join("\n"));
  } else {
    const lines = ["## Harness", `- Project: \`${res.projectName}\` - no vault configured (minimal install: delivery loop and git protocol only).`];
    for (const w of res.warnings) lines.push(`- WARNING: ${w}`);
    parts.push(lines.join("\n"));
  }

  // 2. memory
  const mem = res.memory;
  const date = today(env);
  const maxBytes = opts.maxMemoryBytes ?? res.memoryInject.maxBytes;
  if (mem && mem.accessVia === "path" && mem.dir) {
    const notePath = join(mem.dir, "daily", `${date}.md`);
    if (maxBytes === 0) {
      parts.push(`## Memory\nInjection is disabled (memory.inject.maxBytes = 0). Today's note: \`${notePath}\``);
    } else if (existsSync(notePath)) {
      try {
        const tail = readTail(notePath, maxBytes);
        if (tail) {
          const head = tail.truncated
            ? `## Memory: today's notes (newest ${Buffer.byteLength(tail.body)} of ${tail.size} bytes; full note: \`${notePath}\`)`
            : `## Memory: today's notes (\`daily/${date}.md\`)`;
          parts.push(`${head}\n\n${tail.body}`);
        }
      } catch (err) {
        parts.push(`## Memory\nCould not read today's note \`${notePath}\`: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 3. git
  if (wantGit) {
    const g = gitSyncContext(res.projectRoot, { isLinkedWorktree: res.isLinkedWorktree, primaryRoot: res.primaryRoot });
    if (g) parts.push(g);
  }

  // 4. next steps
  const steps = ["## Next steps"];
  if (res.active && res.knowledge) {
    steps.push(
      `- Before substantive work run the \`kb-search\` skill: gather context from the knowledge base, the code and live state. Skills live in \`${skillsDir}/\`; if your tool did not load them, read \`${skillsDir}/kb-search/SKILL.md\`.`,
    );
    steps.push(`- Follow the \`agentic-e2e-loop\` skill for substantive work (\`${skillsDir}/agentic-e2e-loop/SKILL.md\`): orient, implement, verify, ship, clean up.`);
    if (res.knowledge.autonomy === "readonly") steps.push("- Knowledge autonomy is `readonly`: report KB changes, never write them.");
    else if (res.knowledge.autonomy === "ask") steps.push("- Knowledge autonomy is `ask`: write the KB only on request or an approved proposal.");
    else steps.push("- Knowledge autonomy is `open`: keep the KB in step with your work (see the `knowledge-base` skill).");
    if (mem && mem.accessVia === "path" && mem.dir) {
      steps.push(`- Capture observations and lessons in \`${join(mem.dir, "daily", `${date}.md`)}\` as they surface (create it on the first signal). Never promote memory into the KB automatically.`);
    }
  } else {
    steps.push(`- Follow the \`agentic-e2e-loop\` skill for substantive work (\`${skillsDir}/agentic-e2e-loop/SKILL.md\`).`);
  }
  if (res.warnings.length) {
    steps.push(`- The harness is configured but something is broken (see WARNING above). Run \`magik-harness doctor\`; the \`harness-fit\` skill (\`${skillsDir}/harness-fit/SKILL.md\`) repairs and re-aligns the project.`);
  }
  parts.push(steps.join("\n"));

  return { text: parts.join("\n\n---\n\n"), resolution: res };
}

// ---------------------------------------------------------------------------
// output + entry point
// ---------------------------------------------------------------------------

/**
 * @param {string|null} text
 * @param {string} format
 */
export function formatOutput(text, format) {
  if (format === "cursor") return JSON.stringify(text ? { additional_context: text } : {});
  if (format === "claude") {
    return JSON.stringify(text ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } } : {});
  }
  return text ? text + "\n" : "";
}

/** @param {number} timeoutMs @returns {Promise<string>} */
function readStdin(timeoutMs = 400) {
  return new Promise((resolveP) => {
    if (process.stdin.isTTY) return resolveP("");
    let data = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        process.stdin.removeAllListeners();
        process.stdin.pause();
      } catch {
        /* ignore */
      }
      resolveP(data);
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) finish();
    });
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
  });
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ format: string, maxMemoryBytes?: number, git: boolean, projectRoot?: string }} */
  const out = { format: "text", git: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--format" && argv[i + 1]) out.format = argv[++i];
    else if (a.startsWith("--format=")) out.format = a.slice(9);
    else if (a === "--max-memory-bytes" && argv[i + 1]) out.maxMemoryBytes = Number(argv[++i]);
    else if (a === "--no-git") out.git = false;
    else if (a === "--project-root" && argv[i + 1]) out.projectRoot = argv[++i];
  }
  if (!["cursor", "claude", "text"].includes(out.format)) out.format = "text";
  if (out.maxMemoryBytes !== undefined && !(out.maxMemoryBytes >= 0)) delete out.maxMemoryBytes;
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = process.env;
  const raw = await readStdin();
  /** @type {any} */
  let payload = {};
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  const roots = Array.isArray(payload?.workspace_roots) ? payload.workspace_roots : [];
  const cwd = resolve(
    args.projectRoot ||
      env.MAGIK_PROJECT_DIR ||
      (typeof roots[0] === "string" && roots[0]) ||
      env.CURSOR_PROJECT_DIR ||
      env.CLAUDE_PROJECT_DIR ||
      (typeof payload?.cwd === "string" && payload.cwd) ||
      process.cwd(),
  );

  const { text } = buildContext({ cwd, env, maxMemoryBytes: args.maxMemoryBytes, git: args.git });
  const id = payload?.session_id || payload?.conversation_id || null;
  const source = typeof payload?.source === "string" ? payload.source : "";
  const emit = text && claimSession(id ? String(id) : null, source) ? text : null;
  const out = formatOutput(emit, args.format);
  process.stdout.write(out, () => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

/** True when this file is the process entrypoint (not merely imported). */
function isEntrypoint() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  main().catch((err) => {
    process.stderr.write(`magik-harness session-start: ${err instanceof Error ? err.message : String(err)}\n`);
    const fmt = process.argv.includes("--format") ? process.argv[process.argv.indexOf("--format") + 1] : "text";
    process.stdout.write(fmt === "cursor" || fmt === "claude" ? "{}" : "");
    process.exit(0);
  });
}
