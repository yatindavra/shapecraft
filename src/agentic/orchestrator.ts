import type { ResultMetadata } from "../types.js";
import { MaxTurnsExceededError } from "../types.js";
import { generate } from "../core/generate.js";
import type { Agent } from "./agent.js";

/** One completed, validated step in the chain. */
export interface AgentResult<T = unknown> {
  role: string;
  data: T;
  metadata: ResultMetadata;
}

/** Decides the next agent key, or `"done"` to stop. May be sync or async. */
export type AgentRouter = (last: AgentResult | null, history: AgentResult[]) => string | Promise<string>;

export interface RunAgentsOptions {
  router: AgentRouter;
  /** Loop guard — throws MaxTurnsExceededError beyond this many steps. Default 10. */
  maxTurns?: number;
}

export interface RunAgentsResult<T = unknown> {
  trace: AgentResult[];
  final: T;
}

/**
 * Orchestrator loop: calls each agent's `generate()`, hands its *validated*
 * output to the router, and feeds it forward as the next agent's prompt.
 * Never re-feeds raw/unvalidated model text between steps.
 */
export async function runAgents<T = unknown>(
  agents: Record<string, Agent>,
  input: string,
  { router, maxTurns = 10 }: RunAgentsOptions
): Promise<RunAgentsResult<T>> {
  const trace: AgentResult[] = [];
  let last: AgentResult | null = null;

  for (let turn = 1; turn <= maxTurns; turn++) {
    const next = await router(last, trace);
    if (next === "done") {
      if (!last) throw new Error('runAgents: router returned "done" before any agent ran');
      return { trace, final: last.data as T };
    }

    const agent = agents[next];
    if (!agent) throw new Error(`runAgents: router picked unknown agent "${next}"`);

    const prompt: string = agent.buildPrompt ? agent.buildPrompt(last, trace, input) : last ? JSON.stringify(last.data) : input;
    const systemPrompt = agent.systemPrompt ?? agent.options?.systemPrompt;

    const result = await generate(agent.model, agent.schema, prompt, {
      ...agent.options,
      ...(systemPrompt === undefined ? {} : { systemPrompt }),
    });

    last = { role: agent.role, data: result.data, metadata: result.metadata };
    trace.push(last);
  }

  throw new MaxTurnsExceededError(maxTurns);
}
