/**
 * tests/fit.test.ts: the fit is done by an agent following text, so the text is
 * what gets tested.
 *
 * The CLI lays the straps and the `harness-fit` skill adjusts the project around
 * them. Two things keep that honest. The skill has to describe the structure the
 * installer really writes (so it cannot go stale), and the CLI has to stay out of
 * everything it does not own (so the adjusting stays the agent's job and no
 * migration code creeps back in).
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { loadProfiles } from "../src/lib/catalog.js";
import { escapeRegex, PLUGIN_VERSION } from "./_version.ts";
import { cli, files, has, project, read, readJson, ROOT, write } from "./_helpers.ts";
import type { Project } from "./_helpers.ts";

const SKILL = join(ROOT, "skills", "harness-fit");
const skillText = read(join(SKILL, "SKILL.md"));
const ref = (name: string) => read(join(SKILL, "references", name));

const run = (p: Project, args: string[]) => cli(args, { cwd: p.app, home: p.home });
const install = (p: Project, args: string[] = []) => run(p, ["install", "--yes", "--vault", p.vault, ...args]);

describe("the harness-fit skill", () => {
  it("is part of every profile, so a project can re-fit itself after an upgrade", () => {
    const { profiles } = loadProfiles();
    for (const [name, profile] of Object.entries(profiles)) assert.ok(profile.skills.includes("harness-fit"), `${name} installs harness-fit`);
  });

  it("is text only: instructions an agent follows, with no scripts to run", () => {
    assert.ok(!existsSync(join(SKILL, "scripts")), "the fit is the agent's work; the CLI is the only code");
    const extra = files(SKILL).filter((f) => !f.endsWith(".md"));
    assert.deepEqual(extra, []);
  });

  it("links every reference it ships, so none is orphaned", () => {
    const shipped = readdirSync(join(SKILL, "references")).sort();
    assert.deepEqual(shipped, ["drift.md", "fitted.md", "stages.md", "versions.md"]);
    for (const name of shipped) assert.ok(skillText.includes(`references/${name}`), `SKILL.md does not link references/${name}`);
  });

  it("walks the same steps in the same order every time", () => {
    const headings = [...skillText.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(headings, [
      "0. Before you start",
      "1. Survey (read only)",
      "2. Plan",
      "3. Strap on (the CLI)",
      "4. Adjust the fit (your part)",
      "5. Check the fit",
      "6. Hand over",
      "Fit again when",
    ]);
  });

  it("has a release note for the version it ships with", () => {
    assert.match(ref("versions.md"), new RegExp(`^## ${escapeRegex(PLUGIN_VERSION)}\\b`, "m"), `references/versions.md needs a "## ${PLUGIN_VERSION}" entry (even if it says there is nothing to do)`);
  });

  it("has a Cursor command that loads it", () => {
    const cmd = read(join(ROOT, "commands", "magik-harness-fit.md"));
    assert.match(cmd, /^name: magik-harness-fit$/m);
    assert.match(cmd, /`harness-fit` skill/);
  });
});

describe("references/fitted.md describes what the installer really writes", () => {
  it("names every folder, marker, schema and hook command of a project install", async () => {
    const p = project();
    const r = await install(p);
    assert.equal(r.code, 0, r.err);
    const fitted = ref("fitted.md");
    const lock = readJson(join(p.app, ".magik/lock.json"));

    const folders = new Set<string>();
    for (const key of Object.keys(lock.files) as string[]) {
      if (key.startsWith(".agents/skills/")) folders.add(".agents/skills/");
      else folders.add(key.split("/").slice(0, -1).join("/") + "/");
    }
    for (const folder of folders) assert.ok(fitted.includes(folder), `fitted.md never mentions ${folder}`);

    for (const f of [".magik/harness.json", ".magik/harness.local.json", ".magik/lock.json", ".magik/backups/", "AGENTS.md", ".gitignore", ".cursor/hooks.json"]) {
      assert.ok(fitted.includes(f), `fitted.md never mentions ${f}`);
    }

    const pointer = readJson(join(p.app, ".magik/harness.json"));
    assert.ok(fitted.includes(pointer.schema), "fitted.md names the pointer schema");

    const agents = read(join(p.app, "AGENTS.md")).split("\n")[0].replace(/v=\S+/, "v=...");
    assert.ok(fitted.includes(agents), `fitted.md shows the primer marker ${agents}`);
    const ignore = read(join(p.app, ".gitignore")).split("\n").find((l) => l.startsWith("# magik-harness:gitignore:start"))!.replace(/v=\S+/, "v=...");
    assert.ok(fitted.includes(ignore), `fitted.md shows the gitignore marker ${ignore}`);

    const hook = readJson(join(p.app, ".cursor/hooks.json")).hooks.sessionStart[0].command as string;
    assert.ok(fitted.includes(hook.replace("--format cursor", "--format <tool>")), "fitted.md shows the hook command");
  });

  it("names the files of a global install", async () => {
    const p = project();
    const r = await run(p, ["install", "--scope", "global", "--tools", "cursor", "--vault", p.vault, "--yes"]);
    assert.equal(r.code, 0, r.err);
    const fitted = ref("fitted.md");
    for (const f of ["~/.magik/config.json", "~/.magik/lock.json", "~/.magik/runtime/", "~/.agents/skills/", "~/.cursor/hooks.json"]) {
      assert.ok(fitted.includes(f), `fitted.md never mentions ${f}`);
    }
    for (const f of [".magik/config.json", ".magik/lock.json", ".magik/runtime/session-start.mjs", ".agents/skills/harness-fit/SKILL.md", ".cursor/hooks.json"]) {
      assert.ok(has(join(p.home, f)), `a global install writes ~/${f}`);
    }
  });
});

describe("the CLI stays out of what it does not own", () => {
  const OLD_POINTER = '{"schema":"magik-repo/harness@1","vault":"~/vault","knowledge":{"mount":"app/knowledge"},"memory":{"mount":"app/memory"}}\n';
  const OLD_HOOK = "// a hook script from some earlier setup\n";
  const OLD_BLOCKS = "<!-- harness:primer:start v=1.9.1 -->\nan older primer\n<!-- harness:primer:end -->\n\n# My project\n";

  it("leaves an older pointer, hook script and blocks exactly as they were, for the agent to fit", async () => {
    const p = project({ files: { "README.md": "# app\n", "AGENTS.md": OLD_BLOCKS } });
    write(join(p.app, ".cursor/harness.json"), OLD_POINTER);
    write(join(p.app, ".cursor/hooks/session-start.js"), OLD_HOOK);
    write(join(p.app, ".cursor/hooks.json"), '{"version":1,"hooks":{"sessionStart":[{"command":"node .cursor/hooks/session-start.js"}]}}\n');

    const r = await install(p);
    assert.equal(r.code, 0, r.err);

    assert.equal(read(join(p.app, ".cursor/harness.json")), OLD_POINTER, "the older pointer is not moved or rewritten");
    assert.equal(read(join(p.app, ".cursor/hooks/session-start.js")), OLD_HOOK, "an older hook script is not deleted");
    const agents = read(join(p.app, "AGENTS.md"));
    assert.ok(agents.includes("an older primer"), "an older block is not replaced");
    assert.equal(agents.match(/magik-harness:primer:start/g)?.length, 1, "the current block is added next to it");
    const hooks = readJson(join(p.app, ".cursor/hooks.json")).hooks.sessionStart.map((h: { command: string }) => h.command);
    assert.deepEqual(hooks, ["node .cursor/hooks/session-start.js", "node .magik/runtime/session-start.mjs --format cursor"], "the older entry stays; ours is added");
  });

  it("does not delete or rewrite a skill folder that is the project's own", async () => {
    const p = project();
    write(join(p.app, ".agents/skills/our-own/SKILL.md"), "---\nname: our-own\ndescription: The project's own skill, for tests. Use it never.\n---\n\n# Ours\n");
    const r = await install(p);
    assert.equal(r.code, 0, r.err);
    assert.ok(read(join(p.app, ".agents/skills/our-own/SKILL.md")).includes("# Ours"));
    assert.ok(has(join(p.app, ".agents/skills/harness-fit/SKILL.md")));
  });
});

describe("doctor hands the rest to the agent", () => {
  it("says nothing about the skill when everything is fine", async () => {
    const p = project();
    assert.equal((await install(p)).code, 0);
    const r = await run(p, ["doctor"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.ok(!r.out.includes("harness-fit"), "a healthy install is not nagged");
  });

  it("names the skill when something is wrong, and when nothing is installed", async () => {
    const p = project();
    const none = await run(p, ["doctor", "--scope", "project"]);
    assert.match(none.out, /`harness-fit` skill/);
    assert.equal((await install(p)).code, 0);
    rmSync(join(p.app, ".magik/runtime/resolve.mjs"));
    const broken = await run(p, ["doctor", "--scope", "project"]);
    assert.equal(broken.code, 1, broken.out);
    assert.match(broken.out, /`harness-fit` skill/);
  });
});
