# createClient() & Middleware

For cross-cutting concerns (logging, caching, telemetry) that would otherwise mean editing `generate()` itself, wrap it once with `createClient()` - a Koa-style onion middleware chain plus client-level defaults.

```typescript
import { createClient, loggingMiddleware } from "@aviasole/shapecraft";

const client = createClient({
  middleware: [loggingMiddleware()],
  retry: { max: 3 },
  timeoutMs: 10_000,
});

const result = await client.generate(model, schema, prompt);
```

A middleware sees the request before `next()` runs and the result/error after - outer middlewares wrap inner ones, like nested boxes, not a flat sequence:

```typescript
import type { Middleware } from "@aviasole/shapecraft";

const timing: Middleware = async (ctx, next) => {
  const t0 = Date.now();
  const result = await next();          // everything below this middleware runs first
  console.log(`${ctx.model.id} took ${Date.now() - t0}ms`);
  return result;
};
```

A middleware that never calls `next()` short-circuits the real call entirely - the standard shape for a cache:

```typescript
import type { Middleware, GenerateResult } from "@aviasole/shapecraft";

const cache = new Map<string, GenerateResult<unknown>>();

const cachingMiddleware: Middleware = async (ctx, next) => {
  const key = `${ctx.model.id}:${ctx.prompt}`;
  const hit = cache.get(key);
  if (hit) return hit;                  // model never called
  const result = await next();
  cache.set(key, result);
  return result;
};
```

Every client-level default (`retry`, `timeoutMs`, `jsonSchemaValidator`, `semanticValidator`, `confidenceScorer`, `minConfidence`, `postProcessors`) is merged into each call, and a per-call option always wins over the client-level one.

`createClient()` is purely additive - existing direct calls to `generate()`/`generateStream()` are unaffected. Middleware wraps `generate()` only; `generateStream()` picks up the same client-level defaults but isn't intercepted by middleware (its async-iterable shape doesn't fit the simple before/after `next()` model). `turnaround` calls are out of scope for the client wrapper in v1 - call [`generate()` directly](/guide/turnaround) for those.
