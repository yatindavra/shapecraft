# Timeouts & Cancellation

Bound or cancel a single attempt with `timeoutMs` and/or an `AbortSignal`:

```typescript
import { TimeoutError } from "@aviasole/shapecraft";

try {
  const result = await generate(model, schema, prompt, { timeoutMs: 5_000 });
} catch (err) {
  if (err instanceof TimeoutError) {
    console.error(`Timed out after ${err.timeoutMs}ms`);
  }
}
```

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);

const result = await generate(model, schema, prompt, { signal: controller.signal });
```

Enforced at the core level for every backend - the retry loop always stops waiting once the timeout/signal fires, even against a backend that ignores cancellation entirely. All four built-in backends (`openai`, `groq`, `anthropic`, `ollama`) additionally forward the signal to the underlying SDK/fetch call for real request cancellation, not just abandonment. `TimeoutError` is never retried (it isn't a `SchemaViolationError`).
