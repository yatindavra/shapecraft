# Streaming

`generateStream()` streams tokens live for UX, but validates the assembled response exactly once, through the same pipeline as `generate()` - streaming is purely a transport layer, not a different guarantee. Falls back to one-shot `generate()` for a model without streaming support.

```typescript
import { generateStream, anthropic } from "@aviasole/shapecraft";

const model = anthropic({ model: "claude-haiku-4-5-20251001" });

const stream = generateStream(model, PersonSchema, "Extract: Jane Doe, 28, jane@example.com");

for await (const delta of stream.textStream) {
  process.stdout.write(delta); // raw text as it arrives
}

const { data, attempts, guaranteeLevel } = await stream.result; // validated once, at the end
```

For lifecycle control (retries, incremental field validation), use `stream.events` instead:

```typescript
for await (const event of stream2.events) {
  switch (event.type) {
    case "attempt-start":   /* a new attempt began */ break;
    case "delta":           process.stdout.write(event.text); break;
    case "partial":         console.log("validated so far:", event.value); break;
    case "attempt-failed":  console.log(`attempt ${event.attempt} failed, retrying`); break;
    case "done":            console.log(event.result.data); break;
  }
}
```

**`partial` events - incremental per-field validation.** For JSON/Zod object schemas, each top-level field is validated the instant its own value closes in the stream - before the whole object is done - against its own sub-schema (`z.object` shape, or `jsonSchema.properties`). If a field fails, the attempt aborts immediately (no more tokens pulled) and retries fresh, instead of waiting to discover the failure only after the full response arrives. XML, pattern, and custom-validator schemas don't decompose this way - they only emit `delta`/`done`.

**Retries are visible, not silent.** Non-streaming `generate()` retries invisibly - a failed attempt is simply discarded and re-asked. With streaming, tokens have already been shown before validation can run, so a failed attempt can't be un-sent: it emits `attempt-failed` and starts a fresh `attempt-start`. A UI rendering partial text should clear its buffer on `attempt-failed`/`attempt-start`. There's no "only show validated tokens" mode - that would mean waiting for the whole response, which isn't streaming; use non-streaming `generate()` if you need that.

**Streaming smoothness tracks guarantee level.** `native`/`constrained` backends (OpenAI, Groq, Fireworks, Mistral, Gemini, DeepSeek, Ollama) rarely fail validation - the server already constrains tokens as they're generated - so streams almost never restart. `best-effort` backends (Anthropic, OpenRouter) have no such constraint, so a stream may visibly restart more often.

`llamaCpp()` is the one backend without `generateStream()` - `generateStream()` falls back to a one-shot `generate()` for it, so `textStream` yields the whole response as a single delta. Check `model.capabilities.streaming` rather than assuming.
