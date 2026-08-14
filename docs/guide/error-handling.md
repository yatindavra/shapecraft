# Error Handling

```typescript
import { SchemaViolationError, MaxRetriesExceededError } from "@aviasole/shapecraft";

try {
  const result = await generate(model, schema, prompt, { maxRetries: 3 });
} catch (err) {
  if (err instanceof MaxRetriesExceededError) {
    console.error(`Failed after ${err.attempts} attempts`);
  }
  if (err instanceof SchemaViolationError) {
    console.error("Raw output:", err.raw);
    console.error("Errors:", err.validationErrors);
  }
}
```

## Every error type

All of these are exported from the root entrypoint.

| Error | Thrown when | Carries |
|---|---|---|
| `SchemaViolationError` | one attempt's output failed validation (structural, semantic, or `minConfidence`) | `raw`, `validationErrors` |
| `MaxRetriesExceededError` | `generate()` exhausted `maxRetries` without a valid result | `attempts` |
| `TimeoutError` | one attempt exceeded `timeoutMs`, or `signal` fired | `timeoutMs` |
| `MaxTurnsExceededError` | [turnaround](/guide/turnaround) or [`runAgents()`](/guide/agentic) hit its `maxTurns` guard | `turns` |
| `SkillExecutionError` | a [skill](/guide/skill-based-generation)'s own `handler` threw | `skill`, `cause` |
| `MaxSkillTurnsExceededError` | `runSkillLoop()` hit `maxTurns` with no terminal skill | `turns`, `memory` |
| `MaxToolTurnsExceededError` | [`generateWithTools()`](/guide/tool-calling) hit `maxTurns` still requesting tools | `turns` |
| `ToolExecutionError` | a tool's own `handler` threw | `toolName`, `cause` |

`MaxTurnsExceededError` is also re-exported from `@aviasole/shapecraft/agentic`, so catching it around `runAgents()` doesn't force a second import.

## What retries and what doesn't

Only a `SchemaViolationError` is retried. That's the deliberate line: a failed *structural* check is something re-prompting the model can plausibly fix, so `generate()` retries it up to `maxRetries` before giving up with `MaxRetriesExceededError`.

Everything else propagates immediately:

- **`TimeoutError`** - a hung or slow backend retrying just as slowly rarely self-heals.
- **`SkillExecutionError` / `ToolExecutionError`** - the dispatch was structurally valid; your handler's own logic failed. Re-prompting the model can't fix a broken handler.
- **The `Max*TurnsExceededError` family** - a loop guard tripping is a budget decision for the caller, not something to retry blindly.

`MaxSkillTurnsExceededError` carries the loop's JSON-serializable `memory`, so it's resumable rather than fatal - persist it and call `runSkillLoop()` again with `{ memory: err.memory }` and a fresh budget:

```typescript
import { runSkillLoop, MaxSkillTurnsExceededError } from "@aviasole/shapecraft";

try {
  const { result } = await runSkillLoop(model, registry, "Refund order #4521");
} catch (err) {
  if (err instanceof MaxSkillTurnsExceededError) {
    const { result } = await runSkillLoop(model, registry, "Continue.", { memory: err.memory });
  }
}
```
