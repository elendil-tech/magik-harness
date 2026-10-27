#!/usr/bin/env node
// pds: define a product completely, at every level, and keep the definition honest.
import { main } from "./lib/cli.mjs";

process.exitCode = await main(process.argv.slice(2));
