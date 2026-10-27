import { checks as sch } from "./schema.mjs";
import { checks as ref } from "./refs.mjs";
import { checks as int } from "./integrity.mjs";
import { checks as qlt } from "./quality.mjs";
import { checks as gov } from "./governance.mjs";
import { checks as prb } from "./probes.mjs";

export const IMPLEMENTATIONS = { ...sch, ...ref, ...int, ...qlt, ...gov, ...prb };
export const implementedChecks = Object.keys(IMPLEMENTATIONS);
