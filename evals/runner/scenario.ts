/**
 * evals/runner/scenario.ts — load + validate scenario YAML files.
 *
 * Each `evals/scenarios/*.yaml` is parsed, schema-validated, and returned
 * as a strongly typed `Scenario`. The schema is the contract; any
 * structural drift in scenario files surfaces as a load-time error
 * (which the CLI will print with file context).
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { load as parseYaml } from "js-yaml";
import { ScenarioSchema, type Scenario } from "./types.ts";

export interface LoadedScenario extends Scenario {
  /** Absolute path of the source YAML file — for error messages. */
  __source: string;
}

export function loadScenario(yamlPath: string): LoadedScenario {
  const raw = readFileSync(yamlPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(
      `failed to parse YAML in ${yamlPath}: ${(err as Error).message}`,
    );
  }
  const result = ScenarioSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `scenario file ${yamlPath} failed schema validation:\n${issues}`,
    );
  }

  // Sanity: scenario id should match filename (NN-id.yaml) so the directory
  // listing and the loaded ids are isomorphic. Cheap drift catch.
  const fileBase = basename(yamlPath, ".yaml");
  if (fileBase !== result.data.id) {
    throw new Error(
      `scenario id "${result.data.id}" does not match filename "${fileBase}.yaml" (${yamlPath})`,
    );
  }

  return { ...result.data, __source: yamlPath };
}
