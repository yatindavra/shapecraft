# Staged Validation Pipeline

`generate()`'s validation step is a pipeline: `parse → structural validation → semantic validation → confidence scoring → post-processors → return`. Structural validation is unchanged and the only required stage - the rest are opt-in.

```typescript
const result = await generate(model, PersonSchema, prompt, {
  // runs after structural validation passes — throw to fail (retries, same as a schema violation)
  semanticValidator: (value, { prompt }) => {
    if (!prompt.includes(value.name)) throw new Error(`"${value.name}" not grounded in source text`);
  },
  // returns a 0-1 score, exposed as result.confidence
  confidenceScorer: (value) => (value.name.length > 1 ? 0.9 : 0.3),
  minConfidence: 0.5, // a score below this also fails the attempt and retries
  // runs last, in array order, on a value that already passed every check above
  postProcessors: [(value) => ({ ...value, name: value.name.trim() })],
});

console.log(result.confidence); // 0.9
```

All three are also settable as `createClient()` defaults, following the same per-call-overrides-client-default pattern as `jsonSchemaValidator`. Only `generate()` runs the full pipeline today - `generateStream()`'s per-field incremental checks still use `checkJsonSchema`/your `jsonSchemaValidator` only.
