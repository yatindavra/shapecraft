import type { GenerateOptions, SchemaInput, ShapecraftModel } from "../types.js";
import type { AgentResult } from "./orchestrator.js";

/**
 * A plain `{ model, schema, role }` descriptor — not a class, no hidden
 * lifecycle. One step in a `runAgents()` chain; every step is an ordinary
 * `generate()` call under the hood.
 */
export interface Agent<T = unknown> {
  model: ShapecraftModel;
  schema: SchemaInput<T>;
  /** Identifies this agent in `AgentResult.role` and the router's `history`. */
  role: string;
  systemPrompt?: string;
  /** Extra `generate()` options (maxRetries, temperature, etc.) for this step. */
  options?: GenerateOptions;
  /**
   * Override how this agent's prompt is built. Default: JSON-stringify the
   * previous step's validated `data` (or the original `input` on the first
   * turn, when `last` is null).
   */
  buildPrompt?: (last: AgentResult | null, history: AgentResult[], input: string) => string;
}

/** Identity helper — exists for readability/type-inference at the call site, mirrors `fhir` presets being plain values. */
export function defineAgent<T>(agent: Agent<T>): Agent<T> {
  return agent;
}
