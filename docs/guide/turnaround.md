# Turnaround (multi-turn collection)

Ordinary `generate()` is one prompt in, one validated object out. Turnaround mode inverts that for cases where the caller doesn't have all the information yet: the model interviews the user across several turns, and shapecraft extracts + validates **once**, over the whole transcript, when the conversation is done.

Pass `{ turnaround: true }` as a fifth argument:

```typescript
import { generate, anthropic } from "@aviasole/shapecraft";

const model = anthropic({ model: "claude-haiku-4-5-20251001" });

const schema = {
  jsonSchema: {
    type: "object",
    required: ["problem", "idea", "user"],
    properties: {
      problem: { type: "string" },
      idea: { type: "string" },
      user: { type: "string" },
    },
  },
};

const FACILITATOR =
  "You are the Discover Facilitator. Ask exactly one focused question at a time to extract: " +
  "(1) What problem are we solving? (2) What is the idea? (3) Who is the user? " +
  "Probe vague answers for specifics. Do not invent details on the user's behalf.";

let r = await generate(model, schema, "Hii", { systemPrompt: FACILITATOR }, { turnaround: true });
console.log(r.status); // "collecting"
console.log(r.message); // "What problem are you trying to solve?"

r = await generate(
  model,
  schema,
  "Onboarding new hires takes 3 weeks because of manual account setup",
  { systemPrompt: FACILITATOR },
  { turnaround: true, memory: r.memory } // thread the previous turn's memory back in
);

if (r.status === "complete") {
  console.log(r.data); // extracted & validated once, here
}
```

The return type is a `TurnResult<T>` discriminated union, not a `GenerateResult<T>`:

```typescript
type TurnResult<T> =
  | { status: "collecting"; message: string; memory: ConversationMemory }
  | { status: "complete"; data: T; memory: ConversationMemory };
```

Branch on `status`: while it's `"collecting"`, show `message` to the user and feed their reply back as the next call's prompt. Once it's `"complete"`, `data` is validated exactly as strongly as a standalone `generate()` call with that schema.

## Memory is yours to persist

`memory` is a plain, JSON-serializable `{ messages, status, turns }` object - shapecraft holds no session state of its own. In a real app each turn is a separate HTTP request, so persist `memory` between them (a row, a cache entry, a signed cookie) and thread it back in. `createConversationMemory()` is exported if you want to build the initial value explicitly, but omitting `memory` on the first call does the same thing.

Calling again with a `memory` whose `status` is already `"complete"` throws - a finished conversation is finished; start a new one.

## How the model signals "done"

shapecraft appends its own instruction to your `systemPrompt`, telling the model to reply with exactly `<<<COMPLETE>>>` (exported as `COMPLETION_SENTINEL`) and nothing else once every required field has a clear answer. For Zod, `{ jsonSchema }`, and `{ xml }` schemas it also derives the required field names and hands the model that explicit checklist, rather than making it infer completeness from your prose.

The sentinel is never forwarded to your user. If the model leaks it alongside other text, shapecraft strips it and keeps collecting - a defensive guard, since a sentinel in the middle of a sentence means the model didn't actually mean "done".

## What this does and doesn't guarantee

- **Validation happens exactly once, at the end.** Intermediate turns are unconstrained chat - nothing is parsed or checked until the sentinel fires. The final extraction is an ordinary `generate()` call over the transcript, so the guarantee is identical to any standalone call, not a weaker conversational one.
- **Requires `chat()`.** A model without it throws immediately rather than degrading. Every built-in backend has it - check `model.capabilities.chat` for a custom one.
- **`maxTurns` defaults to 20**, counted across the whole conversation (not per call). Exceeding it throws `MaxTurnsExceededError`.
- **Not available through `createClient()`** in v1 - call `generate()` directly for turnaround conversations.
- **The interview quality is the model's, not shapecraft's.** shapecraft guarantees the *final object* is structurally valid; whether the model asked good questions, or accepted a vague answer as specific enough, is model behavior - the same structural-vs-semantic boundary described in [Guarantees](/reference/guarantees).

Compare with the alternatives: use [Skill-Based Generation](/guide/skill-based-generation) when the model should pick an *operation* rather than collect fields, [Multi-agent Orchestration](/guide/agentic) to chain several validated steps, and [Tool Calling](/guide/tool-calling) when the model needs to call your functions mid-turn.
