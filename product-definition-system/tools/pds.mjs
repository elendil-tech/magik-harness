#!/usr/bin/env node
// pds: define a product completely, at every level, and keep the definition honest.
import { main } from "./lib/cli.mjs";

// `pds next | head` closes the pipe while we are still writing. That is the reader's
// choice, not an error: stop quietly, as every well-behaved command line tool does.
process.stdout.on("error", (e) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

process.exitCode = await main(process.argv.slice(2));
