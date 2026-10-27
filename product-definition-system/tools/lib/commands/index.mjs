// Every command, and how `pds help` groups them.
import { init, create, rename, approve } from "./author.mjs";
import { lint, status, next, ask, explain } from "./report.mjs";
import { view, views, spec, impact, docs, meta } from "./output.mjs";

export const COMMANDS = { init, new: create, rename, approve, lint, status, next, ask, view, views, spec, impact, explain, meta, docs };

export const GROUPS = [
  ["Write", ["init", "new", "rename", "approve"]],
  ["Check", ["lint", "status", "next", "ask"]],
  ["See", ["view", "views", "spec", "impact"]],
  ["Understand", ["explain", "meta", "docs"]],
];
