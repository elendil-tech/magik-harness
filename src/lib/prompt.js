// @ts-check
/**
 * prompt.js — minimal interactive prompts for a human at a terminal.
 * Only used when stdin and stdout are TTYs and neither --yes nor --json was
 * passed; scripts and tests never reach it.
 */

import { createInterface } from "node:readline";

/**
 * @returns {{ ask: (question: string, fallback?: string) => Promise<string>, confirm: (question: string, fallback?: boolean) => Promise<boolean>, close: () => void }}
 */
export function createPrompter() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  /** @type {(q: string) => Promise<string>} */
  const question = (q) => new Promise((res) => rl.question(q, res));
  return {
    async ask(q, fallback = "") {
      const a = (await question(`${q}${fallback ? ` [${fallback}]` : ""}: `)).trim();
      return a || fallback;
    },
    async confirm(q, fallback = true) {
      const a = (await question(`${q} [${fallback ? "Y/n" : "y/N"}]: `)).trim().toLowerCase();
      if (!a) return fallback;
      return a === "y" || a === "yes";
    },
    close: () => rl.close(),
  };
}
