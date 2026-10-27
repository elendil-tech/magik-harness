// Shared test helpers. Tests drive the real code on real files: the CLI in
// process (no child processes, so a failure has a stack), and a scratch copy of
// the worked example that a test can break in one precise way.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../lib/cli.mjs";
import { buildModel } from "../lib/graph.mjs";
import { analyse } from "../lib/lint.mjs";
import { DEFAULT_META_DIR, loadMeta } from "../lib/metamodel.mjs";
import { readProject, resolveConfig } from "../lib/project.mjs";
import { splitFrontmatter } from "../lib/records.mjs";
import { parseYaml, stringifyYaml } from "../lib/yaml.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(here, "..", "..");
export const LEDGERLY = join(PROJECT_ROOT, "examples", "ledgerly");
export const TODAY = "2026-10-27";

/** The shipped meta-model, loaded once. */
export const meta = loadMeta(DEFAULT_META_DIR);

const scratchDirs = [];
process.on("exit", () => {
  for (const d of scratchDirs) rmSync(d, { recursive: true, force: true });
});

/** A fresh empty folder that is removed when the test process ends. */
export function scratch(prefix = "pds-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

/** A private copy of the worked example, free to be broken. */
export function copyExample() {
  const dir = scratch("pds-ledgerly-");
  cpSync(LEDGERLY, dir, { recursive: true });
  return dir;
}

/**
 * Run the command line in process. The environment is explicit, so nothing the
 * developer has set (PDS_AGENT, PDS_ROOT) leaks into a test.
 * @returns {Promise<{code: number, out: string, err: string}>}
 */
export async function pds(argv, { cwd, env = {} } = {}) {
  let out = "";
  let err = "";
  const code = await main(argv, { out: (s) => (out += s), err: (s) => (err += s), env: { PDS_TODAY: TODAY, ...env }, cwd: cwd ?? process.cwd() });
  return { code, out, err };
}

/** Where a record lives in a project folder. */
export function recordPath(root, id) {
  return join(root, "definition", meta.familyOf(meta.typeOfId(id)), `${id}.md`);
}

export function readRecordText(root, id) {
  return readFileSync(recordPath(root, id), "utf8");
}

export function writeRecordText(root, id, text) {
  writeFileSync(recordPath(root, id), text);
}

/** Rewrite the text of one record. */
export function editText(root, id, fn) {
  const before = readRecordText(root, id);
  const after = fn(before);
  if (after === before) throw new Error(`test setup: editing ${id} changed nothing`);
  writeRecordText(root, id, after);
}

/**
 * Change a record's frontmatter as data: parse it, let `fn` mutate it, write it
 * back. Comments inside the frontmatter are lost, which no test depends on.
 */
export function editFront(root, id, fn) {
  editText(root, id, (text) => {
    const split = splitFrontmatter(text);
    const front = parseYaml(split.front);
    fn(front);
    return `---\n${stringifyYaml(front).trimEnd()}\n---\n${split.body}`;
  });
}

/** The text of a record: `front` as data, `body` as Markdown. */
export function rec(front, body = "") {
  return `---\n${stringifyYaml(front).trimEnd()}\n---\n\n${body}\n`;
}

/**
 * A model built in memory from a handful of records, for tests about the graph
 * rather than the files. Each value is the frontmatter, or [frontmatter, body].
 * No linting happens: the records need only be readable. `extraFiles` adds raw
 * files by path, for records that are broken or misplaced on purpose.
 */
export function modelOf(records, { adoption = "full", extraFiles = {} } = {}) {
  const { config } = resolveConfig(meta, { pds: 1, name: "Test", profile: "saas", adoption });
  const files = new Map(Object.entries(extraFiles));
  for (const [id, value] of Object.entries(records)) {
    const [front, body] = Array.isArray(value) ? value : [value, ""];
    files.set(`definition/${meta.familyOf(meta.typeOfId(id))}/${id}.md`, rec({ id, title: id, maturity: "stub", ...front }, body));
  }
  return buildModel(meta, config, files);
}

/** Add a new record to a project: `front` is the frontmatter as data, `body` the Markdown after it. */
export function addRecord(root, id, front, body = "") {
  const path = recordPath(root, id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `---\n${stringifyYaml({ id, ...front }).trimEnd()}\n---\n\n${body}\n`);
}

export function frontOf(root, id) {
  return parseYaml(splitFrontmatter(readRecordText(root, id)).front);
}

/** Move a record file, as a person might by hand. */
export function moveRecord(root, id, toFamily) {
  const from = recordPath(root, id);
  const to = join(root, "definition", toFamily, `${id}.md`);
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}

/** Read the project at `root` and analyse it exactly as `pds lint` would. */
export function analyseRoot(root, { today = TODAY } = {}) {
  return analyse({ meta, project: readProject(meta, root), today });
}

/**
 * The findings with this code, optionally for one element. A code that no check declares is a
 * mistake in the test, not an absence of findings, so it throws: a test that looks for a
 * misspelt code would otherwise pass for ever.
 */
export function found(analysis, code, element) {
  const declared = [...meta.checks, ...meta.gates, ...meta.rules, ...meta.implicitRules];
  if (!declared.some((d) => d.id === code)) throw new Error(`test setup: ${code} is not a check, a gate or a rule`);
  return analysis.findings.filter((f) => f.id === code && (element === undefined || f.element === element));
}

/** Every file under a folder, as relative paths. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** The text of every file in a folder, keyed by relative path, for before/after comparisons. */
export function snapshot(dir) {
  return new Map(listFiles(dir).map((p) => [p, readFileSync(join(dir, p), "utf8")]));
}
