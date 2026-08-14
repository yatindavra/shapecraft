# Pluggable JSON Schema Validation

The built-in `jsonSchema` check (`checkJsonSchema`) is intentionally shallow - it validates `type`, `enum` membership, and `required` presence (recursing through `properties`/`items`), but not `minLength`/`maximum`/`pattern`/`oneOf`/`$ref`/etc. Rather than expanding it, it's pluggable: supply your own validator (or wire up AJV) via `jsonSchemaValidator`.

```typescript
const strictValidator = (value: unknown, schema: Record<string, unknown>) => {
  // throw to reject; return normally to accept
  const v = value as { age?: number };
  if (typeof v.age !== "number" || v.age < 0 || v.age > 130) {
    throw new Error("age must be a plausible human age");
  }
};

const result = await generate(model, { jsonSchema: PersonJsonSchema }, prompt, {
  jsonSchemaValidator: strictValidator,
});
```

Applies to both `generate()`'s final check and `generateStream()`'s per-field incremental (`partial`) validation, so a custom validator behaves consistently whether or not you're streaming. Omit it and you get today's `checkJsonSchema` behavior, unchanged.
