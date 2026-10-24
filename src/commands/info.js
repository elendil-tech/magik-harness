// @ts-check
/**
 * info.js — the small read-only commands: resolve, list, primer, status.
 */

import { resolve } from "node:path";

import { formatResolution, resolveHarness } from "../../runtime/resolve.mjs";
import { parseFlags, UsageError } from "../lib/args.js";
import { loadCatalog, loadProfiles } from "../lib/catalog.js";
import { readLock } from "../lib/lock.js";
import { renderPrimer } from "../lib/render.js";
import { buildScope } from "../lib/scope.js";
import { TOOL_IDS, TOOLS } from "../tools/index.js";
import { VERSION } from "../version.js";

/**
 * @param {string[]} argv
 * @param {import("./install.js").IO} io
 */
export async function runResolve(argv, io) {
  const { flags } = parseFlags(argv, { boolean: ["json", "help"], string: ["project-root"], alias: { h: "help" } });
  if (flags.help) {
    io.out("Usage: magik-harness resolve [--json] [--project-root <dir>]\n\nPrint where this project's knowledge base and memory resolve, and why.\n");
    return 0;
  }
  const r = resolveHarness({ cwd: resolve(io.cwd, /** @type {string|undefined} */ (flags["project-root"]) ?? "."), home: io.home, env: io.env });
  io.out(flags.json ? JSON.stringify(r, null, 2) + "\n" : formatResolution(r) + "\n");
  return r.warnings.length ? 1 : 0;
}

/**
 * @param {string[]} argv
 * @param {import("./install.js").IO} io
 */
export async function runList(argv, io) {
  const { flags } = parseFlags(argv, { boolean: ["json", "help"], string: ["pack-dir"], alias: { h: "help" } });
  if (flags.help) {
    io.out("Usage: magik-harness list [--json] [--pack-dir <dir>]\n\nList profiles, core skills, packs and tool adapters.\n");
    return 0;
  }
  const catalog = loadCatalog({ packDirs: typeof flags["pack-dir"] === "string" ? [resolve(io.cwd, flags["pack-dir"])] : [] });
  const { profiles } = loadProfiles();
  if (flags.json) {
    io.out(
      JSON.stringify(
        {
          version: VERSION,
          profiles,
          skills: catalog.core.map((s) => ({ name: s.name, description: s.description })),
          packs: catalog.packs.map((p) => ({ name: p.name, description: p.description, skills: p.skills, requires: p.requires })),
          tools: TOOL_IDS.map((id) => ({ id, label: TOOLS[id].label, status: TOOLS[id].status })),
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }
  const first = (/** @type {string|null} */ d) => (d ?? "").replace(/\s+/g, " ").split(/(?<=\.)\s/)[0].slice(0, 110);
  io.out(`magik-harness ${VERSION}\n\nProfiles\n`);
  for (const [name, p] of Object.entries(profiles)) io.out(`  ${name.padEnd(10)} ${p.vault ? "with a vault" : "no vault"}; skills: ${p.skills.join(", ")}\n`);
  io.out("\nCore skills\n");
  for (const s of catalog.core) io.out(`  ${s.name.padEnd(18)} ${first(s.description)}\n`);
  io.out("\nPacks (opt-in: --packs <name>)\n");
  for (const p of catalog.packs) io.out(`  ${p.name.padEnd(12)} ${p.description}  [skills: ${p.skills.join(", ")}]\n`);
  io.out("\nTools (--tools)\n");
  for (const id of TOOL_IDS) io.out(`  ${id.padEnd(8)} ${TOOLS[id].status.padEnd(12)} ${TOOLS[id].label}\n`);
  return 0;
}

/**
 * @param {string[]} argv
 * @param {import("./install.js").IO} io
 */
export async function runPrimer(argv, io) {
  const { flags } = parseFlags(argv, { boolean: ["help"], string: ["scope", "profile", "project-root"], alias: { h: "help" } });
  if (flags.help) {
    io.out("Usage: magik-harness primer [--scope project|global] [--profile minimal|knowledge]\n\nPrint the primer text, for tools that need it pasted into their own instruction file.\n");
    return 0;
  }
  const kind = /** @type {string} */ (flags.scope ?? "project");
  if (kind !== "project" && kind !== "global") throw new UsageError("--scope must be project or global");
  const { profiles } = loadProfiles();
  const name = /** @type {string} */ (flags.profile ?? "knowledge");
  if (!profiles[name]) throw new UsageError(`unknown profile "${name}"`);
  const scope = buildScope({ kind, projectRoot: resolve(io.cwd, /** @type {string|undefined} */ (flags["project-root"]) ?? "."), home: io.home, magikHome: io.env.MAGIK_HOME });
  io.out(renderPrimer(profiles[name].primer, scope) + "\n");
  return 0;
}

/**
 * @param {string[]} argv
 * @param {import("./install.js").IO} io
 */
export async function runStatus(argv, io) {
  const { flags } = parseFlags(argv, { boolean: ["json", "help"], string: ["project-root"], alias: { h: "help" } });
  if (flags.help) {
    io.out("Usage: magik-harness status [--json] [--project-root <dir>]\n\nOne screen: which installs exist here, their versions, and what resolves.\n");
    return 0;
  }
  const root = resolve(io.cwd, /** @type {string|undefined} */ (flags["project-root"]) ?? ".");
  const res = resolveHarness({ cwd: root, home: io.home, env: io.env });
  const project = buildScope({ kind: "project", projectRoot: res.projectRoot, home: io.home, magikHome: io.env.MAGIK_HOME });
  const global = buildScope({ kind: "global", home: io.home, magikHome: io.env.MAGIK_HOME });
  const installs = [project, global].map((s) => {
    const l = readLock(s.lockPath);
    return { scope: s.kind, lockPath: s.lockPath, installed: l.ok, version: l.ok ? l.lock.version : null, profile: l.ok ? l.lock.profile : null, tools: l.ok ? l.lock.tools : [], packs: l.ok ? l.lock.packs : [], skillsDir: l.ok ? l.lock.skillsDir : null, problem: !l.ok && !l.missing ? l.error : null };
  });
  if (flags.json) {
    io.out(JSON.stringify({ cliVersion: VERSION, installs, resolution: res }, null, 2) + "\n");
    return 0;
  }
  io.out(`magik-harness ${VERSION}\n\n`);
  for (const i of installs) {
    if (i.installed) {
      const stale = i.version !== VERSION ? `  (CLI is ${VERSION}: run \`magik-harness upgrade${i.scope === "global" ? " --scope global" : ""}\`)` : "";
      io.out(`${i.scope.padEnd(8)} installed v${i.version}  profile ${i.profile}  tools ${i.tools.join(",") || "-"}  packs ${i.packs.join(",") || "-"}${stale}\n`);
    } else io.out(`${i.scope.padEnd(8)} ${i.problem ? `lock unreadable: ${i.problem}` : "not installed"}\n`);
  }
  io.out(`\n${formatResolution(res)}\n`);
  return 0;
}
