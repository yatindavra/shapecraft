# Multi-agent Orchestration

Chain validated `generate()` calls together, behind a separate (tree-shakeable) entrypoint. An "agent" is not a new primitive - it's a `{ model, schema, role }` triple, and `runAgents()` is a loop around ordinary `generate()` calls: same retry loop, same guarantee levels as everywhere else in shapecraft.

```typescript
import { defineAgent, runAgents } from "@aviasole/shapecraft/agentic";
import { openai } from "@aviasole/shapecraft";
import { z } from "zod";

const triage = defineAgent({
  model: openai({ model: "gpt-4o-mini" }),
  schema: z.object({ category: z.enum(["billing", "technical", "general"]) }),
  role: "triage",
});

const technical = defineAgent({
  model: openai({ model: "gpt-4o-mini" }),
  schema: z.object({ diagnosis: z.string(), steps: z.array(z.string()) }),
  role: "technical",
  // The default handoff forwards only the previous step's validated data, so this
  // step would otherwise see a bare { category: "technical" } with no description
  // of the actual problem. Carry the original input forward alongside it.
  buildPrompt: (last, _history, input) => `Original request: ${input}\nTriage: ${JSON.stringify(last?.data)}`,
});

const result = await runAgents(
  { triage, technical },
  "My app crashes when I upload a file over 10MB",
  {
    router: (last) => {
      if (!last) return "triage";
      if (last.role === "triage" && (last.data as { category: string }).category === "technical") return "technical";
      return "done";
    },
    maxTurns: 5,
  }
);

console.log(result.trace); // [{ role: "triage", data: {...}, metadata: {...} }, { role: "technical", ... }]
console.log(result.final); // last step's validated data
```

The `router` is a plain function you write - full control over branching, no hidden state machine. Each agent's prompt defaults to a JSON-stringified copy of the previous step's *validated* `data` (never raw/unvalidated model text); override per-agent with `buildPrompt`.

What this does and doesn't guarantee:

- **Each step is validated** exactly as strongly as a standalone `generate()` call with that model/schema. Orchestration adds zero new validation weakness per step.
- **The chain as a whole is not validated** - nothing checks the *sequence* of agents was "correct" or that one step's output is semantically consistent with the next. That's the router's responsibility, same as any hand-written control flow.
- **Routing is deterministic and caller-owned**, not learned/inferred by a model. If you want a model to decide routing, put that decision inside an agent's own schema (e.g. triage's `category` field) and read it in your router.
- **No loop-prevention beyond `maxTurns`** (default 10) - a router that never returns `"done"` throws `MaxTurnsExceededError` (exported from both `@aviasole/shapecraft/agentic` and the root entrypoint), same blunt guard `TurnaroundOptions.maxTurns` uses.

Out of scope for v1: concurrent/parallel agents (use `generateBatch()` for independent work), autonomous routing, tool-calling within a step, shared mutable state across agents, and persisted/resumable chains.
