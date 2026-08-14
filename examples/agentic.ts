/**
 * Example: Agentic orchestration — triage -> specialist -> reviewer.
 *
 * Each step is an ordinary generate() call (same retry loop, same guarantee
 * levels). The router is a plain function you write, deciding what runs next
 * from the previous step's *validated* data. No hidden state machine.
 */
import { defineAgent, runAgents } from "@aviasole/shapecraft/agentic";
import { anthropic } from "@aviasole/shapecraft";
import { z } from "zod";

const model = anthropic({ model: "claude-haiku-4-5-20251001" });

const triage = defineAgent({
  model,
  schema: z.object({ category: z.enum(["billing", "technical", "general"]) }),
  role: "triage",
  systemPrompt: 'Classify the support request into exactly one category: "billing", "technical", or "general".',
});

const technical = defineAgent({
  model,
  schema: z.object({ diagnosis: z.string(), steps: z.array(z.string()) }),
  role: "technical",
  // Naming the exact JSON shape (not just describing it in prose) keeps weaker
  // models from inventing their own field names (e.g. "fix_steps" instead of "steps").
  systemPrompt:
    'Diagnose the technical issue described in the original request. Respond with JSON exactly like: ' +
    '{"diagnosis": "<string>", "steps": ["<string>", "<string>"]}',
  // The default handoff only forwards the previous step's validated data — a bare
  // { category: "technical" } would starve this step of the actual problem description.
  // Carry the original input forward alongside it.
  buildPrompt: (last, _history, input) => `Original request: ${input}\nTriage: ${JSON.stringify(last?.data)}`,
});

const reviewer = defineAgent({
  model,
  schema: z.object({ approved: z.boolean(), notes: z.string() }),
  role: "reviewer",
  systemPrompt: "Review the proposed diagnosis and steps for soundness before they're sent to the user.",
});

const result = await runAgents(
  { triage, technical, reviewer },
  "My app crashes when I upload a file over 10MB",
  {
    router: (last) => {
      if (!last) return "triage";
      if (last.role === "triage") {
        const { category } = last.data as { category: string };
        return category === "technical" ? "technical" : "done";
      }
      if (last.role === "technical") return "reviewer";
      return "done";
    },
    maxTurns: 5,
  }
);

console.log(result.trace); // [{ role: "triage", ... }, { role: "technical", ... }, { role: "reviewer", ... }]
console.log(result.final); // the reviewer's validated { approved, notes }
