/**
 * Multi-agent orchestration — a separate, tree-shakeable entrypoint.
 *
 *   import { defineAgent, runAgents } from "@aviasole/shapecraft/agentic";
 *
 * An "agent" is a `{ model, schema, role }` triple, not a new execution
 * engine — `runAgents()` is a loop around ordinary `generate()` calls,
 * threading each step's *validated* output into the next. Same retry loop,
 * same guarantee levels as everywhere else in shapecraft. See
 * agentic-support-plan.md for the full design and the honesty ledger.
 */
export { defineAgent } from "./agent.js";
export type { Agent } from "./agent.js";
export { runAgents } from "./orchestrator.js";
export type { AgentResult, AgentRouter, RunAgentsOptions, RunAgentsResult } from "./orchestrator.js";
