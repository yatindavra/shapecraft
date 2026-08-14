# Batch Generation

Run multiple independent prompts (each with its own model/schema/options) in parallel, capped at `concurrency` in flight at once:

```typescript
import { generateBatch } from "@aviasole/shapecraft";

const results = await generateBatch(
  [
    { model, schema, prompt: "Extract: Jane Doe, 28" },
    { model, schema, prompt: "Extract: John Smith, 41" },
    { model, schema, prompt: "Extract: Ada Lovelace, 36" },
  ],
  { concurrency: 2 } // omit to run every item concurrently, uncapped
);

for (const r of results) {
  if (r.status === "fulfilled") console.log(r.value.data);
  else console.error("failed:", r.reason);
}
```

Each item settles independently - `Promise.allSettled`-style, never `Promise.all`-style - so one bad prompt doesn't lose the results of the rest of the batch. Order is preserved: `results[i]` always corresponds to the item at `items[i]`, regardless of which finishes first.

Available through `createClient()` too, so each item gets the client's middleware/retry/timeout/validator defaults, same as calling `client.generate()` on it individually:

```typescript
const client = createClient({ retry: { max: 3 } });
const results = await client.generateBatch(items, { concurrency: 5 });
```
