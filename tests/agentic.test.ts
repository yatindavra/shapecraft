import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineAgent } from "../src/agentic/agent.js";
import { runAgents } from "../src/agentic/orchestrator.js";
import { anthropic } from "../src/backends/anthropic.js";
import { openai } from "../src/backends/openai.js";
import { groq } from "../src/backends/groq.js";
import { mistral } from "../src/backends/mistral.js";
import { MaxRetriesExceededError, MaxTurnsExceededError, SchemaViolationError } from "../src/types.js";
import type { ShapecraftModel } from "../src/types.js";

/** Returns `values` in order, one per `generate()` call; throws once then succeeds if `failFirst`. */
function scriptedModel(id: string, values: unknown[], failFirst = false): ShapecraftModel {
  let call = 0;
  let failed = false;
  return {
    id,
    guaranteeLevel: "constrained",
    async generate<T>(): Promise<T> {
      if (failFirst && !failed) {
        failed = true;
        throw new SchemaViolationError("bad", "invalid");
      }
      const value = values[call];
      call++;
      if (value === undefined) throw new Error("scriptedModel exhausted");
      return value as T;
    },
  };
}

const TriageSchema = z.object({ category: z.enum(["billing", "technical"]) });
const TechnicalSchema = z.object({ diagnosis: z.string() });

describe("runAgents", () => {
  it("chains triage -> specialist, threading validated data forward", async () => {
    const triage = defineAgent({ model: scriptedModel("mock:triage", [{ category: "technical" }]), schema: TriageSchema, role: "triage" });
    const technical = defineAgent({
      model: scriptedModel("mock:technical", [{ diagnosis: "disk full" }]),
      schema: TechnicalSchema,
      role: "technical",
    });

    const seen: unknown[] = [];
    const result = await runAgents({ triage, technical }, "app crashes on upload", {
      router: (last, history) => {
        seen.push({ last, historyLength: history.length });
        if (!last) return "triage";
        if (last.role === "triage") return "technical";
        return "done";
      },
    });

    expect(result.trace.map((t) => t.role)).toEqual(["triage", "technical"]);
    expect(result.trace[0].data).toEqual({ category: "technical" });
    expect(result.final).toEqual({ diagnosis: "disk full" });
    expect(seen[0]).toEqual({ last: null, historyLength: 0 });
  });

  it("retries a single step's own validation loop, not the whole chain", async () => {
    const triage = defineAgent({
      model: scriptedModel("mock:triage", [{ category: "technical" }], true),
      schema: TriageSchema,
      role: "triage",
    });

    const result = await runAgents({ triage }, "input", {
      router: (last) => (last ? "done" : "triage"),
    });

    expect(result.trace).toHaveLength(1);
    expect(result.final).toEqual({ category: "technical" });
  });

  it("throws MaxTurnsExceededError when the router never returns done", async () => {
    const triage = defineAgent({ model: scriptedModel("mock:triage", [{ category: "technical" }, { category: "technical" }]), schema: TriageSchema, role: "triage" });

    await expect(runAgents({ triage }, "input", { router: () => "triage", maxTurns: 2 })).rejects.toBeInstanceOf(MaxTurnsExceededError);
  });

  it("hands the next agent validated data, not raw model text", async () => {
    let capturedPrompt = "";
    const triage = defineAgent({
      model: scriptedModel("mock:triage", [{ category: "technical", extraUnvalidatedField: "leak" }]),
      schema: TriageSchema,
      role: "triage",
    });
    const technical = defineAgent({
      model: {
        id: "mock:technical",
        guaranteeLevel: "constrained",
        async generate<T>(prompt: string): Promise<T> {
          capturedPrompt = prompt;
          return { diagnosis: "ok" } as T;
        },
      },
      schema: TechnicalSchema,
      role: "technical",
    });

    await runAgents({ triage, technical }, "input", {
      router: (last) => (!last ? "triage" : last.role === "triage" ? "technical" : "done"),
    });

    // Zod strips unknown keys by default, so a validated triage result never carries "extraUnvalidatedField".
    expect(capturedPrompt).not.toContain("extraUnvalidatedField");
    expect(capturedPrompt).toContain("technical");
  });

  // Standing check: wrong-format input. A step whose output never satisfies its
  // schema must fail loudly rather than forwarding unvalidated data down the chain.
  // The surfaced error is MaxRetriesExceededError — the step's own retry loop runs
  // first and wraps the underlying violation, exactly as a plain generate() would.
  it("throws MaxRetriesExceededError when a step's output never matches its schema", async () => {
    const alwaysWrongFormat: ShapecraftModel = {
      id: "mock:wrong-format",
      guaranteeLevel: "best-effort",
      async generate<T>(): Promise<T> {
        return { category: "not-a-valid-enum-member" } as T;
      },
    };
    const triage = defineAgent({
      model: alwaysWrongFormat,
      schema: TriageSchema,
      role: "triage",
      options: { maxRetries: 1 },
    });

    await expect(
      runAgents({ triage }, "input", { router: (last) => (last ? "done" : "triage") })
    ).rejects.toBeInstanceOf(MaxRetriesExceededError);
  });
});

// ─── Real API — triage -> technical chain, skipped when key not in .env ──────

const RealTriageSchema = z.object({ category: z.enum(["billing", "technical", "general"]) });
const RealTechnicalSchema = z.object({ diagnosis: z.string(), steps: z.array(z.string()) });

const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasGroq = !!process.env.GROQ_API_KEY;
const hasMistral = !!process.env.MISTRAL_API_KEY;

function realChain(model: ShapecraftModel) {
  const triage = defineAgent({
    model,
    schema: RealTriageSchema,
    role: "triage",
    systemPrompt: 'Classify the support request into exactly one category: "billing", "technical", or "general".',
  });
  const technical = defineAgent({
    model,
    schema: RealTechnicalSchema,
    role: "technical",
    systemPrompt:
      'Diagnose the technical issue described in the original request. Respond with JSON exactly like: ' +
      '{"diagnosis": "<string>", "steps": ["<string>", "<string>"]}',
    // The default handoff only forwards the previous step's validated data — a bare
    // { category: "technical" } starves this step of the actual problem description.
    // Carry the original input forward alongside it.
    buildPrompt: (last, _history, input) => `Original request: ${input}\nTriage: ${JSON.stringify(last?.data)}`,
  });

  return runAgents(
    { triage, technical },
    "My app crashes every time I upload a file larger than 10MB.",
    {
      router: (last) => {
        if (!last) return "triage";
        if (last.role === "triage") return (last.data as { category: string }).category === "technical" ? "technical" : "done";
        return "done";
      },
    }
  );
}

describe("runAgents — Anthropic backend (real API)", () => {
  it.skipIf(!hasAnthropic)("triages then diagnoses, threading validated data forward", async () => {
    const result = await realChain(anthropic({ model: "claude-haiku-4-5-20251001" }));
    expect(result.trace.map((t) => t.role)).toEqual(["triage", "technical"]);
    expect(result.final).toMatchObject({ diagnosis: expect.any(String), steps: expect.any(Array) });
    console.log("[anthropic real] agentic chain result:", result.final);
  }, 30_000);
});

describe("runAgents — OpenAI backend (real API)", () => {
  it.skipIf(!hasOpenAI)("triages then diagnoses, threading validated data forward", async () => {
    const result = await realChain(openai({ model: "gpt-4o-mini" }));
    expect(result.trace.map((t) => t.role)).toEqual(["triage", "technical"]);
    expect(result.final).toMatchObject({ diagnosis: expect.any(String), steps: expect.any(Array) });
    console.log("[openai real] agentic chain result:", result.final);
  }, 30_000);
});

describe("runAgents — Groq backend (real API)", () => {
  it.skipIf(!hasGroq)("triages then diagnoses, threading validated data forward", async () => {
    const result = await realChain(groq({ model: "llama-3.3-70b-versatile" }));
    expect(result.trace.map((t) => t.role)).toEqual(["triage", "technical"]);
    expect(result.final).toMatchObject({ diagnosis: expect.any(String), steps: expect.any(Array) });
    console.log("[groq real] agentic chain result:", result.final);
  }, 30_000);
});

describe("runAgents — Mistral backend (real API)", () => {
  it.skipIf(!hasMistral)("triages then diagnoses, threading validated data forward", async () => {
    const result = await realChain(mistral({ model: "mistral-small-latest" }));
    expect(result.trace.map((t) => t.role)).toEqual(["triage", "technical"]);
    expect(result.final).toMatchObject({ diagnosis: expect.any(String), steps: expect.any(Array) });
    console.log("[mistral real] agentic chain result:", result.final);
  }, 30_000);
});

// ─── Standing check: prompt unrelated to the schema, against every live backend ──
// The model is asked something with nothing to do with support triage. The chain
// must still land on a schema-valid category or fail loudly with
// SchemaViolationError — the one unacceptable outcome is silently returning
// unvalidated text as if it were structured data.
function unrelatedPromptChain(model: ShapecraftModel) {
  const triage = defineAgent({
    model,
    schema: RealTriageSchema,
    role: "triage",
    systemPrompt: 'Classify the support request into exactly one category: "billing", "technical", or "general".',
  });

  return runAgents({ triage }, "What is the boiling point of water at the summit of Mount Everest?", {
    router: (last) => (last ? "done" : "triage"),
  });
}

async function expectSchemaValidOrLoudFailure(run: Promise<{ final: unknown }>, label: string) {
  try {
    const result = await run;
    const category = (result.final as { category?: unknown }).category;
    expect(["billing", "technical", "general"]).toContain(category);
    console.log(`[${label} unrelated-prompt] coerced to valid category:`, category);
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaViolationError);
    console.log(`[${label} unrelated-prompt] failed loudly with SchemaViolationError`);
  }
}

describe("runAgents — unrelated prompt against the schema (real API)", () => {
  it.skipIf(!hasAnthropic)("anthropic stays schema-valid or throws", async () => {
    await expectSchemaValidOrLoudFailure(unrelatedPromptChain(anthropic({ model: "claude-haiku-4-5-20251001" })), "anthropic");
  }, 30_000);

  it.skipIf(!hasGroq)("groq stays schema-valid or throws", async () => {
    await expectSchemaValidOrLoudFailure(unrelatedPromptChain(groq({ model: "llama-3.3-70b-versatile" })), "groq");
  }, 30_000);

  it.skipIf(!hasMistral)("mistral stays schema-valid or throws", async () => {
    await expectSchemaValidOrLoudFailure(unrelatedPromptChain(mistral({ model: "mistral-small-latest" })), "mistral");
  }, 30_000);
});
