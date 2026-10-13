#!/usr/bin/env node
// Thin shim: check the Node version before loading anything that needs it.
export {};
const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error(`magik-harness needs Node 18 or newer (this is ${process.versions.node}).`);
  process.exit(1);
}
// `magik-harness list | head` closes the pipe early: that is not an error.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (/** @type {NodeJS.ErrnoException} */ e) => {
    if (e.code === "EPIPE") process.exit(0);
    throw e;
  });
}
const { main } = await import("../src/cli.js");
process.exitCode = await main();
