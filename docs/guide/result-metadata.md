# Result Metadata

Every `GenerateResult` includes `metadata`:

```typescript
const result = await generate(model, schema, prompt);

console.log(result.metadata);
// { provider: "groq", model: "llama-3.3-70b-versatile", latencyMs: 284 }
```

```typescript
interface ResultMetadata {
  provider: string;
  model: string;
  latencyMs: number;
  tokens?: { input: number; output: number };
  finishReason?: string;
  requestId?: string;
  cost?: number;
}
```

`provider`, `model`, and `latencyMs` are always populated by the core (parsed from `model.id`, measured around the call). `tokens`, `finishReason`, `requestId`, and `cost` are reserved for a future backend hook that surfaces the underlying API response's usage data - they're `undefined` today, on every backend.
