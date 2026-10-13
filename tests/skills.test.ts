/**
 * tests/skills.test.ts: the content the package installs.
 *
 * Skills, packs, profiles and primers are what an agent actually reads, so the
 * suite treats them like code: every skill is valid under the Agent Skills
 * format, every reference inside them resolves, a profile never names a skill
 * that is not there, a primer never points at a skill its profile does not
 * install, and nothing owner-specific has leaked into a public package.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";

import { loadCatalog, loadProfiles } from "../src/lib/catalog.js";
import { lintSkillDir, parseSkillMd } from "../src/lib/skillmd.js";
import { cli, ROOT, tmp } from "./_helpers.ts";

const catalog = loadCatalog({ packDirs: [] });
const { profiles, globalOnly } = loadProfiles();
const everySkill = [...catalog.all.values()];
const KNOWN = new Set(everySkill.map((s) => s.name));

/** Every file under `dir` (absolute paths). */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

describe("skills", () => {
  it("there are skills to check", () => {
    assert.ok(catalog.core.length >= 8, "core skills present");
    assert.ok(catalog.packs.length >= 2, "packs present");
  });

  for (const skill of everySkill) {
    describe(`${skill.name} (${skill.origin})`, () => {
      it("is valid under the Agent Skills format", () => {
        const { problems } = lintSkillDir(skill.dir);
        assert.deepEqual(problems, []);
      });

      it("says what it does and when to use it", () => {
        const d = skill.description ?? "";
        assert.ok(d.length >= 80, `description is only ${d.length} chars; agents pick skills by it`);
        assert.match(d, /\b(use|when|if)\b/i, "the description should say when to reach for the skill");
      });

      it("stays small enough to load whole (under 500 lines)", () => {
        const lines = readFileSync(join(skill.dir, "SKILL.md"), "utf8").split("\n").length;
        assert.ok(lines < 500, `${lines} lines; move detail into references/`);
      });

      it("has no broken relative links or file references", () => {
        const broken: string[] = [];
        for (const f of walk(skill.dir).filter((x) => x.endsWith(".md"))) {
          const text = readFileSync(f, "utf8");
          for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
            const target = m[1];
            if (/^(https?:|mailto:|#)/.test(target)) continue;
            const path = resolve(dirname(f), target.split("#")[0]);
            if (!existsSync(path)) broken.push(`${relative(skill.dir, f)} -> ${target}`);
          }
        }
        const body = readFileSync(join(skill.dir, "SKILL.md"), "utf8");
        for (const m of body.matchAll(/`((?:scripts|references|assets)\/[A-Za-z0-9_./-]+)`/g)) {
          if (!existsSync(join(skill.dir, m[1]))) broken.push(`SKILL.md mentions ${m[1]}, which is not in the skill`);
        }
        assert.deepEqual(broken, []);
      });

      it("ships its scripts executable", { skip: process.platform === "win32" }, () => {
        const notExecutable = walk(skill.dir)
          .filter((f) => /\/scripts\//.test(f.replace(/\\/g, "/")))
          .filter((f) => readFileSync(f, "utf8").startsWith("#!"))
          .filter((f) => (statSync(f).mode & 0o111) === 0)
          .map((f) => relative(skill.dir, f));
        assert.deepEqual(notExecutable, []);
      });
    });
  }

  it("names are unique across core skills and packs", () => {
    const names = everySkill.map((s) => s.name);
    assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
  });

  it("the catalog and the folders agree", () => {
    const core = readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    assert.deepEqual(catalog.core.map((s) => s.name).sort(), core);
  });
});

describe("profiles and packs", () => {
  it("every skill a profile names exists, and every core skill is reachable from some profile", () => {
    const reachable = new Set<string>(globalOnly);
    for (const [name, profile] of Object.entries(profiles)) {
      for (const s of profile.skills) {
        assert.ok(KNOWN.has(s), `profile ${name} names skill ${s}, which is not in the package`);
        reachable.add(s);
      }
    }
    for (const s of globalOnly) assert.ok(KNOWN.has(s), `global-only skill ${s} is not in the package`);
    for (const s of catalog.core) assert.ok(reachable.has(s.name), `core skill ${s.name} is in no profile, so nothing would ever install it`);
  });

  it("every profile has a primer file and a description", () => {
    const raw = JSON.parse(readFileSync(join(ROOT, "content", "profiles.json"), "utf8"));
    for (const [name, profile] of Object.entries(raw)) {
      if (name === "globalOnly") continue;
      const p = profile as { description?: string; primer?: string; skills?: string[]; vault?: boolean };
      assert.ok(p.description && p.description.length > 20, `${name} needs a description`);
      assert.ok(p.primer && existsSync(join(ROOT, "content", p.primer)), `${name} primer file exists`);
      assert.equal(typeof p.vault, "boolean");
    }
  });

  it("each pack has a description, valid requirements, and at least one skill", () => {
    for (const pack of catalog.packs) {
      assert.ok(pack.description.length > 40, `${pack.name} needs a real description`);
      assert.ok(pack.skills.length >= 1, `${pack.name} has no skills`);
      const req = pack.requires as { commands?: unknown; platforms?: unknown };
      if (req.commands !== undefined) assert.ok(Array.isArray(req.commands) && req.commands.every((c) => typeof c === "string"));
      if (req.platforms !== undefined) assert.ok(Array.isArray(req.platforms) && req.platforms.every((c) => ["darwin", "linux", "win32"].includes(c as string)));
      for (const s of pack.skills) assert.ok(KNOWN.has(s));
    }
  });

  it("a pack never shadows a core skill", () => {
    const core = new Set(catalog.core.map((s) => s.name));
    for (const pack of catalog.packs) for (const s of pack.skills) assert.ok(!core.has(s), `${pack.name} redefines core skill ${s}`);
  });
});

describe("primers", () => {
  for (const name of Object.keys(profiles)) {
    describe(`${name} primer`, () => {
      const primer = async () => {
        const home = tmp("primer-home");
        const r = await cli(["primer", "--profile", name], { cwd: home, home });
        assert.equal(r.code, 0, r.err);
        return r.out;
      };

      it("only points at skills its profile installs", async () => {
        const text = await primer();
        const allowed = new Set([...profiles[name].skills, "harness-setup"]);
        const stray: string[] = [];
        for (const m of text.matchAll(/`([a-z][a-z0-9-]+)`/g)) if (KNOWN.has(m[1]) && !allowed.has(m[1])) stray.push(m[1]);
        assert.deepEqual([...new Set(stray)], [], "a primer must not mention a skill that is not installed");
      });

      it("names the skills it relies on", async () => {
        const text = await primer();
        assert.match(text, /`agentic-e2e-loop`/);
        assert.match(text, /`harness`/);
      });

      it("has no unrendered placeholders and fits the budget (5 KB)", async () => {
        const text = await primer();
        assert.ok(!text.includes("{{") && !text.includes("}}"), "template placeholder left in the primer");
        assert.ok(Buffer.byteLength(text) < 5000, `${Buffer.byteLength(text)} bytes; every session pays for the primer`);
      });

      it("does not mention Cursor-only mechanisms (it is read by every tool)", async () => {
        const text = await primer();
        assert.ok(!/\.mdc\b/.test(text));
        const prose = text.replace(/https?:\/\/\S+/g, "");
        assert.ok(!/\/magik-/.test(prose), "slash commands only exist in Cursor");
        assert.ok(!/magik-repo/.test(prose), "old product name");
      });
    });
  }

  it("the knowledge primer carries the knowledge rules; the minimal one tells you how to get them", async () => {
    const home = tmp("primer-home");
    const k = (await cli(["primer", "--profile", "knowledge"], { cwd: home, home })).out;
    const m = (await cli(["primer", "--profile", "minimal"], { cwd: home, home })).out;
    assert.match(k, /kb-search/);
    assert.match(k, /memory/i);
    assert.match(m, /--profile knowledge --vault/, "a minimal install says how to grow into a knowledge base");
  });
});

describe("a public package", () => {
  const DENY: [RegExp, string][] = [
    [/\/Users\/[A-Za-z]/, "an absolute home path"],
    [/falconproxy/i, "a private project name"],
    [/socialninja/i, "a private project name"],
    [/workflow-orchestrator/i, "a private project name"],
    [/doppler/i, "a private secrets setup"],
    [/gianluca/i, "a personal name"],
  ];
  const roots = ["skills", "packs", "content", "runtime", "src", "bin", "commands", "docs"].map((r) => join(ROOT, r)).filter(existsSync);

  it("carries no owner-specific names, paths or account details in anything it ships", () => {
    const hits: string[] = [];
    for (const root of roots) {
      for (const f of walk(root)) {
        const rel = relative(ROOT, f).replace(/\\/g, "/");
        if (rel.startsWith("docs/history/")) continue;
        if (!/\.(md|mjs|js|json|py|sh|txt|ya?ml)$/.test(rel)) continue;
        const text = readFileSync(f, "utf8");
        for (const [re, why] of DENY) {
          const m = re.exec(text);
          if (m) hits.push(`${rel}: ${why} (${m[0]})`);
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  it("every SKILL.md frontmatter is parseable by the same reader the installer uses", () => {
    for (const s of everySkill) {
      const meta = parseSkillMd(readFileSync(join(s.dir, "SKILL.md"), "utf8"));
      assert.deepEqual(meta.errors, [], s.name);
      assert.equal(meta.name, s.name);
    }
  });
});
