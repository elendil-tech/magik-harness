#!/usr/bin/env node
// Renders every Mermaid diagram in this project's Markdown (README, docs and the
// worked example's generated views) with the real Mermaid library, in a browser.
//
// The tool's own tests check that diagrams are well formed; only Mermaid can say
// that they draw. This writes one HTML page that does it.
//
//   node scripts/mermaid-check/build.mjs [--version 11.17.2] [--out DIR]
//
// Open the page it prints. Each diagram is listed green or red, the heading says
// how many failed, and the page title is `done:<diagrams>:<failed>`, which a
// headless browser can poll. The page loads Mermaid from a CDN, so it needs a
// network connection; nothing is installed and nothing in the project changes.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const version = flag("version", "11.17.2");
const outDir = resolve(flag("out", join(tmpdir(), "pds-mermaid-check")));

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name === ".git") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".md")) files.push(path);
  }
};
walk(root);

const blocks = [];
for (const file of files) {
  let index = 0;
  for (const m of readFileSync(file, "utf8").matchAll(/```mermaid\n([\s\S]*?)```/g)) blocks.push({ file: relative(root, file), index: index++, text: m[1] });
}

// "</script" inside the data would end the script element early.
const data = JSON.stringify(blocks).replace(/</g, "\\u003c");

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>pending</title>
<style>body{font-family:sans-serif;margin:16px}.b{border:1px solid #ccc;margin:12px 0;padding:8px}.err{color:#b00020}.ok{color:#2e7d32}svg{max-width:100%;height:auto}</style></head>
<body><h3 id="summary">rendering...</h3><div id="out"></div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@${version}/dist/mermaid.min.js"></script>
<script>
const BLOCKS = ${data};
mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
(async () => {
  const out = document.getElementById("out");
  let failed = 0;
  for (let i = 0; i < BLOCKS.length; i++) {
    const b = BLOCKS[i];
    const box = document.createElement("div");
    box.className = "b";
    const label = document.createElement("div");
    label.textContent = "#" + i + " " + b.file + " [" + b.index + "] " + b.text.trim().split(/\\s/)[0];
    box.appendChild(label);
    try {
      await mermaid.parse(b.text);
      const { svg } = await mermaid.render("d" + i, b.text);
      if (/Syntax error in text/i.test(svg)) throw new Error("Mermaid drew its error diagram");
      const holder = document.createElement("div");
      holder.innerHTML = svg;
      box.appendChild(holder);
      label.className = "ok";
    } catch (e) {
      failed++;
      label.className = "err";
      label.textContent += "  ERROR: " + String((e && e.message) || e).split("\\n")[0];
    }
    out.appendChild(box);
  }
  document.getElementById("summary").textContent = BLOCKS.length + " diagrams, " + failed + " failed";
  document.title = "done:" + BLOCKS.length + ":" + failed;
})();
</script></body></html>
`;

mkdirSync(outDir, { recursive: true });
const target = join(outDir, "index.html");
writeFileSync(target, page);
console.log(`${blocks.length} diagrams in ${new Set(blocks.map((b) => b.file)).size} files (Mermaid ${version}).`);
console.log(`Open ${target}`);
